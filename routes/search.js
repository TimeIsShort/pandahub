const express = require('express');
const db = require('../models/database');

const router = express.Router();

// Full-text search
router.get('/', (req, res) => {
  try {
    const { q, tag_id, page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json({ posts: [], total: 0, page: 1, limit: 20, pages: 0 });
    }

    const result = db.prepare(`
      SELECT p.*, u.username, u.nickname, u.avatar, t.name as tag_name, t.color as tag_color,
             bm25(posts_fts) as rank,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
             COALESCE(p.like_count, 0) as like_count, COALESCE(p.dislike_count, 0) as dislike_count
      FROM posts_fts
      JOIN posts p ON posts_fts.post_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      WHERE posts_fts MATCH ? AND p.status = 'approved'
      ORDER BY rank
      LIMIT ? OFFSET ?
    `).all(q.trim() + '*', Number(limit), (Number(page) - 1) * Number(limit));

    // Count total
    const totalRow = db.prepare(`
      SELECT COUNT(*) as total FROM posts_fts
      JOIN posts p ON posts_fts.post_id = p.id
      WHERE posts_fts MATCH ? AND p.status = 'approved'
    `).get(q.trim() + '*');

    res.json({
      posts: result,
      total: totalRow.total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(totalRow.total / Number(limit))
    });
  } catch (err) {
    console.error('[Search]', err);
    res.status(500).json({ error: '搜索失败' });
  }
});

module.exports = router;
