const express = require('express');
const db = require('../models/database');
const { getUserLevel } = require('../models/database');

const router = express.Router();

// Get leaderboard (top users by points)
router.get('/', (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const users = db.prepare(`
      SELECT id, username, nickname, avatar, points, checkin_streak, created_at
      FROM users
      ORDER BY points DESC
      LIMIT ?
    `).all(Number(limit));

    // Add level info to each user
    users.forEach((u, idx) => {
      const level = getUserLevel(u.points);
      u.rank = idx + 1;
      u.level_name = level.name;
      u.level_icon = level.icon;
      u.level_color = level.color;
    });

    res.json({ users });
  } catch (err) {
    console.error('[Leaderboard]', err);
    res.status(500).json({ error: '获取排行榜失败' });
  }
});

module.exports = router;
