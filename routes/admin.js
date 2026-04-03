const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { logAction } = require('../middleware/moderationLog');
const { callBailianModeration, parseModerationResult } = require('../middleware/autoModeration');
const { sendPushToUser, notifyUserPostApproved, notifyUserPostRejected } = require('../utils/pushHelper');
const { checkMilestones } = require('../utils/milestones');
const { generatePostSummary } = require('../utils/summarize');

const router = express.Router();
const AI_DAILY_QUOTA = 100;

function getToday() {
  return new Date().toISOString().split('T')[0];
}

// Get pending applications (admin only)
router.get('/applications', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  
  const apps = db.prepare(`
    SELECT a.*, u.nickname as processed_by_nick 
    FROM applications a 
    LEFT JOIN users u ON a.processed_by = u.id
    ORDER BY a.status ASC, a.created_at DESC
  `).all();
  
  res.json({ applications: apps });
});

// Approve application and create user
router.post('/approve', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  
  const { application_id, password } = req.body;
  
  if (!application_id || !password) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  try {
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(application_id);
    if (!app) {
      return res.status(404).json({ error: '申请不存在' });
    }
    
    if (app.status !== 'pending') {
      return res.status(400).json({ error: '该申请已被处理' });
    }
    
    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(app.username);
    if (existing) {
      return res.status(400).json({ error: '用户已存在' });
    }
    
    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    db.prepare(
      'INSERT INTO users (username, password, nickname, approved) VALUES (?, ?, ?, 1)'
    ).run(app.username, hashedPassword, app.nickname || app.username);
    
    // Update application status
    db.prepare(`
      UPDATE applications SET status = 'approved', processed_at = CURRENT_TIMESTAMP, processed_by = ? WHERE id = ?
    `).run(req.user.id, application_id);

    logAction({ adminId: req.user.id, action: 'approve_application', targetType: 'application', targetId: application_id, details: `通过申请: ${app.username}` });

    res.json({ success: true, message: '已通过申请，用户已创建' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败' });
  }
});

// Reject application
router.post('/reject', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  
  const { application_id } = req.body;
  
  if (!application_id) {
    return res.status(400).json({ error: '缺少申请ID' });
  }
  
  try {
    // Get application info first
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(application_id);
    if (!app) {
      return res.status(404).json({ error: '申请不存在' });
    }

    if (app.status !== 'pending') {
      return res.status(400).json({ error: '该申请已被处理' });
    }
    
    db.prepare(`
      UPDATE applications SET status = 'rejected', processed_at = CURRENT_TIMESTAMP, processed_by = ? WHERE id = ?
    `).run(req.user.id, application_id);

    logAction({ adminId: req.user.id, action: 'reject_application', targetType: 'application', targetId: application_id, reason: reason || '未说明原因', details: `拒绝申请: ${app.username}` });

    res.json({ success: true, message: '已拒绝申请' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败' });
  }
});

// ===== Post Review =====

// Get pending posts
router.get('/posts', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  
  const posts = db.prepare(`
    SELECT p.*, u.username, u.nickname, u.avatar, t.name as tag_name, t.color as tag_color
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN tags t ON p.tag_id = t.id
    WHERE p.status = 'pending'
    ORDER BY p.created_at DESC
  `).all();
  
  res.json({ posts });
});

// Approve post
router.post('/posts/:id/approve', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  
  try {
    // Get post info first
    const post = db.prepare('SELECT user_id, title FROM posts WHERE id = ?').get(req.params.id);
    if (!post) {
      return res.status(404).json({ error: '帖子不存在' });
    }
    
    db.prepare("UPDATE posts SET status = 'approved' WHERE id = ?").run(req.params.id);

    logAction({ adminId: req.user.id, action: 'approve_post', targetType: 'post', targetId: Number(req.params.id), details: `通过帖子: ${post.title}` });

    // Generate AI summary (fire-and-forget, don't await)
    if (post.content) {
      generatePostSummary(post.title, post.content).then(summary => {
        if (summary && summary.length > 5) {
          db.prepare('UPDATE posts SET summary = ? WHERE id = ?').run(summary, req.params.id);
        }
      }).catch(() => {});
    }

    // Check milestones (post approved)
    checkMilestones('posts');

    // Create notification for the post author
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, content, post_id) 
      VALUES (?, 'post_approved', '🎉 帖子审核通过', '您的帖子「' || ? || '」已通过审核，现在可以在社区看到了！', ?)
    `).run(post.user_id, post.title, req.params.id);

    // Web Push notification
    sendPushToUser(post.user_id, {
      title: '🎉 帖子审核通过',
      body: '您的帖子「' + post.title + '」已通过审核',
      url: '/post/' + post.id,
      tag: 'post-approved'
    });
    // Email notification (async, don't await)
    notifyUserPostApproved(post.user_id, post.title, '/post/' + post.id);

    res.json({ success: true, message: '帖子已通过审核' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败' });
  }
});

// Reject post
router.post('/posts/:id/reject', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  
  const { reason } = req.body;
  
  try {
    // Get post info first
    const post = db.prepare('SELECT user_id, title FROM posts WHERE id = ?').get(req.params.id);
    if (!post) {
      return res.status(404).json({ error: '帖子不存在' });
    }
    
    db.prepare("UPDATE posts SET status = 'rejected', rejected_reason = ? WHERE id = ?").run(reason || null, req.params.id);

    logAction({ adminId: req.user.id, action: 'reject_post', targetType: 'post', targetId: Number(req.params.id), reason: reason || null, details: `拒绝帖子: ${post.title}` });

    // Create notification for the post author
    const reasonText = reason ? '原因：' + reason : '很遗憾，您的帖子未通过审核。';
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, content, post_id) 
      VALUES (?, 'post_rejected', '❌ 帖子审核未通过', ?, ?)
    `).run(post.user_id, reasonText, req.params.id);

    // Web Push notification
    sendPushToUser(post.user_id, {
      title: '❌ 帖子审核未通过',
      body: '您的帖子「' + post.title + '」未通过审核' + (reason ? '，原因：' + reason : ''),
      url: '/post/' + post.id,
      tag: 'post-rejected'
    });
    // Email notification (async, don't await)
    notifyUserPostRejected(post.user_id, post.title, reason, '/post/' + post.id);

    res.json({ success: true, message: '帖子已拒绝' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败' });
  }
});


