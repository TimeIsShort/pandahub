const express = require('express');
const db = require('../models/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const router = express.Router();

// Get active season
router.get('/season', optionalAuth, (req, res) => {
  try {
    const season = db.prepare("SELECT * FROM seasons WHERE status = 'active' ORDER BY season_number DESC LIMIT 1").get();
    if (!season) return res.json({ season: null, challenges: [] });

    const challenges = db.prepare('SELECT * FROM challenges WHERE season_id = ? ORDER BY sort_order ASC').all(season.id);

    let userProgress = [];
    if (req.user) {
      userProgress = db.prepare(`
        SELECT uc.challenge_id, uc.progress, uc.completed, uc.completed_at
        FROM user_challenges uc
        JOIN challenges c ON c.id = uc.challenge_id
        WHERE uc.user_id = ? AND c.season_id = ?
      `).all(req.user.id, season.id);
    }

    const progressMap = {};
    (userProgress || []).forEach(p => { progressMap[p.challenge_id] = p; });

    const challengesWithProgress = challenges.map(c => ({
      ...c,
      progress: progressMap[c.id]?.progress || 0,
      completed: progressMap[c.id]?.completed || 0,
      completed_at: progressMap[c.id]?.completed_at || null
    }));

    res.json({ season, challenges: challengesWithProgress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取赛季信息失败' });
  }
});

// Get user challenge progress
router.get('/me', authMiddleware, (req, res) => {
  try {
    const season = db.prepare("SELECT * FROM seasons WHERE status = 'active' ORDER BY season_number DESC LIMIT 1").get();
    if (!season) return res.json({ season: null, challenges: [] });

    const userProgress = db.prepare(`
      SELECT uc.challenge_id, uc.progress, uc.completed, uc.completed_at, c.*
      FROM user_challenges uc
      JOIN challenges c ON c.id = uc.challenge_id
      WHERE uc.user_id = ? AND c.season_id = ?
    `).all(req.user.id, season.id);

    res.json({ season, challenges: userProgress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取进度失败' });
  }
});

// Sync challenge progress (called on user actions)
function syncChallengeProgress(userId) {
  try {
    const season = db.prepare("SELECT * FROM seasons WHERE status = 'active' ORDER BY season_number DESC LIMIT 1").get();
    if (!season) return;

    const challenges = db.prepare('SELECT * FROM challenges WHERE season_id = ?').all(season.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return;

    // Compute current week stats
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const postsThisWeek = db.prepare(`
      SELECT COUNT(*) as c FROM posts
      WHERE user_id = ? AND status = 'approved'
      AND date(created_at) >= ?
    `).get(userId, weekStartStr).c;

    const commentsThisWeek = db.prepare(`
      SELECT COUNT(*) as c FROM comments
      WHERE user_id = ? AND date(created_at) >= ?
    `).get(userId, weekStartStr).c;

    const checkinsThisWeek = db.prepare(`
      SELECT COUNT(*) as c FROM checkin_log
      WHERE user_id = ? AND date(created_at) >= ?
    `).get(userId, weekStartStr).c;

    const reactionsThisWeek = db.prepare(`
      SELECT COUNT(*) as c FROM post_reactions
      WHERE user_id = ? AND date(created_at) >= ?
    `).get(userId, weekStartStr).c;

    const influenceThisWeek = db.prepare(`
      SELECT COALESCE(SUM(delta), 0) as total FROM influence_history
      WHERE user_id = ? AND date(created_at) >= ?
    `).get(userId, weekStartStr).total;

    const taskMap = {
      posts_count: postsThisWeek,
      comments_count: commentsThisWeek,
      checkin_days: checkinsThisWeek,
      reactions_given: reactionsThisWeek,
      influence_gained: influenceThisWeek
    };

    for (const challenge of challenges) {
      const currentProgress = taskMap[challenge.task_type] || 0;
      const existing = db.prepare('SELECT * FROM user_challenges WHERE user_id = ? AND challenge_id = ?').get(userId, challenge.id);

      if (!existing) {
        const completed = currentProgress >= challenge.task_target ? 1 : 0;
        db.prepare('INSERT INTO user_challenges (user_id, challenge_id, progress, completed, completed_at) VALUES (?, ?, ?, ?, ?)')
          .run(userId, challenge.id, currentProgress, completed, completed ? new Date().toISOString() : null);
        if (completed) {
          db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(challenge.reward_points, userId);
        }
      } else if (!existing.completed) {
        const completed = currentProgress >= challenge.task_target ? 1 : 0;
        db.prepare('UPDATE user_challenges SET progress = ?, completed = ?, completed_at = ? WHERE user_id = ? AND challenge_id = ?')
          .run(currentProgress, completed, completed ? new Date().toISOString() : null, userId, challenge.id);
        if (completed) {
          db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(challenge.reward_points, userId);
          console.log('[Challenge] 用户 ' + userId + ' 完成挑战: ' + challenge.title);
        }
      }
    }
  } catch (e) {
    console.error('[Challenge] sync error:', e);
  }
}

module.exports = router;
module.exports.syncChallengeProgress = syncChallengeProgress;
