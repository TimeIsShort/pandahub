const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

// Record a post view (POST /api/browse-history/view)
router.post('/view', authMiddleware, (req, res) => {
  try {
    const { post_id } = req.body;
    if (!post_id) return res.status(400).json({ error: 'post_id required' });
    // Upsert view record (don't track duplicate views, just update time)
    db.prepare(`
      INSERT INTO post_views (user_id, post_id, viewed_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, post_id) DO UPDATE SET viewed_at = CURRENT_TIMESTAMP
    `).run(req.user.id, post_id);
    res.json({ success: true });
  } catch(e) {
    console.error('[BrowseHistory]', e);
    res.status(500).json({ error: '记录浏览历史失败' });
  }
});

// Get user's browse history (GET /api/browse-history?limit=20&offset=0)
router.get('/', authMiddleware, (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;
    const history = db.prepare(`
      SELECT pv.viewed_at, p.id, p.title, p.ai_summary, p.created_at,
             u.nickname, u.username, u.avatar,
             t.name as tag_name, t.color as tag_color,
             (SELECT COUNT(*) FROM post_reactions WHERE post_id = p.id AND type = 'like') as like_count,
             (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
      FROM post_views pv
      JOIN posts p ON p.id = pv.post_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      WHERE pv.user_id = ?
      ORDER BY pv.viewed_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, limit, offset);

    const total = db.prepare('SELECT COUNT(*) as c FROM post_views WHERE user_id = ?').get(req.user.id).c;
    res.json({ history, total });
  } catch(e) {
    console.error('[BrowseHistory]', e);
    res.status(500).json({ error: '获取浏览历史失败' });
  }
});

// Clear browse history
router.delete('/clear', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM post_views WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
  } catch(e) {
    console.error('[BrowseHistory]', e);
    res.status(500).json({ error: '清除浏览历史失败' });
  }
});

module.exports = router;
