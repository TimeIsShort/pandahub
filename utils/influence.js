/**
 * Influence Score Utility
 * Tracks and updates user influence based on community engagement
 */

const db = require('../models/database');

// Influence score rules
const RULES = {
  post_like:       { delta: 3,  reason: '帖子被点赞' },
  comment_like:    { delta: 1,  reason: '评论被点赞' },
  post_favorite:   { delta: 5,  reason: '帖子被收藏' },
  post_comment:    { delta: 2,  reason: '帖子被回复' },
};

function addInfluence(userId, eventType, targetType, targetId) {
  const rule = RULES[eventType];
  if (!rule) return;

  try {
    db.prepare('UPDATE users SET influence_score = influence_score + ? WHERE id = ?').run(rule.delta, userId);
    db.prepare(`
      INSERT INTO influence_history (user_id, event_type, target_type, target_id, delta, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, eventType, targetType, targetId, rule.delta, rule.reason);
  } catch (e) {
    console.warn('[Influence]', e.message);
  }
}

function removeInfluence(userId, eventType, targetType, targetId) {
  const rule = RULES[eventType];
  if (!rule) return;

  try {
    db.prepare('UPDATE users SET influence_score = MAX(0, influence_score - ?) WHERE id = ?').run(rule.delta, userId);
    // Remove the history record
    db.prepare(`
      DELETE FROM influence_history
      WHERE user_id = ? AND event_type = ? AND target_type = ? AND target_id = ?
    `).run(userId, eventType, targetType, targetId);
  } catch (e) {
    console.warn('[Influence]', e.message);
  }
}

function getInfluenceRank(userId) {
  const rank = db.prepare(`
    SELECT COUNT(*) + 1 as rank FROM users
    WHERE influence_score > (SELECT influence_score FROM users WHERE id = ?)
  `).get(userId);
  return rank?.rank || 0;
}

module.exports = { addInfluence, removeInfluence, getInfluenceRank };
