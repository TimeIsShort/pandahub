const db = require('../models/database');

function logAction({ adminId, action, targetType, targetId, reason, details }) {
  try {
    db.prepare(`
      INSERT INTO moderation_log (admin_id, action, target_type, target_id, reason, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(adminId, action, targetType, targetId, reason || null, details || null);
  } catch (err) {
    console.error('记录操作日志失败:', err.message);
  }
}

module.exports = { logAction };
