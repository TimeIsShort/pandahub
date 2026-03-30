const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Points configuration
const STREAK_BONUSES = {
  1: 5,   // Day 1: 5 points
  2: 8,   // Day 2: 8 points
  3: 10,  // Day 3: 10 points
  4: 12,  // Day 4: 12 points
  5: 15,  // Day 5: 15 points
  6: 18,  // Day 6: 18 points
  7: 25,  // Day 7: 25 points (week bonus)
};

function getStreakBonus(streakDay) {
  if (streakDay <= 0) return STREAK_BONUSES[1];
  if (streakDay >= 7) return STREAK_BONUSES[7];
  return STREAK_BONUSES[streakDay] || STREAK_BONUSES[1];
}

// Get checkin status
router.get('/status', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT points, checkin_streak FROM users WHERE id = ?').get(req.user.id);
    
    // Check if already checked in today
    const today = new Date().toISOString().slice(0, 10);
    const todayCheckin = db.prepare(
      'SELECT * FROM checkins WHERE user_id = ? AND checkin_date = ?'
    ).get(req.user.id, today);

    // Get yesterday's date
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const yesterdayCheckin = db.prepare(
      'SELECT * FROM checkins WHERE user_id = ? AND checkin_date = ?'
    ).get(req.user.id, yesterday);

    // If last checkin was not yesterday, streak should be 0 (but we keep it in user record, logic below)
    // Actually we calculate it: if yesterday didn't checkin, current streak for today = 1
    let currentStreak = user.checkin_streak || 0;
    
    // If no checkin today and no checkin yesterday, streak is 0
    if (!todayCheckin && !yesterdayCheckin) {
      currentStreak = 0;
    } else if (!todayCheckin && yesterdayCheckin) {
      // Streak is preserved from yesterday
      currentStreak = currentStreak;
    }

    // Get last 7 days of checkins
    const recentCheckins = db.prepare(`
      SELECT checkin_date FROM checkins
      WHERE user_id = ?
      ORDER BY checkin_date DESC
      LIMIT 7
    `).all(req.user.id);

    const checkedInDates = recentCheckins.map(c => c.checkin_date);

    // Calculate next bonus
    let nextStreak = currentStreak;
    if (!todayCheckin) {
      nextStreak = yesterdayCheckin ? currentStreak + 1 : 1;
    }

    res.json({
      points: user.points || 0,
      currentStreak: todayCheckin ? currentStreak : (yesterdayCheckin ? currentStreak : 0),
      checkedInToday: !!todayCheckin,
      nextBonus: todayCheckin ? null : getStreakBonus(nextStreak),
      nextStreak: todayCheckin ? null : nextStreak,
      checkedInDates,
      streakBonuses: STREAK_BONUSES
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取签到状态失败' });
  }
});

// Perform checkin
router.post('/checkin', authMiddleware, (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    
    // Check if already checked in today
    const existing = db.prepare(
      'SELECT * FROM checkins WHERE user_id = ? AND checkin_date = ?'
    ).get(req.user.id, today);

    if (existing) {
      return res.status(400).json({ error: '今日已签到，明天再来吧' });
    }

    // Get yesterday's checkin
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const yesterdayCheckin = db.prepare(
      'SELECT * FROM checkins WHERE user_id = ? AND checkin_date = ?'
    ).get(req.user.id, yesterday);

    // Determine streak
    let streakBefore = 0;
    if (yesterdayCheckin) {
      // Get current streak from yesterday's checkin record
      streakBefore = db.prepare(
        'SELECT streak_before + 1 as new_streak FROM checkins WHERE user_id = ? AND checkin_date = ?'
      ).get(req.user.id, yesterday).new_streak - 1;
    }

    // Calculate new streak
    let newStreak = yesterdayCheckin ? (streakBefore + 1) : 1;
    
    // Cap streak at 7 for bonus lookup (but store actual)
    const streakForBonus = Math.min(newStreak, 7);
    const pointsEarned = getStreakBonus(streakForBonus);

    // Insert checkin record
    db.prepare(
      'INSERT INTO checkins (user_id, checkin_date, points_earned, streak_before) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, today, pointsEarned, newStreak);

    // Update user points and streak
    db.prepare(
      'UPDATE users SET points = points + ?, checkin_streak = ? WHERE id = ?'
    ).run(pointsEarned, newStreak, req.user.id);

    // Get updated user
    const updatedUser = db.prepare('SELECT points, checkin_streak FROM users WHERE id = ?').get(req.user.id);

    res.json({
      success: true,
      pointsEarned,
      totalPoints: updatedUser.points,
      currentStreak: updatedUser.checkin_streak,
      message: `签到成功！获得 ${pointsEarned} 积分${newStreak > 1 ? `（连续签到第 ${newStreak} 天）` : ''}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '签到失败' });
  }
});

// Get points history (optional)
router.get('/history', authMiddleware, (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const history = db.prepare(`
      SELECT * FROM checkins
      WHERE user_id = ?
      ORDER BY checkin_date DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, Number(limit), Number(offset));

    const total = db.prepare(
      'SELECT COUNT(*) as count FROM checkins WHERE user_id = ?'
    ).get(req.user.id).count;

    res.json({ history, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取记录失败' });
  }
});

module.exports = router;
