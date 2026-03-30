const fs = require('fs');
const path = require('path');

let wordList = [];
const WORD_FILE = path.join(__dirname, '../data/word-filter.txt');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadWords() {
  try {
    if (fs.existsSync(WORD_FILE)) {
      const content = fs.readFileSync(WORD_FILE, 'utf8');
      wordList = content.split(/\r?\n/).map(w => w.trim()).filter(w => w && !w.startsWith('#'));
    }
  } catch (err) {
    console.error('加载敏感词失败:', err.message);
    wordList = [];
  }
}

loadWords();

// Check if content contains sensitive words
function containsSensitiveWords(content) {
  if (!content || wordList.length === 0) return null;
  for (const word of wordList) {
    if (content.includes(word)) return word;
  }
  return null;
}

// Refresh word list from disk
function refreshWords() {
  loadWords();
}

module.exports = {
  containsSensitiveWords,
  refreshWords,
  getWordList: () => [...wordList]
};
