const express = require('express');
const db = require('../models/database');
const { optionalAuth } = require('../middleware/auth');
const { getUserLevel } = require('../models/database');

const router = express.Router();

// Get user profile
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const profileUserId = Number(req.params.id);
    const canViewAllPosts = !!(req.user && (req.user.role === 'admin' || req.user.id === profileUserId));

    const user = db.prepare(`
      SELECT id, username, nickname, avatar, bio, role, created_at, last_login,
             points, checkin_streak
      FROM users WHERE id = ?
    `).get(profileUserId);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // Add level info
    const level = getUserLevel(user.points);
    user.level_name = level.name;
    user.level_icon = level.icon;
    user.level_color = level.color;

    const whereClause = canViewAllPosts ? 'p.user_id = ?' : "p.user_id = ? AND p.status = 'approved'";
    const posts = db.prepare(`
      SELECT p.*, t.name as tag_name, t.color as tag_color,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
      FROM posts p
      LEFT JOIN tags t ON p.tag_id = t.id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT 20
    `).all(profileUserId);

    res.json({ user, posts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

module.exports = router;
