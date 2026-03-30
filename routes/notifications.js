const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const TYPE_LABELS = {
  new_comment: '💬 评论',
  new_reply: '💬 回复',
  post_approved: '🎉 审核通过',
  post_rejected: '❌ 审核拒绝',
  mention: '@ 提及',
  system: '🔔 系统',
};

// Get user's notifications (paginated + filterable)
router.get('/', authMiddleware, (req, res) => {
  try {
    const { type = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE n.user_id = ?';
    let params = [req.user.id];

    if (type) {
      where += ' AND n.type = ?';
      params.push(type);
    }

    const notifications = db.prepare(`
      SELECT n.*, p.title as post_title
      FROM notifications n
      LEFT JOIN posts p ON n.post_id = p.id
      ${where}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), Number(offset));

    const totalResult = db.prepare(`
      SELECT COUNT(*) as c FROM notifications n ${where}
    `).get(...params);

    const unreadResult = db.prepare(`
      SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0
    `).get(req.user.id);

    // Add human-readable type label
    notifications.forEach(n => {
      n.typeLabel = TYPE_LABELS[n.type] || '🔔 通知';
    });

    res.json({
      notifications,
      total: totalResult.c,
      unreadCount: unreadResult.c,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取通知失败' });
  }
});

// Mark notification as read
router.post('/:id/read', authMiddleware, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败' });
  }
});

// Mark all as read
router.post('/read-all', authMiddleware, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')
      .run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败' });
  }
});

// Get unread count
router.get('/unread-count', authMiddleware, (req, res) => {
  try {
    const result = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(req.user.id);
    res.json({ count: result.count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取失败' });
  }
});

module.exports = router;
