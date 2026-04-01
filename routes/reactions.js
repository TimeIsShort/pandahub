const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

// Get reactions for a list of comment IDs
router.post('/comments/batch', authMiddleware, (req, res) => {
  try {
    const { commentIds } = req.body;
    if (!Array.isArray(commentIds) || !commentIds.length) {
      return res.json({ reactions: {} });
    }
    const placeholders = commentIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT cr.comment_id, cr.emoji, cr.user_id,
             u.nickname, u.username
      FROM comment_reactions cr
      LEFT JOIN users u ON cr.user_id = u.id
      WHERE cr.comment_id IN (${placeholders})
    `).all(...commentIds);

    const result = {};
    rows.forEach(r => {
      if (!result[r.comment_id]) result[r.comment_id] = {};
      if (!result[r.comment_id][r.emoji]) result[r.comment_id][r.emoji] = [];
      result[r.comment_id][r.emoji].push({
        userId: r.user_id,
        name: r.nickname || r.username
      });
    });
    res.json({ reactions: result });
  } catch (err) {
    console.error('[Reactions]', err);
    res.status(500).json({ error: '获取表情失败' });
  }
});

// Add or toggle a reaction on a comment
router.post('/comments/:commentId/react', authMiddleware, (req, res) => {
  try {
    const { emoji } = req.body;
    const commentId = Number(req.params.commentId);
    const userId = req.user.id;

    if (!REACTION_EMOJIS.includes(emoji)) {
      return res.status(400).json({ error: '无效的表情' });
    }

    // Check comment exists
    const comment = db.prepare('SELECT id FROM comments WHERE id = ?').get(commentId);
    if (!comment) return res.status(404).json({ error: '评论不存在' });

    // Check if already reacted with this emoji
    const existing = db.prepare(
      'SELECT id FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?'
    ).get(commentId, userId, emoji);

    if (existing) {
      // Remove reaction (toggle off)
      db.prepare('DELETE FROM comment_reactions WHERE id = ?').run(existing.id);
    } else {
      // Remove any other emoji reaction from this user on this comment
      db.prepare('DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ?').run(commentId, userId);
      // Add new reaction
      db.prepare('INSERT INTO comment_reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)').run(commentId, userId, emoji);
    }

    // Get updated counts
    const counts = db.prepare(`
      SELECT emoji, COUNT(*) as count
      FROM comment_reactions
      WHERE comment_id = ?
      GROUP BY emoji
    `).all(commentId);

    const reactionMap = {};
    counts.forEach(c => { reactionMap[c.emoji] = c.count; });

    const userReaction = db.prepare(
      'SELECT emoji FROM comment_reactions WHERE comment_id = ? AND user_id = ?'
    ).get(commentId, userId);

    res.json({
      success: true,
      reactions: reactionMap,
      userReaction: userReaction ? userReaction.emoji : null
    });
  } catch (err) {
    console.error('[Reactions]', err);
    res.status(500).json({ error: '操作失败' });
  }
});

module.exports = router;
module.exports.REACTION_EMOJIS = REACTION_EMOJIS;
