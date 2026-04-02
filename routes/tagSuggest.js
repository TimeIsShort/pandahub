const express = require('express');
const router = express.Router();
const db = require('../models/database');

// Simple keyword-based tag suggestion (no AI key needed)
function simpleKeywordSuggest(text, tags) {
  const lower = text.toLowerCase();
  const keywords = {
    'AI工具': ['ai', 'chatgpt', 'gpt', 'claude', 'gemini', 'kimi', '工具', '软件', '助手'],
    '使用技巧': ['技巧', '提示', '教程', '攻略', '优化', '设置', '方法'],
    '问题求助': ['问题', '报错', '错误', 'bug', '解决', '求助', '怎么', '如何', '帮忙'],
    '资源分享': ['资源', '分享', '开源', '下载', '免费', '福利', '推荐'],
    '日常闲聊': ['闲聊', '聊天', '日常', '今天', '周末', '生活', '大家'],
    '技术交流': ['代码', '编程', '开发', '技术', 'api', '函数', '算法', '程序员'],
    '产品反馈': ['反馈', '建议', '功能', '改进', '体验', '希望'],
    '公告': ['公告', '更新', '版本', '发布', '新功能', '升级']
  };

  const scores = {};
  for (const tag of tags) {
    scores[tag.name] = 0;
    const tagKeywords = keywords[tag.name] || [];
    for (const kw of tagKeywords) {
      if (lower.includes(kw)) scores[tag.name]++;
    }
  }

  return Object.entries(scores)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => tags.find(t => t.name === name));
}

// POST /api/tag-suggest - 智能推荐标签
router.post('/', (req, res) => {
  try {
    const { title, content } = req.body || {};
    if (!title && !content) {
      return res.status(400).json({ error: '标题和内容不能同时为空' });
    }

    const tags = db.prepare('SELECT * FROM tags ORDER BY created_at ASC').all();
    if (tags.length === 0) {
      return res.json({ suggestions: [] });
    }

    const fullText = (title || '') + ' ' + (content || '').substring(0, 600);
    const suggestions = simpleKeywordSuggest(fullText, tags);

    res.json({
      suggestions: suggestions.map(t => ({ id: t.id, name: t.name, color: t.color, icon: t.icon }))
    });
  } catch (err) {
    console.error('[TagSuggest]', err);
    res.status(500).json({ error: '推荐失败' });
  }
});

module.exports = router;
