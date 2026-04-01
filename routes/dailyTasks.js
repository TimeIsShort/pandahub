const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { DAILY_TASKS } = require('../models/database');
const router = express.Router();

// Get today's task status
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

    const taskStatuses = [
      {
        id: 'post',
        name: '📝 发布帖子',
        desc: '今日发布1篇帖子',
        done: postsDone >= 1,
        current: Math.min(postsDone, 1),
        target: 1,
        reward: 5,
        claimed: false,
      },
      {
        id: 'comment',
        name: '💬 发表评论',
        desc: '今日评论3次',
        done: commentsDone >= 3,
        current: Math.min(commentsDone, 3),
        target: 3,
        reward: 3,
        claimed: false,
      },
      {
        id: 'checkin',
        name: '✅ 每日签到',
        desc: '今日完成签到',
        done: checkinDone,
        current: checkinDone ? 1 : 0,
        target: 1,
        reward: 2,
        claimed: false,
      },
    ];

    // Calculate total reward
    const totalReward = DAILY_TASKS.reduce((sum, t) => sum + t.reward, 0);
    const allDone = taskStatuses.every(t => t.done);

    res.json({ tasks: taskStatuses, allDone, totalReward });
  } catch (err) {
    console.error('[DailyTasks]', err);
    res.status(500).json({ error: '获取任务状态失败' });
  }
});

// Claim all available rewards
router.post('/claim', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Check if already claimed today
    const claimed = db.prepare(
      'SELECT reward_claimed_date FROM user_task_claims WHERE user_id = ? AND claim_date = ?'
    ).get(userId, today);

    if (claimed) {
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

    // Give reward
    db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(totalReward, userId);
    db.prepare(
      'INSERT INTO user_task_claims (user_id, claim_date, reward_points) VALUES (?, ?, ?)'
    ).run(userId, today, totalReward);

    const updatedUser = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);

    res.json({
      success: true,
      rewardPoints: totalReward,
      totalPoints: updatedUser.points,
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
