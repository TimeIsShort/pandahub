const cron = require('node-cron');
const db = require('../models/database');
const { sendPushToUser } = require('../utils/pushHelper');

let scheduled = false;

function startReminderScheduler() {
  if (scheduled) return;
  scheduled = true;

  // Run every minute, check if any user's reminder time matches current time
  cron.schedule('* * * * *', function() {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM

      // Find users with reminder enabled, matching time and day
      const rows = db.prepare(`
        SELECT rs.user_id, u.nickname
        FROM reminder_settings rs
        JOIN users u ON u.id = rs.user_id
        WHERE rs.reminder_enabled = 1
          AND rs.reminder_time = ?
          AND rs.reminder_days LIKE '%' || ? || '%'
      `).all(currentTime, String(dayOfWeek));

      rows.forEach(function(row) {
        sendPushToUser(row.user_id, {
          title: '🐼 签到提醒',
          body: row.nickname + '，该签到啦！连续签到积分翻倍哦～',
          url: '/',
          tag: 'daily-checkin'
        });
        console.log('[Reminder] Sent checkin reminder to user ' + row.user_id);
      });
    } catch (e) {
      console.error('[Reminder] Scheduler error:', e.message);
    }
  });

  console.log('[Reminder] Scheduler started - checking every minute');
}

module.exports = { startReminderScheduler };
