const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { getUserLevel } = require('../models/database');

// GET /api/influence-leaderboard - All-time influence rankings
router.get('/', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    const users = db.prepare(`
      SELECT u.id, u.username, u.nickname, u.avatar, u.influence_score,
             u.points, u.checkin_streak, u.created_at
      FROM users u
      WHERE u.influence_score > 0 AND u.role != 'admin'
      ORDER BY u.influence_score DESC, u.id ASC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as cnt FROM users u
      WHERE u.influence_score > 0 AND u.role != 'admin'
    `).get();

    const enriched = users.map((u, i) => {
      const level = getUserLevel(u.points);
      return {
        rank: offset + i + 1,
        userId: u.id,
        username: u.username,
        nickname: u.nickname,
        avatar: u.avatar,
        influence_score: u.influence_score,
        level: level.name,
        level_icon: level.icon,
        level_color: level.color,
        checkin_streak: u.checkin_streak,
        joined_at: u.created_at
      };
    });

    res.json({ rankings: enriched, total: total.cnt, limit, offset });
  } catch (err) {
    console.error('[InfluenceLeaderboard]', err);
    res.status(500).json({ error: '获取排行榜失败' });
  }
});

// GET /api/influence-leaderboard/user/:id - User's rank
router.get('/user/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = db.prepare(`
      SELECT u.id, u.username, u.nickname, u.avatar, u.influence_score, u.points
      FROM users u WHERE u.id = ?
    `).get(userId);

    if (!user) return res.status(404).json({ error: '用户不存在' });

    const rank = db.prepare(`
      SELECT COUNT(*) + 1 as rank FROM users
      WHERE influence_score > ? AND role != 'admin'
    `).get(user.influence_score);

    const total = db.prepare(`
      SELECT COUNT(*) as cnt FROM users WHERE influence_score > 0 AND role != 'admin'
    `).get();

    const level = getUserLevel(user.points);

    res.json({
      rank: rank.rank,
      total: total.cnt,
      influence_score: user.influence_score,
      level: level.name,
      level_icon: level.icon,
      level_color: level.color
    });
  } catch (err) {
    res.status(500).json({ error: '获取失败' });
  }
});

module.exports = router;
