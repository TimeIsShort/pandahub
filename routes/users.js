const express = require('express');
const db = require('../models/database');
const { optionalAuth, authMiddleware } = require('../middleware/auth');
const { getUserLevel, getLevelBenefits } = require('../models/database');

const router = express.Router();

// Get level benefits for current user (must be before /:id)
router.get('/me/level-benefits', optionalAuth, (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: '请先登录' });
    }

    const user = db.prepare('SELECT points, daily_interest_date FROM users WHERE id = ?').get(req.user.id);
    const level = getUserLevel(user.points);

    // Calculate daily interest if eligible
    const today = new Date().toISOString().split('T')[0];

    let pendingInterest = 0;
    if (user.daily_interest_date !== today && level.daily_interest > 0) {
      pendingInterest = Math.floor(user.points * level.daily_interest);
    }

    res.json({
      level: level,
      benefits: getLevelBenefits(level),
      pendingInterest: pendingInterest,
      nextInterest: level.daily_interest > 0 ? '明天可领取' : null
    });
  } catch (err) {
    console.error('[LevelBenefits error]', err);
    res.status(500).json({ error: '获取等级特权失败' });
  }
});

// Claim daily interest (must be before /:id)
router.post('/me/claim-daily-interest', optionalAuth, (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: '请先登录' });
    }

    const user = db.prepare('SELECT points, daily_interest_date FROM users WHERE id = ?').get(req.user.id);
    const level = getUserLevel(user.points);

    if (level.daily_interest <= 0) {
      return res.status(400).json({ error: '当前等级没有利息特权' });
    }

    const today = new Date().toISOString().split('T')[0];
    if (user.daily_interest_date === today) {
      return res.status(400).json({ error: '今日利息已领取，明天再来！' });
    }

    const interest = Math.floor(user.points * level.daily_interest);
    if (interest <= 0) {
      return res.status(400).json({ error: '积分不足，无法获得利息' });
    }

    db.prepare('UPDATE users SET points = points + ?, daily_interest_date = ? WHERE id = ?')
      .run(interest, today, req.user.id);

    const updated = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);

    res.json({
      success: true,
      interestEarned: interest,
      newBalance: updated.points
    });
  } catch (err) {
    console.error('[ClaimInterest error]', err);
    res.status(500).json({ error: '领取利息失败' });
  }
});

// Get user profile
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const profileUserId = Number(req.params.id);
    const canViewAllPosts = !!(req.user && (req.user.role === 'admin' || req.user.id === profileUserId));

    const user = db.prepare(`
      SELECT id, username, nickname, avatar, bg_image, bio, bio as about, role, created_at, last_login,
             points, checkin_streak, influence_score,
             (SELECT COUNT(*) + 1 FROM users u2 WHERE u2.influence_score > users.influence_score AND u2.role != 'admin') as influence_rank
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

// Get user activity (posts + comments + checkins per day, for heatmap)
router.get('/:id/activity', (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { days = 90 } = req.query;

    // Posts per day
    const posts = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count
      FROM posts
      WHERE user_id = ? AND status = 'approved'
        AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date(created_at)
    `).all(userId, Number(days));

    // Comments per day
    const comments = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count
      FROM comments
      WHERE user_id = ?
        AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date(created_at)
    `).all(userId, Number(days));

    // Checkins per day
    const checkins = db.prepare(`
      SELECT checkin_date as day, 1 as count
      FROM checkins
      WHERE user_id = ?
        AND checkin_date >= date('now', '-' || ? || ' days')
    `).all(userId, Number(days));

    // Merge all
    const map = {};
    posts.forEach(p => { map[p.day] = (map[p.day] || 0) + p.count; });
    comments.forEach(c => { map[c.day] = (map[c.day] || 0) + c.count; });
    checkins.forEach(ch => { map[ch.day] = (map[ch.day] || 0) + 1; });

    const activity = Object.keys(map).map(day => ({ day, count: map[day] }));
    activity.sort((a, b) => a.day.localeCompare(b.day));

    res.json({ activity, days: Number(days) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取活跃数据失败' });
  }
});

// Search users by username or nickname (for @mention)
router.get('/search', (req, res) => {
  try {
    const { q = '', limit = 10 } = req.query;
    if (!q || q.length < 1) return res.json({ users: [] });

    const pattern = '%' + q + '%';
    const users = db.prepare(`
      SELECT id, username, nickname, avatar
      FROM users
      WHERE username LIKE ? OR nickname LIKE ?
      ORDER BY username ASC
      LIMIT ?
    `).all(pattern, pattern, Number(limit));

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: '搜索失败' });
  }
});



// Points trend for last 30 days
router.get('/:id/points-trend', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const days = Math.min(90, Math.max(7, parseInt(req.query.days) || 30));
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split('T')[0];

    const checkins = db.prepare(
      "SELECT DATE(created_at) as day, SUM(points_earned) as points FROM checkins WHERE user_id = ? AND DATE(created_at) >= ? GROUP BY DATE(created_at)"
    ).all(userId, startStr);

    const transfers = db.prepare(
      "SELECT DATE(created_at) as day, SUM(amount) as points FROM point_transfers WHERE to_user_id = ? AND status = 'completed' AND DATE(created_at) >= ? GROUP BY DATE(created_at)"
    ).all(userId, startStr);

    const trendMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const ymd = d.toISOString().split('T')[0];
      trendMap[ymd] = 0;
    }
    checkins.forEach(function(c) { if (trendMap[c.day] !== undefined) trendMap[c.day] += c.points; });
    transfers.forEach(function(t) { if (trendMap[t.day] !== undefined) trendMap[t.day] += t.points; });

    const labels = Object.keys(trendMap).slice(-30);
    const data = labels.map(function(d) { return trendMap[d]; });
    res.json({ labels, data, days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取积分趋势失败' });
  }
});


// GET /api/users/me/notification-settings
router.get('/me/notification-settings', authMiddleware, (req, res) => {
  const user = db.prepare(
    'SELECT notification_quiet_hours, notification_quiet_start, notification_quiet_end, notify_email, notify_push, notification_mode FROM users WHERE id = ?'
  ).get(req.user.id);
  res.json({ settings: user });
});

// POST /api/users/me/notification-settings
router.post('/me/notification-settings', authMiddleware, (req, res) => {
  const { notification_quiet_hours, notification_quiet_start, notification_quiet_end, notify_email, notify_push, notification_mode } = req.body;
  try {
    db.prepare(`
      UPDATE users SET
        notification_quiet_hours = COALESCE(?, notification_quiet_hours),
        notification_quiet_start = COALESCE(?, notification_quiet_start),
        notification_quiet_end = COALESCE(?, notification_quiet_end),
        notify_email = COALESCE(?, notify_email),
        notify_push = COALESCE(?, notify_push),
        notification_mode = COALESCE(?, notification_mode)
      WHERE id = ?
    `).run(
      notification_quiet_hours !== undefined ? (notification_quiet_hours ? 1 : 0) : null,
      notification_quiet_start || null,
      notification_quiet_end || null,
      notify_email !== undefined ? (notify_email ? 1 : 0) : null,
      notify_push !== undefined ? (notify_push ? 1 : 0) : null,
      notification_mode || null,
      req.user.id
    );
    res.json({ success: true, message: '通知设置已更新' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新失败' });
  }
});


module.exports = router;
