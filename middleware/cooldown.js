// Per-user action cooldowns
// Tracks last action time per user in memory

const cooldowns = new Map();

// Clean up stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of cooldowns.entries()) {
    if (now - data.timestamp > 5 * 60 * 1000) { // stale after 5 min
      cooldowns.delete(key);
    }
  }
}, 60 * 1000);

function checkCooldown(userId, action, cooldownMs) {
  const key = userId + ':' + action;
  const now = Date.now();
  const last = cooldowns.get(key);

  if (last && now - last.timestamp < cooldownMs) {
    const remaining = Math.ceil((cooldownMs - (now - last.timestamp)) / 1000);
    return { allowed: false, remaining };
  }

  cooldowns.set(key, { timestamp: now });
  return { allowed: true, remaining: 0 };
}

// Cooldown presets (in milliseconds)
const PRESETS = {
  post: 30 * 1000,     // 30 seconds between posts
  comment: 15 * 1000,   // 15 seconds between comments
  reaction: 5 * 1000,    // 5 seconds between reactions
};

function postCooldown(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  const result = checkCooldown(req.user.id, 'post', PRESETS.post);
  if (!result.allowed) {
    return res.status(429).json({
      error: '发帖过于频繁，请 ' + result.remaining + ' 秒后再试',
      retry_after: result.remaining
    });
  }
  next();
}

function commentCooldown(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  const result = checkCooldown(req.user.id, 'comment', PRESETS.comment);
  if (!result.allowed) {
    return res.status(429).json({
      error: '评论过于频繁，请 ' + result.remaining + ' 秒后再试',
      retry_after: result.remaining
    });
  }
  next();
}

function reactionCooldown(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  const result = checkCooldown(req.user.id, 'reaction', PRESETS.reaction);
  if (!result.allowed) {
    return res.status(429).json({
      error: '操作过于频繁，请稍后再试',
      retry_after: result.remaining
    });
  }
  next();
}

module.exports = { checkCooldown, PRESETS, postCooldown, commentCooldown, reactionCooldown };
