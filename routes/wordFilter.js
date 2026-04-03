const express = require('express');
const router = express.Router();
const { containsSensitiveWords } = require('../middleware/wordFilter');

// Public: check content for sensitive words (no auth needed)
router.post('/check', (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || typeof content !== 'string') {
      return res.json({ hasSensitive: false, matchedWords: [] });
    }
    const matchedWord = containsSensitiveWords(content);
    res.json({
      hasSensitive: !!matchedWord,
      matchedWords: matchedWord ? [matchedWord] : []
    });
  } catch (e) {
    res.status(500).json({ error: '检查失败' });
  }
});

module.exports = router;
