const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const db = require('../models/database');

// Add favorite: POST /api/favorites { post_id }
router.post('/', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { post_id } = req.body;
  const postId = parseInt(post_id);
  if (!postId || isNaN(postId)) return res.status(400).json({ error: '无效的帖子ID' });

  // Check if already favorited
  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND post_id = ?').get(userId, postId);
  if (existing) {
    return res.json({ favorited: true, message: '已经收藏过了' });
  }
  db.prepare('INSERT INTO favorites (user_id, post_id) VALUES (?, ?)').run(userId, postId);
  res.json({ favorited: true, message: '收藏成功' });
});

// Remove favorite: DELETE /api/favorites/:post_id
router.delete('/:post_id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const postId = parseInt(req.params.post_id);
  if (!postId || isNaN(postId)) return res.status(400).json({ error: '无效的帖子ID' });

  db.prepare('DELETE FROM favorites WHERE user_id = ? AND post_id = ?').run(userId, postId);
  res.json({ favorited: false, message: '已取消收藏' });
});

// Get favorite status: GET /api/favorites/status/:post_id
router.get('/status/:post_id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const postId = parseInt(req.params.post_id);
  if (!postId || isNaN(postId)) return res.status(400).json({ error: '无效的帖子ID' });

  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND post_id = ?').get(userId, postId);
  res.json({ favorited: !!existing });
});

// List user's favorites: GET /api/favorites?page=1&limit=20
router.get('/', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM favorites WHERE user_id = ?').get(userId).count;
  const favorites = db.prepare(`
    SELECT p.*, u.nickname, u.username, u.avatar,
           f.created_at as favorited_at,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
           (SELECT COUNT(*) FROM post_votes WHERE post_id = p.id AND vote_type = 'like') as like_count
    FROM favorites f
    JOIN posts p ON f.post_id = p.id
    JOIN users u ON p.user_id = u.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);

  res.json({
    favorites,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit)
  });
});

module.exports = router;
