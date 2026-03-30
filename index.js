require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Load local .env file without external dependency
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  const envLines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1).trim();
    const value = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
require('./models/database');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const tagRoutes = require('./routes/tags');
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');
const profileRoutes = require('./routes/profile');
const applyRoutes = require('./routes/apply');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai');
const notifRoutes = require('./routes/notifications');
const checkinRoutes = require('./routes/checkin');
const emailRoutes = require('./routes/email');
const searchRoutes = require('./routes/search');
const pushRoutes = require('./routes/push');
const i18nRoutes = require('./routes/i18n');
const sitemapRoutes = require('./routes/sitemap');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files with long-term caching for assets
const assetMaxAge = '7d';
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), { maxAge: assetMaxAge }));
app.use('/vendor', express.static(path.join(__dirname, 'public', 'vendor'), { maxAge: assetMaxAge }));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { maxAge: assetMaxAge }));
app.use('/css', express.static(path.join(__dirname, 'public', 'css'), { maxAge: assetMaxAge }));
// Default static (html files get no cache)
app.use(express.static(path.join(__dirname, 'public')));

// Serve apply.html directly
app.get('/apply', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'apply.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/ai', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ai.html'));
});

app.get('/toolbox', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'toolbox.html'));
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);

// Apply routes (POST /apply for API)
app.use('/apply', applyRoutes);

// AI Assistant routes
app.use('/api/ai', aiRoutes);

// Notifications routes
app.use('/api/notifications', notifRoutes);

// Checkin routes
app.use('/api/checkin', checkinRoutes);

// Email routes
app.use('/api/email', emailRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/i18n', i18nRoutes);
app.use('/sitemap.xml', sitemapRoutes);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`论坛已启动: http://0.0.0.0:${PORT}`);
});
