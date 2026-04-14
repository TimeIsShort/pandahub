const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

// Get current week key: 'YYYY-Wxx'
function getWeekKey(date = new Date()) {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date - startOfYear) / 86400000);
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// Get current month key: 'YYYY-MM'
function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Calculate and store weekly leaderboard
async function calculateWeeklyLeaderboard() {
  const periodKey = getWeekKey(new Date(Date.now() - 7 * 86400000)); // last week

  // Get user stats for the week
  const weekStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const weekEnd = new Date().toISOString().slice(0, 10);

  const users = db.prepare(`
    SELECT
      u.id as user_id, u.username, u.nickname, u.avatar,
      COALESCE(p.posts, 0) as posts_count,
      COALESCE(cmt.comments, 0) as comments_count,
      COALESCE(l.likes, 0) as likes_received,
      COALESCE(s.checkins, 0) as checkin_days,
      u.points as current_points
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) as posts FROM posts
      WHERE date(created_at) >= ? AND date(created_at) <= ? AND status='approved'
      GROUP BY user_id
    ) p ON u.id = p.user_id
    LEFT JOIN (
      SELECT user_id, COUNT(*) as comments FROM comments
      WHERE date(created_at) >= ? AND date(created_at) <= ?
      GROUP BY user_id
    ) cmt ON u.id = cmt.user_id
    LEFT JOIN (
      SELECT p.user_id as author_id, COUNT(r.id) as likes
      FROM post_reactions r
      JOIN posts p ON r.post_id = p.id
      WHERE date(r.created_at) >= ? AND date(r.created_at) <= ?
      GROUP BY p.user_id
      UNION ALL
      SELECT c.user_id as author_id, COUNT(r.id) as likes
      FROM comment_reactions r
      JOIN comments c ON r.comment_id = c.id
      WHERE date(r.created_at) >= ? AND date(r.created_at) <= ?
      GROUP BY c.user_id
    ) l ON u.id = l.author_id
    LEFT JOIN (
      SELECT user_id, COUNT(DISTINCT date(created_at)) as checkins FROM checkins
      WHERE checkin_date >= ? AND checkin_date <= ?
      GROUP BY user_id
    ) s ON u.id = s.user_id
    WHERE u.approved = 1
  `).all(weekStart, weekEnd, weekStart, weekEnd, weekStart, weekEnd, weekStart, weekEnd, weekStart, weekEnd);

  // Calculate composite score
  // Score = posts*10 + comments*5 + likes*3 + checkins*2
  const scored = users.map(u => ({
    ...u,
    total_score: (u.posts_count || 0) * 10 + (u.comments_count || 0) * 5 + (u.likes_received || 0) * 3 + (u.checkin_days || 0) * 2
  })).filter(u => u.total_score > 0).sort((a, b) => b.total_score - a.total_score);

  // Insert/update leaderboard entries
  const insert = db.prepare(`
    INSERT OR REPLACE INTO leaderboard_entries
    (period_type, period_key, user_id, username, nickname, avatar, posts_count, comments_count, likes_received, total_score, rank, awarded_at)
    VALUES ('weekly', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);

  const awardBadges = db.prepare(`
    INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at)
    VALUES (?, ?, datetime('now'))
  `);

  const updateAwarded = db.prepare(`
    UPDATE leaderboard_entries SET awarded_at = datetime('now') WHERE id = ?
  `);

  const insertAll = db.transaction((items) => {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i];
      const rank = i + 1;
      const result = insert.run(
        periodKey, entry.user_id, entry.username, entry.nickname || entry.username,
        entry.avatar || '', entry.posts_count || 0, entry.comments_count || 0,
        entry.likes_received || 0, entry.total_score, rank
      );

      // Award badges for top 10
      if (rank <= 10) {
        const badgeMap = { 1: 'weekly_top1', 2: 'weekly_top3', 3: 'weekly_top3' };
        const badgeId = rank === 1 ? 'weekly_top1' : rank <= 3 ? 'weekly_top3' : 'weekly_top10';
        awardBadges.run(entry.user_id, badgeId);
        updateAwarded.run(result.lastInsertRowid);
      }
    }
  });

  insertAll(scored);
  return { periodKey, count: scored.length, top3: scored.slice(0, 3) };
}

// Calculate and store monthly leaderboard
async function calculateMonthlyLeaderboard() {
  const periodKey = getMonthKey(new Date(Date.now() - 30 * 86400000)); // last month

  const monthStart = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const monthEnd = new Date().toISOString().slice(0, 10);

  const users = db.prepare(`
    SELECT
      u.id as user_id, u.username, u.nickname, u.avatar,
      COALESCE(p.posts, 0) as posts_count,
      COALESCE(c.comments, 0) as comments_count,
      COALESCE(l.likes, 0) as likes_received,
      COALESCE(s.checkins, 0) as checkin_days,
      u.points as current_points
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) as posts FROM posts
      WHERE date(created_at) >= ? AND date(created_at) <= ? AND status='approved'
      GROUP BY user_id
    ) p ON u.id = p.user_id
    LEFT JOIN (
      SELECT user_id, COUNT(*) as comments FROM comments
      WHERE date(created_at) >= ? AND date(created_at) <= ?
      GROUP BY user_id
    ) c ON u.id = c.user_id
    LEFT JOIN (
      SELECT p.user_id as author_id, COUNT(r.id) as likes
      FROM post_reactions r
      JOIN posts p ON r.post_id = p.id
      WHERE date(r.created_at) >= ? AND date(r.created_at) <= ?
      GROUP BY p.user_id
      UNION ALL
      SELECT c.user_id as author_id, COUNT(r.id) as likes
      FROM comment_reactions r
      JOIN comments c ON r.comment_id = c.id
      WHERE date(r.created_at) >= ? AND date(r.created_at) <= ?
      GROUP BY c.user_id
    ) l ON u.id = l.author_id
    LEFT JOIN (
      SELECT user_id, COUNT(DISTINCT date(created_at)) as checkins FROM checkins
      WHERE checkin_date >= ? AND checkin_date <= ?
      GROUP BY user_id
    ) s ON u.id = s.user_id
    WHERE u.approved = 1
  `).all(monthStart, monthEnd, monthStart, monthEnd, monthStart, monthEnd, monthStart, monthEnd, monthStart, monthEnd);

  const scored = users.map(u => ({
    ...u,
    total_score: (u.posts_count || 0) * 10 + (u.comments_count || 0) * 5 + (u.likes_received || 0) * 3 + (u.checkin_days || 0) * 2
  })).filter(u => u.total_score > 0).sort((a, b) => b.total_score - a.total_score);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO leaderboard_entries
    (period_type, period_key, user_id, username, nickname, avatar, posts_count, comments_count, likes_received, total_score, rank, awarded_at)
    VALUES ('monthly', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);

  const awardBadges = db.prepare(`
    INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at)
    VALUES (?, ?, datetime('now'))
  `);

  const updateAwarded = db.prepare(`
    UPDATE leaderboard_entries SET awarded_at = datetime('now') WHERE id = ?
  `);

  const insertAll = db.transaction((items) => {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i];
      const rank = i + 1;
      const result = insert.run(
        periodKey, entry.user_id, entry.username, entry.nickname || entry.username,
        entry.avatar || '', entry.posts_count || 0, entry.comments_count || 0,
        entry.likes_received || 0, entry.total_score, rank
      );

      if (rank <= 10) {
        const badgeId = rank === 1 ? 'monthly_top1' : rank <= 3 ? 'monthly_top3' : 'monthly_top10';
        awardBadges.run(entry.user_id, badgeId);
        updateAwarded.run(result.lastInsertRowid);
      }
    }
  });

  insertAll(scored);
  return { periodKey, count: scored.length, top3: scored.slice(0, 3) };
}

// GET /api/leaderboard - Get current leaderboards
router.get('/', (req, res) => {
  try {
    const type = req.query.type || 'weekly';
    const periodKey = type === 'weekly' ? getWeekKey() : getMonthKey();

    // Get latest stored leaderboard
    const latest = db.prepare(`
      SELECT * FROM leaderboard_entries
      WHERE period_type = ? AND period_key = ?
      ORDER BY rank ASC
      LIMIT 20
    `).all(type, periodKey);

    // If no data for current period, get previous
    const prevKey = type === 'weekly'
      ? getWeekKey(new Date(Date.now() - 7 * 86400000))
      : `${new Date().getFullYear()}-${String(new Date().getMonth()).padStart(2, '0')}`;

    const entries = latest.length > 0 ? latest : db.prepare(`
      SELECT * FROM leaderboard_entries
      WHERE period_type = ? AND period_key = ?
      ORDER BY rank ASC LIMIT 20
    `).all(type, prevKey);

    const period = latest.length > 0 ? periodKey : prevKey;
    const hasCurrent = latest.length > 0;

    res.json({
      type,
      period,
      hasCurrentData: hasCurrent,
      entries: entries.map(e => ({
        rank: e.rank,
        userId: e.user_id,
        username: e.username,
        nickname: e.nickname,
        avatar: e.avatar,
        score: Math.round(e.total_score * 10) / 10,
        posts: e.posts_count,
        comments: e.comments_count,
        likes: e.likes_received
      }))
    });
  } catch (err) {
    console.error('[Leaderboard]', err);
    res.status(500).json({ error: 'failed' });
  }
});

// POST /api/leaderboard/calculate - Trigger calculation (admin/cron)
router.post('/calculate', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  try {
    const { type } = req.body; // 'weekly' | 'monthly' | 'both'

    const results = {};
    if (!type || type === 'weekly' || type === 'both') {
      results.weekly = calculateWeeklyLeaderboard();
    }
    if (!type || type === 'monthly' || type === 'both') {
      results.monthly = calculateMonthlyLeaderboard();
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('[Leaderboard calculate]', err);
    res.status(500).json({ error: 'failed' });
  }
});

// GET /api/leaderboard/user/:userId - Get user's ranking history
router.get('/user/:userId', (req, res) => {
  try {
    const entries = db.prepare(`
      SELECT * FROM leaderboard_entries
      WHERE user_id = ?
      ORDER BY period_type, period_key DESC
      LIMIT 20
    `).all(req.params.userId);

    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: 'failed' });
  }
});

module.exports = router;
module.exports.calculateWeeklyLeaderboard = calculateWeeklyLeaderboard;
module.exports.calculateMonthlyLeaderboard = calculateMonthlyLeaderboard;
