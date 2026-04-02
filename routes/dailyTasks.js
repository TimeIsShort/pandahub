const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { DAILY_TASKS } = require('../models/database');
const router = express.Router();

// Weekly champion bonus config
const WEEKLY_BONUS = {
  min_consecutive_days: 7,  // Need 7 consecutive days for weekly bonus
  bonus_points: 50          // Weekly champion bonus
};

// Get today's task status with enhanced info
router.get('/status', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Get user daily stats
    const user = db.prepare(
      'SELECT daily_posts_date, daily_posts_count, daily_comments_date, daily_comments_count FROM users WHERE id = ?'
    ).get(userId);

    // Check if day has rolled over (reset if yesterday)
    const postsDone = (user.daily_posts_date === today) ? (user.daily_posts_count || 0) : 0;
    const commentsDone = (user.daily_comments_date === today) ? (user.daily_comments_count || 0) : 0;

    // Check checkin status
    const checkinDone = !!db.prepare(
      'SELECT id FROM checkins WHERE user_id = ? AND checkin_date = ?'
    ).get(userId, today);

    // Check if already claimed today
    const claimRecord = db.prepare(
      'SELECT * FROM user_task_claims WHERE user_id = ? AND claim_date = ?'
    ).get(userId, today);

    // Calculate consecutive days
    let consecutiveDays = claimRecord?.consecutive_days || 0;

    const taskStatuses = [
      {
        id: 'post',
        name: '📝 发布帖子',
        desc: '今日发布1篇帖子',
        icon: '📝',
        done: postsDone >= 1,
        current: Math.min(postsDone, 1),
        target: 1,
        reward: 5,
        claimed: !!claimRecord,
      },
      {
        id: 'comment',
        name: '💬 发表评论',
        desc: '今日评论3次',
        icon: '💬',
        done: commentsDone >= 3,
        current: Math.min(commentsDone, 3),
        target: 3,
        reward: 3,
        claimed: !!claimRecord,
      },
      {
        id: 'checkin',
        name: '✅ 每日签到',
        desc: '今日完成签到',
        icon: '✅',
        done: checkinDone,
        current: checkinDone ? 1 : 0,
        target: 1,
        reward: 2,
        claimed: !!claimRecord,
      },
    ];

    // Calculate total reward
    const totalReward = DAILY_TASKS.reduce((sum, t) => sum + t.reward, 0);
    const allDone = taskStatuses.every(t => t.done);

    // Check if eligible for weekly champion bonus
    const weeklyEligible = consecutiveDays >= WEEKLY_BONUS.min_consecutive_days;

    // Days until weekly bonus
    const daysUntilWeekly = consecutiveDays > 0
      ? Math.max(0, WEEKLY_BONUS.min_consecutive_days - (consecutiveDays % 7 === 0 ? 7 : consecutiveDays % 7))
      : 0;

    res.json({
      tasks: taskStatuses,
      allDone,
      totalReward,
      claimed: !!claimRecord,
      claimedRecord: claimRecord,
      consecutiveDays,
      weeklyEligible,
      weeklyBonus: WEEKLY_BONUS.bonus_points,
      daysUntilWeekly: consecutiveDays > 0 ? (7 - (consecutiveDays % 7)) : 7,
      WEEKLY_BONUS
    });
  } catch (err) {
    console.error('[DailyTasks]', err);
    res.status(500).json({ error: '获取任务状态失败' });
  }
});

// Get weekly leaderboard for task champions
router.get('/weekly-leaderboard', authMiddleware, (req, res) => {
  try {
    // Get users with their consecutive days in last 7 days
    const leaders = db.prepare(`
      SELECT u.id, u.username, u.nickname, u.avatar,
             MAX(utc.consecutive_days) as max_streak,
             COUNT(utc.id) as claim_days
      FROM users u
      JOIN user_task_claims utc ON u.id = utc.user_id
      WHERE utc.claim_date >= date('now', '-7 days')
      GROUP BY u.id
      ORDER BY max_streak DESC, claim_days DESC
      LIMIT 10
    `).all();

    res.json({ leaders });
  } catch (err) {
    console.error('[DailyTasks leaderboard]', err);
    res.status(500).json({ error: '获取排行榜失败' });
  }
});

