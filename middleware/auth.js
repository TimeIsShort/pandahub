const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../models/database');

const envJwtSecret = process.env.JWT_SECRET && process.env.JWT_SECRET.trim();
const JWT_SECRET = envJwtSecret || crypto.randomBytes(48).toString('hex');

if (!envJwtSecret) {
  console.warn('[security] JWT_SECRET 未配置，已使用临时密钥；重启服务后所有登录态会失效。');
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, role, is_banned FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }
    if (Number(user.is_banned) === 1) {
      return res.status(403).json({ error: '账号已被封禁' });
    }
    decoded.role = user.role;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '令牌无效' });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = db.prepare('SELECT id, role, is_banned FROM users WHERE id = ?').get(decoded.id);
      if (user && Number(user.is_banned) !== 1) {
        decoded.role = user.role;
        req.user = decoded;
      }
    } catch (e) {}
  }
  next();
}

module.exports = { authMiddleware, optionalAuth, JWT_SECRET };
