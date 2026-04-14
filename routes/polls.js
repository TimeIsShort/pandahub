const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

// Get poll details with options and vote counts
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(req.params.id);
    if (!poll) {
      return res.status(404).json({ error: '投票不存在' });
    }

    const options = db.prepare(
      'SELECT * FROM poll_options WHERE poll_id = ? ORDER BY sort_order ASC'
    ).all(poll.id);

    // Get vote counts for each option
    const optionsWithCounts = options.map(opt => {
      const voteCount = db.prepare(
        'SELECT COUNT(*) as count FROM poll_votes WHERE poll_id = ? AND option_id = ?'
      ).get(poll.id, opt.id);
      return { ...opt, vote_count: voteCount.count };
    });

    const totalVotes = optionsWithCounts.reduce((sum, opt) => sum + opt.vote_count, 0);

    // Check if current user has voted
    let userVotedOptions = [];
    if (req.user) {
      const myVotes = db.prepare(
        'SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?'
      ).all(poll.id, req.user.id);
      userVotedOptions = myVotes.map(v => v.option_id);
    }

    // Check if poll has ended
    const hasEnded = poll.end_date ? new Date(poll.end_date) < new Date() : false;

    res.json({
      poll,
      options: optionsWithCounts,
      totalVotes,
      userVotedOptions,
      hasEnded
    });
  } catch (err) {
    console.error('[Poll]', err);
    res.status(500).json({ error: '获取投票失败' });
  }
});

// Vote on a poll
router.post('/:id/vote', authMiddleware, (req, res) => {
  try {
    const { option_ids } = req.body; // array of option ids (for multiple choice)
    const pollId = req.params.id;
    const userId = req.user.id;

    if (!option_ids || !Array.isArray(option_ids) || option_ids.length === 0) {
      return res.status(400).json({ error: '请选择投票选项' });
    }

    const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
    if (!poll) {
      return res.status(404).json({ error: '投票不存在' });
    }

    if (poll.end_date && new Date(poll.end_date) < new Date()) {
      return res.status(400).json({ error: '投票已结束' });
    }

    // Check if multiple choice is allowed
    if (!poll.multiple_choice && option_ids.length > 1) {
      return res.status(400).json({ error: '该投票为单选，请只选择一个选项' });
    }

    // Atomic: check + insert in a transaction to prevent double-vote race
    const voteTx = db.transaction(() => {
      const existing = db.prepare(
        'SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?'
      ).all(pollId, userId);

      if (existing.length > 0) {
        return { error: '您已经投过票了' };
      }

      const insertVote = db.prepare(
        'INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)'
      );
      for (const optionId of option_ids) {
        insertVote.run(pollId, optionId, userId);
      }
      return { error: null };
    });
    const txResult = voteTx();
    if (txResult.error) {
      return res.status(400).json({ error: txResult.error });
    }

    // Return updated poll data
    const options = db.prepare(
      'SELECT * FROM poll_options WHERE poll_id = ? ORDER BY sort_order ASC'
    ).all(pollId);

    const optionsWithCounts = options.map(opt => {
      const voteCount = db.prepare(
        'SELECT COUNT(*) as count FROM poll_votes WHERE poll_id = ? AND option_id = ?'
      ).get(pollId, opt.id);
      return { ...opt, vote_count: voteCount.count };
    });

    const totalVotes = optionsWithCounts.reduce((sum, opt) => sum + opt.vote_count, 0);

    res.json({
      success: true,
      options: optionsWithCounts,
      totalVotes,
      userVotedOptions: option_ids
    });
  } catch (err) {
    console.error('[Poll vote]', err);
    res.status(500).json({ error: '投票失败' });
  }
});

// ============ Admin Routes ============

// Get all polls
router.get('/admin/all', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const polls = db.prepare(`
      SELECT p.*, u.username as creator_name,
             (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id) as total_votes
      FROM polls p
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
    `).all();

    res.json({ polls });
  } catch (err) {
    console.error('[Poll admin]', err);
    res.status(500).json({ error: '获取投票列表失败' });
  }
});

// Create poll
router.post('/', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const { post_id, question, options, multiple_choice, end_date } = req.body;

    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: '问题和选项不能为空，至少需要2个选项' });
    }

    const result = db.prepare(`
      INSERT INTO polls (post_id, question, multiple_choice, end_date, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(post_id || null, question, multiple_choice ? 1 : 0, end_date || null, req.user.id);

    const pollId = result.lastInsertRowid;

    // Insert options
    const insertOption = db.prepare(
      'INSERT INTO poll_options (poll_id, option_text, sort_order) VALUES (?, ?, ?)'
    );
    options.forEach((text, idx) => {
      if (text && text.trim()) {
        insertOption.run(pollId, text.trim(), idx);
      }
    });

    const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
    const pollOptions = db.prepare(
      'SELECT * FROM poll_options WHERE poll_id = ? ORDER BY sort_order ASC'
    ).all(pollId);

    res.json({ poll, options: pollOptions });
  } catch (err) {
    console.error('[Poll create]', err);
    res.status(500).json({ error: '创建投票失败' });
  }
});

// Update poll
router.put('/:id', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const { question, options, multiple_choice, end_date } = req.body;
    const pollId = req.params.id;

    const existing = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
    if (!existing) {
      return res.status(404).json({ error: '投票不存在' });
    }

    db.prepare(`
      UPDATE polls SET question = ?, multiple_choice = ?, end_date = ?
      WHERE id = ?
    `).run(
      question || existing.question,
      multiple_choice !== undefined ? (multiple_choice ? 1 : 0) : existing.multiple_choice,
      end_date !== undefined ? end_date : existing.end_date,
      pollId
    );

    // Update options if provided
    if (options && Array.isArray(options)) {
      // Delete existing options
      db.prepare('DELETE FROM poll_options WHERE poll_id = ?').run(pollId);
      // Re-insert
      const insertOption = db.prepare(
        'INSERT INTO poll_options (poll_id, option_text, sort_order) VALUES (?, ?, ?)'
      );
      options.forEach((text, idx) => {
        if (text && text.trim()) {
          insertOption.run(pollId, text.trim(), idx);
        }
      });
    }

    const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
    const pollOptions = db.prepare(
      'SELECT * FROM poll_options WHERE poll_id = ? ORDER BY sort_order ASC'
    ).all(pollId);

    res.json({ poll, options: pollOptions });
  } catch (err) {
    console.error('[Poll update]', err);
    res.status(500).json({ error: '更新投票失败' });
  }
});

// Delete poll
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const existing = db.prepare('SELECT * FROM polls WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '投票不存在' });
    }

    // Cascade delete handles poll_options and poll_votes
    db.prepare('DELETE FROM polls WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('[Poll delete]', err);
    res.status(500).json({ error: '删除投票失败' });
  }
});

module.exports = router;
