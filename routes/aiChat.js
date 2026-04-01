const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// Save a chat message
router.post('/', authMiddleware, (req, res) => {
  try {
    const { role, content, model, tokens_used } = req.body;
    if (!role || !content) return res.status(400).json({ error: '缺少参数' });
    if (!['user', 'assistant', 'system'].includes(role)) {
      return res.status(400).json({ error: '无效的角色' });
    }
    const result = db.prepare(
      'INSERT INTO ai_chat_history (user_id, role, content, model, tokens_used) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, role, content, model || null, tokens_used || null);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('[AIChat]', err);
    res.status(500).json({ error: '保存失败' });
  }
});

// Batch save messages (for saving a complete conversation turn)
router.post('/batch', authMiddleware, (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages必须是数组' });
    const stmt = db.prepare(
      'INSERT INTO ai_chat_history (user_id, role, content, model, tokens_used) VALUES (?, ?, ?, ?, ?)'
    );
    const saveMany = db.transaction((msgs) => {
      for (const m of msgs) {
        if (m.role && m.content) {
          stmt.run(req.user.id, m.role, m.content, m.model || null, m.tokens_used || null);
        }
      }
    });
    saveMany(messages);
    res.json({ success: true });
  } catch (err) {
    console.error('[AIChat batch]', err);
    res.status(500).json({ error: '保存失败' });
  }
});

// Get chat history (paginated, oldest first for loading more)
router.get('/', authMiddleware, (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const before = req.query.before ? new Date(req.query.before).toISOString() : null;

    let query = 'SELECT id, role, content, model, tokens_used, created_at FROM ai_chat_history WHERE user_id = ?';
    let params = [req.user.id];

    if (before) {
      query += ' AND created_at < ?';
      params.push(before);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit + 1); // fetch one extra to check if there are more

    const rows = db.prepare(query).all(...params);
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    // Return oldest first for chronological order
    rows.reverse();

    res.json({ messages: rows, hasMore });
  } catch (err) {
    console.error('[AIChat]', err);
    res.status(500).json({ error: '获取历史失败' });
  }
});

// Clear chat history
router.delete('/', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM ai_chat_history WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '清除失败' });
  }
});

module.exports = router;
