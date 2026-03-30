const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/database');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');
const { getUserLevel } = require('../models/database');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于6位' });
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ error: '密码必须包含大小写字母和数字' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    db.prepare(
      'INSERT INTO users (username, password, nickname, email, approved, email_verified) VALUES (?, ?, ?, ?, 0, 0)'
    ).run(username, hashedPassword, nickname || username, email || null);

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
    const { email, username } = req.body;
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

    // Find pending user
    const user = db.prepare('SELECT id FROM users WHERE username = ? AND approved = 0').get(username);
    if (!user) {
      return res.status(404).json({ error: '未找到待激活的账号，请先注册' });
    }

    // Check if email already used by another user
    const emailUsed = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, user.id);
    if (emailUsed) {
      return res.status(400).json({ error: '该邮箱已被其他账号使用' });
    }

    // Generate code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Invalidate old codes for this user
    db.prepare('UPDATE email_codes SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);

    // Save code
    db.prepare(
      "INSERT INTO email_codes (email, user_id, code, purpose, expires_at) VALUES (?, ?, ?, 'register', ?)"
    ).run(email, user.id, code, expiresAt.toISOString());

    // Update user's email field
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, user.id);

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
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    if (!user.approved) {
      return res.status(403).json({ error: '账号尚未通过审核，请等待管理员批准' });
    }

    if (Number(user.is_banned) === 1) {
      return res.status(403).json({ error: '账号已被封禁，请联系管理员' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

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
  const user = db.prepare('SELECT id, username, nickname, avatar, bio, role, created_at, points, checkin_streak FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  const level = getUserLevel(user.points);
  user.level_name = level.name;
  user.level_icon = level.icon;
  user.level_color = level.color;
  res.json({ user });
});

module.exports = router;