// Pin / Unpin a post (toggle)
router.post('/posts/:id/pin', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  try {
    const post = db.prepare('SELECT id, title, is_pinned FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    const newVal = post.is_pinned ? 0 : 1;
    db.prepare('UPDATE posts SET is_pinned = ? WHERE id = ?').run(newVal, req.params.id);
    logAction({ adminId: req.user.id, action: newVal ? 'pin_post' : 'unpin_post', targetType: 'post', targetId: Number(req.params.id), details: (newVal ? '置顶' : '取消置顶') + ': ' + post.title });
    res.json({ success: true, is_pinned: newVal, message: newVal ? '已置顶' : '已取消置顶' });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

// Feature / Unfeature a post (toggle)
router.post('/posts/:id/feature', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  try {
    const post = db.prepare('SELECT id, title, is_featured FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    const newVal = post.is_featured ? 0 : 1;
    db.prepare('UPDATE posts SET is_featured = ? WHERE id = ?').run(newVal, req.params.id);

    if (newVal) {
      // Add to featured_posts
      const year = new Date().getFullYear();
      const now = new Date();
      const startOfYear = new Date(year, 0, 1);
      const days = Math.floor((now - startOfYear) / 86400000);
      const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      const periodKey = `${year}-W${String(week).padStart(2, '0')}`;
      db.prepare('INSERT OR IGNORE INTO featured_posts (post_id, period_type, period_key) VALUES (?, ?, ?)').run(req.params.id, 'weekly', periodKey);
    } else {
      // Remove from featured_posts
      const year = new Date().getFullYear();
      const now = new Date();
      const startOfYear = new Date(year, 0, 1);
      const days = Math.floor((now - startOfYear) / 86400000);
      const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      const periodKey = `${year}-W${String(week).padStart(2, '0')}`;
      db.prepare('DELETE FROM featured_posts WHERE post_id = ? AND period_type = ? AND period_key = ?').run(req.params.id, 'weekly', periodKey);
    }

    logAction({ adminId: req.user.id, action: newVal ? 'feature_post' : 'unfeature_post', targetType: 'post', targetId: Number(req.params.id), details: (newVal ? '加精' : '取消加精') + ': ' + post.title });
    res.json({ success: true, is_featured: newVal, message: newVal ? '已加精' : '已取消加精' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败' });
  }
});

// Get all posts with status (for admin view)
router.get('/all-posts', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  
  const posts = db.prepare(`
    SELECT p.*, u.username, u.nickname, u.avatar, t.name as tag_name, t.color as tag_color
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN tags t ON p.tag_id = t.id
    ORDER BY p.created_at DESC
    LIMIT 50
  `).all();
  
  res.json({ posts });
});

// ===== User Management =====

// List all users
router.get('/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const users = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.nickname,
      u.role,
      u.approved,
      u.is_banned,
      u.banned_reason,
      u.banned_at,
      u.ai_quota,
      u.ai_reset_date,
      u.created_at,
      u.last_login,
      (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS post_count
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT 300
  `).all();

  res.json({ users });
});

// Create internal beta user directly
router.post('/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const username = String(req.body.username || '').trim();
  const nickname = String(req.body.nickname || '').trim();
  const password = String(req.body.password || '');
  const role = String(req.body.role || 'member').trim().toLowerCase() === 'admin' ? 'admin' : 'member';
  const quota = Number.isFinite(Number(req.body.ai_quota)) ? Number(req.body.ai_quota) : AI_DAILY_QUOTA;

  if (!username || password.length < 6) {
    return res.status(400).json({ error: '用户名不能为空且密码至少6位' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const today = getToday();
  const safeQuota = Math.max(0, Math.min(100000, Math.floor(quota)));

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare(`
      INSERT INTO users (username, password, nickname, role, approved, ai_quota, ai_reset_date, is_banned)
      VALUES (?, ?, ?, ?, 1, ?, ?, 0)
    `).run(username, hashedPassword, nickname || username, role, safeQuota, today);

    const user = db.prepare(`
      SELECT id, username, nickname, role, approved, ai_quota, ai_reset_date, is_banned, created_at
      FROM users
      WHERE id = ?
    `).get(result.lastInsertRowid);

    res.json({ success: true, message: '用户已创建', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建用户失败' });
  }
});

// Ban user
router.post('/users/:id/ban', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: '用户ID无效' });
  }
  if (userId === Number(req.user.id)) {
    return res.status(400).json({ error: '不能封禁当前登录管理员账号' });
  }

  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!target) {
    return res.status(404).json({ error: '用户不存在' });
  }
  if (String(target.role || '').toLowerCase() === 'admin') {
    return res.status(400).json({ error: '不能封禁管理员账号' });
  }

  const reason = String(req.body.reason || '').trim().slice(0, 200);

  db.prepare(`
    UPDATE users
    SET is_banned = 1,
        banned_reason = ?,
        banned_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reason || '管理员封禁', userId);

  logAction({ adminId: req.user.id, action: 'ban_user', targetType: 'user', targetId: userId, reason: reason || '管理员封禁', details: `封禁用户 ID: ${userId}` });

  res.json({ success: true, message: '已封禁该用户' });
});

// Unban user
router.post('/users/:id/unban', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: '用户ID无效' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!target) {
    return res.status(404).json({ error: '用户不存在' });
  }

  db.prepare(`
    UPDATE users
    SET is_banned = 0,
        banned_reason = NULL,
        banned_at = NULL
    WHERE id = ?
  `).run(userId);

  logAction({ adminId: req.user.id, action: 'unban_user', targetType: 'user', targetId: userId, details: `解除封禁用户 ID: ${userId}` });

  res.json({ success: true, message: '已解除封禁' });
});

// Reset/set today's AI quota for a user
router.post('/users/:id/quota', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: '用户ID无效' });
  }

  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!target) {
    return res.status(404).json({ error: '用户不存在' });
  }
  if (String(target.role || '').toLowerCase() === 'admin') {
    return res.status(400).json({ error: '管理员账号为无限额度，无需重置' });
  }

  const quotaInput = Number.isFinite(Number(req.body.quota)) ? Number(req.body.quota) : AI_DAILY_QUOTA;
  const nextQuota = Math.max(0, Math.min(100000, Math.floor(quotaInput)));
  const today = getToday();

  db.prepare('UPDATE users SET ai_quota = ?, ai_reset_date = ? WHERE id = ?')
    .run(nextQuota, today, userId);

  res.json({ success: true, message: `已设置今日额度为 ${nextQuota}` });
});

