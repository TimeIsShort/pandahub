const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@yourdomain.com';

let webpush = null;
try {
  webpush = require('web-push');
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.warn('[Push] web-push 未安装，跳过 VAPID 初始化');
}

// Store push subscriptions
// Table: push_subscriptions (user_id, endpoint, p256dh, auth, created_at)

db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    user_id INTEGER PRIMARY KEY,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Get VAPID public key
router.get('/vapid-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Web Push 未配置，请联系管理员' });
  }
  res.json({ key: VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: '缺少订阅信息' });
    }

    // Upsert subscription
    db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET endpoint = ?, p256dh = ?, auth = ?
    `).run(req.user.id, endpoint, keys.p256dh, keys.auth, endpoint, keys.p256dh, keys.auth);

    res.json({ success: true });
  } catch (err) {
    console.error('[Push] 订阅失败:', err);
    res.status(500).json({ error: '订阅失败' });
  }
});

// Unsubscribe
router.post('/unsubscribe', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Push] 取消订阅失败:', err);
    res.status(500).json({ error: '取消订阅失败' });
  }
});

// Check if user is subscribed
router.get('/status', authMiddleware, (req, res) => {
  try {
    const sub = db.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id = ?').get(req.user.id);
    res.json({ subscribed: !!sub });
  } catch (err) {
    res.status(500).json({ error: '查询状态失败' });
  }
});

// Send push notification to a user (called internally by other routes)
async function sendPushToUser(userId, { title, body, url, tag }) {
  if (!webpush) {
    console.warn('[Push] web-push 未安装，跳过推送');
    return;
  }
  try {
    const sub = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').get(userId);
    if (!sub) return;
    await webpush.sendNotification({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    }, JSON.stringify({ title, body, url, tag }));
  } catch (err) {
    console.warn('[Push] 发送失败:', err.message);
  }
}

module.exports = router;
module.exports.sendPushToUser = sendPushToUser;

// POST /api/push/broadcast - 管理员发送全站推送
router.post('/broadcast', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  const { title, body, url } = req.body;
  if (!title) return res.status(400).json({ error: '标题不能为空' });

  if (!webpush) return res.status(503).json({ error: 'Web Push 未配置' });

  const subs = db.prepare('SELECT * FROM push_subscriptions').all();
  let sent = 0, failed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, JSON.stringify({ title: title || '🐼 熊猫社区', body: body || '', url: url || '/', tag: 'broadcast' }));
      sent++;
    } catch(e) {
      failed++;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  res.json({ message: `发送完成：成功 ${sent}，失败 ${failed}` });
});
