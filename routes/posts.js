const express = require('express');
const db = require('../models/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { containsSensitiveWords, refreshWords } = require('../middleware/wordFilter');
const { logAction } = require('../middleware/moderationLog');
const { logUserAction } = require('../middleware/actionLogger');
const { updatePostFTS, getUserLevel, POINT_COST } = require('../models/database');
const { sendPushToUser, notifyUserNewComment, notifyUserNewReply, processMentions } = require('../utils/pushHelper');
const { incrementDailyPostCount, incrementDailyCommentCount } = require('./dailyTasks');
const { checkBadges } = require('./badges');

const router = express.Router();

function canViewUnapprovedPost(user, post) {
  if (!user || !post) return false;
  if (user.role === 'admin') return true;
  return Number(user.id) === Number(post.user_id);
}

// Get all posts (with pagination and filtering) - only approved posts
router.get('/', optionalAuth, (req, res) => {
  try {
    const { tag_id, section_id, page = 1, limit = 20, search, sort = 'newest', time_range, following, featured, points_min, points_max } = req.query;
    const offset = (page - 1) * limit;

    let where = "p.status = 'approved'";
    const params = [];

    // Featured filter: only featured posts
    if (featured === '1') {
      where += ' AND p.is_featured = 1';
    }

    // Points range filter
    if (points_min !== undefined && points_min !== null && points_min !== "") {
      where += " AND p.points >= ?";
      params.push(Number(points_min));
    }
    if (points_max !== undefined && points_max !== null && points_max !== "") {
      where += " AND p.points <= ?";
      params.push(Number(points_max));
    }

    // Following filter: only posts from users I follow
    if (following) {
      const followingIds = db.prepare(
        'SELECT following_id FROM follows WHERE follower_id = ?'
      ).all(Number(following)).map(r => r.following_id);
      if (followingIds.length === 0) {
        return res.json({ posts: [], total: 0, page: 1, limit: Number(limit), pages: 0 });
      }
      const placeholders = followingIds.map(() => '?').join(',');
      where += ` AND p.user_id IN (${placeholders})`;
      params.push(...followingIds);
    }

    if (tag_id) {
      where += ' AND p.tag_id = ?';
      params.push(tag_id);
    }

    if (section_id) {
      where += ' AND p.section_id = ?';
      params.push(section_id);
    }

    if (search) {
      where += ' AND (p.title LIKE ? OR p.content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Time range filter
    if (time_range === 'day') {
      where += " AND p.created_at >= datetime('now', 'start of day')";
    } else if (time_range === 'week') {
      where += " AND p.created_at >= datetime('now', '-7 days')";
    } else if (time_range === 'month') {
      where += " AND p.created_at >= datetime('now', '-30 days')";
    }

    // Sort order
    let orderBy = 'p.is_pinned DESC, p.created_at DESC';
    if (sort === 'hot') {
      // Hot = views + likes + comments weighted
      orderBy = 'p.is_pinned DESC, (p.views + COALESCE(p.like_count, 0) * 5 + COALESCE(p.dislike_count, 0) * -3 + (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) * 3) DESC';
    }

    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM posts p WHERE ${where}
    `).get(...params);

    const posts = db.prepare(`
      SELECT p.*, u.username, u.nickname, u.avatar, u.level_name, u.level_icon, u.level_color,
             t.name as tag_name, t.color as tag_color, t.icon as tag_icon,
             s.name as section_name, s.icon as section_icon,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
             COALESCE(p.like_count, 0) as like_count, COALESCE(p.dislike_count, 0) as dislike_count
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      LEFT JOIN sections s ON p.section_id = s.id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), Number(offset));

    res.json({
      posts,
      total: countResult.total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(countResult.total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取帖子失败' });
  }
});

// Get single post
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const post = db.prepare(`
      SELECT p.*, u.username, u.nickname, u.avatar, t.name as tag_name, t.color as tag_color,
             COALESCE(p.like_count, 0) as like_count, COALESCE(p.dislike_count, 0) as dislike_count
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!post) {
      return res.status(404).json({ error: '帖子不存在' });
    }

    if (post.status !== 'approved' && !canViewUnapprovedPost(req.user, post)) {
      return res.status(404).json({ error: '帖子不存在' });
    }

    // Increment views
    if (post.status === 'approved') {
      try {
        db.prepare('UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = ?').run(req.params.id);
      } catch (e) {
        // Keep detail page available even when legacy databases miss the views column.
        if (!String(e.message || '').includes('no such column')) {
          throw e;
        }
      }
      // Log post view
      try {
        db.prepare(
          'INSERT INTO post_views (post_id, user_id, ip_address) VALUES (?, ?, ?)'
        ).run(req.params.id, req.user?.id || null, req.ip || '');
      } catch (e) {
        console.error('[PostViewLog]', e.message);
      }
      // User action log
      logUserAction({
        userId: req.user?.id || null,
        username: req.user?.username || null,
        action: 'view_post',
        targetType: 'post',
        targetId: Number(req.params.id),
        details: '浏览帖子: ' + post.title,
        req
      });
    }

    // Get comments with nested structure (parent first, then children)
    const flatComments = db.prepare(`
      SELECT c.*, u.username, u.nickname, u.avatar,
             ru.nickname as reply_to_nickname, ru.username as reply_to_username,
             (SELECT COUNT(*) FROM comment_votes cv WHERE cv.comment_id = c.id) as like_count
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN users ru ON c.reply_to_user_id = ru.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `).all(req.params.id);

    // Build nested tree (max 3 levels)
    const commentMap = {};
    const roots = [];
    flatComments.forEach(c => { commentMap[c.id] = { ...c, children: [] }; });
    flatComments.forEach(c => {
      if (c.parent_id && commentMap[c.parent_id]) {
        commentMap[c.parent_id].children.push(commentMap[c.id]);
      } else {
        roots.push(commentMap[c.id]);
      }
    });

    res.json({ post, comments: roots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取帖子失败' });
  }
});

// Create post
router.post('/', authMiddleware, (req, res) => {
  try {
    const { title, content, tag_id, section_id } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: '标题和内容不能为空' });
    }

    // Sensitive word filter
    refreshWords();
    const badTitle = containsSensitiveWords(title);
    const badContent = containsSensitiveWords(content);
    if (badTitle) {
      return res.status(400).json({ error: `标题包含敏感词「${badTitle}」，请修改后重试` });
    }
    if (badContent) {
      return res.status(400).json({ error: `内容包含敏感词「${badContent}」，请修改后重试` });
    }

    // Check and deduct points for posting
    const cost = POINT_COST.create_post || 5;
    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
    const currentPoints = Number(user.points) || 0;
    if (currentPoints < cost) {
      return res.status(403).json({
        error: `积分不足，发帖需要 ${cost} 积分，当前剩余 ${currentPoints} 积分`,
        need_points: cost,
        current_points: currentPoints
      });
    }

    const result = db.prepare(
      'INSERT INTO posts (user_id, title, content, tag_id, section_id, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, title, content, tag_id || null, section_id || null, 'pending');

    const post = db.prepare(`
      SELECT p.*, u.username, u.nickname, u.avatar, u.level_name, u.level_icon, u.level_color,
             t.name as tag_name, t.color as tag_color, t.icon as tag_icon,
             s.name as section_name, s.icon as section_icon
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      LEFT JOIN sections s ON p.section_id = s.id
      WHERE p.id = ?
    `).get(result.lastInsertRowid);

    // Sync to FTS index
    updatePostFTS(post.id);

    // Update daily post count for task system
    incrementDailyPostCount(req.user.id);
    checkBadges(req.user.id);

    // Deduct points
    db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(cost, req.user.id);

    logUserAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'create_post',
      targetType: 'post',
      targetId: result.lastInsertRowid,
      details: '发布帖子: ' + title,
      req
    });

    res.json({ post, message: `帖子已提交，消耗 ${cost} 积分，等待管理员审核` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建帖子失败' });
  }
});

// Update post
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) {
      return res.status(404).json({ error: '帖子不存在' });
    }
    if (post.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权修改' });
    }

    const { title, content, tag_id } = req.body;
    db.prepare(`
      UPDATE posts SET title = ?, content = ?, tag_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(title || post.title, content || post.content, tag_id !== undefined ? tag_id : post.tag_id, req.params.id);

    const updated = db.prepare(`
      SELECT p.*, u.username, u.nickname, u.avatar, t.name as tag_name, t.color as tag_color
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      WHERE p.id = ?
    `).get(req.params.id);

    // Sync to FTS index
    updatePostFTS(req.params.id);

    res.json({ post: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新帖子失败' });
  }
});

// Delete post
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) {
      return res.status(404).json({ error: '帖子不存在' });
    }
    if (post.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权删除' });
    }

    const deletePost = db.transaction((postId) => {
      db.prepare('DELETE FROM comments WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM notifications WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
    });

    deletePost(req.params.id);

    // Remove from FTS index
    updatePostFTS(req.params.id, 'delete');

    // Log deletion
    const logReason = req.user.role === 'admin' ? '管理员删除' : '用户自己删除';
    logAction({ adminId: req.user.id, action: 'delete_post', targetType: 'post', targetId: Number(req.params.id), reason: logReason, details: `删除帖子: ${post.title}` });
    logUserAction({
      userId: req.user.id,
      username: req.user.username,
      action: req.user.role === 'admin' ? 'admin_delete_post' : 'delete_post',
      targetType: 'post',
      targetId: Number(req.params.id),
      details: '删除帖子: ' + post.title,
      req
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除帖子失败' });
  }
});

// Add comment
router.post('/:id/comments', authMiddleware, async (req, res) => {
  try {
    const { content, parent_id, reply_to_user_id } = req.body;
    if (!content) {
      return res.status(400).json({ error: '评论内容不能为空' });
    }

    // Sensitive word filter
    refreshWords();
    const badContent = containsSensitiveWords(content);
    if (badContent) {
      return res.status(400).json({ error: `评论包含敏感词「${badContent}」，请修改后重试` });
    }

    const post = db.prepare('SELECT id, user_id, status FROM posts WHERE id = ?').get(req.params.id);
    if (!post) {
      return res.status(404).json({ error: '帖子不存在' });
    }

    if (post.status !== 'approved' && !canViewUnapprovedPost(req.user, post)) {
      return res.status(403).json({ error: '该帖子暂不可评论' });
    }

    // Validate parent comment if provided
    if (parent_id) {
      const parent = db.prepare('SELECT id FROM comments WHERE id = ? AND post_id = ?').get(parent_id, req.params.id);
      if (!parent) {
        return res.status(400).json({ error: '被回复的评论不存在' });
      }
    }

    // Check points before commenting
    const cost = POINT_COST.create_comment || 2;
    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
    const currentPoints = Number(user.points) || 0;
    if (currentPoints < cost) {
      return res.status(403).json({
        error: `积分不足，评论需要 ${cost} 积分，当前剩余 ${currentPoints} 积分`,
        need_points: cost,
        current_points: currentPoints
      });
    }

    const result = db.prepare(
      'INSERT INTO comments (post_id, user_id, content, parent_id, reply_to_user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, req.user.id, content, parent_id || null, reply_to_user_id || null);

    const comment = db.prepare(`
      SELECT c.*, u.username, u.nickname, u.avatar,
             ru.nickname as reply_to_nickname, ru.username as reply_to_username
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN users ru ON c.reply_to_user_id = ru.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);

    // Deduct points
    db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(cost, req.user.id);

    // Process @mentions (async, non-blocking)
    processMentions(content, req.params.id, post.title, req.user.id, comment.nickname || comment.username);

    // Notify post author (if not commenting on own post)
    if (post.user_id !== req.user.id) {
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, content, post_id)
        VALUES (?, 'new_comment', '💬有新评论', '有人评论了你的帖子「' || ? || '」', ?)
      `).run(post.user_id, post.title, req.params.id);
      sendPushToUser(post.user_id, {
        title: '💬 有新评论',
        body: '有人评论了你的帖子「' + post.title + '」',
        url: '/post/' + req.params.id,
        tag: 'new-comment'
      });
      // Email notification (async, don't await)
      notifyUserNewComment(post.user_id, post.title, comment.nickname || comment.username, '/post/' + req.params.id);
    }

    // Notify parent comment author (if this is a reply)
    if (reply_to_user_id && reply_to_user_id !== req.user.id) {
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, content, post_id)
        VALUES (?, 'new_reply', '💬 有新回复', '有人回复了你的评论', ?)
      `).run(reply_to_user_id, req.params.id);
      sendPushToUser(reply_to_user_id, {
        title: '💬 有新回复',
        body: '有人回复了你的评论，快去看看吧',
        url: '/post/' + req.params.id,
        tag: 'new-reply'
      });
      // Email notification (async, don't await)
      notifyUserNewReply(reply_to_user_id, post.title, comment.nickname || comment.username, '/post/' + req.params.id);
    }

    res.json({ comment, points_deducted: cost });

    // Update daily comment count for task system
    incrementDailyCommentCount(req.user.id);
    checkBadges(req.user.id);

    logUserAction({
      userId: req.user.id,
      username: req.user.username,
      action: 'create_comment',
      targetType: 'comment',
      targetId: result.lastInsertRowid,
      details: '评论帖子: ' + post.title,
      req
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '评论失败' });
  }
});

// Delete comment
router.delete('/comments/:id', authMiddleware, (req, res) => {
  try {
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) {
      return res.status(404).json({ error: '评论不存在' });
    }
    if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权删除' });
    }

    db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
    res.json({ success: true });

    logUserAction({
      userId: req.user.id,
      username: req.user.username,
      action: req.user.role === 'admin' ? 'admin_delete_comment' : 'delete_comment',
      targetType: 'comment',
      targetId: Number(req.params.id),
      details: '删除评论: ' + (comment.content || '').substring(0, 50),
      req
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除评论失败' });
  }
});

// Vote on a post (like or dislike) - toggles if already voted
router.post('/:id/vote', authMiddleware, (req, res) => {
  try {
    const { vote_type } = req.body; // 'like' or 'dislike'
    if (!vote_type || !['like', 'dislike'].includes(vote_type)) {
      return res.status(400).json({ error: '无效的投票类型' });
    }

    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
    if (!post) {
      return res.status(404).json({ error: '帖子不存在' });
    }

    // Check existing vote
    const existingVote = db.prepare(
      'SELECT * FROM post_votes WHERE post_id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    let action = ''; // 'added', 'removed', 'changed'
    let currentVote = null;

    if (existingVote) {
      if (existingVote.vote_type === vote_type) {
        // Same vote type -> remove vote (toggle off)
        db.prepare('DELETE FROM post_votes WHERE post_id = ? AND user_id = ?')
          .run(req.params.id, req.user.id);
        // Decrement count
        if (vote_type === 'like') {
          db.prepare('UPDATE posts SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(req.params.id);
        } else {
          db.prepare('UPDATE posts SET dislike_count = MAX(0, dislike_count - 1) WHERE id = ?').run(req.params.id);
        }
        action = 'removed';
        currentVote = null;
      } else {
        // Different vote type -> change vote
        db.prepare('UPDATE post_votes SET vote_type = ? WHERE post_id = ? AND user_id = ?')
          .run(vote_type, req.params.id, req.user.id);
        // Update counts: decrement old, increment new
        if (vote_type === 'like') {
          db.prepare('UPDATE posts SET like_count = like_count + 1, dislike_count = MAX(0, dislike_count - 1) WHERE id = ?').run(req.params.id);
        } else {
          db.prepare('UPDATE posts SET dislike_count = dislike_count + 1, like_count = MAX(0, like_count - 1) WHERE id = ?').run(req.params.id);
        }
        action = 'changed';
        currentVote = vote_type;
      }
    } else {
      // New vote
      db.prepare('INSERT INTO post_votes (post_id, user_id, vote_type) VALUES (?, ?, ?)')
        .run(req.params.id, req.user.id, vote_type);
      if (vote_type === 'like') {
        db.prepare('UPDATE posts SET like_count = like_count + 1 WHERE id = ?').run(req.params.id);
      } else {
        db.prepare('UPDATE posts SET dislike_count = dislike_count + 1 WHERE id = ?').run(req.params.id);
      }
      action = 'added';
      currentVote = vote_type;
    }

    // Get updated counts
    const updatedPost = db.prepare('SELECT like_count, dislike_count FROM posts WHERE id = ?').get(req.params.id);

    res.json({
      success: true,
      action,
      currentVote,
      like_count: updatedPost.like_count,
      dislike_count: updatedPost.dislike_count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '投票失败' });
  }
});

// Get vote status for a post
router.get('/:id/votes', optionalAuth, (req, res) => {
  try {
    const post = db.prepare('SELECT like_count, dislike_count FROM posts WHERE id = ?').get(req.params.id);
    if (!post) {
      return res.status(404).json({ error: '帖子不存在' });
    }

    let userVote = null;
    if (req.user) {
      const vote = db.prepare('SELECT vote_type FROM post_votes WHERE post_id = ? AND user_id = ?')
        .get(req.params.id, req.user.id);
      userVote = vote ? vote.vote_type : null;
    }

    res.json({
      like_count: post.like_count,
      dislike_count: post.dislike_count,
      userVote
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取投票信息失败' });
  }
});

module.exports = router;
