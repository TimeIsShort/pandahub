// Simple in-memory API response cache
const cache = new Map();
const TTL = 30 * 1000; // 30 seconds

function apiCacheMiddleware(req, res, next) {
  // Only cache GET requests to /api/ endpoints
  if (req.method !== 'GET' || !req.path.startsWith('/')) return next();
  
  // Don't cache authenticated endpoints
  if (req.headers.authorization) return next();
  
  // Configurable cache targets
  const cachePaths = [
    '/api/sections', '/api/tags', '/api/stats', '/api/home',
    '/api/leaderboard', '/api/trending', '/api/featured'
  ];
  
  const shouldCache = cachePaths.some(p => req.path.startsWith(p));
  if (!shouldCache) return next();
  
  const key = req.path + '?' + (req.originalUrl.split('?')[1] || '');
  const cached = cache.get(key);
  
  if (cached && (Date.now() - cached.ts) < TTL) {
    return res.json(cached.data);
  }
  
  // Override res.json to cache the response
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    if (res.statusCode === 200) {
      cache.set(key, { data, ts: Date.now() });
      // Limit cache size
      if (cache.size > 50) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
        cache.delete(oldest[0]);
      }
    }
    return originalJson(data);
  };
  
  next();
}

module.exports = { apiCacheMiddleware };
