const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { sendPushToUser } = require('../utils/pushHelper');

const router = express.Router();

// Get conversation list (all users I've chatted with, latest message per user)
router.get('/conversations', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    // Get latest message per conversation partner (sent or received)
    const conversations = db.prepare(`
      SELECT
        m.*,
        CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END as partner_id,
        CASE WHEN m.sender_id = ? THEN ru.nickname ELSE su.nickname END as partner_nickname,
        CASE WHEN m.sender_id = ? THEN ru.avatar ELSE su.avatar END as partner_avatar,
        CASE WHEN m.sender_id = ? THEN ru.username ELSE su.username END as partner_username
      FROM messages m
      LEFT JOIN users su ON m.sender_id = su.id
      LEFT JOIN users ru ON m.receiver_id = ru.id
      WHERE m.sender_id = ? OR m.receiver_id = ?
      ORDER BY m.created_at DESC
    `).all(userId, userId, userId, userId, userId, userId);

    // Deduplicate by partner_id (keep latest)
    const seen = new Set();
    const unique = [];
    for (const c of conversations) {
      if (!seen.has(c.partner_id)) {
        seen.add(c.partner_id);
        // Count unread
        const unread = db.prepare(`
          SELECT COUNT(*) as c FROM messages
          WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
        `).get(c.partner_id, userId).c;
        c.unread_count = unread;
        unique.push(c);
      }
    }

    // Sort by latest message time
    unique.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ conversations: unique });
  } catch (err) {
    console.error('[Messages]', err);
    res.status(500).json({ error: '获取会话列表失败' });
  }
});

// Get messages with a specific user
router.get('/with/:userId', authMiddleware, (req, res) => {
  try {
    const myId = req.user.id;
    const partnerId = Number(req.params.userId);

    // Mark all messages from partner to me as read
    db.prepare(`
      UPDATE messages SET is_read = 1
      WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
    `).run(partnerId, myId);

    const messages = db.prepare(`
      SELECT m.*, u.avatar as sender_avatar, u.nickname as sender_nickname
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE (m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.created_at ASC
    `).all(myId, partnerId, partnerId, myId);

    res.json({ messages });
  } catch (err) {
    console.error('[Messages]', err);
    res.status(500).json({ error: '获取消息失败' });
  }
});

// Send a message
router.post('/', authMiddleware, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiver_id, content } = req.body;

    if (!receiver_id) return res.status(400).json({ error: 'receiver_id 不能为空' });
    if (!content || !content.trim()) return res.status(400).json({ error: '消息内容不能为空' });
    if (content.trim().length > 2000) return res.status(400).json({ error: '消息不能超过2000字' });
    if (senderId === Number(receiver_id)) return res.status(400).json({ error: '不能给自己发私信' });

    // Check receiver exists
    const receiver = db.prepare('SELECT id, nickname, username FROM users WHERE id = ?').get(receiver_id);
    if (!receiver) return res.status(404).json({ error: '用户不存在' });

    const result = db.prepare(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)'
    ).run(senderId, receiver_id, content.trim());

    const message = db.prepare(`
      SELECT m.*, u.avatar as sender_avatar, u.nickname as sender_nickname
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);

    // Web Push notification to receiver
    const sender = db.prepare('SELECT nickname, username FROM users WHERE id = ?').get(senderId);
    sendPushToUser(receiver_id, {
      title: '💬 新私信',
      body: (sender.nickname || sender.username) + '：' + content.trim().substring(0, 50),
      url: '/#/messages',
      tag: 'private-message'
    });

    res.json({ message });
  } catch (err) {
    console.error('[Messages]', err);
    res.status(500).json({ error: '发送失败' });
  }
});

// Get unread count
router.get('/unread-count', authMiddleware, (req, res) => {
  try {
    const count = db.prepare(
      'SELECT COUNT(*) as c FROM messages WHERE receiver_id = ? AND is_read = 0'
    ).get(req.user.id).c;
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

module.exports = router;
