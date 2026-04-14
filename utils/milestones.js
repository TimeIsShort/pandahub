/**
 * Milestone Checker - call after key community actions
 * This triggers milestone detection and recording for gamification.
 */

const db = require('../models/database');
const SITE_URL = process.env.SITE_URL || 'https://pandahub.cloud';

/**
 * Check and record milestones after a community action
 * @param {string} type - 'users' | 'posts' | 'comments' | 'checkin_streak'
 * @param {number} currentValue - current count (optional, will query if not provided)
 */
const { sendPushToUser, sendEmailToUser, escapeHtml } = require('./pushHelper');

function checkMilestones(type, currentValue) {
  try {
    // Get current value if not provided
    let value = currentValue;
    if (value === undefined) {
      const stats = {
        users: db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt,
        posts: db.prepare("SELECT COUNT(*) as cnt FROM posts WHERE status='approved'").get().cnt,
        comments: db.prepare("SELECT COUNT(*) as cnt FROM comments").get().cnt
      };
      value = stats[type];
    }

    // Find newly achieved milestones
    const achieved = db.prepare(`
      SELECT m.id, m.title, m.milestone_type, m.threshold
      FROM milestones m
      LEFT JOIN milestone_events e ON m.id = e.milestone_id
      WHERE m.milestone_type = ? AND m.threshold <= ? AND e.id IS NULL
      ORDER BY m.threshold DESC
    `).all(type, value || 0);

    if (achieved.length === 0) return [];

    // Record each new milestone
    const insertEvent = db.prepare('INSERT OR IGNORE INTO milestone_events (milestone_id) VALUES (?)');
    for (const m of achieved) {
      insertEvent.run(m.id);
      // Log the achievement
      try {
        db.prepare(`
          INSERT INTO admin_action_logs (admin_id, action, target_type, target_id, details, created_at)
          VALUES (1, 'milestone_achieved', 'milestone', ?, ?, datetime('now'))
        `).run(m.id, '里程碑达成: ' + m.title);
      } catch (e) {
        // admin_action_logs might not exist in all environments
        console.log('[Milestone] Logged:', m.title);

        // Send notification for this milestone (personal types get individual notification)
        sendMilestoneNotification(m, type);
      }
    }

    return achieved;
  } catch (err) {
    console.error('[Milestone check]', err);
    return [];
  }
}

/**
 * Get the latest achieved milestone (for showing celebration modal)
 */
function getLatestMilestone() {
  try {
    return db.prepare(`
      SELECT m.*, e.achieved_at
      FROM milestones m
      JOIN milestone_events e ON m.id = e.milestone_id
      ORDER BY e.achieved_at DESC
      LIMIT 1
    `).get();
  } catch (err) {
    return null;
  }
}

async function sendMilestoneNotification(milestone, type) {
  try {
    const { sendPushToUser, sendEmailToUser, escapeHtml } = require('./pushHelper');
    const db = require('../models/database');

    // Determine recipients
    let userIds = [];
    if (type === 'checkin_streak') {
      // Personal milestone - find the user who achieved it
      const streakUser = db.prepare(
        "SELECT user_id FROM checkins WHERE date(checkin_date) = date('now') ORDER BY created_at DESC LIMIT 1"
      ).get();
      if (streakUser) userIds = [streakUser.user_id];
    } else {
      // Community milestone - notify recent active users (last 30 days)
      const activeUsers = db.prepare(
        "SELECT DISTINCT user_id FROM posts WHERE created_at > datetime('now', '-30 days') UNION SELECT DISTINCT user_id FROM comments WHERE created_at > datetime('now', '-30 days')"
      ).all();
      userIds = activeUsers.map(u => u.user_id || u.id).filter(Boolean);
    }

    const milestoneName = milestone.title || '社区里程碑';
    const milestoneIcon = milestone.icon || '🎉';
    const msg = milestoneIcon + ' ' + milestoneName + ' 已达成！';

    for (const uid of userIds) {
      // In-app
      db.prepare(
        "INSERT INTO notifications (user_id, type, title, content) VALUES (?, 'milestone', ?, ?)"
      ).run(uid, msg, milestone.description || '');

      // Web Push
      sendPushToUser(uid, {
        title: msg,
        body: milestone.description || '查看详情',
        url: '/',
        tag: 'milestone-' + milestone.id
      });

      // Email
      sendEmailToUser(uid, {
        subject: milestoneIcon + ' ' + milestoneName + ' 已达成 - 熊猫社区',
        html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">' +
          '<div style="text-align:center;margin-bottom:24px;"><h2 style="color:#667eea;">🐼 熊猫社区</h2></div>' +
          '<div style="text-align:center;font-size:48px;margin:20px 0;">' + milestoneIcon + '</div>' +
          '<p style="font-size:20px;font-weight:bold;text-align:center;color:#1e293b;">' + escapeHtml(milestoneName) + '</p>' +
          '<p style="font-size:15px;color:#64748b;text-align:center;margin:12px 0;">' + escapeHtml(milestone.description || '') + '</p>' +
          '<div style="background:#fef9c3;border-radius:8px;padding:16px;margin:20px 0;text-align:center;font-size:14px;color:#92400e;">' +
          '感谢每一位社区成员的贡献！🌟</div>' +
          '<a href="' + SITE_URL + '" style="display:block;text-align:center;background:#667eea;color:#fff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px;margin-top:16px;">前往社区 →</a></div>',
      });
    }
  } catch (e) {
    console.warn('[Milestone] Notification error:', e.message);
  }
}

module.exports = { checkMilestones, getLatestMilestone };
