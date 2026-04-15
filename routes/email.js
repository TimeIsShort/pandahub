const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Get SMTP config from env
function getTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error('SMTP_HOST environment variable is not configured');
  }
  return nodemailer.createTransport({
    host,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send email verification code
router.post('/send-code', authMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: '邮箱地址不能为空' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    // Check if email is already bound to another user
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .get(email, req.user.id);
    if (existing) {
      return res.status(400).json({ error: '该邮箱已被其他用户绑定' });
    }

    // Check if user already has verified email
    const user = db.prepare('SELECT email, email_verified FROM users WHERE id = ?').get(req.user.id);
    if (user.email && user.email_verified === 1 && user.email === email) {
      return res.status(400).json({ error: '该邮箱已绑定，无需重复验证' });
    }

    // Generate 6-digit code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate old unused codes for this email
    db.prepare('UPDATE email_codes SET used = 1 WHERE email = ? AND used = 0')
      .run(email);

    // Save new code
    db.prepare(
      'INSERT INTO email_codes (email, user_id, code, expires_at) VALUES (?, ?, ?, ?)'
    ).run(email, req.user.id, code, expiresAt.toISOString());

    // Try to send email
    try {
      const transporter = getTransporter();
      const mailOptions = {
        from: `"熊猫社区" <${process.env.SMTP_FROM || 'noreply@pandacommunity.com'}>`,
        to: email,
        subject: '【熊猫社区】绑定邮箱验证码',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #1a5f7a;">🐼 熊猫社区</h2>
            </div>
            <p style="font-size: 16px; color: #333;">您好！</p>
            <p style="font-size: 16px; color: #333;">您正在绑定邮箱，请使用以下验证码：</p>
            <div style="background: #f0f7fa; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; color: #1a5f7a; letter-spacing: 8px;">${code}</span>
            </div>
            <p style="font-size: 14px; color: #888;">验证码有效期为 <strong>10 分钟</strong>，请尽快完成验证。</p>
            <p style="font-size: 14px; color: #888;">如果不是您本人操作，请忽略此邮件。</p>
          </div>
        `,
        text: `您好！您正在绑定邮箱，验证码为：${code}，有效期10分钟。`,
      };

      await transporter.sendMail(mailOptions);
    } catch (mailErr) {
      // Log but don't fail - for testing without real SMTP
      console.warn('邮件发送失败:', mailErr.message);
      // For development: return code in response for testing
      if (process.env.NODE_ENV !== 'production') {
        return res.json({
          success: true,
          message: '验证码已发送（开发模式：验证码显示在响应中）',
          dev_code: code, // Remove in production!
        });
      }
      return res.json({ success: true, message: '验证码已发送，请查收邮件' });
    }

    res.json({ success: true, message: '验证码已发送，请查收邮件' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '发送验证码失败' });
  }
});

// Verify email code and bind email
router.post('/verify-code', authMiddleware, (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: '邮箱和验证码不能为空' });
    }

    // Find valid code
    const record = db.prepare(`
      SELECT * FROM email_codes
      WHERE email = ? AND user_id = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
      ORDER BY id DESC LIMIT 1
    `).get(email, req.user.id, code);

    if (!record) {
      return res.status(400).json({ error: '验证码无效或已过期' });
    }

    // Mark code as used
    db.prepare('UPDATE email_codes SET used = 1 WHERE id = ?').run(record.id);

    // Bind email to user
    db.prepare('UPDATE users SET email = ?, email_verified = 1 WHERE id = ?')
      .run(email, req.user.id);

    res.json({
      success: true,
      message: '邮箱绑定成功！',
      email
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '验证失败' });
  }
});

// Unbind email
router.post('/unbind-email', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
    if (!user.email) {
      return res.status(400).json({ error: '未绑定邮箱' });
    }

    db.prepare('UPDATE users SET email = NULL, email_verified = 0 WHERE id = ?')
      .run(req.user.id);

    res.json({ success: true, message: '邮箱已解除绑定' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '解除绑定失败' });
  }
});

// ============ FORGOT PASSWORD (No Auth) ============

// Send reset code to email
router.post('/forgot/send-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: '邮箱地址不能为空' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    // Find user with this email
    const user = db.prepare('SELECT id, nickname FROM users WHERE email = ? AND email_verified = 1')
      .get(email);
    if (!user) {
      // Don't reveal whether email exists or not
      return res.json({ success: true, message: '如果该邮箱已绑定且验证通过，验证码已发送' });
    }

    // Generate code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate old unused codes for this user+purpose
    db.prepare("UPDATE email_codes SET used = 1 WHERE email = ? AND purpose = 'reset' AND used = 0")
      .run(email);

    // Save new code
    db.prepare(
      "INSERT INTO email_codes (email, user_id, code, purpose, expires_at) VALUES (?, ?, ?, 'reset', ?)"
    ).run(email, user.id, code, expiresAt.toISOString());

    // Try to send email
    try {
      const transporter = getTransporter();
      const mailOptions = {
        from: `"熊猫社区" <${process.env.SMTP_FROM || 'noreply@pandacommunity.com'}>`,
        to: email,
        subject: '【熊猫社区】找回密码验证码',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #1a5f7a;">🐼 熊猫社区</h2>
            </div>
            <p style="font-size: 16px; color: #333;">您好${user.nickname ? '，' + escapeHtml(user.nickname) : ''}！</p>
            <p style="font-size: 16px; color: #333;">您正在找回密码，请使用以下验证码：</p>
            <div style="background: #f0f7fa; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; color: #1a5f7a; letter-spacing: 8px;">${code}</span>
            </div>
            <p style="font-size: 14px; color: #888;">验证码有效期为 <strong>10 分钟</strong>，请尽快完成验证。</p>
            <p style="font-size: 14px; color: #888;">如果不是您本人操作，请忽略此邮件。</p>
          </div>
        `,
        text: `您好！您正在找回密码，验证码为：${code}，有效期10分钟。`,
      };

      await transporter.sendMail(mailOptions);
    } catch (mailErr) {
      console.warn('邮件发送失败:', mailErr.message);
      if (process.env.NODE_ENV !== 'production') {
        return res.json({
          success: true,
          message: '验证码已发送（开发模式：验证码显示在响应中）',
          dev_code: code,
        });
      }
      return res.json({ success: true, message: '验证码已发送，请查收邮件' });
    }

    res.json({ success: true, message: '验证码已发送，请查收邮件' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '发送验证码失败' });
  }
});

// Reset password with code
router.post('/forgot/reset-password', async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
      return res.status(400).json({ error: '邮箱、验证码和新密码不能为空' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于6位' });
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ error: '密码必须包含大小写字母和数字' });
    }

    // Find valid code
    const record = db.prepare(`
      SELECT * FROM email_codes
      WHERE email = ? AND code = ? AND purpose = 'reset' AND used = 0 AND expires_at > datetime('now')
      ORDER BY id DESC LIMIT 1
    `).get(email, code);

    if (!record) {
      return res.status(400).json({ error: '验证码无效或已过期' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password
    db.prepare('UPDATE users SET password = ? WHERE id = ?')
      .run(hashedPassword, record.user_id);

    // Mark code as used
    db.prepare('UPDATE email_codes SET used = 1 WHERE id = ?').run(record.id);

    res.json({ success: true, message: '密码重置成功，请使用新密码登录' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '重置密码失败' });
  }
});

// Escape helper
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[c]));
}

module.exports = router;
