const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// Get all available badges (public)
router.get('/', (req, res) => {
  try {
    const badges = db.prepare('SELECT * FROM badges ORDER BY condition_value ASC').all();
    res.json({ badges });
  } catch (err) {
    res.status(500).json({ error: '获取徽章列表失败' });
  }
});

// Get user's earned badges (auth required for private details)
router.get('/me', authMiddleware, (req, res) => {
  try {
    const earned = db.prepare(`
      SELECT ub.badge_id, ub.earned_at, b.name, b.description, b.icon
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ?
      ORDER BY ub.earned_at DESC
    `).all(req.user.id);
    res.json({ badges: earned });
  } catch (err) {
    res.status(500).json({ error: '获取徽章失败' });
  }
});

// Get another user's badges (public)
router.get('/:userId', (req, res) => {
  try {
    const userId = Number(req.params.userId);

    // Get user stats for progress
    const user = db.prepare('SELECT points, checkin_streak FROM users WHERE id = ?').get(userId);
    const postCount = db.prepare("SELECT COUNT(*) as c FROM posts WHERE user_id = ? AND status = 'approved'").get(userId).c;
    const commentCount = db.prepare('SELECT COUNT(*) as c FROM comments WHERE user_id = ?').get(userId).c;
    const reactionCount = db.prepare(`
      SELECT COUNT(*) as c FROM post_reactions pr
      JOIN posts p ON p.id = pr.post_id
      WHERE p.user_id = ? AND pr.user_id != ?
    `).get(userId, userId).c;

    const allBadges = db.prepare('SELECT * FROM badges ORDER BY condition_value ASC').all();
    const earnedMap = {};
    db.prepare(`
      SELECT ub.badge_id, ub.earned_at, b.name, b.description, b.icon
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ?
      ORDER BY ub.earned_at DESC
    `).all(userId).forEach(b => { earnedMap[b.badge_id] = b; });

    // Build full list with locked/unlocked + progress
    const badgesWithProgress = allBadges.map(badge => {
      const earned = earnedMap[badge.id];
      let current = 0;
      let target = badge.condition_value;
      switch (badge.condition_type) {
        case 'posts_count':    current = postCount; break;
        case 'comments_count': current = commentCount; break;
        case 'checkin_streak': current = user?.checkin_streak || 0; break;
        case 'points':         current = user?.points || 0; break;
        case 'reactions_count': current = reactionCount; break;
      }
      const locked = !earned;
      const progress = Math.min(Math.round((current / target) * 100), 100);
      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        earned_at: earned ? earned.earned_at : null,
        locked,
        current,
        target,
        progress
      };
    });

    res.json({ badges: badgesWithProgress, earnedCount: Object.keys(earnedMap).length, totalCount: allBadges.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取徽章失败' });
  }
});

// Award a badge to a user (internal use)
function awardBadge(userId, badgeId) {
  try {
    db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, badgeId);
  } catch (e) {}
}

// Check and award badges for a user (call after actions)
function checkBadges(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return;

  const allBadges = db.prepare('SELECT * FROM badges').all();
  const earned = new Set(
    db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(userId).map(r => r.badge_id)
  );

  for (const badge of allBadges) {
    if (earned.has(badge.id)) continue;

    let qualifies = false;
    switch (badge.condition_type) {
      case 'posts_count':
        const postCount = db.prepare('SELECT COUNT(*) as c FROM posts WHERE user_id = ? AND status = \'approved\'').get(userId).c;
        qualifies = postCount >= badge.condition_value;
        break;
      case 'comments_count':
        const commentCount = db.prepare('SELECT COUNT(*) as c FROM comments WHERE user_id = ?').get(userId).c;
        qualifies = commentCount >= badge.condition_value;
        break;
      case 'checkin_streak':
        qualifies = (user.checkin_streak || 0) >= badge.condition_value;
        break;
      case 'points':
        qualifies = (user.points || 0) >= badge.condition_value;
        break;
      case 'reactions_count':
        const reactionCount = db.prepare('SELECT COUNT(*) as c FROM post_reactions pr JOIN posts p ON p.id = pr.post_id WHERE p.user_id = ?').get(userId).c;
        qualifies = reactionCount >= badge.condition_value;
        break;
    }

    if (qualifies) {
      awardBadge(userId, badge.id);
      console.log('[Badge] 用户 ' + userId + ' 获得徽章: ' + badge.name);
    }
  }
}

module.exports = router;
module.exports.awardBadge = awardBadge;
module.exports.checkBadges = checkBadges;
