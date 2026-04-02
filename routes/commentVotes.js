const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { addInfluence, removeInfluence } = require('../utils/influence');

const router = express.Router();

// Vote on a comment
router.post('/:id/vote', authMiddleware, (req, res) => {
  try {
    const { vote_type } = req.body;
    const commentId = Number(req.params.id);
    const userId = req.user.id;

    if (!['like'].includes(vote_type)) {
      return res.status(400).json({ error: '无效投票类型' });
    }

    // Check comment exists
    const comment = db.prepare('SELECT id, user_id FROM comments WHERE id = ?').get(commentId);
    if (!comment) return res.status(404).json({ error: '评论不存在' });

    // Can't vote on own comment
    if (comment.user_id === userId) {
      return res.status(400).json({ error: '不能给自己的评论点赞' });
    }

    // Check existing vote
    const existing = db.prepare(
      'SELECT * FROM comment_votes WHERE comment_id = ? AND user_id = ?'
    ).get(commentId, userId);

    if (existing) {
      // Remove vote (toggle off)
      db.prepare('DELETE FROM comment_votes WHERE comment_id = ? AND user_id = ?').run(commentId, userId);
      removeInfluence(comment.user_id, 'comment_like', 'comment', commentId);
    } else {
      // Add vote
      db.prepare('INSERT INTO comment_votes (comment_id, user_id, vote_type) VALUES (?, ?, ?)').run(commentId, userId, vote_type);
      addInfluence(comment.user_id, 'comment_like', 'comment', commentId);
    }

    // Count likes
    const likeCount = db.prepare(
      'SELECT COUNT(*) as c FROM comment_votes WHERE comment_id = ?'
    ).get(commentId).c;

    res.json({ success: true, like_count: likeCount, userVote: existing ? null : vote_type });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '投票失败' });
  }
});

// Get vote status for a comment
router.get('/:id/votes', authMiddleware, (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const userId = req.user.id;

    const vote = db.prepare(
      'SELECT vote_type FROM comment_votes WHERE comment_id = ? AND user_id = ?'
    ).get(commentId, userId);

    const likeCount = db.prepare(
      'SELECT COUNT(*) as c FROM comment_votes WHERE comment_id = ?'
    ).get(commentId).c;

    res.json({ userVote: vote ? vote.vote_type : null, like_count: likeCount });
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

module.exports = router;