// Claim all available rewards
router.post('/claim', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Check if already claimed today
    const existingClaim = db.prepare(
      'SELECT * FROM user_task_claims WHERE user_id = ? AND claim_date = ?'
    ).get(userId, today);

    if (existingClaim) {
      return res.status(400).json({ error: '今日奖励已领取，请明日再来！' });
    }

    // Verify all tasks are done
    const user = db.prepare(
      'SELECT daily_posts_date, daily_posts_count, daily_comments_date, daily_comments_count FROM users WHERE id = ?'
    ).get(userId);

    const postsDone = (user.daily_posts_date === today) ? (user.daily_posts_count || 0) : 0;
    const commentsDone = (user.daily_comments_date === today) ? (user.daily_comments_count || 0) : 0;
    const checkinDone = !!db.prepare(
      'SELECT id FROM checkins WHERE user_id = ? AND checkin_date = ?'
    ).get(userId, today);

    if (postsDone < 1 || commentsDone < 3 || !checkinDone) {
      const incomplete = [];
      if (postsDone < 1) incomplete.push('发布帖子');
      if (commentsDone < 3) incomplete.push('发表评论');
      if (!checkinDone) incomplete.push('每日签到');
      return res.status(400).json({ error: `还需完成：${incomplete.join('、')}` });
    }

    // Calculate reward
    const totalReward = DAILY_TASKS.reduce((sum, t) => sum + t.reward, 0);

    // Calculate consecutive days
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const yesterdayClaim = db.prepare(
      'SELECT consecutive_days FROM user_task_claims WHERE user_id = ? AND claim_date = ?'
    ).get(userId, yesterday);

    let consecutiveDays = yesterdayClaim ? (yesterdayClaim.consecutive_days + 1) : 1;

    // Check for weekly champion bonus
    let weeklyBonus = 0;
    if (consecutiveDays >= WEEKLY_BONUS.min_consecutive_days && consecutiveDays % 7 === 0) {
      weeklyBonus = WEEKLY_BONUS.bonus_points;
    }

    const finalReward = totalReward + weeklyBonus;

    // Give reward
    db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(finalReward, userId);
    db.prepare(
      'INSERT INTO user_task_claims (user_id, claim_date, reward_points, consecutive_days) VALUES (?, ?, ?, ?)'
    ).run(userId, today, finalReward, consecutiveDays);

    const updatedUser = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);

    res.json({
      success: true,
      rewardPoints: totalReward,
      weeklyBonus: weeklyBonus,
      totalReward: finalReward,
      totalPoints: updatedUser.points,
      consecutiveDays: consecutiveDays,
      isWeeklyChampion: consecutiveDays >= WEEKLY_BONUS.min_consecutive_days
    });
  } catch (err) {
    console.error('[DailyTasks claim]', err);
    res.status(500).json({ error: '领取奖励失败' });
  }
});

// Increment daily post count (called from post creation)
function incrementDailyPostCount(userId) {
  const today = new Date().toISOString().split('T')[0];
  const user = db.prepare('SELECT daily_posts_date, daily_posts_count FROM users WHERE id = ?').get(userId);
  if (user.daily_posts_date === today) {
    db.prepare('UPDATE users SET daily_posts_count = daily_posts_count + 1 WHERE id = ?').run(userId);
  } else {
    db.prepare('UPDATE users SET daily_posts_date = ?, daily_posts_count = 1 WHERE id = ?').run(today, userId);
  }
}

// Increment daily comment count (called from comment creation)
function incrementDailyCommentCount(userId) {
  const today = new Date().toISOString().split('T')[0];
  const user = db.prepare('SELECT daily_comments_date, daily_comments_count FROM users WHERE id = ?').get(userId);
  if (user.daily_comments_date === today) {
    db.prepare('UPDATE users SET daily_comments_count = daily_comments_count + 1 WHERE id = ?').run(userId);
  } else {
    db.prepare('UPDATE users SET daily_comments_date = ?, daily_comments_count = 1 WHERE id = ?').run(today, userId);
  }
}

module.exports = router;
module.exports.incrementDailyPostCount = incrementDailyPostCount;
module.exports.incrementDailyCommentCount = incrementDailyCommentCount;
