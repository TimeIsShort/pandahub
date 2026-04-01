const express = require('express');
const db = require('../models/database');
const crypto = require('crypto');
const router = express.Router();

// In-memory challenge store (challengeToken -> { targetX, expiresAt })
const challenges = new Map();

// Clean up expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of challenges.entries()) {
    if (data.expiresAt < now) challenges.delete(token);
  }
}, 5 * 60 * 1000);

// GET new captcha challenge
router.get('/challenge', (req, res) => {
  // Generate random target between 40–80% of slider width (200px = 80–160)
  const targetX = Math.floor(Math.random() * 41) + 80; // 80~160
  const token = crypto.randomBytes(16).toString('hex');
  
  challenges.set(token, {
    targetX,
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 min
  });

  res.json({ token, targetX });
});

// POST verify captcha
router.post('/verify', (req, res) => {
  const { token, slideX } = req.body;
  
  if (!token || slideX === undefined) {
    return res.status(400).json({ error: '缺少参数' });
  }

  const challenge = challenges.get(token);
  if (!challenge) {
    return res.status(400).json({ error: '验证已过期，请重试' });
  }
  if (challenge.expiresAt < Date.now()) {
    challenges.delete(token);
    return res.status(400).json({ error: '验证已过期，请重试' });
  }

  // Tolerance: ±6px
  const diff = Math.abs(challenge.targetX - Number(slideX));
  if (diff > 6) {
    challenges.delete(token);
    return res.json({ ok: false, error: '验证失败，请重试' });
  }

  // One-time use
  challenges.delete(token);
  res.json({ ok: true });
});

module.exports = router;
