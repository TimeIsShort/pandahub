// Push notification helper - sends Web Push to subscribed users
let webpush = null;
let webpushReady = false;

function initPush() {
  if (webpushReady) return;
  try {
    const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
    const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
    const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@yourdomain.com';
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

function isInQuietHours(userId) {
  try {
    const db = require('../models/database');
    const user = db.prepare(
      'SELECT notification_quiet_hours, notification_quiet_start, notification_quiet_end FROM users WHERE id = ?'
    ).get(Number(userId));
    if (!user || !user.notification_quiet_hours) return false;

    const now = new Date();
    const currentHHMM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const start = user.notification_quiet_start || '22:00';
    const end = user.notification_quiet_end || '08:00';

    if (start <= end) {
      return currentHHMM >= start && currentHHMM < end;
    } else {
      // Overnight (e.g. 22:00 - 08:00)
      return currentHHMM >= start || currentHHMM < end;
    }
  } catch (e) {
    return false;
  }
}

async function sendPushToUser(userId, { title, body, url, tag }) {
  try {
    const db = require('../models/database');
    const user = db.prepare('SELECT notify_push, notification_mode FROM users WHERE id = ?').get(Number(userId));
    if (!user || !user.notify_push) return;
    if (isInQuietHours(userId)) return;
    // Respect notification mode: 'all' = everything, 'dm_only' = only new_message, 'silent' = none
    const mode = user.notification_mode || 'all';
    if (mode === 'silent') return;
    if (mode === 'dm_only' && tag !== 'private-message' && tag !== 'new_message') return;

    initPush();
    if (!webpushReady) return;

    const sub = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').get(Number(userId));
    if (!sub) return;

    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body, url: url || '/', tag: tag || 'default' })
    );
    console.log('[Push] 推送给用户 ' + userId + ': ' + title);
  } catch (err) {
    if (err.statusCode === 404 || err.message.includes('unsubscribed')) {
      try {
        const db = require('../models/database');
        db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(Number(userId));
      } catch (e2) {}
    }
  }
}

// ============ Email Notifications ============
let emailTransporter = null;

function initEmail() {
  if (emailTransporter) return;
  try {
    const nodemailer = require('nodemailer');
    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });
  } catch (e) {
    console.warn('[Email] nodemailer 初始化失败:', e.message);
  }
}

