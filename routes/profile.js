const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Configure avatar upload
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../public/uploads/avatars'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${req.user.id}-${uniqueSuffix}${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('只支持图片格式：jpg, png, gif, webp'));
  }
});

// Ensure avatars directory exists
const fs = require('fs');
const avatarDir = path.join(__dirname, '../public/uploads/avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

// Get all hobbies
router.get('/hobbies', (req, res) => {
  try {
    const hobbies = db.prepare('SELECT * FROM hobbies ORDER BY id').all();
    res.json({ hobbies });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取爱好失败' });
  }
});

// Get user profile with hobbies
router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, username, nickname, avatar, bio, role, email, email_verified, created_at FROM users WHERE id = ?'
    ).get(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    const hobbies = db.prepare(`
      SELECT h.* FROM hobbies h
      JOIN user_hobbies uh ON h.id = uh.hobby_id
      WHERE uh.user_id = ?
    `).all(req.user.id);
    
    res.json({ user, hobbies });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// Update user profile
router.put('/me', authMiddleware, (req, res) => {
  try {
    const { nickname, bio, hobby_ids } = req.body;
    
    // Update basic info
    if (nickname !== undefined || bio !== undefined) {
      const updates = [];
      const params = [];
      if (nickname !== undefined) { updates.push('nickname = ?'); params.push(nickname); }
      if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
      params.push(req.user.id);
      
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    
    // Update hobbies
    if (hobby_ids !== undefined) {
      if (!Array.isArray(hobby_ids)) {
        return res.status(400).json({ error: '爱好参数格式错误' });
      }

      const cleanedIds = [...new Set(
        hobby_ids
          .map(id => Number(id))
          .filter(id => Number.isInteger(id) && id > 0)
      )].slice(0, 8);

      db.prepare('DELETE FROM user_hobbies WHERE user_id = ?').run(req.user.id);

      if (cleanedIds.length > 0) {
        const placeholders = cleanedIds.map(() => '?').join(',');
        const validIds = db.prepare(`SELECT id FROM hobbies WHERE id IN (${placeholders})`)
          .all(...cleanedIds)
          .map(row => row.id);

        const insertUserHobby = db.prepare('INSERT INTO user_hobbies (user_id, hobby_id) VALUES (?, ?)');
        for (const hobby_id of validIds) {
          insertUserHobby.run(req.user.id, hobby_id);
        }
      }
    }
    
    // Get updated user
    const user = db.prepare(
      'SELECT id, username, nickname, avatar, bio, role, email, email_verified, created_at FROM users WHERE id = ?'
    ).get(req.user.id);
    
    const hobbies = db.prepare(`
      SELECT h.* FROM hobbies h
      JOIN user_hobbies uh ON h.id = uh.hobby_id
      WHERE uh.user_id = ?
    `).all(req.user.id);
    
    res.json({ user, hobbies });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新失败' });
  }
});

// Upload avatar
router.post('/avatar', authMiddleware, avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择图片文件' });
    }
    
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatarUrl, req.user.id);
    
    res.json({ avatar: avatarUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '上传失败' });
  }
});



// User action logs - GET /api/profile/action-logs
router.get('/action-logs', authMiddleware, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const total = db.prepare(
      'SELECT COUNT(*) as count FROM user_actions_log WHERE user_id = ?'
    ).get(req.user.id).count;

    const logs = db.prepare(
      'SELECT action, target_type, target_id, details, ip_address, created_at ' +
      'FROM user_actions_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(req.user.id, limit, offset);

    res.json({ logs, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取记录失败' });
  }
});

module.exports = router;
