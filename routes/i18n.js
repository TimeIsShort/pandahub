const express = require('express');
const { t, getAvailableLanguages, loadTranslations, DEFAULT_LANG } = require('../middleware/i18n');

const router = express.Router();

// Get available languages
router.get('/languages', (req, res) => {
  res.json({ languages: getAvailableLanguages(), default: DEFAULT_LANG });
});

// Get translation for a specific language or detect from header/cookie
router.get('/t', (req, res) => {
  const { lang } = req.query;
  const detectedLang = lang || req.cookies?.lang || DEFAULT_LANG;
  const langs = getAvailableLanguages();
  if (!langs.find(l => l.code === detectedLang)) {
    return res.status(400).json({ error: 'Unsupported language' });
  }
  res.json({ lang: detectedLang, translations: require('../data/i18n/' + detectedLang + '.json') });
});

module.exports = router;
