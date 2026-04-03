const express = require('express');
const SITE_URL = process.env.SITE_URL || 'https://your-domain.com';
const router = express.Router();
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { sendEmail } = require('../utils/mailer');

// GET /api/email-digest/stats - 本周数据统计
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 本周热门帖子（按点赞+评论排序）
    const topPosts = db.prepare(`
      SELECT p.id, p.title, p.ai_summary, p.created_at,
             u.nickname, u.username,
             t.name as tag_name, t.color as tag_color,
             (SELECT COUNT(*) FROM post_reactions WHERE post_id = p.id AND type = 'like') as like_count,
             (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      WHERE p.status = 'approved' AND p.created_at >= ?
      ORDER BY like_count DESC, comment_count DESC
      LIMIT 5
    `).all(weekAgo);

    // 本周新用户数
    const newUsers = db.prepare(`SELECT COUNT(*) as count FROM users WHERE created_at >= ?`).get(weekAgo);

    // 本周发帖数
    const newPosts = db.prepare(`SELECT COUNT(*) as count FROM posts WHERE status = 'approved' AND created_at >= ?`).get(weekAgo);

    // 本周评论数
    const newComments = db.prepare(`SELECT COUNT(*) as count FROM comments WHERE created_at >= ?`).get(weekAgo);

    res.json({ topPosts, newUsers: newUsers.count, newPosts: newPosts.count, newComments: newComments.count });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/email-digest/send - 手动发送测试邮件（发送到自己的邮箱）
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const user = db.prepare('SELECT email, nickname FROM users WHERE id = ?').get(req.user.id);
    if (!user.email) return res.status(400).json({ error: '请先绑定邮箱' });

    const html = await buildDigestEmail({ nickname: user.nickname, isTest: true });
    await sendEmail({
      to: user.email,
      subject: '🐼 熊猫社区 - 邮件聚合测试',
      html
    });

    res.json({ message: '测试邮件已发送到 ' + user.email });
  } catch(e) {
    res.status(500).json({ error: '发送失败: ' + e.message });
  }
});

// POST /api/email-digest/broadcast - 广播给所有活跃用户（管理员）
router.post('/broadcast', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });

  const { limit = 50 } = req.body;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 过去7天有活动的用户
  const activeUsers = db.prepare(`
    SELECT DISTINCT u.id, u.email, u.nickname
    FROM users u
    WHERE u.email IS NOT NULL AND u.email != ''
      AND u.email_verified = 1
      AND u.is_banned = 0
      AND (
        EXISTS(SELECT 1 FROM posts WHERE user_id = u.id AND created_at >= ?) OR
        EXISTS(SELECT 1 FROM comments WHERE user_id = u.id AND created_at >= ?) OR
        EXISTS(SELECT 1 FROM checkins WHERE user_id = u.id AND created_at >= ?)
      )
    LIMIT ?
  `).all(weekAgo, weekAgo, weekAgo, limit);

  let sent = 0, failed = 0;
  for (const u of activeUsers) {
    try {
      const html = await buildDigestEmail({ nickname: u.nickname, isTest: false });
      await sendEmail({ to: u.email, subject: '🐼 熊猫社区本周热门帖子', html });
      sent++;
    } catch(e) {
      failed++;
    }
    // Rate limit: 1 email per second
    await new Promise(r => setTimeout(r, 1000));
  }

  res.json({ message: `发送完成：成功 ${sent}，失败 ${failed}` });
});

async function buildDigestEmail({ nickname, isTest }) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const topPosts = db.prepare(`
    SELECT p.id, p.title, p.ai_summary, p.created_at,
           u.nickname, u.username,
           t.name as tag_name, t.color as tag_color,
           (SELECT COUNT(*) FROM post_reactions WHERE post_id = p.id AND type = 'like') as like_count,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN tags t ON p.tag_id = t.id
    WHERE p.status = 'approved' AND p.created_at >= ?
    ORDER BY like_count DESC, comment_count DESC
    LIMIT 5
  `).all(weekAgo);

  const stats = {
    newUsers: db.prepare(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`).get(weekAgo).c,
    newPosts: db.prepare(`SELECT COUNT(*) as c FROM posts WHERE status = 'approved' AND created_at >= ?`).get(weekAgo).c,
    newComments: db.prepare(`SELECT COUNT(*) as c FROM comments WHERE created_at >= ?`).get(weekAgo).c,
  };

  const postList = topPosts.length
    ? topPosts.map((p, i) => `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="background:#667eea;color:#fff;font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;">${i + 1}</span>
          ${p.tag_name ? `<span style="background:${p.tag_color};color:#fff;font-size:11px;padding:2px 7px;border-radius:5px;">${p.tag_name}</span>` : ''}
        </div>
        <a href="https://your-domain.com/post/${p.id}" style="font-size:15px;font-weight:600;color:#1a202c;text-decoration:none;display:block;margin-bottom:4px;">${escapeHtml(p.title)}</a>
        ${p.ai_summary ? `<div style="font-size:13px;color:#64748b;margin-bottom:6px;">🤖 ${escapeHtml(p.ai_summary)}</div>` : ''}
        <div style="font-size:12px;color:#94a3b8;">👤 ${p.nickname || p.username} · 👍 ${p.like_count} · 💬 ${p.comment_count}</div>
      </div>
    `).join('')
    : '<div style="color:#94a3b8;text-align:center;padding:20px;">本周暂无热门帖子</div>';

  const testNote = isTest
    ? '<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:#854d0e;">📌 这是测试邮件，仅发送到您的邮箱。</div>'
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>熊猫社区本周热门</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="background:linear-gradient(135deg,#0f766e,#667eea);border-radius:16px;padding:24px 20px;margin-bottom:20px;text-align:center;">
    <h1 style="color:#fff;font-size:22px;margin:0 0 4px;">🐼 熊猫社区</h1>
    <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">${nickname ? nickname + '，' : ''}本周热门内容</p>
  </div>

  ${testNote}

  <div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;">
    <h3 style="margin:0 0 14px;font-size:15px;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:10px;">📊 本周数据</h3>
    <div style="display:flex;gap:12px;text-align:center;">
      <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:12px 8px;">
        <div style="font-size:22px;font-weight:700;color:#16a34a;">${stats.newUsers}</div>
        <div style="font-size:12px;color:#64748b;">新用户</div>
      </div>
      <div style="flex:1;background:#eff6ff;border-radius:8px;padding:12px 8px;">
        <div style="font-size:22px;font-weight:700;color:#2563eb;">${stats.newPosts}</div>
        <div style="font-size:12px;color:#64748b;">新帖子</div>
      </div>
      <div style="flex:1;background:#fef3c7;border-radius:8px;padding:12px 8px;">
        <div style="font-size:22px;font-weight:700;color:#d97706;">${stats.newComments}</div>
        <div style="font-size:12px;color:#64748b;">新评论</div>
      </div>
    </div>
  </div>

  <div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;">
    <h3 style="margin:0 0 14px;font-size:15px;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:10px;">🔥 本周热门帖子</h3>
    ${postList}
  </div>

  <div style="text-align:center;padding:20px;">
    <a href="https://your-domain.com" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:600;">打开熊猫社区 →</a>
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = router;
