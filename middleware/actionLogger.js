const db = require('../models/database');

function getClientIp(req) {
  return req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '';
}

function logUserAction({ userId, username, action, targetType, targetId, details, req }) {
  try {
    const ip = getClientIp(req);
    db.prepare(`
      INSERT INTO user_actions_log (user_id, username, action, target_type, target_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId || null, username || null, action, targetType || null, targetId || null, details || null, ip);
  } catch (err) {
    console.error('[UserActionLog]', err.message);
  }
}

module.exports = { logUserAction };
