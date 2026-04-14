const express = require('express');
const SITE_URL = process.env.SITE_URL || 'https://pandahub.cloud';
const router = express.Router();
const db = require('../models/database');
const crypto = require('crypto');

function generateCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function randomReward(min = 8, max = 15) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate invite code
router.post('/generate', (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: '请先登录' });

  // Check if user has enough points (cost: 5 points)
  const COST = 5;
  if ((user.points || 0) < COST) {
    return res.status(400).json({ error: `积分不足，需要${COST}积分生成邀请码` });
  }

  // Check user hasn't exceeded max codes per day (3 per day)
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM invite_codes
    WHERE creator_id = ? AND date(created_at) = ?
  `).get(user.id, today);

  if (todayCount.cnt >= 3) {
    return res.status(400).json({ error: '每天最多生成3个邀请码，明天再来吧～' });
  }

  // Generate unique code
  let code, attempts = 0;
  do {
    code = generateCode();
    attempts++;
    if (attempts > 10) return res.status(500).json({ error: '生成失败，请重试' });
  } while (db.prepare('SELECT id FROM invite_codes WHERE code = ?').get(code));

  // Deduct points
  db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(COST, user.id);

  // Insert
  const result = db.prepare(`
    INSERT INTO invite_codes (code, creator_id, creator_username, uses_remaining, uses_total, reward_points, expires_at)
    VALUES (?, ?, ?, 1, 1, ?, datetime('now', '+30 days'))
  `).run(code, user.id, user.username, randomReward());

  res.json({
    success: true,
    code,
    cost: COST,
    reward: randomReward(),
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    link: `${SITE_URL}/register?code=${code}`
  });
});

// Get my invite codes
router.get('/my', (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: '请先登录' });

  const codes = db.prepare(`
    SELECT code, uses_remaining, uses_total, reward_points, expires_at, created_at, claimed_at,
           claimed_by_id, claimed_by_username
    FROM invite_codes
    WHERE creator_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(user.id);

  const records = db.prepare(`
    SELECT code, invitee_username, inviter_reward, created_at
    FROM invite_records
    WHERE inviter_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(user.id);

  res.json({ codes, records });
});

// Validate a code (used in registration)
router.get('/validate/:code', (req, res) => {
  const { code } = req.params;
  const record = db.prepare(`
    SELECT c.*, u.username as creator_name, u.nickname as creator_nickname
    FROM invite_codes c
    JOIN users u ON c.creator_id = u.id
    WHERE c.code = ?
  `).get(code);

  if (!record) {
    return res.json({ valid: false, error: '邀请码不存在' });
  }

  if (record.uses_remaining <= 0) {
    return res.json({ valid: false, error: '邀请码已用完' });
  }

  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    return res.json({ valid: false, error: '邀请码已过期' });
  }

  res.json({
    valid: true,
    creatorName: record.creator_nickname || record.creator_name,
    rewardPoints: record.reward_points,
    expiresAt: record.expires_at
  });
});

// Use a code (during registration, internal)
router.post('/use', (req, res) => {
  const { code, inviteeId, inviteeUsername } = req.body;
  if (!code || !inviteeId) return res.status(400).json({ error: '参数不完整' });

  const record = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code);
  if (!record) return res.status(400).json({ error: '邀请码不存在' });
  if (record.uses_remaining <= 0) return res.status(400).json({ error: '邀请码已用完' });
  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: '邀请码已过期' });
  }

  // Cannot invite yourself
  if (record.creator_id === inviteeId) {
    return res.status(400).json({ error: '不能使用自己的邀请码' });
  }

  // Mark as used
  db.prepare(`
    UPDATE invite_codes
    SET uses_remaining = uses_remaining - 1,
        claimed_by_id = ?,
        claimed_by_username = ?,
        claimed_at = datetime('now')
    WHERE code = ?
  `).run(inviteeId, inviteeUsername, code);

  // Reward inviter
  const INVITEE_BONUS = 20;
  db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(record.reward_points, record.creator_id);

  // Reward invitee (new user bonus)
  db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(INVITEE_BONUS, inviteeId);

  // Record
  db.prepare(`
    INSERT INTO invite_records (code, inviter_id, inviter_username, invitee_id, invitee_username, inviter_reward, invitee_reward)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(code, record.creator_id, record.creator_username, inviteeId, inviteeUsername, record.reward_points, INVITEE_BONUS);

  res.json({
    success: true,
    inviterReward: record.reward_points,
    inviteeReward: INVITEE_BONUS,
    totalReward: record.reward_points + INVITEE_BONUS
  });
});

module.exports = router;
