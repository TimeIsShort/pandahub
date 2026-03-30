const express = require('express');
const https = require('https');
const http = require('http');
const { randomUUID } = require('crypto');
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const AI_DAILY_QUOTA = 100;
const MINIMAX_BASE_URL = String(process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com').replace(/\/+$/, '');
const MINIMAX_API_URL = /\/v1$/i.test(MINIMAX_BASE_URL)
  ? `${MINIMAX_BASE_URL}/text/chatcompletion_v2`
  : `${MINIMAX_BASE_URL}/v1/text/chatcompletion_v2`;
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_DEFAULT_MODEL = 'MiniMax-M2.7';
const MINIMAX_ALLOWED_MODELS = new Set([
  'MiniMax-M2.7',
  'MiniMax-M2.5',
  'MiniMax-M2.1',
  'MiniMax-M2.1-lightning',
  'MiniMax-M2.1-highspeed',
  'MiniMax-M2'
]);
const BAILIAN_BASE_URL = (process.env.BAILIAN_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1').replace(/\/+$/, '');
const BAILIAN_CHAT_URL = `${BAILIAN_BASE_URL}/chat/completions`;
const BAILIAN_API_KEY = process.env.BAILIAN_API_KEY || '';
const BAILIAN_DEFAULT_MODEL = 'qwen3.5-plus';
const BAILIAN_ALLOWED_MODELS = new Set([
  'qwen3.5-plus',
  'qwen3-max-2026-01-23',
  'qwen3-coder-next',
  'qwen3-coder-plus',
  'glm-5',
  'glm-4.7',
  'kimi-k2.5',
  'MiniMax-M2.5'
]);
const LEGACY_SESSION_ID = 'legacy';

// Get today's date string
function getToday() {
  return new Date().toISOString().split('T')[0];
}

function normalizeSessionId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.slice(0, 80);
}

function createSessionId() {
  try {
    return randomUUID();
  } catch (e) {
    return `sess-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

function isLegacySession(sessionId) {
  return !sessionId || sessionId === LEGACY_SESSION_ID;
}

// HTTP GET helper
function httpGet(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Extract titles from RSS
function extractTitles(xml, count = 10) {
  const titles = [];
  const regex = /<title><!\[CDATA\[([^\]]+)\]\]><\/title>|<title>([^<]+)<\/title>/g;
  let match;
  while ((match = regex.exec(xml)) !== null && titles.length < count) {
    const title = match[1] || match[2];
    if (title && !title.includes('CDATA') && title.length > 10 && 
        !title.includes('RSS') && !title.includes('Feed') && title.length < 200) {
      titles.push(title.trim());
    }
  }
  return titles;
}

// Search for news
async function searchNews() {
  try {
    const feeds = [
      'https://techcrunch.com/category/artificial-intelligence/feed/',
      'https://www.wired.com/feed/tag/ai/latest/rss'
    ];
    
    let allNews = [];
    
    for (const feed of feeds) {
      try {
        const xml = await httpGet(feed, 5000);
        const titles = extractTitles(xml, 8);
        allNews = allNews.concat(titles);
      } catch (e) {}
    }
    
    // Deduplicate
    const seen = new Set();
    allNews = allNews.filter(n => {
      const key = n.substring(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    return allNews.slice(0, 10);
  } catch (e) {
    return [];
  }
}

// Search forum posts
async function searchPosts(keyword) {
  try {
    const lowerKeyword = keyword.toLowerCase();
    const posts = db.prepare(`
      SELECT p.id, p.title, p.content, p.created_at, u.nickname, t.name as tag_name
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN tags t ON p.tag_id = t.id
      WHERE LOWER(p.title) LIKE ? OR LOWER(p.content) LIKE ?
      ORDER BY p.created_at DESC
      LIMIT 10
    `).all(`%${lowerKeyword}%`, `%${lowerKeyword}%`);
    
    return posts;
  } catch (e) {
    return [];
  }
}

// Smart AI response
async function generateAIResponse(message, chatHistory) {
  const lowerMsg = message.toLowerCase();
  
  // Check if user wants to search posts (priority over news)
  const wantsPostSearch = 
    lowerMsg.includes('搜索帖子') || lowerMsg.includes('找帖子') ||
    lowerMsg.includes('查找帖子') || lowerMsg.includes('搜帖子') ||
    lowerMsg.includes('找找帖子') ||
    (lowerMsg.includes('找') && lowerMsg.includes('帖子')) ||
    (lowerMsg.includes('搜') && lowerMsg.includes('帖子')) ||
    lowerMsg.includes('看看社区') || lowerMsg.includes('社区里') ||
    lowerMsg.includes('有什么帖子') || lowerMsg.includes('搜索一下') ||
    (lowerMsg.includes('有') && lowerMsg.includes('帖子'));
  
  if (wantsPostSearch) {
    // Extract potential search keyword - remove common words but keep specific terms
    let keywords = lowerMsg
      .replace(/一下|搜索|找|查找|搜|帖子|社区|里|有什么|看看|相关|的|一下/g, '')
      .trim();
    
    if (keywords.length >= 1) {
      const posts = await searchPosts(keywords);
      if (posts.length > 0) {
        const postList = posts.map((p, i) => 
          `${i+1}. 【${p.tag_name || '无标签'}】${p.title}\n   👤 ${p.nickname || '匿名'} | 🕐 ${new Date(p.created_at).toLocaleDateString('zh-CN')}`
        ).join('\n\n');
        return `🔍 在社区找到了 ${posts.length} 条相关帖子：\n\n${postList}\n\n点击标题即可查看详情`;
      } else {
        return `🔍 在社区没找到与"${keywords}"相关的帖子，要不换个关键词试试？`;
      }
    } else {
      // Show recent posts if no specific keyword
      const posts = await searchPosts('');
      if (posts.length > 0) {
        const postList = posts.slice(0, 5).map((p, i) => 
          `${i+1}. 【${p.tag_name || '无标签'}】${p.title}`
        ).join('\n');
        return `📋 社区最新帖子：\n\n${postList}\n\n想搜特定内容可以告诉我，比如"搜Python相关的帖子"`;
      }
    }
  }
  
  // Check if user wants news
  const wantsNews = lowerMsg.includes('新闻') || lowerMsg.includes('news') || 
    lowerMsg.includes('最新') || lowerMsg.includes('今天') ||
    (lowerMsg.includes('搜索') && lowerMsg.includes('ai')) ||
    (lowerMsg.includes('有什么') && lowerMsg.includes('新')) ||
    lowerMsg.includes('ai动态');
  
  if (wantsNews) {
    const news = await searchNews();
    if (news.length > 0) {
      const newsList = news.map((n, i) => `${i+1}. ${n}`).join('\n');
      return `📰 找到了今日AI科技新闻：\n\n${newsList}\n\n数据来源：TechCrunch、Wired`;
    }
  }
  
  // General responses based on keywords
  if (lowerMsg.includes('你好') || lowerMsg.includes('hi') || lowerMsg.includes('hello')) {
    return '你好！有什么我可以帮助你的吗？😊';
  }
  
  if (lowerMsg.includes('帮助') || lowerMsg.includes('help')) {
    return '我可以帮你：\n• 回答AI相关问题\n• 搜索最新科技新闻\n• 讨论技术话题\n• 写作建议\n\n直接问我试试，比如"有什么AI新闻"！';
  }
  
  if (lowerMsg.includes('谢谢') || lowerMsg.includes('thank')) {
    return '不客气！很高兴能帮到你 😊';
  }
  
  if (lowerMsg.includes('你是谁') || lowerMsg.includes('who are')) {
    return '我是社区的AI助手！可以回答问题、搜索最新新闻、讨论技术话题等。普通用户每天有100次使用额度，好好利用哦！';
  }
  
  if (lowerMsg.includes('额度') || lowerMsg.includes('次数')) {
    return '普通用户每天有100次AI助手使用额度，次日自动刷新。';
  }
  
  if (lowerMsg.includes('ai') || lowerMsg.includes('人工智能')) {
    return 'AI人工智能正在快速发展！GPT、Claude、Gemini等大模型不断刷新能力边界。你对AI哪方面比较感兴趣？';
  }
  
  if (lowerMsg.includes('编程') || lowerMsg.includes('代码') || lowerMsg.includes('program')) {
    return '编程是很有价值的技能！你是想学习编程还是遇到具体问题了？可以告诉我使用的语言和问题，我来帮你分析 😊';
  }
  
  if (lowerMsg.includes('天安门') || lowerMsg.includes('习近平') || lowerMsg.includes('中国崩溃') || lowerMsg.includes('反动')) {
    return '抱歉，我不了解这个话题。让我们聊点别的吧！';
  }
  
  // Default response for other messages
  return `收到你的消息了！"${message.length > 30 ? message.substring(0, 30) + '...' : message}"这个问题很有意思...\n\n我可以帮你搜索AI新闻、回答技术问题、讨论各种话题。试试问我"有什么AI新闻"？`;
}

function getSafeMiniMaxModel(model) {
  const next = normalizeMiniMaxModel(model);
  if (MINIMAX_ALLOWED_MODELS.has(next)) return next;
  return MINIMAX_DEFAULT_MODEL;
}

function normalizeMiniMaxModel(model) {
  const raw = String(model || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();

  if (lowered === 'minimax-m2.1 lightning' || lowered === 'minimax m2.1 lightning') {
    return 'MiniMax-M2.1-lightning';
  }
  if (lowered === 'minimax-m2.1-highspeed') {
    return 'MiniMax-M2.1-lightning';
  }
  if (lowered === 'minimax-m2') {
    return 'MiniMax-M2';
  }
  return raw;
}

function getSafeBailianModel(model) {
  const next = String(model || '').trim();
  if (BAILIAN_ALLOWED_MODELS.has(next)) return next;
  return BAILIAN_DEFAULT_MODEL;
}

function toText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(item => toText(item)).join('\n').trim();
  }
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.content === 'string') return value.content;
    if (typeof value.message === 'string') return value.message;
  }
  return '';
}

function extractMiniMaxReply(data) {
  return (
    toText(data?.reply) ||
    toText(data?.output_text) ||
    toText(data?.output?.text) ||
    toText(data?.choices?.[0]?.message?.content) ||
    toText(data?.choices?.[0]?.text) ||
    ''
  ).trim();
}

function extractBailianReply(data) {
  return (
    toText(data?.choices?.[0]?.message?.content) ||
    toText(data?.output?.text) ||
    toText(data?.output_text) ||
    ''
  ).trim();
}

function buildMiniMaxMessages(history, currentMessage) {
  const normalized = Array.isArray(history)
    ? history
        .filter(item => item && (item.role === 'user' || item.role === 'assistant') && item.content)
        .slice(-10)
        .map(item => ({ role: item.role, content: String(item.content) }))
    : [];

  return ensureCurrentUserMessage(normalized, currentMessage);
}

function buildOpenAIStyleMessages(history, currentMessage) {
  const normalized = Array.isArray(history)
    ? history
        .filter(item => item && (item.role === 'user' || item.role === 'assistant') && item.content)
        .slice(-12)
        .map(item => ({ role: item.role, content: String(item.content) }))
    : [];

  return ensureCurrentUserMessage(normalized, currentMessage);
}

function ensureCurrentUserMessage(messages, currentMessage) {
  const normalized = Array.isArray(messages) ? messages.slice() : [];
  const userText = String(currentMessage || '').trim();
  if (!userText) return normalized;

  const last = normalized[normalized.length - 1];
  if (last && last.role === 'user' && String(last.content || '').trim() === userText) {
    return normalized;
  }

  normalized.push({ role: 'user', content: userText });
  return normalized;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableFetchError(err) {
  const message = String(err?.message || '').toLowerCase();
  return (
    err?.name === 'AbortError' ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('eai_again')
  );
}

async function callMiniMaxChat({ message, history, model }) {
  if (!MINIMAX_API_KEY) {
    throw new Error('MINIMAX_API_KEY_MISSING');
  }

  const selectedModel = getSafeMiniMaxModel(model);
  const messages = buildMiniMaxMessages(history, message);
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40000);

    try {
      const response = await fetch(MINIMAX_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MINIMAX_API_KEY}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages,
          temperature: 0.5,
          stream: false
        }),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const apiError = data?.error?.message || data?.base_resp?.status_msg || `HTTP ${response.status}`;
        lastError = new Error(`MINIMAX_API_ERROR:${apiError}`);
        if (attempt < maxAttempts && isRetryableStatus(response.status)) {
          await sleep(350 * attempt);
          continue;
        }
        throw lastError;
      }

      const text = extractMiniMaxReply(data);
      if (!text) {
        lastError = new Error('MINIMAX_EMPTY_REPLY');
        if (attempt < maxAttempts) {
          await sleep(250 * attempt);
          continue;
        }
        throw lastError;
      }

      return { text, model: selectedModel };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts && isRetryableFetchError(err)) {
        await sleep(350 * attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('MINIMAX_API_ERROR:UNKNOWN');
}

async function callBailianChat({ message, history, model }) {
  if (!BAILIAN_API_KEY) {
    throw new Error('BAILIAN_API_KEY_MISSING');
  }

  const selectedModel = getSafeBailianModel(model);
  const messages = buildOpenAIStyleMessages(history, message);
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40000);

    try {
      const response = await fetch(BAILIAN_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BAILIAN_API_KEY}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages,
          temperature: 0.5,
          stream: false
        }),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const apiError = data?.error?.message || data?.message || `HTTP ${response.status}`;
        lastError = new Error(`BAILIAN_API_ERROR:${apiError}`);
        if (attempt < maxAttempts && isRetryableStatus(response.status)) {
          await sleep(350 * attempt);
          continue;
        }
        throw lastError;
      }

      const text = extractBailianReply(data);
      if (!text) {
        lastError = new Error('BAILIAN_EMPTY_REPLY');
        if (attempt < maxAttempts) {
          await sleep(250 * attempt);
          continue;
        }
        throw lastError;
      }

      return { text, model: selectedModel };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts && isRetryableFetchError(err)) {
        await sleep(350 * attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('BAILIAN_API_ERROR:UNKNOWN');
}

// Check and update quota
function getQuotaContext(userId) {
  const user = db.prepare('SELECT ai_quota, ai_reset_date, role FROM users WHERE id = ?').get(userId);
  if (!user) {
    return { quota: 0, total: AI_DAILY_QUOTA, unlimited: false };
  }

  if (String(user.role || '').toLowerCase() === 'admin') {
    return { quota: Number.MAX_SAFE_INTEGER, total: Number.MAX_SAFE_INTEGER, unlimited: true };
  }

  const today = getToday();
  
  if (user.ai_reset_date !== today) {
    db.prepare('UPDATE users SET ai_quota = ?, ai_reset_date = ? WHERE id = ?')
      .run(AI_DAILY_QUOTA, today, userId);
    return { quota: AI_DAILY_QUOTA, total: AI_DAILY_QUOTA, unlimited: false };
  }

  const currentQuota = Number.isFinite(Number(user.ai_quota))
    ? Math.max(0, Number(user.ai_quota))
    : AI_DAILY_QUOTA;
  return { quota: currentQuota, total: AI_DAILY_QUOTA, unlimited: false };
}

// Get remaining quota
router.get('/quota', authMiddleware, (req, res) => {
  const quotaCtx = getQuotaContext(req.user.id);
  res.json({ quota: quotaCtx.quota, total: quotaCtx.total, unlimited: quotaCtx.unlimited });
});

// List conversation sessions
router.get('/sessions', authMiddleware, (req, res) => {
  try {
    const sessions = db.prepare(`
      SELECT
        COALESCE(NULLIF(c.session_id, ''), ?) AS session_id,
        MAX(c.created_at) AS last_message_at,
        SUM(CASE WHEN c.role = 'user' THEN 1 ELSE 0 END) AS turn_count,
        (
          SELECT c1.content
          FROM ai_chats c1
          WHERE c1.user_id = c.user_id
            AND COALESCE(NULLIF(c1.session_id, ''), ?) = COALESCE(NULLIF(c.session_id, ''), ?)
            AND c1.role = 'user'
          ORDER BY c1.created_at ASC, c1.id ASC
          LIMIT 1
        ) AS first_prompt,
        (
          SELECT c2.provider
          FROM ai_chats c2
          WHERE c2.user_id = c.user_id
            AND COALESCE(NULLIF(c2.session_id, ''), ?) = COALESCE(NULLIF(c.session_id, ''), ?)
          ORDER BY c2.created_at DESC, c2.id DESC
          LIMIT 1
        ) AS provider,
        (
          SELECT c3.model
          FROM ai_chats c3
          WHERE c3.user_id = c.user_id
            AND COALESCE(NULLIF(c3.session_id, ''), ?) = COALESCE(NULLIF(c.session_id, ''), ?)
          ORDER BY c3.created_at DESC, c3.id DESC
          LIMIT 1
        ) AS model
      FROM ai_chats c
      WHERE c.user_id = ?
      GROUP BY COALESCE(NULLIF(c.session_id, ''), ?)
      ORDER BY last_message_at DESC
      LIMIT 100
    `).all(
      LEGACY_SESSION_ID,
      LEGACY_SESSION_ID,
      LEGACY_SESSION_ID,
      LEGACY_SESSION_ID,
      LEGACY_SESSION_ID,
      LEGACY_SESSION_ID,
      LEGACY_SESSION_ID,
      req.user.id,
      LEGACY_SESSION_ID
    );

    const mapped = sessions.map(item => ({
      id: item.session_id,
      title: (item.first_prompt || '新会话').slice(0, 80),
      last_message_at: item.last_message_at,
      turn_count: Number(item.turn_count || 0),
      provider: item.provider || '',
      model: item.model || ''
    }));

    res.json({ sessions: mapped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取会话列表失败' });
  }
});

// Get chat history by session
router.get('/history', authMiddleware, (req, res) => {
  try {
    const requestSessionId = normalizeSessionId(req.query.session_id);
    if (!requestSessionId) {
      return res.json({ chats: [] });
    }

    const chats = isLegacySession(requestSessionId)
      ? db.prepare(`
          SELECT role, content, created_at, provider, model
          FROM ai_chats
          WHERE user_id = ? AND (session_id IS NULL OR session_id = '')
          ORDER BY created_at ASC, id ASC
          LIMIT 300
        `).all(req.user.id)
      : db.prepare(`
          SELECT role, content, created_at, provider, model
          FROM ai_chats
          WHERE user_id = ? AND session_id = ?
          ORDER BY created_at ASC, id ASC
          LIMIT 300
        `).all(req.user.id, requestSessionId);

    res.json({ chats, session_id: requestSessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取聊天记录失败' });
  }
});

// Delete one session
router.delete('/sessions/:id', authMiddleware, (req, res) => {
  try {
    const sessionId = normalizeSessionId(req.params.id);
    if (!sessionId) {
      return res.status(400).json({ error: '会话ID不能为空' });
    }

    if (isLegacySession(sessionId)) {
      db.prepare(`
        DELETE FROM ai_chats
        WHERE user_id = ? AND (session_id IS NULL OR session_id = '')
      `).run(req.user.id);
    } else {
      db.prepare('DELETE FROM ai_chats WHERE user_id = ? AND session_id = ?')
        .run(req.user.id, sessionId);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除会话失败' });
  }
});

// Clear all chat history
router.delete('/history', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM ai_chats WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

// Send message
router.post('/chat', authMiddleware, async (req, res) => {
  try {
    // Check email verification
    const chatUser = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(req.user.id);
    if (!chatUser || Number(chatUser.email_verified) !== 1) {
      return res.status(403).json({ error: '请先验证邮箱后再使用 AI 对话', need_email_verify: true });
    }

    const { message, model, provider, session_id } = req.body;
    const selectedProvider = String(provider || 'local').toLowerCase();
    let selectedSessionId = normalizeSessionId(session_id);
    if (!selectedSessionId) {
      selectedSessionId = createSessionId();
    }
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: '消息不能为空' });
    }

    if (selectedProvider === 'minimax' && !MINIMAX_API_KEY) {
      return res.status(500).json({ error: 'MinMax 密钥未配置，请联系管理员' });
    }

    if (selectedProvider === 'bailian' && !BAILIAN_API_KEY) {
      return res.status(500).json({ error: '百炼密钥未配置，请联系管理员' });
    }

    if (selectedProvider !== 'minimax' && selectedProvider !== 'bailian' && selectedProvider !== 'local') {
      return res.status(400).json({ error: '该模型供应商暂未配置服务端密钥，当前仅 MinMax/百炼可用' });
    }
    
    const quotaCtx = getQuotaContext(req.user.id);
    let quota = quotaCtx.quota;
    const isUnlimited = quotaCtx.unlimited;
    if (!isUnlimited && quota <= 0) {
      return res.status(403).json({ error: '今日额度已用完，明天再来吧！', quota: 0 });
    }
    
    // Get latest chat history for context (most recent turns)
    const recentHistory = isLegacySession(selectedSessionId)
      ? db.prepare(`
          SELECT role, content
          FROM ai_chats
          WHERE user_id = ? AND (session_id IS NULL OR session_id = '')
          ORDER BY created_at DESC, id DESC
          LIMIT 20
        `).all(req.user.id)
      : db.prepare(`
          SELECT role, content
          FROM ai_chats
          WHERE user_id = ? AND session_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 20
        `).all(req.user.id, selectedSessionId);

    const history = recentHistory.reverse();
    
    // Generate AI response
    let aiResponse = '';
    let usedModel = model || '';
    if (selectedProvider === 'minimax') {
      const miniMaxResult = await callMiniMaxChat({ message, history, model });
      aiResponse = miniMaxResult.text;
      usedModel = miniMaxResult.model;
    } else if (selectedProvider === 'bailian') {
      const bailianResult = await callBailianChat({ message, history, model });
      aiResponse = bailianResult.text;
      usedModel = bailianResult.model;
    } else {
      aiResponse = await generateAIResponse(message, history);
    }
    
    const saveConversation = db.transaction(() => {
      db.prepare(`
        INSERT INTO ai_chats (user_id, session_id, role, content, provider, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(req.user.id, selectedSessionId, 'user', message, selectedProvider, model || '');

      db.prepare(`
        INSERT INTO ai_chats (user_id, session_id, role, content, provider, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(req.user.id, selectedSessionId, 'assistant', aiResponse, selectedProvider, usedModel || '');

      if (!isUnlimited) {
        db.prepare('UPDATE users SET ai_quota = ai_quota - 1 WHERE id = ?')
          .run(req.user.id);
      }
    });

    saveConversation();
    quota = isUnlimited ? quota : quota - 1;
    
    res.json({ 
      response: aiResponse,
      provider: selectedProvider,
      model: usedModel,
      session_id: selectedSessionId,
      quota,
      total: quotaCtx.total,
      unlimited: isUnlimited
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '回复失败，请重试' });
  }
});

module.exports = router;