// ===== Auto Moderation =====

// Auto-review a single post
router.post('/posts/:id/auto-review', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) {
    return res.status(404).json({ error: '帖子不存在' });
  }

  const raw = await callBailianModeration(post.title, post.content);
  const result = parseModerationResult(raw);

  // Save AI result
  db.prepare('UPDATE posts SET moderation_result = ? WHERE id = ?').run(raw || 'error', post.id);

  if (result === 'approved') {
    db.prepare("UPDATE posts SET status = 'approved' WHERE id = ?").run(post.id);
    // Generate AI summary (fire-and-forget)
    if (post.content) {
      generatePostSummary(post.title, post.content).then(summary => {
        if (summary && summary.length > 5) {
          db.prepare('UPDATE posts SET summary = ? WHERE id = ?').run(summary, post.id);
        }
      }).catch(() => {});
    }
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, content, post_id)
      VALUES (?, 'post_approved', '🎉 帖子审核通过', '您的帖子「' || ? || '」已通过审核，现在可以在社区看到了！', ?)
    `).run(post.user_id, post.title, post.id);
    sendPushToUser(post.user_id, {
      title: '🎉 帖子审核通过',
      body: '您的帖子「' + post.title + '」已通过 AI 自动审核',
      url: '/post/' + post.id,
      tag: 'post-approved'
    });
    notifyUserPostApproved(post.user_id, post.title, '/post/' + post.id);
    logAction({ adminId: req.user.id, action: 'auto_approve_post', targetType: 'post', targetId: Number(post.id), details: `AI自动通过: ${post.title} | AI回复: ${raw}` });
    // Check milestones (post approved by AI)
    checkMilestones('posts');
    return res.json({ success: true, result: 'approved', ai_response: raw, message: 'AI 审核通过，帖子已发布' });
  }

  if (result === 'rejected') {
    db.prepare("UPDATE posts SET status = 'rejected' WHERE id = ?").run(post.id);
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, content, post_id)
      VALUES (?, 'post_rejected', '❌ 帖子审核未通过', '您的帖子「' || ? || '」未通过审核（AI自动判定），请联系管理员申诉', ?)
    `).run(post.user_id, post.title, post.id);
    sendPushToUser(post.user_id, {
      title: '❌ 帖子审核未通过',
      body: '您的帖子「' + post.title + '」未通过 AI 自动审核，请联系管理员申诉',
      url: '/post/' + post.id,
      tag: 'post-rejected'
    });
    notifyUserPostRejected(post.user_id, post.title, 'AI自动审核未通过，请联系管理员', '/post/' + post.id);
    logAction({ adminId: req.user.id, action: 'auto_reject_post', targetType: 'post', targetId: Number(post.id), reason: 'AI自动拒绝', details: `AI拒绝: ${post.title} | AI回复: ${raw}` });
    return res.json({ success: true, result: 'rejected', ai_response: raw, message: 'AI 审核拒绝，帖子已下线' });
  }

  // manual_review or error - keep pending
  logAction({ adminId: req.user.id, action: 'auto_review_post', targetType: 'post', targetId: Number(post.id), reason: 'AI建议人工审核', details: `AI回复: ${raw}` });
  return res.json({ success: true, result: result === 'manual_review' ? 'manual_review' : 'error', ai_response: raw, message: 'AI 无法判断，已标记待人工审核' });
});

