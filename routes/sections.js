const express = require('express');
const router = express.Router();
const db = require('../models/database');

// GET /api/sections - 获取所有版块（带标签统计）
router.get('/', (req, res) => {
  try {
    const sections = db.prepare(`
      SELECT 
        s.*,
        COUNT(DISTINCT t.id) as tag_count,
        COUNT(DISTINCT p.id) as post_count
      FROM sections s
      LEFT JOIN tags t ON t.section_id = s.id
      LEFT JOIN posts p ON p.section_id = s.id AND p.status = 'approved'
      GROUP BY s.id
      ORDER BY s.sort_order ASC
    `).all();
    
    res.json({ sections });
  } catch (error) {
    console.error('获取版块失败:', error);
    res.status(500).json({ error: '获取版块失败' });
  }
});

// GET /api/sections/:id - 获取单个版块详情（带标签）
router.get('/:id', (req, res) => {
  try {
    const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(req.params.id);
    if (!section) {
      return res.status(404).json({ error: '版块不存在' });
    }
    
    // 获取该版块下的标签
    const tags = db.prepare(`
      SELECT t.*, COUNT(p.id) as post_count
      FROM tags t
      LEFT JOIN posts p ON p.tag_id = t.id AND p.status = 'approved'
      WHERE t.section_id = ?
      GROUP BY t.id
      ORDER BY t.name ASC
    `).all(req.params.id);
    
    // 获取该版块下的帖子
    const posts = db.prepare(`
      SELECT p.*, u.username, u.nickname, u.avatar, u.level_name, u.level_icon, u.level_color,
             t.name as tag_name, t.color as tag_color, t.icon as tag_icon,
             s.name as section_name, s.icon as section_icon
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      LEFT JOIN sections s ON p.section_id = s.id
      WHERE p.section_id = ? AND p.status = 'approved'
      ORDER BY p.is_pinned DESC, p.created_at DESC
      LIMIT 20
    `).all(req.params.id);
    
    res.json({ section, tags, posts });
  } catch (error) {
    console.error('获取版块详情失败:', error);
    res.status(500).json({ error: '获取版块详情失败' });
  }
});

// POST /api/sections - 创建版块（管理员）
router.post('/', (req, res) => {
  try {
    const { name, icon, description, cover_image, sort_order } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: '版块名称不能为空' });
    }
    
    const result = db.prepare(`
      INSERT INTO sections (name, icon, description, cover_image, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, icon || '📁', description || '', cover_image || '', sort_order || 0);
    
    const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(result.lastInsertRowid);
    res.json({ section });
  } catch (error) {
    console.error('创建版块失败:', error);
    res.status(500).json({ error: '创建版块失败' });
  }
});

// PUT /api/sections/:id - 更新版块（管理员）
router.put('/:id', (req, res) => {
  try {
    const { name, icon, description, cover_image, sort_order } = req.body;
    
    const existing = db.prepare('SELECT * FROM sections WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '版块不存在' });
    }
    
    db.prepare(`
      UPDATE sections 
      SET name = ?, icon = ?, description = ?, cover_image = ?, sort_order = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      icon || existing.icon,
      description ?? existing.description,
      cover_image ?? existing.cover_image,
      sort_order ?? existing.sort_order,
      req.params.id
    );
    
    const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(req.params.id);
    res.json({ section });
  } catch (error) {
    console.error('更新版块失败:', error);
    res.status(500).json({ error: '更新版块失败' });
  }
});

// DELETE /api/sections/:id - 删除版块（管理员）
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM sections WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '版块不存在' });
    }
    
    // 将该版块下的帖子和标签移回默认版块（综合）
    db.prepare('UPDATE posts SET section_id = NULL WHERE section_id = ?').run(req.params.id);
    db.prepare('UPDATE tags SET section_id = NULL WHERE section_id = ?').run(req.params.id);
    
    db.prepare('DELETE FROM sections WHERE id = ?').run(req.params.id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('删除版块失败:', error);
    res.status(500).json({ error: '删除版块失败' });
  }
});

module.exports = router;
