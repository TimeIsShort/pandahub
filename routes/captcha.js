const express = require('express');
const crypto = require('crypto');
const { getChallenge, setChallenge, deleteChallenge } = require('../utils/captchaStore');
const router = express.Router();

// GET new captcha challenge
router.get('/challenge', (req, res) => {
  // Generate random target between 40–80% of slider width (200px = 80–160)
  const targetX = Math.floor(Math.random() * 41) + 80; // 80~160
  const token = crypto.randomBytes(16).toString('hex');
  
  setChallenge(token, {
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

  const challenge = getChallenge(token);
  if (!challenge) {
    return res.status(400).json({ error: '验证已过期，请重试' });
  }
  if (challenge.expiresAt < Date.now()) {
    deleteChallenge(token);
    return res.status(400).json({ error: '验证已过期，请重试' });
  }

  // Tolerance: ±6px
  const diff = Math.abs(challenge.targetX - Number(slideX));
  if (diff > 6) {
    deleteChallenge(token);
    return res.json({ ok: false, error: '验证失败，请重试' });
  }

  // One-time use
  deleteChallenge(token);
  res.json({ ok: true });
});

module.exports = router;