// Auto-review all pending posts
router.post('/posts/auto-review-all', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const pending = db.prepare(`
    SELECT p.*, u.username, u.nickname
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.status = 'pending'
    ORDER BY p.created_at ASC
    LIMIT 50
  `).all();

  if (pending.length === 0) {
    return res.json({ success: true, message: '没有待审核的帖子', processed: 0 });
  }

  const results = { approved: 0, rejected: 0, manual_review: 0, error: 0 };

  for (const post of pending) {
    const raw = await callBailianModeration(post.title, post.content);
    const result = parseModerationResult(raw);

    db.prepare('UPDATE posts SET moderation_result = ? WHERE id = ?').run(raw || 'error', post.id);

    if (result === 'approved') {
      db.prepare("UPDATE posts SET status = 'approved' WHERE id = ?").run(post.id);
      // Generate AI summary
      if (post.content) {
        generatePostSummary(post.title, post.content).then(summary => {
          if (summary && summary.length > 5) {
            db.prepare('UPDATE posts SET summary = ? WHERE id = ?').run(summary, post.id);
          }
        }).catch(() => {});
      }
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, content, post_id)
        VALUES (?, 'post_approved', '🎉 帖子审核通过', '您的帖子「' || ? || '」已通过审核，现在可以在社区看到了！', ?)
      `).run(post.user_id, post.title, post.id);
      logAction({ adminId: req.user.id, action: 'auto_approve_post', targetType: 'post', targetId: Number(post.id), details: `AI批量审核通过: ${post.title}` });
      results.approved++;
    } else if (result === 'rejected') {
      db.prepare("UPDATE posts SET status = 'rejected' WHERE id = ?").run(post.id);
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, content, post_id)
        VALUES (?, 'post_rejected', '❌ 帖子审核未通过', '您的帖子「' || ? || '」未通过审核（AI自动判定），请联系管理员申诉', ?)
      `).run(post.user_id, post.title, post.id);
      logAction({ adminId: req.user.id, action: 'auto_reject_post', targetType: 'post', targetId: Number(post.id), reason: 'AI批量拒绝', details: `AI批量拒绝: ${post.title}` });
      results.rejected++;
    } else {
      results.manual_review++;
    }

    // Delay to avoid rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  res.json({
    success: true,
    message: `批量审核完成：通过${results.approved}篇 / 拒绝${results.rejected}篇 / 待人工${results.manual_review}篇`,
    results
  });
});

