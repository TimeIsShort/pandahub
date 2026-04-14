const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// HTML escape helper to prevent XSS in user-generated content rendered in badge wall
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Get all available badges (public)
router.get('/', (req, res) => {
  try {
    const badges = db.prepare('SELECT * FROM badges ORDER BY condition_value ASC').all();
    res.json({ badges });
  } catch (err) {
    res.status(500).json({ error: '获取徽章列表失败' });
  }
});

// Get user's earned badges (auth required for private details)
router.get('/me', authMiddleware, (req, res) => {
  try {
    const earned = db.prepare(`
      SELECT ub.badge_id, ub.earned_at, b.name, b.description, b.icon
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ?
      ORDER BY ub.earned_at DESC
    `).all(req.user.id);
    res.json({ badges: earned });
  } catch (err) {
    res.status(500).json({ error: '获取徽章失败' });
  }
});

// Get another user's badges (public)
router.get('/:userId', (req, res) => {
  try {
    const userId = Number(req.params.userId);

    // Get user stats for progress
    const user = db.prepare('SELECT points, checkin_streak FROM users WHERE id = ?').get(userId);
    const postCount = db.prepare("SELECT COUNT(*) as c FROM posts WHERE user_id = ? AND status = 'approved'").get(userId).c;
    const commentCount = db.prepare('SELECT COUNT(*) as c FROM comments WHERE user_id = ?').get(userId).c;
    const reactionCount = db.prepare(`
      SELECT COUNT(*) as c FROM post_reactions pr
      JOIN posts p ON p.id = pr.post_id
      WHERE p.user_id = ? AND pr.user_id != ?
    `).get(userId, userId).c;

    const allBadges = db.prepare('SELECT * FROM badges ORDER BY condition_value ASC').all();
    const earnedMap = {};
    db.prepare(`
      SELECT ub.badge_id, ub.earned_at, b.name, b.description, b.icon
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ?
      ORDER BY ub.earned_at DESC
    `).all(userId).forEach(b => { earnedMap[b.badge_id] = b; });

    // Build full list with locked/unlocked + progress
    const badgesWithProgress = allBadges.map(badge => {
      const earned = earnedMap[badge.id];
      let current = 0;
      let target = badge.condition_value;
      switch (badge.condition_type) {
        case 'posts_count':    current = postCount; break;
        case 'comments_count': current = commentCount; break;
        case 'checkin_streak': current = user?.checkin_streak || 0; break;
        case 'points':         current = user?.points || 0; break;
        case 'reactions_count': current = reactionCount; break;
      }
      const locked = !earned;
      const progress = Math.min(Math.round((current / target) * 100), 100);
      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        earned_at: earned ? earned.earned_at : null,
        locked,
        current,
        target,
        progress
      };
    });

    res.json({ badges: badgesWithProgress, earnedCount: Object.keys(earnedMap).length, totalCount: allBadges.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取徽章失败' });
  }
});

// Award a badge to a user (internal use)
function awardBadge(userId, badgeId) {
  try {
    db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, badgeId);
  } catch (e) {}
}

// Check and award badges for a user (call after actions)
function checkBadges(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return;

  const allBadges = db.prepare('SELECT * FROM badges').all();
  const earned = new Set(
    db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(userId).map(r => r.badge_id)
  );

  for (const badge of allBadges) {
    if (earned.has(badge.id)) continue;

    let qualifies = false;
    switch (badge.condition_type) {
      case 'posts_count':
        const postCount = db.prepare('SELECT COUNT(*) as c FROM posts WHERE user_id = ? AND status = \'approved\'').get(userId).c;
        qualifies = postCount >= badge.condition_value;
        break;
      case 'comments_count':
        const commentCount = db.prepare('SELECT COUNT(*) as c FROM comments WHERE user_id = ?').get(userId).c;
        qualifies = commentCount >= badge.condition_value;
        break;
      case 'checkin_streak':
        qualifies = (user.checkin_streak || 0) >= badge.condition_value;
        break;
      case 'points':
        qualifies = (user.points || 0) >= badge.condition_value;
        break;
      case 'reactions_count':
        const reactionCount = db.prepare('SELECT COUNT(*) as c FROM post_reactions pr JOIN posts p ON p.id = pr.post_id WHERE p.user_id = ?').get(userId).c;
        qualifies = reactionCount >= badge.condition_value;
        break;
    }

    if (qualifies) {
      awardBadge(userId, badge.id);
      console.log('[Badge] 用户 ' + userId + ' 获得徽章: ' + badge.name);
    }
  }
}

module.exports = router;
module.exports.awardBadge = awardBadge;
module.exports.checkBadges = checkBadges;