async function sendEmailToUser(userId, { subject, html }) {
  try {
    const db = require('../models/database');
    const user = db.prepare(
      'SELECT email, email_verified, nickname, notify_email FROM users WHERE id = ?'
    ).get(Number(userId));

    if (!user || !user.email || user.email_verified !== 1) return;
    if (!user.notify_email) return;
    if (isInQuietHours(userId)) return; // Quiet hours apply to email too

    initEmail();
    if (!emailTransporter) return;

    const fromStr = '"熊猫社区" <' + (process.env.SMTP_FROM || 'noreply@pandahub.cloud') + '>';
    await emailTransporter.sendMail({
      from: fromStr,
      to: user.email,
      subject,
      html,
    });
    console.log('[Email] 发送给用户 ' + userId + ' (' + user.email + '): ' + subject);
  } catch (err) {
    console.warn('[Email] 发送失败:', err.message);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function notifyUserNewComment(userId, postTitle, commenterName, postUrl) {
  // Web Push
  sendPushToUser(userId, {
    title: '💬 新评论',
    body: (commenterName || '有人') + ' 评论了你的帖子「' + (postTitle || '').substring(0, 20) + '」',
    url: postUrl || '/',
    tag: 'comment'
  });
  // Email
  await sendEmailToUser(userId, {
    subject: '💬 您在熊猫社区的帖子有新评论',
    html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">' +
      '<div style="text-align:center;margin-bottom:24px;"><h2 style="color:#667eea;">🐼 熊猫社区</h2></div>' +
      '<p style="font-size:16px;color:#333;">您好！</p>' +
      '<p style="font-size:16px;color:#333;">您的帖子 <strong>「' + escapeHtml(postTitle) + '」</strong> 收到了新的评论：</p>' +
      '<div style="background:#f0f7ff;border-radius:8px;padding:16px;margin:20px 0;font-size:15px;color:#1e3a5f;">' +
      '<strong>' + escapeHtml(commenterName) + '</strong> 评论了你的帖子</div>' +
      '<p style="font-size:14px;color:#888;">登录熊猫社区查看详情 →</p></div>',
  });
}

async function notifyUserNewReply(userId, postTitle, replierName, postUrl) {
  // Web Push
  sendPushToUser(userId, {
    title: '💬 新回复',
    body: (replierName || '有人') + ' 回复了你的评论',
    url: postUrl || '/',
    tag: 'reply'
  });
  // Email
  await sendEmailToUser(userId, {
    subject: '💬 您在熊猫社区的评论有新回复',
    html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">' +
      '<div style="text-align:center;margin-bottom:24px;"><h2 style="color:#667eea;">🐼 熊猫社区</h2></div>' +
      '<p style="font-size:16px;color:#333;">您好！</p>' +
      '<p style="font-size:16px;color:#333;">您的评论收到了新的回复！</p>' +
      '<div style="background:#f0f7ff;border-radius:8px;padding:16px;margin:20px 0;font-size:15px;color:#1e3a5f;">' +
      '<strong>' + escapeHtml(replierName) + '</strong> 回复了你的评论</div>' +
      '<p style="font-size:14px;color:#888;">登录熊猫社区查看详情 →</p></div>',
  });
}

async function notifyUserPostApproved(userId, postTitle, postUrl) {
  // Web Push
  sendPushToUser(userId, {
    title: '🎉 帖子已通过审核',
    body: '您的帖子「' + (postTitle || '').substring(0, 20) + '」已上线啦！',
    url: postUrl || '/',
    tag: 'approved'
  });
  await sendEmailToUser(userId, {
    subject: '🎉 您的帖子已通过审核 - 熊猫社区',
    html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">' +
      '<div style="text-align:center;margin-bottom:24px;"><h2 style="color:#667eea;">🐼 熊猫社区</h2></div>' +
      '<p style="font-size:16px;color:#333;">您好！</p>' +
      '<p style="font-size:16px;color:#333;">恭喜！您的帖子已通过审核，现在可以在社区看到了：</p>' +
      '<div style="background:#f0fdf4;border-left:4px solid #10b981;border-radius:4px;padding:16px;margin:20px 0;font-size:15px;color:#166534;">' +
      '<strong>「' + escapeHtml(postTitle) + '」</strong> 已上线 🎉</div>' +
      '<p style="font-size:14px;color:#888;">登录熊猫社区查看 →</p></div>',
  });
}

async function notifyUserPostRejected(userId, postTitle, reason, postUrl) {
  // Web Push
  sendPushToUser(userId, {
    title: '❌ 帖子未通过审核',
    body: '您的帖子「' + (postTitle || '').substring(0, 20) + '」未通过审核' + (reason ? '：' + reason : ''),
    url: '/',
    tag: 'rejected'
  });
  var reasonHtml = reason ? '<div style="margin-top:8px;font-size:14px;">原因：' + escapeHtml(reason) + '</div>' : '';
  await sendEmailToUser(userId, {
    subject: '❌ 您的帖子未通过审核 - 熊猫社区',
    html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">' +
      '<div style="text-align:center;margin-bottom:24px;"><h2 style="color:#667eea;">🐼 熊猫社区</h2></div>' +
      '<p style="font-size:16px;color:#333;">您好！</p>' +
      '<p style="font-size:16px;color:#333;">很遗憾，您的帖子未通过审核：</p>' +
      '<div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:4px;padding:16px;margin:20px 0;font-size:15px;color:#991b1b;">' +
      '<strong>「' + escapeHtml(postTitle) + '」</strong>' + reasonHtml + '</div>' +
      '<p style="font-size:14px;color:#888;">如有疑问，请联系管理员。</p></div>',
  });
}

async function notifyUserMentioned(userId, postTitle, mentionerName, postUrl) {
  await sendEmailToUser(userId, {
    subject: '@ 在熊猫社区有人提到了你',
    html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">' +
      '<div style="text-align:center;margin-bottom:24px;"><h2 style="color:#667eea;">🐼 熊猫社区</h2></div>' +
      '<p style="font-size:16px;color:#333;">您好！</p>' +
      '<p style="font-size:16px;color:#333;"><strong>' + escapeHtml(mentionerName) + '</strong> 在评论中提到了您：</p>' +
      '<div style="background:#f0f7ff;border-radius:8px;padding:16px;margin:20px 0;font-size:15px;color:#1e3a5f;">' +
      '帖子：<strong>' + escapeHtml(postTitle) + '</strong></div>' +
      '<p style="font-size:14px;color:#888;">登录熊猫社区查看详情 →</p></div>',
  });
}

// Parse @mentions from content and send notifications
async function processMentions(content, postId, postTitle, commenterId, commenterName) {
  // Find all @username patterns
  var mentions = content.match(/@([\w\u4e00-\u9fa5]{1,20})/g) || [];
  // Deduplicate
  var seen = {};
  var unique = [];
  for (var i = 0; i < mentions.length; i++) {
    var username = mentions[i].substring(1); // remove @
    if (!seen[username] && username !== commenterName) {
      seen[username] = true;
      unique.push(username);
    }
  }
  if (unique.length === 0) return;

  var db = require('../models/database');
  for (var j = 0; j < unique.length; j++) {
    var mentionedUser = db.prepare('SELECT id FROM users WHERE username = ? OR nickname = ?').get(unique[j], unique[j]);
    if (!mentionedUser || mentionedUser.id === commenterId) continue;

    // Send in-app notification
    db.prepare(
      "INSERT INTO notifications (user_id, type, title, content, post_id) VALUES (?, 'mention', '@ 有人提到了你', ?, ?)"
    ).run(mentionedUser.id, '有人 @ 了你，快去看看吧', postId);

    // Web Push
    sendPushToUser(mentionedUser.id, {
      title: '@ 有人提到了你',
      body: commenterName + ' 在评论中 @ 了你',
      url: '/post/' + postId,
      tag: 'mention-' + postId
    });

    // Email (async)
    notifyUserMentioned(mentionedUser.id, postTitle, commenterName, '/post/' + postId);
  }
}

module.exports = { sendPushToUser, sendEmailToUser, notifyUserNewComment, notifyUserNewReply, notifyUserPostApproved, notifyUserPostRejected, notifyUserMentioned };