// ===== Moderation Log =====

router.get('/moderation-log', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const { page = 1, limit = 50, action, admin_id } = req.query;
  const offset = (page - 1) * limit;

  let where = '1=1';
  const params = [];

  if (action) {
    where += ' AND m.action = ?';
    params.push(action);
  }
  if (admin_id) {
    where += ' AND m.admin_id = ?';
    params.push(Number(admin_id));
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM moderation_log m WHERE ${where}`).get(...params);
  const logs = db.prepare(`
    SELECT m.*, u.username as admin_username, u.nickname as admin_nickname
    FROM moderation_log m
    LEFT JOIN users u ON m.admin_id = u.id
    WHERE ${where}
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  res.json({
    logs,
    total: countRow.total,
    page: Number(page),
    limit: Number(limit),
    pages: Math.ceil(countRow.total / limit)
  });
});

// ===== User Actions Log (All Users) =====
router.get('/user-actions-log', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const { page = 1, limit = 50, action, user_id } = req.query;
  const offset = (page - 1) * limit;

  let where = '1=1';
  const params = [];

  if (action) {
    where += ' AND a.action = ?';
    params.push(action);
  }
  if (user_id) {
    where += ' AND a.user_id = ?';
    params.push(Number(user_id));
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM user_actions_log a WHERE ${where}`).get(...params);
  const logs = db.prepare(`
    SELECT a.*, u.username as user_username, u.nickname as user_nickname
    FROM user_actions_log a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE ${where}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  res.json({
    logs,
    total: countRow.total,
    page: Number(page),
    limit: Number(limit),
    pages: Math.ceil(countRow.total / limit)
  });
});

