const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

// Get current week's featured posts
router.get('/', (req, res) => {
  try {
    const type = req.query.type || 'weekly';
    const periodKey = getPeriodKey(type);

    const posts = db.prepare(`
      SELECT p.id, p.title, p.created_at, p.views, p.like_count,
             u.username, u.nickname, u.avatar,
             t.name as tag_name, t.color as tag_color, t.icon as tag_icon,
             f.created_at as featured_at,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
      FROM featured_posts f
      JOIN posts p ON f.post_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      WHERE f.period_type = ? AND f.period_key = ?
      ORDER BY f.created_at DESC
    `).all(type, periodKey);

    res.json({
      type,
      period: periodKey,
      posts: posts.map(p => ({
        id: p.id,
        title: p.title,
        created_at: p.created_at,
        views: p.views,
        like_count: p.like_count,
        comment_count: p.comment_count,
        author: { username: p.username, nickname: p.nickname, avatar: p.avatar },
        tag: p.tag_name ? { name: p.tag_name, color: p.tag_color, icon: p.tag_icon } : null,
        featured_at: p.featured_at
      }))
    });
  } catch (err) {
    console.error('[Featured]', err);
    res.status(500).json({ error: '获取精华帖失败' });
  }
});

// Add a post to featured list
router.post('/', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    const { post_id, period_type = 'weekly' } = req.body;
    const postIdNum = Number(post_id);
    if (!post_id || !postIdNum || isNaN(postIdNum)) return res.status(400).json({ error: '无效的post_id' });

    const post = db.prepare('SELECT id, title FROM posts WHERE id = ?').get(post_id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const periodKey = getPeriodKey(period_type);

    db.prepare(`
      INSERT OR IGNORE INTO featured_posts (post_id, period_type, period_key) VALUES (?, ?, ?)
    `).run(postIdNum, period_type, periodKey);

    // Also mark as featured in posts table
    db.prepare('UPDATE posts SET is_featured = 1 WHERE id = ?').run(postIdNum);

    res.json({ success: true, message: '已加精' });
  } catch (err) {
    console.error('[Featured]', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// Remove a post from featured
router.delete('/:postId', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    const postId = Number(req.params.postId);
    if (!postId || isNaN(postId)) return res.status(400).json({ error: '无效的帖子ID' });
    const type = req.query.type || 'weekly';
    const periodKey = getPeriodKey(type);

    db.prepare(`
      DELETE FROM featured_posts WHERE post_id = ? AND period_type = ? AND period_key = ?
    `).run(postId, type, periodKey);

    res.json({ success: true, message: '已取消加精' });
  } catch (err) {
    console.error('[Featured]', err);
    res.status(500).json({ error: '操作失败' });
  }
});

function getPeriodKey(type) {
  if (type === 'monthly') {
    return `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  }
  // weekly: 'YYYY-Wxx'
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((now - startOfYear) / 86400000);
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

module.exports = router;