// GET /badges/:userId - Public badges wall page
router.get('/wall/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const user = db.prepare('SELECT id, nickname, username, avatar, level_name, level_icon, level_color FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).send('用户不存在');

  const postCount = db.prepare("SELECT COUNT(*) as c FROM posts WHERE user_id = ? AND status = 'approved'").get(userId).c;
  const commentCount = db.prepare('SELECT COUNT(*) as c FROM comments WHERE user_id = ?').get(userId).c;
  const earnedMap = {};
  db.prepare(`SELECT ub.badge_id, ub.earned_at, b.name, b.description, b.icon
    FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = ?`).all(userId)
    .forEach(b => { earnedMap[b.badge_id] = b; });

  const allBadges = db.prepare('SELECT * FROM badges ORDER BY condition_value ASC').all();
  const user_ = db.prepare('SELECT points, checkin_streak FROM users WHERE id = ?').get(userId);
  const reactionCount = db.prepare(`SELECT COUNT(*) as c FROM post_reactions pr JOIN posts p ON p.id = pr.post_id WHERE p.user_id = ? AND pr.user_id != ?`).get(userId, userId).c;

  const badges = allBadges.map(badge => {
    const earned = earnedMap[badge.id];
    let current = 0;
    switch (badge.condition_type) {
      case 'posts_count':    current = postCount; break;
      case 'comments_count': current = commentCount; break;
      case 'checkin_streak': current = user_?.checkin_streak || 0; break;
      case 'points':         current = user_?.points || 0; break;
      case 'reactions_count': current = reactionCount; break;
    }
    const progress = Math.min(Math.round((current / badge.condition_value) * 100), 100);
    return {
      id: badge.id, name: badge.name, description: badge.description, icon: badge.icon,
      earned_at: earned ? earned.earned_at : null, locked: !earned, current, target: badge.condition_value, progress
    };
  });

  const earnedCount = badges.filter(b => !b.locked).length;
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(user.nickname || user.username)} 的勋章墙 - 熊猫社区</title>
<link rel="stylesheet" href="/css/style.css">
<style>
  body { background: #edf3f5; margin: 0; font-family: -apple-system, sans-serif; }
  .header { background: linear-gradient(135deg, #0f766e, #667eea); padding: 24px 16px; text-align: center; color: #fff; }
  .header h1 { margin: 0 0 8px; font-size: 20px; }
  .header .subtitle { opacity: 0.85; font-size: 14px; }
  .user-info { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 16px; }
  .avatar { width: 64px; height: 64px; border-radius: 50%; border: 3px solid #fff; object-fit: cover; background: #e2e8f0; }
  .stats-bar { display: flex; justify-content: center; gap: 24px; margin-top: 12px; font-size: 14px; }
  .stats-bar span { opacity: 0.9; }
  .container { max-width: 720px; margin: 0 auto; padding: 20px 16px; }
  .earned-summary { background: linear-gradient(135deg, #0f766e, #667eea); color: #fff; border-radius: 14px; padding: 16px 20px; margin-bottom: 20px; text-align: center; }
  .earned-summary .big { font-size: 36px; font-weight: 700; }
  .earned-summary .small { font-size: 13px; opacity: 0.85; }
  .badge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
  .badge-card { background: #fff; border-radius: 14px; padding: 18px 16px; text-align: center; border: 1px solid #e5e7eb; transition: transform 0.15s; }
  .badge-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  .badge-card.locked { opacity: 0.55; filter: grayscale(0.6); }
  .badge-icon { font-size: 42px; margin-bottom: 8px; display: block; }
  .badge-name { font-size: 14px; font-weight: 600; color: #1a202c; margin-bottom: 4px; }
  .badge-desc { font-size: 12px; color: #64748b; margin-bottom: 8px; }
  .badge-earned { font-size: 11px; color: #16a34a; background: #dcfce7; padding: 2px 8px; border-radius: 20px; }
  .badge-progress { margin-top: 8px; }
  .progress-bar { height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 3px; transition: width 0.3s; }
  .progress-text { font-size: 11px; color: #94a3b8; margin-top: 3px; }
  .back-btn { display: inline-block; background: rgba(255,255,255,0.2); color: #fff; padding: 8px 20px; border-radius: 20px; text-decoration: none; font-size: 14px; margin-top: 12px; }
  .level-badge { display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.2); padding: 3px 10px; border-radius: 20px; font-size: 12px; margin-top: 6px; }
</style>
</head>
<body>
<div class="header">
  <h1>🏅 勋章墙</h1>
  <div class="user-info">
    ${user.avatar ? `<img class="avatar" src="${escapeHtml(user.avatar)}" alt="avatar">` : `<div class="avatar" style="display:flex;align-items:center;justify-content:center;font-size:28px;background:rgba(255,255,255,0.3);">${escapeHtml((user.nickname || user.username)[0] || '').toUpperCase()}</div>`}
    <div>
      <div style="font-size:18px;font-weight:700;">${escapeHtml(user.nickname || user.username)}</div>
      ${user.level_name ? `<div class="level-badge">${escapeHtml(user.level_icon || '⭐')} ${escapeHtml(user.level_name)}</div>` : ''}
    </div>
  </div>
  <div class="stats-bar">
    <span>📝 ${postCount} 帖子</span>
    <span>💬 ${commentCount} 评论</span>
    <span>🏅 ${earnedCount}/${badges.length} 勋章</span>
  </div>
  <a class="back-btn" href="/">← 回到社区</a>
</div>
<div class="container">
  <div class="earned-summary">
    <div class="big">${earnedCount} <span class="small">/ ${badges.length} 已解锁</span></div>
    <div class="small" style="margin-top:4px;">${Math.round(earnedCount/badges.length*100)}% 完成度</div>
  </div>
  <div class="badge-grid">
    ${badges.map(b => `
    <div class="badge-card ${b.locked ? 'locked' : ''}">
      <span class="badge-icon">${b.icon}</span>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.description}</div>
      ${b.locked ? `
        <div class="badge-progress">
          <div class="progress-bar"><div class="progress-fill" style="width:${b.progress}%"></div></div>
          <div class="progress-text">${b.current} / ${b.target}</div>
        </div>` : `<span class="badge-earned">✓ 已获得</span>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${b.earned_at ? new Date(b.earned_at).toLocaleDateString('zh-CN') : ''}</div>`}
    </div>`).join('')}
  </div>
</div>
</body>
</html>`;

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(html);
});
