const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/database');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');
const { getUserLevel, getLevelBenefits } = require('../models/database');
const { logAction } = require('../middleware/moderationLog');
const { logUserAction } = require('../middleware/actionLogger');
const { checkMilestones } = require('../utils/milestones');

const router = express.Router();

// ===== Anti-Bot Helpers =====
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || req.socket?.remoteAddress
    || '';
}

function checkLoginAttempts(userId, username, ip) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentFailures = db.prepare(
    "SELECT COUNT(*) as c FROM login_attempts WHERE " +
    "((user_id = ? AND username = ?) OR ip_address = ?) AND success = 0 AND attempted_at > ?"
  ).get(userId || -1, username, ip, oneHourAgo);

  if (recentFailures.c >= 5) {
    return { blocked: true, reason: '登录尝试次数过多，请1小时后再试或联系管理员' };
  }
  return { blocked: false };
}

function recordLoginAttempt(userId, username, ip, success) {
  try {
    db.prepare(
      'INSERT INTO login_attempts (ip_address, user_id, username, success) VALUES (?, ?, ?, ?)'
    ).run(ip, userId || null, username, success ? 1 : 0);
  } catch (e) {
    console.error('[LoginAttempt]', e.message);
  }
}

function checkRegistrationRate(ip) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentRegs = db.prepare(
    "SELECT COUNT(*) as c FROM login_attempts WHERE ip_address = ? AND username = 'REGISTER_RATE_CHECK' AND attempted_at > ?"
  ).get(ip, oneHourAgo);
  if (recentRegs.c >= 5) {
    return { blocked: true, reason: '该IP注册过于频繁，请1小时后再试' };
  }
  if (recentRegs.c >= 3) {
    return { captchaRequired: true };
  }
  return { blocked: false, captchaRequired: false };
}

function recordRegistrationAttempt(ip) {
  try {
    db.prepare(
      "INSERT INTO login_attempts (ip_address, username, success) VALUES (?, 'REGISTER_RATE_CHECK', 0)"
    ).run(ip);
  } catch (e) {
    console.error('[RegRate]', e.message);
  }
}

function verifyCaptchaToken(token, slideX) {
  if (!token) return { valid: false, error: '缺少验证码' };
  const { getChallenge, deleteChallenge } = require('../utils/captchaStore');
  const challenge = getChallenge(token);
  if (!challenge) return { valid: false, error: '验证已过期，请重试' };
  if (challenge.expiresAt < Date.now()) {
    deleteChallenge(token);
    return { valid: false, error: '验证已过期，请重试' };
  }
  const diff = Math.abs(challenge.targetX - Number(slideX));
  if (diff > 6) {
    deleteChallenge(token);
    return { valid: false, error: '验证失败，请重试' };
  }
  deleteChallenge(token);
  return { valid: true };
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname, email, __hp, __ts, captchaToken } = req.body;
    const ip = getClientIp(req);

    // Honeypot check — bots fill hidden fields
    if (__hp) {
      return res.status(201).json({ pending: true, message: '注册成功，请验证邮箱完成账号激活' });
    }

    // Time check — humans take > 2 seconds to fill the form
    if (__ts && Date.now() - Number(__ts) < 2000) {
      return res.status(400).json({ error: '注册太快了，请正常填写表单' });
    }

    // IP rate limit
    const regCheck = checkRegistrationRate(ip);
    if (regCheck.blocked) {
      return res.status(429).json({ error: regCheck.reason });
    }
    if (regCheck.captchaRequired) {
      if (!captchaToken) {
        return res.status(400).json({ error: 'captcha_required', captchaRequired: true });
      }
      const captchaResult = verifyCaptchaToken(captchaToken);
      if (!captchaResult.valid) {
        return res.status(400).json({ error: captchaResult.error, captchaRequired: true });
      }
    }

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于6位' });
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ error: '密码必须包含大小写字母和数字' });
    }

    // Track registration
    recordRegistrationAttempt(ip);

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    db.prepare(
      'INSERT INTO users (username, password, nickname, email, approved, email_verified) VALUES (?, ?, ?, ?, 0, 0)'
    ).run(username, hashedPassword, nickname || username, email || null);

    logUserAction({
      userId: null,
      username: username,
      action: 'user_register',
      targetType: 'user',
      details: '新用户注册: ' + username + (email ? ' (' + email + ')' : ''),
      req
    });

    res.status(201).json({
      pending: true,
      message: '注册成功，请验证邮箱完成账号激活'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '注册失败' });
  }
});

