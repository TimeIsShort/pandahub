const express = require('express');
const router = express.Router();
const db = require('../models/database');

// Prevent CDN caching for API responses
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// 获取当前社区统计
router.get('/stats', (req, res) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
    const postCount = db.prepare("SELECT COUNT(*) as cnt FROM posts WHERE status='approved'").get().cnt;
    const commentCount = db.prepare("SELECT COUNT(*) as cnt FROM comments").get().cnt;

    // 获取最长连续签到
    const streak = db.prepare(`
      SELECT MAX(streak_days) as max_streak FROM (
        SELECT user_id, COUNT(*) as streak_days
        FROM checkin_records
        WHERE date(created_at) >= date('now', '-100 days')
        GROUP BY user_id
      )
    `).get().max_streak || 0;

    res.json({
      users: userCount,
      posts: postCount,
      comments: commentCount,
      checkin_streak_max: streak
    });
  } catch (err) {
    console.error('[Milestones stats]', err);
    res.status(500).json({ error: 'failed' });
  }
});

// 获取里程碑列表（含达成状态）
router.get('/', (req, res) => {
  try {
    const stats = {
      users: db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt,
      posts: db.prepare("SELECT COUNT(*) as cnt FROM posts WHERE status='approved'").get().cnt,
      comments: db.prepare("SELECT COUNT(*) as cnt FROM comments").get().cnt,
      checkin_streak_max: 0
    };

    const milestones = db.prepare(`
      SELECT m.*,
        e.id IS NOT NULL as achieved,
        e.achieved_at,
        CASE m.milestone_type
          WHEN 'users' THEN ?
          WHEN 'posts' THEN ?
          WHEN 'comments' THEN ?
          WHEN 'checkin_streak' THEN ?
        END as current_value
      FROM milestones m
      LEFT JOIN milestone_events e ON m.id = e.milestone_id
      ORDER BY m.milestone_type, m.threshold
    `).all(stats.users, stats.posts, stats.comments, stats.checkin_streak_max);

    // 计算下一个里程碑
    const result = milestones.map(m => ({
      ...m,
      progress: Math.min(100, Math.round((m.current_value / m.threshold) * 100))
    }));

    res.json({ milestones: result, stats });
  } catch (err) {
    console.error('[Milestones]', err);
    res.status(500).json({ error: 'failed' });
  }
});

// 获取最新达成的里程碑（用于弹窗展示）
router.get('/latest', (req, res) => {
  try {
    const latest = db.prepare(`
      SELECT m.*, e.achieved_at
      FROM milestones m
      JOIN milestone_events e ON m.id = e.milestone_id
      ORDER BY e.achieved_at DESC
      LIMIT 1
    `).get();

    if (!latest) return res.json({ milestone: null });

    // 获取当前值
    const stats = {
      users: db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt,
      posts: db.prepare("SELECT COUNT(*) as cnt FROM posts WHERE status='approved'").get().cnt,
      comments: db.prepare("SELECT COUNT(*) as cnt FROM comments").get().cnt
    };

    latest.current_value = stats[latest.milestone_type] || 0;
    res.json({ milestone: latest });
  } catch (err) {
    console.error('[Milestones latest]', err);
    res.status(500).json({ error: 'failed' });
  }
});

// 触发里程碑检查（内部API，在关键操作后调用）
router.post('/check', (req, res) => {
  try {
    const { type, value } = req.body; // type: users|posts|comments|checkin_streak
    const stats = {
      users: db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt,
      posts: db.prepare("SELECT COUNT(*) as cnt FROM posts WHERE status='approved'").get().cnt,
      comments: db.prepare("SELECT COUNT(*) as cnt FROM comments").get().cnt
    };

    const currentValue = value !== undefined ? value : (stats[type] || 0);

    // 查找达成的里程碑（尚未记录的）
    const achieved = db.prepare(`
      SELECT m.* FROM milestones m
      LEFT JOIN milestone_events e ON m.id = e.milestone_id
      WHERE m.milestone_type = ? AND m.threshold <= ? AND e.id IS NULL
      ORDER BY m.threshold DESC
    `).all(type, currentValue);

    if (achieved.length === 0) {
      return res.json({ newMilestones: [], achieved });
    }

    // 记录每个新达成的里程碑
    const insertEvent = db.prepare('INSERT OR IGNORE INTO milestone_events (milestone_id) VALUES (?)');
    const insertLog = db.transaction((items) => {
      for (const m of items) insertEvent.run(m.id);
    });
    insertLog(achieved);

    // 记录操作用日志（仅第一次达成时）
    const insertAction = db.prepare(`
      INSERT INTO admin_action_logs (admin_id, action, target_type, target_id, details, created_at)
      VALUES (1, 'milestone_achieved', 'milestone', ?, ?, datetime('now'))
    `);
    for (const m of achieved) {
      insertAction.run(m.id, `里程碑达成: ${m.title}`);
    }

    res.json({ newMilestones: achieved, achieved });
  } catch (err) {
    console.error('[Milestones check]', err);
    res.status(500).json({ error: 'failed' });
  }
});

// 获取下一个即将达成的里程碑
router.get('/next', (req, res) => {
  try {
    const stats = {
      users: db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt,
      posts: db.prepare("SELECT COUNT(*) as cnt FROM posts WHERE status='approved'").get().cnt,
      comments: db.prepare("SELECT COUNT(*) as cnt FROM comments").get().cnt
    };

    const next = {};
    for (const [type, val] of Object.entries(stats)) {
      const nextMilestone = db.prepare(`
        SELECT m.* FROM milestones m
        LEFT JOIN milestone_events e ON m.id = e.milestone_id
        WHERE m.milestone_type = ? AND m.threshold > ? AND e.id IS NULL
        ORDER BY m.threshold ASC LIMIT 1
      `).get(type, val);

      if (nextMilestone) {
        nextMilestone.current_value = val;
        nextMilestone.progress = Math.min(100, Math.round((val / nextMilestone.threshold) * 100));
        next[type] = nextMilestone;
      }
    }

    res.json({ next });
  } catch (err) {
    console.error('[Milestones next]', err);
    res.status(500).json({ error: 'failed' });
  }
});

module.exports = router;
