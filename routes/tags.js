const express = require('express');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get all tags (public)
router.get('/', (req, res) => {
  try {
    const tags = db.prepare(`
      SELECT t.*, COUNT(p.id) as post_count
      FROM tags t
      LEFT JOIN posts p ON p.tag_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at ASC
    `).all();
    res.json({ tags });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取标签失败' });
  }
});

// Create a new tag (admin only)
router.post('/', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  try {
    const { name, color, icon } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '标签名不能为空' });
    const colorVal = color && color.startsWith('#') ? color : '#667eea';
    const iconVal = icon || '🏷️';
    const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(name.trim());
    if (existing) return res.status(400).json({ error: '标签已存在' });
    const result = db.prepare('INSERT INTO tags (name, color, icon) VALUES (?, ?, ?)').run(name.trim(), colorVal, iconVal);
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, tag });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建标签失败' });
  }
});

// Update a tag (admin only)
router.put('/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  try {
    const { name, color, icon } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '标签名不能为空' });
    const tag = db.prepare('SELECT id FROM tags WHERE id = ?').get(req.params.id);
    if (!tag) return res.status(404).json({ error: '标签不存在' });
    const existing = db.prepare('SELECT id FROM tags WHERE name = ? AND id != ?').get(name.trim(), req.params.id);
    if (existing) return res.status(400).json({ error: '标签名已存在' });
    db.prepare('UPDATE tags SET name = ?, color = ?, icon = ? WHERE id = ?').run(name.trim(), color || '#667eea', icon || '🏷️', req.params.id);
    const updated = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
    res.json({ success: true, tag: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新标签失败' });
  }
});

// Delete a tag (admin only)
router.delete('/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  try {
    const tag = db.prepare('SELECT id FROM tags WHERE id = ?').get(req.params.id);
    if (!tag) return res.status(404).json({ error: '标签不存在' });
    // Unlink posts using this tag
    db.prepare('UPDATE posts SET tag_id = NULL WHERE tag_id = ?').run(req.params.id);
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除标签失败' });
  }
});

module.exports = router;
