const express = require('express');
const db = require('../models/database');
const { getUserLevel } = require('../models/database');
const { getCache, setCache } = require('../utils/cache');

const router = express.Router();

// Get leaderboard (top users by points)
router.get('/', (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.page_size) || 20;
    const calcOffset = (page - 1) * pageSize;

    const cacheKey = `leaderboard:page:${page}:size:${pageSize}`;
    const cached = getCache(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    const users = db.prepare(`
      SELECT id, username, nickname, avatar, points, checkin_streak, created_at
      FROM users
      ORDER BY points DESC
      LIMIT ? OFFSET ?
    `).all(Number(limit) || 20, Number(offset) || calcOffset);

    // Add level info to each user
    users.forEach((u, idx) => {
      const level = getUserLevel(u.points);
      u.rank = (Number(offset) || calcOffset) + idx + 1;
      u.level_name = level.name;
      u.level_icon = level.icon;
      u.level_color = level.color;
    });

    // Total count
    const total = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

    const result = { users, total, page, page_size: pageSize };
    setCache(cacheKey, result, 5 * 60 * 1000); // 5 minutes
    res.set('X-Cache', 'MISS');
    res.json(result);
  } catch (err) {
    console.error('[Leaderboard]', err);
    res.status(500).json({ error: '获取排行榜失败' });
  }
});

// Get current user's rank
router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未登录' });
    }
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get user's rank: count users with more points + 1
    const user = db.prepare('SELECT id, username, nickname, avatar, points FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const rank = db.prepare('SELECT COUNT(*) as c FROM users WHERE points > ?').get(user.points).c + 1;
    const level = getUserLevel(user.points);

    res.json({
      rank,
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      points: user.points,
      level_name: level.name,
      level_icon: level.icon,
      level_color: level.color
    });
  } catch (err) {
    console.error('[Leaderboard /me]', err);
    res.status(500).json({ error: '获取排名失败' });
  }
});

// ============ Hot Posts Ranking ============
// Hot score algorithm: based on views, likes, comments, and recency
router.get('/hot-posts', (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const hours = Number(req.query.hours) || 72;

    const cacheKey = `hot-posts:${hours}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
    const decayHours = Math.max(hours, 1);
    const posts = db.prepare(`
      SELECT
        p.id,
        p.title,
        p.content,
        p.views,
        p.like_count,
        p.dislike_count,
        p.created_at,
        p.tag_id,
        u.username, u.nickname, u.avatar,
        t.name as tag_name, t.color as tag_color,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
        ROUND(
          COALESCE(p.views, 0) * 0.1
          + COALESCE(p.like_count, 0) * 5
          + (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) * 3
          + MAX(0, (${decayHours} - (CAST((JULIANDAY('now') - JULIANDAY(p.created_at)) * 24 AS REAL))) / ${decayHours}) * 15
        , 0) as hot_score
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      WHERE p.status = 'approved'
        AND p.created_at >= ?
      ORDER BY hot_score DESC, p.created_at DESC
      LIMIT ?
    `).all(cutoff, limit);

    // Strip HTML from content for preview
    posts.forEach(p => {
      p.preview = (p.content || '').replace(/<[^>]+>/g, '').substring(0, 80);
      p.hot_score = Number(p.hot_score);
    });

    const result = { posts };
    setCache(cacheKey, result, 60 * 1000); // 1 minute
    res.set('X-Cache', 'MISS');
    res.json(result);
  } catch (err) {
    console.error('[HotPosts]', err);
    res.status(500).json({ error: '获取热榜失败' });
  }
});

// Cache stats endpoint for monitoring
router.get('/cache-stats', (req, res) => {
  try {
    const { getCacheStats } = require('../utils/cache');
    res.json(getCacheStats());
  } catch (err) {
    res.status(500).json({ error: '获取缓存状态失败' });
  }
});

module.exports = router;
