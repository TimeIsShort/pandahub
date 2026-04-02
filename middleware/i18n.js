const fs = require('fs');
const path = require('path');

const I18N_DIR = path.join(__dirname, '../data/i18n');
const DEFAULT_LANG = 'zh';

let translations = {};

function loadTranslations() {
  try {
    translations = {};
    const files = fs.readdirSync(I18N_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const lang = file.replace('.json', '');
        translations[lang] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, file), 'utf8'));
      }
    }
  } catch (err) {
    console.error('[i18n] 加载翻译文件失败:', err.message);
    translations = { zh: {}, en: {} };
  }
}

loadTranslations();

// Get translation for a key path like "nav.home" or "errors.login_failed"
function t(key, lang) {
  lang = lang || DEFAULT_LANG;
  const langData = translations[lang] || translations[DEFAULT_LANG] || {};
  const keys = key.split('.');
  let value = langData;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key; // return key if not found
    }
  }
  return value;
}

function getAvailableLanguages() {
  return Object.keys(translations).map(code => {
    const names = { zh: '简体中文', en: 'English', 'zh-TW': '繁體中文' };
    return { code, name: names[code] || code };
  });
}

module.exports = { t, loadTranslations, getAvailableLanguages, DEFAULT_LANG };
