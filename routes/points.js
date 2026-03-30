const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Transfer points to another user
router.post('/transfer', authMiddleware, (req, res) => {
  try {
    const fromUserId = req.user.id;
    const { to_username, amount, note } = req.body;

    if (!to_username || !amount) {
      return res.status(400).json({ error: '请提供目标用户名和转账金额' });
    }
    const amountNum = Number(amount);
    if (!Number.isInteger(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: '转账金额必须为正整数' });
    }

    // Find target user
    const toUser = db.prepare('SELECT id, username, nickname FROM users WHERE username = ? OR nickname = ?').get(to_username, to_username);
    if (!toUser) {
      return res.status(404).json({ error: '目标用户不存在' });
    }
    if (toUser.id === fromUserId) {
      return res.status(400).json({ error: '不能给自己转账' });
    }

    // Check balance
    const fromUser = db.prepare('SELECT points FROM users WHERE id = ?').get(fromUserId);
    if (fromUser.points < amountNum) {
      return res.status(403).json({ error: '积分不足，当前余额 ' + fromUser.points });
    }

    // Deduct from sender
    db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(amountNum, fromUserId);
    // Add to receiver
    db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(amountNum, toUser.id);
    // Record transfer
    const result = db.prepare(
      'INSERT INTO point_transfers (from_user_id, to_user_id, amount, note) VALUES (?, ?, ?, ?)'
    ).run(fromUserId, toUser.id, amountNum, note || null);

    res.json({ success: true, id: result.lastInsertRowid, amount: amountNum });
  } catch (err) {
    console.error('[Points transfer]', err);
    res.status(500).json({ error: '转账失败' });
  }
});

// Get my transfer records (sent + received)
router.get('/transfers', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const sent = db.prepare(`
      SELECT t.*, u.username as to_username, u.nickname as to_nickname, u.avatar as to_avatar
      FROM point_transfers t
      JOIN users u ON t.to_user_id = u.id
      WHERE t.from_user_id = ?
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, Number(limit), Number(offset));

    const sentTotal = db.prepare('SELECT COUNT(*) as c FROM point_transfers WHERE from_user_id = ?').get(userId).c;

    const received = db.prepare(`
      SELECT t.*, u.username as from_username, u.nickname as from_nickname, u.avatar as from_avatar
      FROM point_transfers t
      JOIN users u ON t.from_user_id = u.id
      WHERE t.to_user_id = ?
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, Number(limit), Number(offset));

    const receivedTotal = db.prepare('SELECT COUNT(*) as c FROM point_transfers WHERE to_user_id = ?').get(userId).c;

    res.json({ sent, sentTotal, received, receivedTotal });
  } catch (err) {
    console.error('[Points transfers]', err);
    res.status(500).json({ error: '获取记录失败' });
  }
});

module.exports = router;
