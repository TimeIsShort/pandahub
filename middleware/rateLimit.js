// In-memory sliding window rate limiter
// Strategy: per-IP sliding window, 60 requests per minute by default

const ipMap = new Map();

const WINDOW_MS = 60 * 1000;    // 1 minute window
const MAX_REQUESTS = 120;        // 120 requests per minute
const AUTHED_LIMIT = 300;       // 300/min for authenticated users

function getIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || 'unknown';
}

function cleanOldEntries() {
  const now = Date.now();
  for (const [ip, data] of ipMap.entries()) {
    // Remove entries older than WINDOW_MS
    data.window = data.window.filter(t => now - t < WINDOW_MS);
    if (data.window.length === 0) {
      ipMap.delete(ip);
    }
  }
}

// Clean up every 30 seconds
setInterval(cleanOldEntries, 30 * 1000);

function rateLimit(options = {}) {
  const limit = options.limit || MAX_REQUESTS;
  const windowMs = options.windowMs || WINDOW_MS;
  const message = options.message || '请求过于频繁，请稍后再试';

  return (req, res, next) => {
    const ip = getIP(req);
    const now = Date.now();
    const isAuthed = !!(req.user && req.user.id);

    if (!ipMap.has(ip)) {
      ipMap.set(ip, { window: [] });
    }

    const record = ipMap.get(ip);
    // Remove old timestamps outside current window
    record.window = record.window.filter(t => now - t < windowMs);

    const effectiveLimit = isAuthed ? Math.max(limit, AUTHED_LIMIT) : limit;

    if (record.window.length >= effectiveLimit) {
      const oldestAllowed = now - windowMs;
      const resetIn = (record.window[0] - oldestAllowed) / 1000;
      res.set('Retry-After', Math.ceil(resetIn / 1000));
      res.set('X-RateLimit-Limit', effectiveLimit);
      res.set('X-RateLimit-Remaining', 0);
      res.set('X-RateLimit-Reset', oldestAllowed + windowMs);
      return res.status(429).json({ error: message, retry_after: Math.ceil(windowMs / 1000) });
    }

    record.window.push(now);

    res.set('X-RateLimit-Limit', effectiveLimit);
    res.set('X-RateLimit-Remaining', Math.max(0, effectiveLimit - record.window.length));
    res.set('X-RateLimit-Reset', now + windowMs);

    next();
  };
}

// Special: stricter limit for auth actions (login, register, post, comment)
function authRateLimit(options = {}) {
  const limit = options.limit || 10;
  const windowMs = options.windowMs || (60 * 1000);
  const message = options.message || '操作过于频繁，请稍后再试';

  return (req, res, next) => {
    const ip = getIP(req);
    const key = ip + ':' + (options.key || 'auth');
    const now = Date.now();

    if (!ipMap.has(key)) {
      ipMap.set(key, { window: [] });
    }

    const record = ipMap.get(key);
    record.window = record.window.filter(t => now - t < windowMs);

    if (record.window.length >= limit) {
      res.set('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: message });
    }

    record.window.push(now);
    next();
  };
}

module.exports = { rateLimit, authRateLimit };
