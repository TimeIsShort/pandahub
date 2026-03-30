// Push notification helper - sends Web Push to subscribed users
let webpush = null;
let webpushReady = false;

function initPush() {
  if (webpushReady) return;
  try {
    const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
    const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
    const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@pandahub.cloud';
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.warn('[Push] VAPID 未配置，跳过推送');
      return;
    }
    webpush = require('web-push');
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    webpushReady = true;
  } catch (e) {
    console.warn('[Push] web-push 初始化失败:', e.message);
  }
}

async function sendPushToUser(userId, { title, body, url, tag }) {
  initPush();
  if (!webpushReady) return;

  try {
    const db = require('../models/database');
    const sub = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').get(Number(userId));
    if (!sub) return;

    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body, url: url || '/', tag: tag || 'default' })
    );
    console.log(`[Push] 推送给用户 ${userId}: ${title}`);
  } catch (err) {
    if (err.statusCode === 404 || err.message.includes('unsubscribed')) {
      // Clean up dead subscription
      try {
        const db = require('../models/database');
        db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(Number(userId));
      } catch (e2) {}
    }
    // Silently ignore other push errors
  }
}

module.exports = { sendPushToUser };
