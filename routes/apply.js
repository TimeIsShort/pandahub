const express = require('express');
const nodemailer = require('nodemailer');
const db = require('../models/database');

const router = express.Router();

// Get apply page
router.get('/', (req, res) => {
  res.sendFile(require('path').join(__dirname, '../public/apply.html'));
});

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || 'your-email@example.com',
      pass: process.env.SMTP_PASS || '',
    },
  });
}

// Send verification code for application
router.post('/send-code', async (req, res) => {
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

    // Check if already applied
    const existingApp = db.prepare('SELECT id FROM applications WHERE username = ? OR email = ?').get(username, email);
    if (existingApp) {
      return res.status(400).json({ error: '该用户名或邮箱已申请，请等待审核' });
    }

    // Check existing user
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    // Generate code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Invalidate old codes
    db.prepare("UPDATE email_codes SET used = 1 WHERE email = ? AND purpose = 'apply' AND used = 0").run(email);

    // Save code
    db.prepare(
      "INSERT INTO email_codes (email, code, purpose, expires_at) VALUES (?, ?, 'apply', ?)"
    ).run(email, code, expiresAt.toISOString());

    // Send email
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"熊猫社区" <${process.env.SMTP_FROM || process.env.SMTP_USER || 'your-email@example.com'}>`,
        to: email,
        subject: '【熊猫社区】内测申请验证码',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #1a5f7a;">🐼 熊猫社区</h2>
            </div>
            <p style="font-size: 16px; color: #333;">您好！</p>
            <p style="font-size: 16px; color: #333;">您正在申请加入熊猫社区，请使用以下验证码完成申请：</p>
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
      // In dev mode, return code in response
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

// Submit application
router.post('/', async (req, res) => {
  try {
    const { username, nickname, email, reason, code } = req.body;
    
    if (!username || !email) {
      return res.status(400).json({ error: '用户名和邮箱不能为空' });
    }
    if (!code) {
      return res.status(400).json({ error: '验证码不能为空，请先获取验证码' });
    }
    
    // Check if username exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    
    // Check if already applied
    const existingApp = db.prepare('SELECT id FROM applications WHERE username = ? OR email = ?').get(username, email);
    if (existingApp) {
      return res.status(400).json({ error: '该用户名或邮箱已申请，请等待审核' });
    }

    // Verify code
    const record = db.prepare(`
      SELECT * FROM email_codes
      WHERE email = ? AND code = ? AND purpose = 'apply' AND used = 0 AND expires_at > datetime('now')
      ORDER BY id DESC LIMIT 1
    `).get(email, code);

    if (!record) {
      return res.status(400).json({ error: '验证码无效或已过期，请重新获取' });
    }

    // Mark code as used
    db.prepare('UPDATE email_codes SET used = 1 WHERE id = ?').run(record.id);
    
    // Create application
    db.prepare(
      'INSERT INTO applications (username, nickname, email, reason) VALUES (?, ?, ?, ?)'
    ).run(username, nickname || username, email, reason || '');
    
    res.json({ success: true, message: '申请已提交，请等待管理员审核' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '申请失败' });
  }
});

// Check application status
router.get('/status', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: '缺少用户名' });
  
  const app = db.prepare('SELECT status, created_at FROM applications WHERE username = ?').get(username);
  if (!app) return res.json({ status: 'not_found' });
  
  res.json({ status: app.status, created_at: app.created_at });
});

module.exports = router;
