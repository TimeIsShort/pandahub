const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Follow a user
router.post('/follow/:userId', authMiddleware, (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = Number(req.params.userId);

    if (followerId === followingId) {
      return res.status(400).json({ error: '不能关注自己' });
    }

    // Check target user exists
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(followingId);
    if (!target) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // Check not already following
    const existing = db.prepare(
      'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?'
    ).get(followerId, followingId);

    if (existing) {
      return res.status(400).json({ error: '已经关注过了' });
    }

    db.prepare(
      'INSERT INTO follows (follower_id, following_id) VALUES (?, ?)'
    ).run(followerId, followingId);

    res.json({ success: true, message: '关注成功' });
  } catch (err) {
    console.error('[Follow]', err);
    res.status(500).json({ error: '关注失败' });
  }
});

// Unfollow a user
router.delete('/follow/:userId', authMiddleware, (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = Number(req.params.userId);

    const existing = db.prepare(
      'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?'
    ).get(followerId, followingId);

    if (!existing) {
      return res.status(400).json({ error: '还未关注此人' });
    }

    db.prepare(
      'DELETE FROM follows WHERE follower_id = ? AND following_id = ?'
    ).run(followerId, followingId);

    res.json({ success: true, message: '已取消关注' });
  } catch (err) {
    console.error('[Follow]', err);
    res.status(500).json({ error: '取消关注失败' });
  }
});

// Get user's followers (who follows me)
router.get('/followers/:userId', (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const followers = db.prepare(`
      SELECT u.id, u.username, u.nickname, u.avatar, u.points,
             f.created_at as followed_at
      FROM follows f
      JOIN users u ON f.follower_id = u.id
      WHERE f.following_id = ?
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, Number(limit), Number(offset));

    const total = db.prepare(
      'SELECT COUNT(*) as c FROM follows WHERE following_id = ?'
    ).get(userId).c;

    res.json({ users: followers, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[Follow]', err);
    res.status(500).json({ error: '获取粉丝列表失败' });
  }
});

// Get user's following (who I follow)
router.get('/following/:userId', (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const following = db.prepare(`
      SELECT u.id, u.username, u.nickname, u.avatar, u.points,
             f.created_at as followed_at
      FROM follows f
      JOIN users u ON f.following_id = u.id
      WHERE f.follower_id = ?
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, Number(limit), Number(offset));

    const total = db.prepare(
      'SELECT COUNT(*) as c FROM follows WHERE follower_id = ?'
    ).get(userId).c;

    res.json({ users: following, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[Follow]', err);
    res.status(500).json({ error: '获取关注列表失败' });
  }
});

// Check if current user follows a specific user
router.get('/status/:userId', authMiddleware, (req, res) => {
  try {
    const myId = req.user.id;
    const targetId = Number(req.params.userId);

    const isFollowing = !!db.prepare(
      'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?'
    ).get(myId, targetId);

    const followersCount = db.prepare(
      'SELECT COUNT(*) as c FROM follows WHERE following_id = ?'
    ).get(targetId).c;

    const followingCount = db.prepare(
      'SELECT COUNT(*) as c FROM follows WHERE follower_id = ?'
    ).get(targetId).c;

    res.json({ is_following: isFollowing, followers_count: followersCount, following_count: followingCount });
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

module.exports = router;
