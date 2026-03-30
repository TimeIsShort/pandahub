const express = require('express');
const db = require('../models/database');

const router = express.Router();

// Get all tags
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

module.exports = router;