// Send registration verification code
router.post('/send-register-code', async (req, res) => {
  try {
    const { email, username, password, __hp, __ts, captchaToken } = req.body;
    const ip = getClientIp(req);

    // Honeypot check — bots fill hidden fields
    if (__hp) {
      return res.json({ success: true, message: '验证码已发送（开发模式）', dev_code: '123456' });
    }

    // Time check — humans take > 2 seconds to fill the form
    if (__ts && Date.now() - Number(__ts) < 2000) {
      return res.status(400).json({ error: '操作太快，请稍后重试' });
    }

    // IP rate limit: 5 registrations per IP per hour; >= 3 requires captcha
    const regCheck = checkRegistrationRate(ip);
    if (regCheck.blocked) {
      return res.status(429).json({ error: regCheck.reason });
    }
    if (regCheck.captchaRequired) {
      if (!captchaToken) {
        return res.status(400).json({ error: 'captcha_required', captchaRequired: true });
      }
      const captchaResult = verifyCaptchaToken(captchaToken);
      if (!captchaResult.valid) {
        return res.status(400).json({ error: captchaResult.error, captchaRequired: true });
      }
    }

    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }
    if (!username) {
      return res.status(400).json({ error: '用户名不能为空' });
    }
    if (!password) {
      return res.status(400).json({ error: '密码不能为空' });
    }

    // Check username existence
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    // Check email existence
    const emailUsed = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (emailUsed) {
      return res.status(400).json({ error: '该邮箱已被其他账号使用' });
    }

    // Track registration
    recordRegistrationAttempt(ip);

    // Create user (pending approval, unverified)
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password, nickname, email, approved, email_verified) VALUES (?, ?, ?, ?, 0, 0)'
    ).run(username, hashedPassword, username, email);
    const userId = result.lastInsertRowid;

    // Generate code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Save code
    db.prepare(
      "INSERT INTO email_codes (email, user_id, code, purpose, expires_at) VALUES (?, ?, ?, 'register', ?)"
    ).run(email, userId, code, expiresAt.toISOString());

    // Try to send email
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });

    try {
      await transporter.sendMail({
        from: `"熊猫社区" <${process.env.SMTP_FROM || 'noreply@pandacommunity.com'}>`,
        to: email,
        subject: '【熊猫社区】注册邮箱验证',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #1a5f7a;">🐼 熊猫社区</h2>
            </div>
            <p style="font-size: 16px; color: #333;">您好！</p>
            <p style="font-size: 16px; color: #333;">您正在注册熊猫社区，请使用以下验证码完成注册：</p>
            <div style="background: #f0f7fa; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; color: #1a5f7a; letter-spacing: 8px;">${code}</span>
            </div>
            <p style="font-size: 14px; color: #888;">验证码有效期为 <strong>10 分钟</strong>，请尽快完成验证。</p>
            <p style="font-size: 14px; color: #888;">如果不是您本人操作，请忽略此邮件。</p>
          </div>
        `,
      });
    } catch (mailErr) {
      console.warn('邮件发送失败:', mailErr.message);
      if (process.env.NODE_ENV !== 'production') {
        return res.json({ success: true, message: '验证码已发送（开发模式）', dev_code: code });
      }
      return res.json({ success: true, message: '验证码已发送，请查收邮件' });
    }

    res.json({ success: true, message: '验证码已发送，请查收邮件' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '发送验证码失败' });
  }
});

// Verify registration code and activate account
router.post('/verify-register', async (req, res) => {
  try {
    const { email, code, username } = req.body;
    if (!email || !code || !username) {
      return res.status(400).json({ error: '邮箱、验证码和用户名不能为空' });
    }

    // Find valid code
    const record = db.prepare(`
      SELECT * FROM email_codes
      WHERE email = ? AND user_id = (
        SELECT id FROM users WHERE username = ? AND approved = 0 AND email_verified = 0
      ) AND code = ? AND purpose = 'register' AND used = 0 AND expires_at > datetime('now')
      ORDER BY id DESC LIMIT 1
    `).get(email, username, code);

    if (!record) {
      return res.status(400).json({ error: '验证码无效或已过期' });
    }

    // Mark code as used
    db.prepare('UPDATE email_codes SET used = 1 WHERE id = ?').run(record.id);

    // Activate user
    db.prepare('UPDATE users SET approved = 1, email_verified = 1 WHERE id = ?').run(record.user_id);

    // Check milestones (new user registered)
    const newMilestones = checkMilestones('users');

    res.json({
      success: true,
      message: '账号激活成功，请登录！',
      username
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '验证失败' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const ip = getClientIp(req);

    // Check rate limit before anything else
    const loginCheck = checkLoginAttempts(null, username, ip);
    if (loginCheck.blocked) {
      return res.status(429).json({ error: loginCheck.reason });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      recordLoginAttempt(null, username, ip, false);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    if (!user.approved) {
      return res.status(403).json({ error: '账号尚未通过审核，请等待管理员批准' });
    }

    if (Number(user.is_banned) === 1) {
      return res.status(403).json({ error: '账号已被封禁，请联系管理员' });
    }

    // Check failed attempts for this specific account
    const accountCheck = checkLoginAttempts(user.id, username, ip);
    if (accountCheck.blocked) {
      recordLoginAttempt(user.id, username, ip, false);
      return res.status(429).json({ error: accountCheck.reason });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      recordLoginAttempt(user.id, username, ip, false);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // Success — clear failed attempts
    try {
      db.prepare("DELETE FROM login_attempts WHERE user_id = ? AND success = 0").run(user.id);
    } catch(e) {}

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Log admin login
    if (user.role === 'admin') {
      logAction({ adminId: user.id, action: 'admin_login', targetType: 'user', targetId: user.id, details: '管理员登录: ' + user.username });
    }

    // General user login log
    logUserAction({
      userId: user.id,
      username: user.username,
      action: 'user_login',
      targetType: 'user',
      targetId: user.id,
      details: '用户登录: ' + user.username + (user.role === 'admin' ? ' (管理员)' : ''),
      req
    });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    const level = getUserLevel(user.points);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: user.role,
        is_banned: Number(user.is_banned) === 1,
        avatar: user.avatar,
        bio: user.bio,
        points: user.points,
        checkin_streak: user.checkin_streak,
        email_verified: Number(user.email_verified) === 1,
        level_name: level.name,
        level_icon: level.icon,
        level_color: level.color,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '登录失败' });
  }
});

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, nickname, avatar, bio, role, created_at, points, checkin_streak, daily_interest_date FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  const level = getUserLevel(user.points);
  user.level_name = level.name;
  user.level_icon = level.icon;
  user.level_color = level.color;
  user.level_tier = level.tier;
  user.level_benefits = getLevelBenefits(level);

  // Calculate pending interest
  const today = new Date().toISOString().split('T')[0];
  if (user.daily_interest_date !== today && level.daily_interest > 0) {
    user.pending_interest = Math.floor(user.points * level.daily_interest);
  } else {
    user.pending_interest = 0;
  }

  res.json({ user });
});

// Admin logout - log the action
router.post('/logout', authMiddleware, (req, res) => {
  if (req.user.role === 'admin') {
    logAction({ adminId: req.user.id, action: 'admin_logout', targetType: 'user', targetId: req.user.id, details: '管理员登出: ' + req.user.username });
  }
  res.json({ success: true });
});

module.exports = router;
