const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// GET reminder settings for current user
router.get('/settings', authMiddleware, (req, res) => {
  try {
    const settings = db.prepare(
      'SELECT * FROM reminder_settings WHERE user_id = ?'
    ).get(req.user.id);

    if (!settings) {
      // Create default settings
      db.prepare(
        'INSERT INTO reminder_settings (user_id) VALUES (?)'
      ).run(req.user.id);
      return res.json({
        reminder_enabled: 1,
        reminder_time: '09:00',
        reminder_days: '1,2,3,4,5,6,0'
      });
    }

    res.json({
      reminder_enabled: settings.reminder_enabled,
      reminder_time: settings.reminder_time,
      reminder_days: settings.reminder_days
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取提醒设置失败' });
  }
});

// PUT update reminder settings
router.put('/settings', authMiddleware, (req, res) => {
  try {
    const { reminder_enabled, reminder_time, reminder_days } = req.body;

    if (reminder_time && !/^\d{2}:\d{2}$/.test(reminder_time)) {
      return res.status(400).json({ error: '时间格式错误，请使用 HH:MM' });
    }
    if (reminder_days) {
      const days = String(reminder_days).split(',').map(d => d.trim());
      const valid = ['0','1','2','3','4','5','6'];
      if (!days.every(d => valid.includes(d))) {
        return res.status(400).json({ error: '日期格式错误，使用逗号分隔的0-6数字（0=周日）' });
      }
    }

    const existing = db.prepare('SELECT id FROM reminder_settings WHERE user_id = ?').get(req.user.id);
    if (existing) {
      db.prepare(
        'UPDATE reminder_settings SET reminder_enabled = ?, reminder_time = ?, reminder_days = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
      ).run(
        reminder_enabled !== undefined ? (reminder_enabled ? 1 : 0) : 1,
        reminder_time || '09:00',
        reminder_days || '1,2,3,4,5,6,0',
        req.user.id
      );
    } else {
      db.prepare(
        'INSERT INTO reminder_settings (user_id, reminder_enabled, reminder_time, reminder_days) VALUES (?, ?, ?, ?)'
      ).run(
        req.user.id,
        reminder_enabled !== undefined ? (reminder_enabled ? 1 : 0) : 1,
        reminder_time || '09:00',
        reminder_days || '1,2,3,4,5,6,0'
      );
    }

    res.json({ success: true, message: '提醒设置已保存' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '保存提醒设置失败' });
  }
});

// POST: subscribe to push notifications (save endpoint)
router.post('/subscribe', authMiddleware, (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: '缺少订阅信息' });
    }

    db.prepare(
      'INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, endpoint, keys.p256dh, keys.auth);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '订阅失败' });
  }
});

// DELETE: unsubscribe
router.delete('/unsubscribe', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '取消订阅失败' });
  }
});

// GET: check if subscribed
router.get('/subscribed', authMiddleware, (req, res) => {
  try {
    const sub = db.prepare('SELECT user_id FROM push_subscriptions WHERE user_id = ?').get(req.user.id);
    res.json({ subscribed: !!sub });
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

module.exports = router;