// ===== Security / Login Attempts Log =====
router.get('/security-logs', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const { page = 1, limit = 30, ip, username, status } = req.query;
  const offset = (page - 1) * Number(limit);

  let where = '1=1';
  const params = [];

  if (ip) {
    where += ' AND la.ip_address LIKE ?';
    params.push('%' + ip + '%');
  }
  if (username) {
    where += ' AND (la.username LIKE ? OR u.nickname LIKE ?)';
    params.push('%' + username + '%', '%' + username + '%');
  }
  if (status === 'success') {
    where += ' AND la.success = 1';
  } else if (status === 'failed') {
    where += ' AND la.success = 0';
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM login_attempts la LEFT JOIN users u ON la.user_id = u.id WHERE ${where}`).get(...params);
  const logs = db.prepare(`
    SELECT la.*, u.username, u.nickname, u.email
    FROM login_attempts la
    LEFT JOIN users u ON la.user_id = u.id
    WHERE ${where}
    ORDER BY la.attempted_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  // Stats
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0];

  const lockedIps = db.prepare(`
    SELECT COUNT(DISTINCT ip_address) as c FROM login_attempts
    WHERE success = 0 AND attempted_at > ?
  `).get(oneHourAgo).c;

  const todayFailed = db.prepare(`
    SELECT COUNT(*) as c FROM login_attempts
    WHERE success = 0 AND date(attempted_at) = ?
  `).get(today).c;

  const todaySuccess = db.prepare(`
    SELECT COUNT(*) as c FROM login_attempts
    WHERE success = 1 AND date(attempted_at) = ?
  `).get(today).c;

  res.json({
    logs,
    total: countRow.total,
    page: Number(page),
    limit: Number(limit),
    pages: Math.ceil(countRow.total / Number(limit)),
    stats: { lockedIps, todayFailed, todaySuccess }
  });
});

// DELETE: unlock (clear failed attempts for an IP)
router.delete('/unlock-ip', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  const { ip } = req.query;
  if (!ip) return res.status(400).json({ error: '缺少 IP 参数' });

  const result = db.prepare('DELETE FROM login_attempts WHERE ip_address = ? AND success = 0').run(ip);
  res.json({ success: true, deleted: result.changes });
});

// ===== Post Views Log =====
router.get('/post-views-log', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const { page = 1, limit = 50, post_id } = req.query;
  const offset = (page - 1) * limit;

  let where = '1=1';
  const params = [];

  if (post_id) {
    where += ' AND v.post_id = ?';
    params.push(Number(post_id));
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM post_views v WHERE ${where}`).get(...params);
  const views = db.prepare(`
    SELECT v.*, u.username as user_username, u.nickname as user_nickname,
           p.title as post_title
    FROM post_views v
    LEFT JOIN users u ON v.user_id = u.id
    LEFT JOIN posts p ON v.post_id = p.id
    WHERE ${where}
    ORDER BY v.viewed_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  res.json({
    views,
    total: countRow.total,
    page: Number(page),
    limit: Number(limit),
    pages: Math.ceil(countRow.total / limit)
  });
});

// ===== Word Filter Management =====

// Get word list
router.get('/word-filter', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  const { refreshWords, getWordList } = require('../middleware/wordFilter');
  refreshWords();
  res.json({ words: getWordList() });
});

// Add word(s)
router.post('/word-filter', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  const { words } = req.body;
  if (!words || !Array.isArray(words)) {
    return res.status(400).json({ error: 'words 必须是数组' });
  }

  const fs = require('fs');
  const path = require('path');
  const WORD_FILE = path.join(__dirname, '../data/word-filter.txt');

  const existing = fs.existsSync(WORD_FILE) ? fs.readFileSync(WORD_FILE, 'utf8') : '';
  const existingSet = new Set(existing.split(/\r?\n/).map(w => w.trim()).filter(w => w && !w.startsWith('#')));

  const newWords = words.filter(w => w && w.trim() && !existingSet.has(w.trim()));
  if (newWords.length > 0) {
    fs.appendFileSync(WORD_FILE, '\n' + newWords.join('\n'), 'utf8');
  }

  const { refreshWords, getWordList } = require('../middleware/wordFilter');
  refreshWords();

  logAction({ adminId: req.user.id, action: 'add_word_filter', targetType: 'system', details: `新增 ${newWords.length} 个敏感词: ${newWords.join(', ')}` });

  res.json({ success: true, message: `新增 ${newWords.length} 个敏感词`, words: getWordList() });
});

// Remove word
router.delete('/word-filter', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  const { word } = req.body;
  if (!word) {
    return res.status(400).json({ error: '缺少 word 参数' });
  }

  const fs = require('fs');
  const path = require('path');
  const WORD_FILE = path.join(__dirname, '../data/word-filter.txt');

  if (!fs.existsSync(WORD_FILE)) {
    return res.status(404).json({ error: '词库文件不存在' });
  }

  const lines = fs.readFileSync(WORD_FILE, 'utf8').split(/\r?\n/);
  const filtered = lines.filter(l => l.trim() !== word.trim());
  fs.writeFileSync(WORD_FILE, filtered.join('\n'), 'utf8');

  const { refreshWords, getWordList } = require('../middleware/wordFilter');
  refreshWords();

  logAction({ adminId: req.user.id, action: 'remove_word_filter', targetType: 'system', details: `删除敏感词: ${word}` });

  res.json({ success: true, message: `已删除「${word}」`, words: getWordList() });
});

