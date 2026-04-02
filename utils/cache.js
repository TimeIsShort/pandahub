// Simple in-memory cache utility
const cache = new Map();

const DEFAULT_TTL = 60 * 1000; // 60 seconds default

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCache(key, value, ttlMs = DEFAULT_TTL) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

function clearCache(keyPrefix) {
  if (!keyPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key);
    }
  }
}

function getCacheStats() {
  let hits = 0;
  let misses = 0;
  for (const entry of cache.values()) {
    if (Date.now() <= entry.expiresAt) hits++;
  }
  return {
    size: cache.size,
    hits,
    misses,
    keys: Array.from(cache.keys())
  };
}

// Cache config for different routes
const CACHE_CONFIG = {
  'sections': { ttl: 2 * 60 * 1000 },        // 2 minutes
  'tags': { ttl: 2 * 60 * 1000 },           // 2 minutes
  'hot-posts': { ttl: 60 * 1000 },           // 1 minute
  'posts': { ttl: 30 * 1000 },               // 30 seconds (short for freshness)
  'leaderboard': { ttl: 5 * 60 * 1000 },    // 5 minutes
  'trending': { ttl: 60 * 1000 },            // 1 minute
  'daily-tasks': { ttl: 60 * 1000 },         // 1 minute
};

module.exports = { getCache, setCache, clearCache, getCacheStats, CACHE_CONFIG };
