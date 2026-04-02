const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const TYPE_LABELS = {
  new_comment: '💬 评论',
  new_reply: '💬 回复',
  post_approved: '🎉 审核通过',
  post_rejected: '❌ 审核拒绝',
  mention: '@ 提及',
  system: '🔔 系统',
  private_message: '💬 私信',
};

// Get user's notifications (paginated + filterable)
router.get('/', authMiddleware, (req, res) => {
  try {
    const { type = '', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE n.user_id = ?';
    let params = [req.user.id];

    if (type) {
      where += ' AND n.type = ?';
      params.push(type);
    }

    const notifications = db.prepare(`
      SELECT n.*, p.title as post_title
      FROM notifications n
      LEFT JOIN posts p ON n.post_id = p.id
      ${where}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), Number(offset));

    const totalResult = db.prepare(`
      SELECT COUNT(*) as c FROM notifications n ${where}
    `).get(...params);

    const unreadResult = db.prepare(`
      SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0
    `).get(req.user.id);

    // Add human-readable type label
    notifications.forEach(n => {
      n.typeLabel = TYPE_LABELS[n.type] || '🔔 通知';
    });

    res.json({
      notifications,
      total: totalResult.c,
      unreadCount: unreadResult.c,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取通知失败' });
  }
});

// Mark notification as read
router.post('/:id/read', authMiddleware, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败' });
  }
});

// Mark all as read
router.post('/read-all', authMiddleware, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')
      .run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败' });
  }
});

// Get unread count
router.get('/unread-count', authMiddleware, (req, res) => {
  try {
    const result = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(req.user.id);
    res.json({ count: result.count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取失败' });
  }
});

// Unified inbox: notifications + private messages combined
router.get('/inbox', authMiddleware, (req, res) => {
  try {
    const { tab = 'all', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const userId = req.user.id;

    let items = [];
    let total = 0;

    if (tab === 'all' || tab === 'notifications') {
      // Get notifications
      let notifWhere = 'WHERE n.user_id = ?';
      let notifParams = [userId];
      if (tab === 'notifications') {
        notifWhere += " AND n.type != 'private_message'";
      }

      const notifs = db.prepare(`
        SELECT n.*, p.title as post_title,
               'notification' as item_type,
               n.id as notif_id
        FROM notifications n
        LEFT JOIN posts p ON n.post_id = p.id
        ${notifWhere}
        ORDER BY n.created_at DESC
        LIMIT ? OFFSET ?
      `).all(...notifParams, Number(limit), Number(offset));

      const notifTotal = db.prepare(`
        SELECT COUNT(*) as c FROM notifications n ${notifWhere}
      `).get(...notifParams).c;

      notifs.forEach(n => {
        n.typeLabel = TYPE_LABELS[n.type] || '🔔 通知';
        n.item_time = n.created_at;
      });

      items = items.concat(notifs);
      total += notifTotal;
    }

    if (tab === 'all' || tab === 'messages') {
      // Get private messages
      const msgs = db.prepare(`
        SELECT m.*,
               su.nickname as sender_nickname,
               su.avatar as sender_avatar,
               ru.nickname as receiver_nickname,
               'private_message' as item_type,
               m.id as msg_id,
               CASE WHEN m.sender_id = ? THEN ru.id ELSE su.id END as partner_id,
               CASE WHEN m.sender_id = ? THEN ru.nickname ELSE su.nickname END as partner_nickname,
               CASE WHEN m.sender_id = ? THEN ru.avatar ELSE su.avatar END as partner_avatar,
               CASE WHEN m.sender_id = ? THEN ru.username ELSE su.username END as partner_username
        FROM messages m
        LEFT JOIN users su ON m.sender_id = su.id
        LEFT JOIN users ru ON m.receiver_id = ru.id
        WHERE m.sender_id = ? OR m.receiver_id = ?
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
      `).all(userId, userId, userId, userId, userId, userId, Number(limit), Number(offset));

      const msgTotal = db.prepare(`
        SELECT COUNT(*) as c FROM messages WHERE sender_id = ? OR receiver_id = ?
      `).get(userId, userId).c;

      msgs.forEach(m => {
        m.typeLabel = '💬 私信';
        m.item_time = m.created_at;
        // For display: use sender_nickname or partner_nickname
        m.display_nickname = m.sender_id === userId ? m.receiver_nickname : m.sender_nickname;
        m.display_avatar = m.sender_id === userId ? m.receiver_avatar : m.sender_avatar;
      });

      items = items.concat(msgs);
      total += msgTotal;
    }

    // Sort all by time
    items.sort((a, b) => new Date(b.item_time) - new Date(a.item_time));

    // Count unread
    const notifUnread = db.prepare(
      'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(userId).c;
    const msgUnread = db.prepare(
      'SELECT COUNT(*) as c FROM messages WHERE receiver_id = ? AND is_read = 0'
    ).get(userId).c;

    res.json({
      items,
      total,
      unreadCount: notifUnread + msgUnread,
      notifUnread,
      msgUnread,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error('[Inbox]', err);
    res.status(500).json({ error: '获取收件箱失败' });
  }
});

// Delete notification
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: '通知不存在或无权删除' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除失败' });
  }
});

// Batch mark as read
router.post('/mark-read', authMiddleware, (req, res) => {
  try {
    const { type } = req.body;
    if (type === 'notifications') {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    } else if (type === 'messages') {
      db.prepare('UPDATE messages SET is_read = 1 WHERE receiver_id = ?').run(req.user.id);
    } else {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
      db.prepare('UPDATE messages SET is_read = 1 WHERE receiver_id = ?').run(req.user.id);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败' });
  }
});

module.exports = router;
