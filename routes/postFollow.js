const express = require('express');
const router = express.Router();
const db = require('../models/database');

// Follow a post
router.post('/follow/:postId', (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: '请先登录' });

  const postId = parseInt(req.params.postId);
  const post = db.prepare('SELECT id, title, user_id FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  // Cannot follow own post
  if (post.user_id === user.id) {
    return res.status(400).json({ error: '不能关注自己的帖子' });
  }

  // Check if already following
  const existing = db.prepare('SELECT id FROM post_follows WHERE user_id = ? AND post_id = ?').get(user.id, postId);
  if (existing) {
    return res.json({ success: true, following: true, message: '已关注此帖子' });
  }

  db.prepare('INSERT INTO post_follows (user_id, post_id) VALUES (?, ?)').run(user.id, postId);
  res.json({ success: true, following: true, message: '关注成功' });
});

// Unfollow a post
router.delete('/follow/:postId', (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: '请先登录' });

  const postId = parseInt(req.params.postId);
  db.prepare('DELETE FROM post_follows WHERE user_id = ? AND post_id = ?').run(user.id, postId);
  res.json({ success: true, following: false, message: '已取消关注' });
});

// Get my followed posts
router.get('/following', (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: '请先登录' });

  const follows = db.prepare(`
    SELECT p.id, p.title, p.created_at, p.updated_at,
           u.username as author_username, u.nickname as author_nickname, u.avatar as author_avatar,
           (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
           (SELECT MAX(created_at) FROM comments c WHERE c.post_id = p.id) as last_comment_at
    FROM post_follows f
    JOIN posts p ON f.post_id = p.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
    LIMIT 50
  `).all(user.id);

  res.json({ follows });
});

// Check if following a post
router.get('/follow/:postId', (req, res) => {
  const user = req.user;
  if (!user) return res.json({ following: false });

  const postId = parseInt(req.params.postId);
  const record = db.prepare('SELECT id FROM post_follows WHERE user_id = ? AND post_id = ?').get(user.id, postId);
  res.json({ following: !!record });
});

module.exports = router;
