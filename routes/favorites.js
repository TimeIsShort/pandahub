const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Add a post to favorites
router.post('/', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { post_id } = req.body;

    if (!post_id) return res.status(400).json({ error: 'post_id 不能为空' });

    // Check post exists
    const post = db.prepare('SELECT id, title FROM posts WHERE id = ?').get(post_id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    // Already favorited?
    const existing = db.prepare(
      'SELECT 1 FROM favorites WHERE user_id = ? AND post_id = ?'
    ).get(userId, post_id);

    if (existing) {
      return res.status(400).json({ error: '已经收藏过了' });
    }

    db.prepare('INSERT INTO favorites (user_id, post_id) VALUES (?, ?)').run(userId, post_id);

    res.json({ success: true, message: '收藏成功' });
  } catch (err) {
    console.error('[Favorites]', err);
    res.status(500).json({ error: '收藏失败' });
  }
});

// Remove from favorites
router.delete('/:postId', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const postId = Number(req.params.postId);

    const existing = db.prepare(
      'SELECT 1 FROM favorites WHERE user_id = ? AND post_id = ?'
    ).get(userId, postId);

    if (!existing) return res.status(400).json({ error: '未收藏此帖子' });

    db.prepare('DELETE FROM favorites WHERE user_id = ? AND post_id = ?').run(userId, postId);
    res.json({ success: true, message: '已取消收藏' });
  } catch (err) {
    console.error('[Favorites]', err);
    res.status(500).json({ error: '取消收藏失败' });
  }
});

// Get current user's favorites list
router.get('/', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const favorites = db.prepare(`
      SELECT p.id, p.title, p.created_at, p.views, p.comment_count,
             p.like_count, p.dislike_count,
             t.name as tag_name, t.color as tag_color,
             u.nickname as author_nickname, u.username as author_username, u.avatar as author_avatar,
             f.created_at as favorited_at
      FROM favorites f
      JOIN posts p ON f.post_id = p.id
      LEFT JOIN tags t ON p.tag_id = t.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE f.user_id = ? AND p.status = 'approved'
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, Number(limit), Number(offset));

    const total = db.prepare(
      'SELECT COUNT(*) as c FROM favorites f JOIN posts p ON f.post_id = p.id WHERE f.user_id = ? AND p.status = ?'
    ).get(userId, 'approved').c;

    res.json({ favorites, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[Favorites]', err);
    res.status(500).json({ error: '获取收藏列表失败' });
  }
});

// Check if current user favorited a post
router.get('/status/:postId', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const postId = Number(req.params.postId);
    const isFavorited = !!db.prepare(
      'SELECT 1 FROM favorites WHERE user_id = ? AND post_id = ?'
    ).get(userId, postId);

    const count = db.prepare(
      'SELECT COUNT(*) as c FROM favorites WHERE post_id = ?'
    ).get(postId).c;

    res.json({ is_favorited: isFavorited, count });
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

module.exports = router;