// ===== Statistics Dashboard =====

router.get('/stats', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  try {
    const range = String(req.query.range || '7');
    const days = range === '30' ? 30 : 7;
    const cutoffDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // User stats
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const activeUsers = db.prepare(`
      SELECT COUNT(DISTINCT id) as c FROM users
      WHERE last_login >= ? OR DATE(created_at) >= ?
    `).get(cutoffDate, cutoffDate).c;
    const newUsers = db.prepare(`
      SELECT COUNT(*) as c FROM users WHERE DATE(created_at) >= ?
    `).get(cutoffDate).c;
    const pendingApps = db.prepare(`
      SELECT COUNT(*) as c FROM applications WHERE status = 'pending'
    `).get().c;

    // Post stats
    const totalPosts = db.prepare('SELECT COUNT(*) as c FROM posts').get().c;
    const newPosts = db.prepare(`
      SELECT COUNT(*) as c FROM posts WHERE DATE(created_at) >= ?
    `).get(cutoffDate).c;
    const pendingPosts = db.prepare(`
      SELECT COUNT(*) as c FROM posts WHERE status = 'pending'
    `).get().c;

    // Daily post trend
    const dailyPosts = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM posts
      WHERE created_at >= ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all(cutoffDate);

    // Daily new user trend
    const dailyUsers = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM users
      WHERE created_at >= ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all(cutoffDate);

    // Daily active users (by last_login)
    const dailyActive = db.prepare(`
      SELECT DATE(last_login) as date, COUNT(*) as count
      FROM users
      WHERE last_login >= ?
      GROUP BY DATE(last_login)
      ORDER BY date ASC
    `).all(cutoffDate);

    // Tag distribution (posts per tag)
    const tagDist = db.prepare(`
      SELECT t.name, t.color, COUNT(p.id) as count
      FROM tags t
      LEFT JOIN posts p ON p.tag_id = t.id AND p.status = 'approved'
      GROUP BY t.id, t.name, t.color
      ORDER BY count DESC
      LIMIT 20
    `).all();

    // Top posters
    const topPosters = db.prepare(`
      SELECT u.id, u.username, u.nickname, u.avatar,
             COUNT(p.id) as post_count
      FROM users u
      LEFT JOIN posts p ON p.user_id = u.id AND p.status = 'approved'
      GROUP BY u.id
      HAVING post_count > 0
      ORDER BY post_count DESC
      LIMIT 10
    `).all();

    // ── Helper functions (defined before use) ─────────────────────────────────
    function getDauMauTrend() {
      const days30 = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days30.push({ date: d.toISOString().slice(0, 10), label: d.toISOString().slice(5, 10) });
      }
      const startDate = days30[0].date;

      const dauRows = db.prepare(`
        SELECT DATE(last_login) as date, COUNT(DISTINCT id) as count
        FROM users
        WHERE last_login IS NOT NULL AND DATE(last_login) >= ?
        GROUP BY DATE(last_login)
      `).all(startDate);

      const dauMap = {};
      dauRows.forEach(r => { dauMap[r.date] = r.count; });

      const mauMap = {};
      days30.forEach(day => {
        const start = new Date(day.date); start.setDate(start.getDate() - 29);
        const startStr = start.toISOString().slice(0, 10);
        const mau = db.prepare(`
          SELECT COUNT(DISTINCT id) as c FROM users
          WHERE last_login >= ? OR DATE(created_at) >= ?
        `).get(startStr, startStr).c;
        mauMap[day.date] = mau;
      });

      return days30.map(d => ({
        date: d.date, label: d.label,
        dau: dauMap[d.date] || 0,
        mau: mauMap[d.date] || 0
      }));
    }

    function getActivityHeatmap() {
      const rows = db.prepare(`
        SELECT strftime('%w', created_at) as dow,
               strftime('%H', created_at) as hour,
               COUNT(*) as count
        FROM user_actions_log
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY dow, hour
      `).all();

      const checkinRows = db.prepare(`
        SELECT strftime('%w', created_at) as dow,
               strftime('%H', created_at) as hour,
               COUNT(*) as count
        FROM checkins
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY dow, hour
      `).all();

      const postRows = db.prepare(`
        SELECT strftime('%w', created_at) as dow,
               strftime('%H', created_at) as hour,
               COUNT(*) as count
        FROM posts
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY dow, hour
      `).all();

      const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
      rows.forEach(r => { matrix[Number(r.dow)][Number(r.hour)] += r.count; });
      checkinRows.forEach(r => { matrix[Number(r.dow)][Number(r.hour)] += r.count; });
      postRows.forEach(r => { matrix[Number(r.dow)][Number(r.hour)] += r.count * 2; });
      return matrix;
    }

    res.json({
      summary: {
        totalUsers, activeUsers, newUsers, pendingApps,
        totalPosts, newPosts, pendingPosts,
      },
      trend: {
        dailyPosts,
        dailyUsers,
        dailyActive,
      },
      dauMau: getDauMauTrend(),
      heatmap: getActivityHeatmap(),
      tagDist,
      topPosters,
      range: days,
    });
  } catch (err) {
    console.error('[Admin] Stats error:', err);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// ===== FTS Index Management =====

router.post('/rebuild-fts', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  try {
    const { rebuildPostsFTS } = require('../models/database');
    rebuildPostsFTS();
    res.json({ success: true, message: '搜索索引重建完成' });
  } catch (err) {
    console.error('[Admin] FTS重建失败:', err);
    res.status(500).json({ error: '索引重建失败: ' + err.message });
  }
});

