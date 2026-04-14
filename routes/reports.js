const express = require('express');
const db = require('../models/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const REPORT_REASONS = [
  { value: 'spam', label: '🚨 垃圾广告' },
  { value: 'harmful', label: '⚠️ 有害信息' },
  { value: 'harassment', label: '😠 人身攻击' },
  { value: 'misinformation', label: '📰 虚假信息' },
  { value: 'copyright', label: '©️ 侵权抄袭' },
  { value: 'other', label: '📝 其他问题' },
];

// Get report reasons (public)
router.get('/reasons', (req, res) => {
  res.json({ reasons: REPORT_REASONS });
});

// Create a report (login required)
router.post('/', authMiddleware, (req, res) => {
  try {
    const { target_type, target_id, reason, description } = req.body;
    const reporterId = req.user.id;

    if (!['post', 'comment'].includes(target_type)) {
      return res.status(400).json({ error: '无效的举报对象类型' });
    }
    if (!reason) {
      return res.status(400).json({ error: '请选择举报原因' });
    }
    if (!target_id || !Number.isInteger(Number(target_id)) || Number(target_id) <= 0) {
      return res.status(400).json({ error: '无效的目标ID' });
    }

    // Check target exists
    if (target_type === 'post') {
      const post = db.prepare('SELECT id, user_id, title FROM posts WHERE id = ?').get(target_id);
      if (!post) return res.status(404).json({ error: '帖子不存在' });
      if (post.user_id === reporterId) return res.status(400).json({ error: '不能举报自己的帖子' });
    } else {
      const comment = db.prepare('SELECT id, user_id FROM comments WHERE id = ?').get(target_id);
      if (!comment) return res.status(404).json({ error: '评论不存在' });
      if (comment.user_id === reporterId) return res.status(400).json({ error: '不能举报自己的评论' });
    }

    // Check not already reported by this user for same target
    const existing = db.prepare(
      'SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = ?'
    ).get(reporterId, target_type, target_id, 'pending');
    if (existing) {
      return res.status(400).json({ error: '您已举报过该内容，请等待处理' });
    }

    const result = db.prepare(
      'INSERT INTO reports (reporter_id, target_type, target_id, reason, description) VALUES (?, ?, ?, ?, ?)'
    ).run(reporterId, target_type, target_id, reason, description || null);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('[Reports]', err);
    res.status(500).json({ error: '举报失败' });
  }
});

// Get reports list (admin only)
router.get('/admin', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }

    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const validStatuses = ['pending', 'resolved', 'dismissed'];
    const statusParam = validStatuses.includes(status) ? status : 'pending';

    const reports = db.prepare(`
      SELECT r.*,
             reporter.username as reporter_username,
             reporter.nickname as reporter_nickname,
             reporter.avatar as reporter_avatar,
             target_user.username as target_username,
             target_user.nickname as target_nickname
      FROM reports r
      JOIN users reporter ON r.reporter_id = reporter.id
      LEFT JOIN posts p ON r.target_type = 'post' AND r.target_id = p.id
      LEFT JOIN comments c ON r.target_type = 'comment' AND r.target_id = c.id
      LEFT JOIN users target_user ON p.user_id = target_user.id OR c.user_id = target_user.id
      WHERE r.status = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(statusParam, Number(limit), Number(offset));

    const total = db.prepare(`SELECT COUNT(*) as c FROM reports r WHERE r.status = ?`).get(statusParam).c;

    // Fetch target content for display
    const enriched = reports.map(r => {
      let targetContent = '';
      if (r.target_type === 'post') {
        const post = db.prepare('SELECT title, user_id FROM posts WHERE id = ?').get(r.target_id);
        targetContent = post ? post.title : '(已删除)';
      } else {
        const comment = db.prepare('SELECT content, user_id FROM comments WHERE id = ?').get(r.target_id);
        targetContent = comment ? comment.content.substring(0, 100) : '(已删除)';
      }
      return { ...r, target_content: targetContent };
    });

    res.json({ reports: enriched, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[Reports admin]', err);
    res.status(500).json({ error: '获取举报列表失败' });
  }
});

// Dismiss (ignore) a report
router.post('/admin/:id/dismiss', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: '举报不存在' });

    db.prepare("UPDATE reports SET status = 'dismissed' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

// Take action on a report
router.post('/admin/:id/action', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    const { action, admin_note } = req.body; // action: 'delete_target' | 'ban_user' | 'warn_user'
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: '举报不存在' });

    if (action === 'delete_target') {
      if (report.target_type === 'post') {
        db.prepare('DELETE FROM posts WHERE id = ?').run(report.target_id);
      } else {
        db.prepare('DELETE FROM comments WHERE id = ?').run(report.target_id);
      }
    } else if (action === 'ban_user') {
      // Ban the content author
      let userId;
      if (report.target_type === 'post') {
        const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(report.target_id);
        userId = post ? post.user_id : null;
      } else {
        const comment = db.prepare('SELECT user_id FROM comments WHERE id = ?').get(report.target_id);
        userId = comment ? comment.user_id : null;
      }
      if (userId) {
        db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(userId);
      }
    }

    db.prepare("UPDATE reports SET status = 'resolved', admin_note = ? WHERE id = ?").run(admin_note || null, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Reports action]', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// Get pending report count (for admin badge)
router.get('/admin/count', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    const count = db.prepare("SELECT COUNT(*) as c FROM reports WHERE status = 'pending'").get().c;
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

module.exports = router;
