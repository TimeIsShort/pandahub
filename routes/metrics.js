const express = require('express');
const router = express.Router();
const { getCacheStats } = require('../utils/cache');
const { authMiddleware } = require('../middleware/auth');

// Performance metrics storage (in-memory ring buffer)
const MAX_METRICS = 1440; // 24h at 1-min granularity
const perfMetrics = [];
let perfStartTime = Date.now();

// Collect DCL/LCP/FID metrics via beacon
router.post('/perf', (req, res) => {
  try {
    const { dcl, lcp, fid, url, lang } = req.body;
    const now = Date.now();
    const metric = {
      timestamp: now,
      dcl: dcl || 0,
      lcp: lcp || 0,
      fid: fid || 0,
      url: url || '',
      lang: lang || 'zh'
    };
    perfMetrics.push(metric);
    if (perfMetrics.length > MAX_METRICS) {
      perfMetrics.shift();
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'failed' });
  }
});

// JS error reporting
router.post('/js-error', (req, res) => {
  try {
    const { message, stack, url, line, col, userAgent } = req.body;
    // Log to stderr (captured by PM2 logs)
    console.error('[JS Error]', JSON.stringify({ message, stack: (stack || '').substring(0, 500), url, line, col, ts: new Date().toISOString() }));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'failed' });
  }
});

// API latency monitoring middleware
const apiLatencies = [];
const MAX_LATENCIES = 10000;

function latencyMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const latency = Date.now() - start;
    apiLatencies.push({ ts: start, method: req.method, path: req.path, latency });
    if (apiLatencies.length > MAX_LATENCIES) {
      apiLatencies.shift();
    }
  });
  next();
}

// Apply latency middleware to API routes
router.use(latencyMiddleware);

// Get performance dashboard data (admin only)
router.get('/dashboard', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  try {
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;
    const oneDayAgo = now - 86400 * 1000;

    // Filter recent metrics
    const recentPerf = perfMetrics.filter(m => m.timestamp > oneDayAgo);
    const recentLatency = apiLatencies.filter(l => l.ts > oneDayAgo);

    // DCL stats (last hour)
    const dclStats = calcStats(recentPerf.filter(m => m.dcl > 0 && m.timestamp > oneHourAgo).map(m => m.dcl));
    const lcpStats = calcStats(recentPerf.filter(m => m.lcp > 0 && m.timestamp > oneHourAgo).map(m => m.lcp));
    const fidStats = calcStats(recentPerf.filter(m => m.fid > 0 && m.timestamp > oneHourAgo).map(m => m.fid));

    // API latency p50/p95/p99
    const latencies = recentLatency.map(l => l.latency).sort((a, b) => a - b);
    const apiP50 = percentile(latencies, 50);
    const apiP95 = percentile(latencies, 95);
    const apiP99 = percentile(latencies, 99);

    // Cache hit rate
    const cacheStats = getCacheStats();
    const cacheHitRate = cacheStats.size > 0 ? 'N/A (memory)' : '0';

    // Top slow API endpoints
    const slowEndpoints = {};
    recentLatency.forEach(l => {
      const key = l.method + ' ' + l.path;
      if (!slowEndpoints[key]) slowEndpoints[key] = [];
      slowEndpoints[key].push(l.latency);
    });
    const topSlow = Object.entries(slowEndpoints)
      .map(([endpoint, vals]) => ({
        endpoint,
        p95: percentile(vals.sort((a, b) => a - b), 95),
        count: vals.length
      }))
      .filter(e => e.count >= 5)
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 10);

    // Uptime
    const uptimeMs = now - perfStartTime;
    const uptimeHours = (uptimeMs / 3600000).toFixed(1);

    res.json({
      uptime: `${uptimeHours}h`,
      pageLoad: {
        dcl: dclStats,
        lcp: lcpStats,
        fid: fidStats,
        sampleCount: recentPerf.filter(m => m.dcl > 0).length
      },
      api: {
        p50: apiP50,
        p95: apiP95,
        p99: apiP99,
        sampleCount: recentLatency.length
      },
      cache: {
        size: cacheStats.size,
        keys: cacheStats.keys.length
      },
      topSlowEndpoints: topSlow
    });
  } catch (err) {
    console.error('[Metrics]', err);
    res.status(500).json({ error: 'failed' });
  }
});

function calcStats(values) {
  if (!values || values.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    count: values.length
  };
}

function percentile(sortedArr, p) {
  if (!sortedArr || sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)];
}

module.exports = router;
module.exports.latencyMiddleware = latencyMiddleware;