// GET /api/admin/daily-report - Daily or weekly community data report
router.get('/daily-report', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  try {
    const period = req.query.period || 'daily'; // 'daily' or 'weekly'
    const days = period === 'weekly' ? 7 : 1;
    const now = new Date();
    var startDate = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);

    // User stats
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const newUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE DATE(created_at) >= ?').get(startDate).c;
    const activeUsers = db.prepare('SELECT COUNT(DISTINCT user_id) as c FROM user_actions_log WHERE created_at >= ?').get(startDate + 'T00:00:00Z').c;

    // Post stats
    const newPosts = db.prepare("SELECT COUNT(*) as c FROM posts WHERE status = 'approved' AND DATE(created_at) >= ?").get(startDate).c;
    const totalPosts = db.prepare("SELECT COUNT(*) as c FROM posts WHERE status = 'approved'").get().c;
    const pendingPosts = db.prepare("SELECT COUNT(*) as c FROM posts WHERE status = 'pending'").get().c;

    // Comment stats
    const newComments = db.prepare('SELECT COUNT(*) as c FROM comments WHERE DATE(created_at) >= ?').get(startDate).c;

    // Engagement
    const newReactions = db.prepare("SELECT COUNT(*) as c FROM post_reactions WHERE DATE(created_at) >= ?").get(startDate).c;
    const newCheckins = db.prepare('SELECT COUNT(*) as c FROM checkins WHERE DATE(checkin_date) >= ?').get(startDate).c;
    const newLogins = db.prepare('SELECT COUNT(*) as c FROM user_login_rewards WHERE DATE(reward_date) >= ?').get(startDate).c;

    // Top content (by reactions in period)
    const topPosts = db.prepare(`
      SELECT p.id, p.title, p.ai_summary,
             (SELECT COUNT(*) FROM post_reactions WHERE post_id = p.id) as likes,
             (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments
      FROM posts p
      WHERE p.status = 'approved' AND DATE(p.created_at) >= ?
      ORDER BY likes DESC, comments DESC
      LIMIT 5
    `).all(startDate);

    // New users this period
    const recentUsers = db.prepare(`
      SELECT id, username, nickname, avatar, created_at
      FROM users
      WHERE DATE(created_at) >= ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(startDate);

    res.json({
      period, startDate, endDate: now.toISOString().slice(0, 10),
      stats: { totalUsers, newUsers, activeUsers, totalPosts, newPosts, pendingPosts, newComments, newReactions, newCheckins, newLogins },
      topPosts, recentUsers
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
