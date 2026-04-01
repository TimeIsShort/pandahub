#!/usr/bin/env node
/**
 * 每日签到提醒脚本
 * 用法: node scripts/daily-checkin-reminder.js
 * 建议通过 cron 每天定时执行，如: 0 9 * * * cd /root/forum && node scripts/daily-checkin-reminder.js
 */
const db = require('../models/database');

// 获取今日日期字符串
function getTodayStr() {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

// 获取所有开启提醒且今日未签到的用户
function getUncheckedUsers() {
  const today = getTodayStr();
  const users = db.prepare(`
    SELECT u.id, u.username, u.nickname, u.email,
           rs.reminder_time, rs.reminder_days
    FROM reminder_settings rs
    JOIN users u ON u.id = rs.user_id
    WHERE rs.reminder_enabled = 1
  `).all();

  // 过滤出今天是提醒日且未签到的用户
  const todayDow = new Date().getDay().toString(); // 0=周日
  const checkedToday = new Set(
    db.prepare('SELECT user_id FROM checkins WHERE checkin_date = ?').all(today).map(r => r.user_id)
  );

  return users.filter(u => {
    // 检查今天是否是提醒日
    const days = (u.reminder_days || '').split(',').map(d => d.trim());
    if (!days.includes(todayDow)) return false;
    // 检查今日是否已签到
    if (checkedToday.has(u.id)) return false;
    return true;
  });
}

// 发送站内通知
function sendNotification(userId, title, content) {
  try {
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, content, is_read, created_at)
      VALUES (?, 'system', ?, ?, 0, datetime('now'))
    `).run(userId, title, content);
    return true;
  } catch (err) {
    console.error(`[Reminder] 通知发送失败 userId=${userId}:`, err.message);
    return false;
  }
}

// 获取用户昵称
function getDisplayName(user) {
  return user.nickname || user.username;
}

async function main() {
  console.log(`[${new Date().toLocaleString('zh-CN')}] 开始执行每日签到提醒...`);
  
  const users = getUncheckedUsers();
  console.log(`[Reminder] 今日应提醒用户数: ${users.length}`);

  let sent = 0;
  for (const user of users) {
    const name = getDisplayName(user);
    const title = '📢 签到提醒';
    const content = `哈喽 ${name}，你今天还没有签到哦～ 快去签到领积分吧！连续签到天数越多，奖励越丰厚～`;
    
    if (sendNotification(user.id, title, content)) {
      sent++;
      console.log(`[Reminder] ✓ 已提醒用户: ${name} (${user.id})`);
    }
  }

  console.log(`[${new Date().toLocaleString('zh-CN')}] 提醒完成，共发送 ${sent} 条通知`);
}

main().catch(console.error);
