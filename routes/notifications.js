const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get user's notifications
router.get('/', authMiddleware, (req, res) => {
  try {
    const notifications = db.prepare(`
      SELECT n.*, p.title as post_title
      FROM notifications n
      LEFT JOIN posts p ON n.post_id = p.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50
    `).all(req.user.id);
    
    const unreadCount = notifications.filter(n => !n.is_read).length;
    
    res.json({ notifications, unreadCount });
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
