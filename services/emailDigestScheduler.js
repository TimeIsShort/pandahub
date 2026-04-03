// Weekly email digest scheduler - runs every Friday at 18:00
const db = require('../models/database');
const { sendEmail } = require('../utils/mailer');
const { buildDigestEmail } = require('../routes/emailDigest');

let timer = null;

function startDigestScheduler() {
  // Check if should run today
  function shouldRunToday() {
    const now = new Date();
    return now.getDay() === 5; // Friday = 5
  }

  function scheduleNext() {
    const now = new Date();
    const friday18 = new Date(now);
    // Set to next Friday 18:00
    const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
    friday18.setDate(now.getDate() + daysUntilFriday);
    friday18.setHours(18, 0, 0, 0);
    if (friday18 <= now) friday18.setDate(friday18.getDate() + 7);

    const ms = friday18.getTime() - now.getTime();
    console.log(`[EmailDigest] Next run: ${friday18.toLocaleString('zh-CN')} (in ${Math.round(ms/1000/60)} minutes)`);
    clearTimeout(timer);
    timer = setTimeout(runDigest, ms);
  }

  async function runDigest() {
    console.log('[EmailDigest] Running weekly digest...');
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const activeUsers = db.prepare(`
      SELECT DISTINCT u.id, u.email, u.nickname
      FROM users u
      WHERE u.email IS NOT NULL AND u.email != ''
        AND u.email_verified = 1
        AND u.is_banned = 0
        AND (
          EXISTS(SELECT 1 FROM posts WHERE user_id = u.id AND created_at >= ?) OR
          EXISTS(SELECT 1 FROM comments WHERE user_id = u.id AND created_at >= ?) OR
          EXISTS(SELECT 1 FROM checkins WHERE user_id = u.id AND created_at >= ?)
        )
      LIMIT 200
    `).all(weekAgo, weekAgo, weekAgo);

    let sent = 0, failed = 0;
    for (const u of activeUsers) {
      try {
        const html = await buildDigestEmail({ nickname: u.nickname, isTest: false });
        await sendEmail({ to: u.email, subject: '🐼 熊猫社区本周热门帖子', html });
        sent++;
      } catch(e) {
        failed++;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`[EmailDigest] Done: ${sent} sent, ${failed} failed`);
    scheduleNext();
  }

  // Run immediately if it's Friday (for testing)
  if (shouldRunToday()) {
    console.log('[EmailDigest] Today is Friday - running digest in 10s');
    timer = setTimeout(runDigest, 10000);
  } else {
    scheduleNext();
  }
}

module.exports = { startDigestScheduler };
