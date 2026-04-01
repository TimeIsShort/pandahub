const API_BASE = '/api';
let currentUser = null;
let currentTagId = null;
let currentPointsRange = null;
let currentPostId = null;
let currentPage = 1;
let selectedImages = [];
let uploadedImageUrls = [];
let commentImages = []; // images for comment being composed
let currentReplyTo = null; // { commentId, userId, name }
let toastHideTimer = null;
let confirmResolver = null;
let petalRainInitialized = false;
const THEME_STORAGE_KEY = 'forum_theme';
const AVAILABLE_THEMES = ['mint', 'sunset', 'sky', 'cyber', 'aurora'];
const AI_MODEL_STORAGE_KEY = 'forum_ai_model';
const AI_PROVIDER_STORAGE_KEY = 'forum_ai_provider';
let aiChatHistory = [];
let aiSessions = [];
let currentAISessionId = '';
let pandaPlayCount = 0;
const PANDA_3D_MIN_WIDTH = 960;
const PANDA_3D_MODEL_URL = '/assets/models/meshy-panda.glb?' + Date.now();
const PANDA_3D_MODULE_URL = '/js/panda-3d-v6.js?v=20260328-14';
let panda3DModulePromise = null;
let panda3DInstance = null;
const AI_PROVIDER_MODELS = {
  minimax: {
    label: 'MinMax',
    models: [
      { value: 'MiniMax-M2.7', label: 'MiniMax M2.7（开通可用）' },
      { value: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
      { value: 'MiniMax-M2.1', label: 'MiniMax M2.1' },
      { value: 'MiniMax-M2.1-lightning', label: 'MiniMax M2.1 Lightning' },
      { value: 'MiniMax-M2', label: 'MiniMax M2' }
    ]
  },
  bailian: {
    label: '百炼',
    models: [
      { value: 'qwen3.5-plus', label: 'Qwen3.5-Plus' },
      { value: 'qwen3-max-2026-01-23', label: 'Qwen3-Max-2026-01-23' },
      { value: 'qwen3-coder-next', label: 'Qwen3-Coder-Next' },
      { value: 'qwen3-coder-plus', label: 'Qwen3-Coder-Plus' },
      { value: 'glm-5', label: 'GLM-5' },
      { value: 'glm-4.7', label: 'GLM-4.7' },
      { value: 'kimi-k2.5', label: 'Kimi-K2.5（百炼接入）' },
      { value: 'MiniMax-M2.5', label: 'MiniMax-M2.5（百炼接入）' }
    ]
  },
  moonshot: {
    label: '月之暗面',
    models: [
      { value: 'kimi-k2.5', label: 'Kimi K2.5' },
      { value: 'kimi-k2-thinking', label: 'Kimi K2 Thinking' },
      { value: 'kimi-k2-thinking-turbo', label: 'Kimi K2 Thinking Turbo' },
      { value: 'kimi-k2-turbo-preview', label: 'Kimi K2 Turbo Preview' },
      { value: 'moonshot-v1-128k', label: 'Moonshot V1 128K' },
      { value: 'moonshot-v1-32k', label: 'Moonshot V1 32K' },
      { value: 'moonshot-v1-8k', label: 'Moonshot V1 8K' },
      { value: 'kimi-latest', label: 'Kimi Latest' }
    ]
  }
};

// Utils

// User level helper
const LEVELS = [
  { min: 0,    max: 100,   name: '萌新',   icon: '🌱', color: '#86efac' },
  { min: 101,  max: 500,   name: '入门',   icon: '🌿', color: '#86efac' },
  { min: 501,  max: 1000,  name: '进阶',   icon: '🌳', color: '#fde047' },
  { min: 1001, max: 3000,  name: '老鸟',   icon: '🔥', color: '#fb923c' },
  { min: 3001, max: Infinity, name: '大佬', icon: '⭐', color: '#f472b6' },
];

function getUserLevel(points) {
  const p = Number(points) || 0;
  for (const lv of LEVELS) {
    if (p >= lv.min && p <= lv.max) return lv;
  }
  return LEVELS[0];
}

// Strip Markdown syntax from text, returns plain text
function stripMarkdown(content) {
  if (!content) return '';
  return content
    // Remove image syntax: ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove link syntax: [text](url) — keep text only
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove bold/italic markers: **text**, __text__, *text*, _text_, ~~text~~
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    // Remove inline code: `code`
    .replace(/`([^`]+)`/g, '$1')
    // Remove code blocks: ```...``` and indented code
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^    .+$/gm, '')
    // Remove blockquote markers: >
    .replace(/^>\s+/gm, '')
    // Remove heading markers: # ## ###
    .replace(/^#{1,6}\s+/gm, '')
    // Remove horizontal rules: --- or ***
    .replace(/^[-*_]{3,}$/gm, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract first image URL from Markdown/HTML content
function extractThumbnail(content) {
  if (!content) return null;
  // Markdown image: ![alt](url)
  const mdMatch = content.match(/!\[([^\]]*)\]\(([^)]+)\)/);
  if (mdMatch) return mdMatch[2];
  // HTML img tag
  const htmlMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (htmlMatch) return htmlMatch[1];
  return null;
}

function getToken() {
  return localStorage.getItem('token');
}

function dismissAnnouncement() {
  var bar = document.getElementById('announcement-bar');
  if (bar) {
    bar.style.height = '0';
    setTimeout(function() { bar.style.display = 'none'; }, 300);
    localStorage.setItem('announcement_dismissed', '1');
  }
}

// ============ Trending Panel ============
var _trendingCache = null;

async function loadTrending() {
  var el = document.getElementById('trending-list');
  if (!el) return;
  el.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:12px;">加载中...</div>';
  try {
    var res = await api('/leaderboard/hot-posts?limit=5&hours=168');
    var posts = (res && res.posts) ? res.posts : [];
    if (posts.length === 0) {
      el.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:12px;">暂无热议内容</div>';
      return;
    }
    el.innerHTML = posts.map(function(p) {
      var title = stripMarkdown(p.title || '无标题').substring(0, 22);
      var name = p.nickname || p.username || '匿名';
      var commentCount = p.comment_count || 0;
      var score = p.hot_score || 0;
      return '<div onclick="goPost(' + p.id + ')" style="display:flex;gap:8px;align-items:flex-start;padding:8px 4px;border-radius:10px;cursor:pointer;transition:background .15s;" onmouseover="this.style.background=\'#fff8f0\'" onmouseout="this.style.background=\'\'">' +
        '<span style="font-size:16px;flex-shrink:0;">🔥</span>' +
        '<div style="flex:1;min-width:0;"><div style="font-size:12px;color:#1e3a5f;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(title) + '</div><div style="font-size:11px;color:#94a3b8;margin-top:2px;">' + escapeHtml(name) + ' · 💬' + commentCount + ' · ' + score + '热度</div></div></div>';
    }).join('');
  } catch(e) {
    if (el) el.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:12px;">加载失败</div>';
  }
}

window.loadTrending = loadTrending;

function toggleTrendingDropdown() {
  var dropdown = document.getElementById('trending-dropdown');
  if (!dropdown) return;
  var isHidden = dropdown.style.display === 'none' || !dropdown.style.display;
  if (isHidden) {
    dropdown.style.display = 'block';
    var list = document.getElementById('trending-list');
    if (list && !list.innerHTML.trim()) {
      loadTrending();
    }
  } else {
    dropdown.style.display = 'none';
  }
}

document.addEventListener('click', function(e) {
  var dropdown = document.getElementById('trending-dropdown');
  var btn = document.getElementById('btn-trending');
  if (!dropdown || !btn) return;
  if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// ============ Panda FAB ============
function togglePandaMini() {
  var mini = document.getElementById('panda-mini-view');
  if (!mini) return;
  mini.style.display = mini.style.display === 'none' ? '' : 'none';
}

function togglePandaFullscreen() {
  var overlay = document.getElementById('panda-fullscreen-overlay');
  if (!overlay) return;
  overlay.style.display = overlay.style.display === 'none' ? '' : 'none';
}

window.togglePandaMini = togglePandaMini;
window.togglePandaFullscreen = togglePandaFullscreen;

function getUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  currentUser = user;
  updateNav();
  loadMsgUnreadCount();
  startMsgPolling();
  checkEmailVerifiedBanner();
}

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  updateNav();
  if (_msgPollInterval) { clearInterval(_msgPollInterval); _msgPollInterval = null; }
}

function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return fetch(`${API_BASE}${endpoint}`, { ...options, headers: { ...headers, ...options.headers } })
    .then(async (r) => {
      let data = {};
      try {
        data = await r.json();
      } catch (e) {
        data = { error: '服务器返回格式异常' };
      }

      data._status = r.status;

      // Token expired/invalid: force re-login for protected APIs
      if (r.status === 401 && endpoint !== '/auth/login' && endpoint !== '/auth/register') {
        clearAuth();
        data.error = data.error || '登录已失效，请重新登录';
        showLogin();
      }

      return data;
    });
}

function formatDate(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return d.toLocaleDateString('zh-CN');
}

function showToast(message, type = 'info', duration = 2200) {
  if (!message) return;

  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  toast.className = `app-toast ${type}`;
  toast.textContent = message;
  // Reflow so repeated messages still play the entry animation
  void toast.offsetWidth;
  toast.classList.add('show');

  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
  }
  toastHideTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

function setButtonBusy(target, busyText = '处理中...') {
  const button = typeof target === 'string' ? document.getElementById(target) : target;
  if (!button) return () => { };

  const originalText = button.textContent;
  const originalDisabled = button.disabled;
  button.disabled = true;
  button.classList.add('loading');
  button.textContent = busyText;

  return () => {
    button.disabled = originalDisabled;
    button.classList.remove('loading');
    button.textContent = originalText;
  };
}

function renderAIBubble(role, content, messageId = '') {
  const safeContent = escapeHtml(String(content || '')).replace(/\n/g, '<br>');
  const klass = role === 'user' ? 'ai-msg ai-msg-user' : 'ai-msg ai-msg-assistant';
  const idAttr = messageId ? ` data-ai-msg-id="${messageId}"` : '';
  return `<div class="${klass}"${idAttr}>${safeContent}</div>`;
}

function renderAIWelcomeMessage() {
  return renderAIBubble('assistant', '👋 你好！我是AI助手。普通用户每天100次使用额度，有什么问题尽管问我！');
}

function getPreferredAIModel() {
  return localStorage.getItem(AI_MODEL_STORAGE_KEY) || '';
}

function getPreferredAIProvider() {
  const saved = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
  if (saved && AI_PROVIDER_MODELS[saved]) return saved;
  return 'minimax';
}

function setPreferredAIModel(model) {
  if (!model) return;
  localStorage.setItem(AI_MODEL_STORAGE_KEY, model);
}

function setPreferredAIProvider(provider) {
  if (!provider || !AI_PROVIDER_MODELS[provider]) return;
  localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
}

function getModelsByProvider(provider) {
  return AI_PROVIDER_MODELS[provider]?.models || [];
}

function ensureValidAIModel(provider, model) {
  const models = getModelsByProvider(provider);
  if (models.length === 0) return '';
  if (model && models.some(item => item.value === model)) return model;
  return models[0].value;
}

function initAIModelSelector() {
  const providerSelector = document.getElementById('ai-provider-select');
  const selector = document.getElementById('ai-model-select');
  if (!providerSelector || !selector) return;

  providerSelector.innerHTML = Object.entries(AI_PROVIDER_MODELS)
    .map(([key, info]) => `<option value="${key}">${info.label}</option>`)
    .join('');

  const initProvider = getPreferredAIProvider();
  providerSelector.value = initProvider;

  const renderModelsForProvider = (provider) => {
    const models = getModelsByProvider(provider);
    selector.innerHTML = models
      .map(item => `<option value="${item.value}">${item.label}</option>`)
      .join('');
    const safeModel = ensureValidAIModel(provider, getPreferredAIModel());
    selector.value = safeModel;
    setPreferredAIProvider(provider);
    setPreferredAIModel(safeModel);
    updateAIModelHint();
  };

  renderModelsForProvider(initProvider);

  if (providerSelector.dataset.bound !== '1') {
    providerSelector.dataset.bound = '1';
    providerSelector.addEventListener('change', () => {
      renderModelsForProvider(providerSelector.value);
    });
  }

  if (selector.dataset.bound !== '1') {
    selector.dataset.bound = '1';
    selector.addEventListener('change', () => {
      const provider = providerSelector.value;
      const safeModel = ensureValidAIModel(provider, selector.value);
      selector.value = safeModel;
      setPreferredAIProvider(provider);
      setPreferredAIModel(safeModel);
      updateAIModelHint();
    });
  }
}

function getCurrentAISelection() {
  const providerSelector = document.getElementById('ai-provider-select');
  const modelSelector = document.getElementById('ai-model-select');
  const provider = providerSelector?.value || getPreferredAIProvider();
  const model = ensureValidAIModel(provider, modelSelector?.value || getPreferredAIModel());
  if (modelSelector) modelSelector.value = model;
  setPreferredAIProvider(provider);
  setPreferredAIModel(model);
  return { provider, model };
}

function getAIModelLabel(provider, modelValue) {
  const model = getModelsByProvider(provider).find(item => item.value === modelValue);
  if (model) return model.label;
  return modelValue || '未知模型';
}

function getAIProviderLabel(provider) {
  return AI_PROVIDER_MODELS[provider]?.label || provider;
}

function updateAIModelHint() {
  const selector = document.getElementById('ai-model-select');
  const providerSelector = document.getElementById('ai-provider-select');
  if (!selector || !providerSelector) return;
  const { provider, model } = getCurrentAISelection();
  const hint = `${getAIProviderLabel(provider)} / ${getAIModelLabel(provider, model)}`;
  selector.title = hint;
  providerSelector.title = hint;
}

function formatAITime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function createClientSessionId() {
  return `sess-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeSessionList(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map(item => ({
      id: String(item.id || '').trim(),
      title: String(item.title || '').trim(),
      last_message_at: item.last_message_at || '',
      turn_count: Number(item.turn_count || 0),
      provider: String(item.provider || '').toLowerCase(),
      model: String(item.model || ''),
      isDraft: !!item.isDraft
    }))
    .filter(item => !!item.id);
}

function trimSessionTitle(title) {
  const raw = String(title || '').trim();
  if (!raw) return '新会话';
  return raw.length > 26 ? `${raw.slice(0, 26)}...` : raw;
}

function renderAISessionList() {
  const list = document.getElementById('ai-session-list');
  if (!list) return;

  if (aiSessions.length === 0) {
    list.innerHTML = '<div class="ai-session-empty">暂无会话，开始提问吧</div>';
    return;
  }

  list.innerHTML = aiSessions.map((session, idx) => {
    const encodedId = encodeURIComponent(session.id);
    const activeClass = session.id === currentAISessionId ? 'active' : '';
    const title = escapeHtml(trimSessionTitle(session.title || `对话 ${idx + 1}`));
    const timePart = formatAITime(session.last_message_at);
    const modelPart = session.provider && session.model
      ? `${getAIProviderLabel(session.provider)} · ${getAIModelLabel(session.provider, session.model)}`
      : '';
    const meta = escapeHtml(modelPart || timePart || `第 ${idx + 1} 轮`);

    return `
      <div
        class="ai-session-item ${activeClass}"
        role="button"
        tabindex="0"
        onclick="openAISession('${encodedId}')"
        onkeydown="if(event.key==='Enter' || event.key===' '){event.preventDefault();openAISession('${encodedId}')}">
        <div class="ai-session-item-head">
          <div class="ai-session-item-title">${title}</div>
          <button type="button" class="ai-session-delete-btn" onclick="deleteAISession('${encodedId}', event)" aria-label="删除会话">×</button>
        </div>
        <div class="ai-session-item-meta">${meta}</div>
      </div>
    `;
  }).join('');
}

function renderAIChatMessages(chats) {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;

  if (!Array.isArray(chats) || chats.length === 0) {
    container.innerHTML = renderAIWelcomeMessage();
    return;
  }

  container.innerHTML = chats
    .map((chat, index) => renderAIBubble(chat.role === 'user' ? 'user' : 'assistant', chat.content, `msg-${index}`))
    .join('');

  container.scrollTop = container.scrollHeight;
}

function appendAIMessage(role, content, meta = '') {
  aiChatHistory.push({
    role,
    content: String(content || ''),
    meta: meta || '',
    created_at: new Date().toISOString()
  });
  renderAIChatMessages(aiChatHistory);
}

function createNewAIChat() {
  currentAISessionId = createClientSessionId();
  aiChatHistory = [];

  if (!aiSessions.some(item => item.id === currentAISessionId)) {
    aiSessions.unshift({
      id: currentAISessionId,
      title: '新会话',
      last_message_at: new Date().toISOString(),
      turn_count: 0,
      provider: '',
      model: '',
      isDraft: true
    });
  }

  renderAISessionList();
  renderAIChatMessages(aiChatHistory);
  document.getElementById('ai-input')?.focus();
}

async function openAISession(encodedId) {
  const sessionId = decodeURIComponent(String(encodedId || ''));
  if (!sessionId) return;
  currentAISessionId = sessionId;
  renderAISessionList();
  await loadAIHistory(sessionId);
}

async function deleteAISession(encodedId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const sessionId = decodeURIComponent(String(encodedId || ''));
  if (!sessionId) return;

  const ok = await askConfirm('删除后该会话不可恢复，确定继续吗？', '删除会话');
  if (!ok) return;

  const target = aiSessions.find(item => item.id === sessionId);
  if (target?.isDraft) {
    aiSessions = aiSessions.filter(item => item.id !== sessionId);
  } else {
    const res = await api(`/ai/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
  }

  if (currentAISessionId === sessionId) {
    currentAISessionId = '';
    aiChatHistory = [];
  }

  await loadAISessions();
}

function initConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  const btnOk = document.getElementById('confirm-modal-ok');
  const btnCancel = document.getElementById('confirm-modal-cancel');
  if (!modal || !btnOk || !btnCancel || modal.dataset.bound === '1') return;

  modal.dataset.bound = '1';
  btnOk.addEventListener('click', () => resolveConfirm(true));
  btnCancel.addEventListener('click', () => resolveConfirm(false));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) resolveConfirm(false);
  });
  document.addEventListener('keydown', (e) => {
    if (modal.style.display !== 'flex') return;
    if (e.key === 'Escape') resolveConfirm(false);
  });
}

function askConfirm(message, title = '确认操作') {
  initConfirmModal();
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  if (!modal || !titleEl || !msgEl) return Promise.resolve(false);

  titleEl.textContent = title;
  msgEl.textContent = message || '确定继续吗？';
  modal.style.display = 'flex';

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function resolveConfirm(value) {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.style.display = 'none';
  if (confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(!!value);
  }
}

function normalizeTheme(theme) {
  return AVAILABLE_THEMES.includes(theme) ? theme : 'mint';
}

function getStoredTheme() {
  return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'mint');
}

function applyTheme(theme, persist = true) {
  const nextTheme = normalizeTheme(theme);
  document.body.setAttribute('data-theme', nextTheme);
  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  const selector = document.getElementById('settings-theme');
  if (selector && selector.value !== nextTheme) {
    selector.value = nextTheme;
  }
}

function bindThemeSelector() {
  const selector = document.getElementById('settings-theme');
  if (!selector || selector.dataset.bound === '1') return;

  selector.dataset.bound = '1';
  selector.addEventListener('change', () => {
    applyTheme(selector.value, true);
    showToast('主题已切换', 'success');
  });
}

// ============ i18n ============
window._i18n = { lang: 'zh', translations: {} };

async function loadI18n(lang) {
  lang = lang || localStorage.getItem('lang') || 'zh';
  try {
    const res = await fetch('/api/i18n/t?lang=' + lang);
    const data = await res.json();
    window._i18n.lang = data.lang;
    window._i18n.translations = data.translations || {};
    localStorage.setItem('lang', data.lang);
    // Update lang selector if exists
    const sel = document.getElementById('settings-lang');
    if (sel) sel.value = data.lang;
  } catch (e) {
    console.warn('[i18n] load failed:', e);
  }
}

function t(key) {
  const keys = key.split('.');
  let val = window._i18n.translations;
  for (const k of keys) {
    if (val && typeof val === 'object' && k in val) {
      val = val[k];
    } else {
      return key;
    }
  }
  return val;
}

function handleLangChange(lang) {
  loadI18n(lang);
  applyI18n();
  showToast(lang === 'zh' ? '语言已切换为简体中文' : 'Language set to English', 'success');
}

function applyI18n() {
  // Apply translations to data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
}

// Navigation
function dismissEmailBanner() {
  var banner = document.getElementById('email-verify-banner');
  if (banner) {
    banner.style.display = 'none';
    localStorage.setItem('emailBannerDismissed', '1');
  }
}

function checkEmailVerifiedBanner() {
  var user = getUser();
  var banner = document.getElementById('email-verify-banner');
  if (!banner) return;
  var dismissed = localStorage.getItem('emailBannerDismissed');
  if (!user || user.email_verified) {
    banner.style.display = 'none';
    return;
  }
  // Show only if not permanently dismissed
  if (dismissed !== '1') {
    banner.style.display = 'flex';
  }
}

function openSettingsTab(tab) {
  showView('settings');
  // Scroll to email section if specified
  setTimeout(function() {
    var emailArea = document.getElementById('email-bind-area');
    if (emailArea) emailArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function updateNav() {
  const user = getUser();
  document.getElementById('nav-login').style.display = user ? 'none' : 'inline-block';
  document.getElementById('nav-register').style.display = user ? 'none' : 'inline-block';
  var userMenu = document.getElementById('nav-user-menu');
  if (userMenu) userMenu.style.display = user ? 'block' : 'none';
  document.getElementById('nav-ai').style.display = user ? 'inline-block' : 'none';
  document.getElementById('nav-notif').style.display = user ? 'inline-block' : 'none';
  document.getElementById('nav-toolbox').style.display = 'inline-block';
  document.getElementById('nav-rss').style.display = 'inline-block';
  var btnNewPost = document.getElementById('btn-new-post');
  if (btnNewPost) btnNewPost.style.display = user ? 'inline-block' : 'none';
  var fabPublish = document.getElementById('fab-publish');
  if (fabPublish) fabPublish.style.display = user ? 'flex' : 'none';
  var fabContainer = document.getElementById('panda-fab-container');
  if (fabContainer) fabContainer.style.display = user ? 'block' : 'none';

  if (user) {
    // Update avatar button
    var icon = document.getElementById('nav-avatar-icon');
    var nameEl = document.getElementById('nav-username');
    if (icon) icon.textContent = ((user.nickname || user.username)[0] || '?').toUpperCase();
    if (nameEl) nameEl.textContent = user.nickname || user.username;
    var adminItem = document.getElementById('dd-admin');
    if (adminItem) adminItem.style.display = (user.role === 'admin') ? 'block' : 'none';

    loadNotifCount();
    if (!window._notifPollInterval) {
      window._notifPollInterval = setInterval(loadNotifCount, 30000);
    }
  } else {
    if (window._notifPollInterval) {
      clearInterval(window._notifPollInterval);
      window._notifPollInterval = null;
    }
    closeUserMenu();
  }
}

function toggleUserMenu() {
  var dd = document.getElementById('user-dropdown');
  if (!dd) return;
  dd.style.display = dd.style.display === 'none' ? '' : 'none';
}

function closeUserMenu() {
  var dd = document.getElementById('user-dropdown');
  if (dd) dd.style.display = 'none';
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  var menu = document.getElementById('nav-user-menu');
  if (menu && !menu.contains(e.target)) {
    closeUserMenu();
  }
});

window.toggleUserMenu = toggleUserMenu;
window.closeUserMenu = closeUserMenu;

function goToolbox() {
  window.open('/toolbox', '_blank');
}

function setBottomNav(name) {
  var items = ['bn-home', 'bn-ai', 'bn-notif', 'bn-profile'];
  items.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === 'bn-' + name);
  });
}

function goHome() {
  setBottomNav('home');
  checkEmailVerifiedBanner();
  showView('home');
  loadPosts();
  loadTrending();
  // Show panda FAB on home
  var fab = document.getElementById('panda-fab-container');
  if (fab) fab.style.display = '';
}

function goProfile() {
  setBottomNav('profile');
  const user = getUser();
  if (!user) return showLogin();
  showView('profile');
  loadProfile(user.id);
}

// ============ Profile & Follow ============
async function loadProfile(userId) {
  try {
    var [userRes, followRes, postsRes] = await Promise.all([
      api('/users/' + userId),
      followStatus(userId),
      api('/posts?user_id=' + userId + '&limit=10')
    ]);

    if (userRes.error) { showToast(userRes.error, 'error'); return; }

    var user = userRes;
    var level = getUserLevel(user.points || 0);
    var avatar = user.avatar
      ? '<img src="' + user.avatar + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : '<span style="font-size:28px;font-weight:700;">' + (user.nickname || user.username)[0].toUpperCase() + '</span>';
    var currentUser = getUser();
    var isMe = currentUser && currentUser.id === userId;
    var isFollowing = followRes && followRes.is_following;

    var followBtn = '';
    if (!isMe && currentUser) {
      followBtn = isFollowing
        ? '<button onclick="toggleFollow(' + userId + ', this)" class="following-btn following-btn-active" id="follow-btn-' + userId + '">✓ 已关注</button>'
        : '<button onclick="toggleFollow(' + userId + ', this)" class="following-btn" id="follow-btn-' + userId + '">+ 关注</button>';
    }

    var html = '<div class="profile-header">';
    html += '  <div class="profile-avatar" style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,' + (level.color || '#667eea') + ',#764ba2);display:flex;align-items:center;justify-content:center;overflow:hidden;color:#fff;font-size:28px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,0.1);">' + avatar + '</div>';
    html += '  <div class="profile-info">';
    html += '    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">';
    html += '      <h2 style="font-size:20px;font-weight:700;color:var(--text);margin:0;">' + escapeHtml(user.nickname || user.username) + '</h2>';
    html += '      <span class="level-badge" style="background:' + (level.color || '#667eea') + ';color:#fff;font-size:11px;padding:2px 8px;border-radius:999px;margin:0;">Lv.' + level.level + '</span>';
    html += followBtn;
    html += '    </div>';
    html += '    <div style="font-size:12px;color:#94a3b8;margin-top:4px;">@' + escapeHtml(user.username) + ' · 注册于 ' + formatDate(user.created_at) + '</div>';
    html += '    <div style="display:flex;gap:16px;margin-top:8px;font-size:13px;color:#64748b;">';
    html += '      <span><strong style="color:var(--text);">' + (user.points || 0) + '</strong> 积分</span>';
    html += '      <span style="cursor:pointer;" onclick="showFollowers(' + userId + ')"><strong style="color:var(--text);">' + (followRes.followers_count || 0) + '</strong> 粉丝</span>';
    html += '      <span style="cursor:pointer;" onclick="showFollowing(' + userId + ')"><strong style="color:var(--text);">' + (followRes.following_count || 0) + '</strong> 关注</span>';
    html += '    </div>';
    if (user.bio) {
      html += '    <div style="margin-top:8px;font-size:13px;color:#64748b;line-height:1.6;">' + escapeHtml(user.bio) + '</div>';
    }
    html += '  </div>';
    html += '</div>';
    html += '<div style="margin-top:16px;"><h3 style="font-size:15px;color:var(--text);margin-bottom:12px;">Ta 的帖子</h3>';
    html += '<div id="profile-posts-list"></div></div>';

    var el = document.getElementById('profile-content');
    if (el) { el.innerHTML = html; }

    // Render posts
    var postsEl = document.getElementById('profile-posts-list');
    if (postsEl && postsRes.posts && postsRes.posts.length > 0) {
      postsEl.innerHTML = postsRes.posts.map(function(p) {
        return '<div class="post-card" onclick="viewPost(' + p.id + ')" style="cursor:pointer;">' +
          '<div class="post-title">' + escapeHtml(p.title) + '</div>' +
          '<div style="font-size:12px;color:#94a3b8;margin-top:4px;">👍 ' + (p.like_count||0) + ' 💬 ' + (p.comment_count||0) + ' · ' + formatDate(p.created_at) + '</div></div>';
      }).join('');
    } else if (postsEl) {
      postsEl.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px;">暂无帖子</div>';
    }

    window._currentProfileUserId = userId;
  } catch (e) {
    console.error(e);
  }
}

async function followStatus(userId) {
  try {
    return await api('/follow/status/' + userId);
  } catch (e) { return { is_following: false, followers_count: 0, following_count: 0 }; }
}

async function toggleFollow(userId, btnEl) {
  var user = getUser();
  if (!user) { showLogin(); return; }
  try {
    var status = await followStatus(userId);
    if (status.is_following) {
      await api('/follow/' + userId, { method: 'DELETE' });
      if (btnEl) { btnEl.textContent = '+ 关注'; btnEl.classList.remove('following-btn-active'); }
      showToast('已取消关注', 'success');
    } else {
      await api('/follow/' + userId, { method: 'POST' });
      if (btnEl) { btnEl.textContent = '✓ 已关注'; btnEl.classList.add('following-btn-active'); }
      showToast('关注成功', 'success');
    }
    // Refresh counts
    loadProfile(userId);
  } catch (e) { showToast('操作失败', 'error'); }
}

function showFollowers(userId) {
  showFollowModal(userId, 'followers');
}

function showFollowing(userId) {
  showFollowModal(userId, 'following');
}

async function showFollowModal(userId, type) {
  var title = type === 'followers' ? '粉丝' : '关注';
  var list = type === 'followers'
    ? await api('/follow/followers/' + userId)
    : await api('/follow/following/' + userId);
  var users = list.users || [];

  var html = '<div id="follow-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target.id===\'follow-modal\')this.remove();">';
  html += '<div style="background:#fff;border-radius:16px;width:100%;max-width:400px;max-height:500px;overflow-y:auto;padding:20px;">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
  html += '<h3 style="margin:0;font-size:16px;color:var(--text);">' + title + '</h3>';
  html += '<button onclick="document.getElementById(\'follow-modal\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#94a3b8;padding:4px;">×</button>';
  html += '</div>';
  if (users.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#94a3b8;">暂无' + title + '</div>';
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:10px;">';
    users.forEach(function(u) {
      html += '<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;background:#f8fafc;" onclick="viewOtherProfile(' + u.id + ')">';
      html += '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;overflow:hidden;flex-shrink:0;">' + (u.avatar ? '<img src="' + u.avatar + '" style="width:100%;height:100%;object-fit:cover;">' : (u.nickname||u.username)[0].toUpperCase()) + '</div>';
      html += '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;color:var(--text);">' + escapeHtml(u.nickname || u.username) + '</div><div style="font-size:11px;color:#94a3b8;">' + (u.points||0) + ' 积分</div></div>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function viewOtherProfile(userId) {
  document.getElementById('follow-modal').remove();
  showView('profile');
  loadProfile(userId);
}

// ============ Points Transfer ============"" 
async function submitTransfer() {
  var user = getUser();
  if (!user) { showToast('请先登录', 'error'); return; }

  var username = document.getElementById('transfer-username').value.trim();
  var amount = document.getElementById('transfer-amount').value.trim();
  var note = document.getElementById('transfer-note').value.trim();
  var resultEl = document.getElementById('transfer-result');

  if (!username) { showToast('请输入对方用户名', 'error'); return; }
  if (!amount || parseInt(amount) <= 0) { showToast('请输入正确的转账积分', 'error'); return; }

  try {
    var res = await api('/points/transfer', {
      method: 'POST',
      body: JSON.stringify({ to_username: username, amount: parseInt(amount), note: note })
    });
    if (res.error) {
      resultEl.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:8px 0;">' + res.error + '</div>';
      showToast(res.error, 'error');
      return;
    }
    resultEl.innerHTML = '<div style="color:#10b981;font-size:13px;padding:8px 0;">转账成功！已向 ' + escapeHtml(username) + ' 转账 ' + amount + ' 积分</div>';
    document.getElementById('transfer-username').value = '';
    document.getElementById('transfer-amount').value = '';
    document.getElementById('transfer-note').value = '';
    // Reload profile to update displayed points
    loadSettings();
    loadTransferRecords();
    // Refresh current view if on profile
    if (typeof loadProfile === 'function' && window._currentProfileUserId) {
      loadProfile(window._currentProfileUserId);
    }
  } catch (e) {
    resultEl.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:8px 0;">转账失败，请稍后重试</div>';
  }
}

async function loadTransferRecords() {
  var el = document.getElementById('transfer-records');
  if (!el) return;
  var user = getUser();
  if (!user) { el.innerHTML = ''; return; }

  try {
    var res = await api('/points/transfers');
    if (res.error) { el.innerHTML = ''; return; }

    var sent = res.sent || [];
    var received = res.received || [];

    var html = '<div style="margin-top:12px;">';
    html += '<div style="display:flex;gap:0;background:#f0f2ff;border-radius:10px;padding:3px;margin-bottom:10px;">';
    html += '<button id="tab-sent-btn" class="checkin-sub-tab active" onclick="switchTransferTab(\'sent\')" style="flex:1;padding:6px;border:none;border-radius:7px;background:transparent;font-size:12px;font-weight:600;cursor:pointer;color:#667eea;">📤 我转出的</button>';
    html += '<button id="tab-received-btn" class="checkin-sub-tab" onclick="switchTransferTab(\'received\')" style="flex:1;padding:6px;border:none;border-radius:7px;background:transparent;font-size:12px;font-weight:600;cursor:pointer;color:#94a3b8;">📥 我收到的</button>';
    html += '</div>';
    html += '<div id="transfer-sent-list"></div>';
    html += '<div id="transfer-received-list" style="display:none;"></div>';
    html += '</div>';

    el.innerHTML = html;

    renderTransferList('sent', sent);
    renderTransferList('received', received);
  } catch (e) {
    el.innerHTML = '';
  }
}

function renderTransferList(type, records) {
  var el = document.getElementById('transfer-' + type + '-list');
  if (!records || records.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px;">暂无记录</div>';
    return;
  }
  el.innerHTML = records.map(function(r) {
    var otherName = type === 'sent' ? (r.to_nickname || r.to_username) : (r.from_nickname || r.from_username);
    var otherAvatar = type === 'sent' ? r.to_avatar : r.from_avatar;
    var lvl = { color: '#667eea' };
    var avatar = otherAvatar
      ? '<img src="' + otherAvatar + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">'
      : '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">' + ((otherName || '?')[0] || '?').toUpperCase() + '</div>';
    var sign = type === 'sent' ? '-' : '+';
    var color = type === 'sent' ? '#ef4444' : '#10b981';
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f4f8;">' +
      avatar +
      '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;color:#1e3a5f;">' + escapeHtml(otherName) + '</div><div style="font-size:11px;color:#94a3b8;">' + formatDate(r.created_at) + (r.note ? ' · ' + escapeHtml(r.note) : '') + '</div></div>' +
      '<div style="font-size:14px;font-weight:800;color:' + color + ';">' + sign + r.amount + '</div>' +
      '</div>';
  }).join('');
}

function switchTransferTab(tab) {
  var sentList = document.getElementById('transfer-sent-list');
  var receivedList = document.getElementById('transfer-received-list');
  var sentBtn = document.getElementById('tab-sent-btn');
  var receivedBtn = document.getElementById('tab-received-btn');
  if (tab === 'sent') {
    sentList.style.display = '';
    receivedList.style.display = 'none';
    sentBtn.style.background = 'transparent'; sentBtn.style.color = '#667eea'; sentBtn.classList.add('active');
    receivedBtn.style.background = 'transparent'; receivedBtn.style.color = '#94a3b8'; receivedBtn.classList.remove('active');
  } else {
    sentList.style.display = 'none';
    receivedList.style.display = '';
    receivedBtn.style.background = 'transparent'; receivedBtn.style.color = '#667eea'; receivedBtn.classList.add('active');
    sentBtn.style.background = 'transparent'; sentBtn.style.color = '#94a3b8'; sentBtn.classList.remove('active');
  }
}

window.submitTransfer = submitTransfer;
window.loadTransferRecords = loadTransferRecords;
window.switchTransferTab = switchTransferTab;

function goSettings() {
  const user = getUser();
  if (!user) return showLogin();
  showView('settings');
  loadSettings();
  loadTransferRecords();
}

function goActionLogs() {
  const user = getUser();
  if (!user) return showLogin();
  showView('action-logs');
  loadActionLogs(1);
}

let actionLogsPage = 1;
let actionLogsCache = [];

function loadActionLogs(page) {
  actionLogsPage = page || 1;
  api('/api/profile/action-logs?page=' + actionLogsPage + '&limit=20')
    .then(data => {
      if (data.error) { showToast(data.error, 'error'); return; }
      actionLogsCache = data.logs || [];
      renderActionLogs(data);
    })
    .catch(() => showToast('加载操作记录失败', 'error'));
}

function renderActionLogs(data) {
  const el = document.getElementById('action-logs-list');
  if (!actionLogsCache.length) {
    el.innerHTML = '<div style="padding:30px;text-align:center;color:#888;font-size:14px;">暂无操作记录</div>';
    document.getElementById('action-logs-pagination').innerHTML = '';
    return;
  }
  const actionNames = {
    'view_post': '👁️ 浏览帖子',
    'create_post': '📝 发布帖子',
    'delete_post': '🗑️ 删除帖子',
    'admin_delete_post': '🗑️ 管理员删除帖子',
    'create_comment': '💬 发布评论',
    'delete_comment': '🗑️ 删除评论',
    'admin_delete_comment': '🗑️ 管理员删除评论',
    'user_register': '🎉 注册账号',
    'user_login': '🔐 登录',
    'transfer_points': '💸 积分转账',
    'checkin': '✅ 每日签到',
    'receive_points': '🎁 获得积分',
  };
  const actionColors = {
    'create_post': '#10b981',
    'delete_post': '#ef4444',
    'admin_delete_post': '#ef4444',
    'create_comment': '#10b981',
    'delete_comment': '#ef4444',
    'admin_delete_comment': '#ef4444',
    'transfer_points': '#f59e0b',
    'checkin': '#10b981',
    'receive_points': '#10b981',
  };
  let html = '<div style="display:flex;flex-direction:column;gap:10px;">';
  for (const log of actionLogsCache) {
    const actionName = actionNames[log.action] || log.action;
    const color = actionColors[log.action] || '#667eea';
    const time = new Date(log.created_at).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f8fafc;border-radius:10px;border-left:3px solid ' + color + ';">';
    html += '<div>';
    html += '<span style="font-weight:600;font-size:13px;color:#334155;">' + actionName + '</span>';
    if (log.details) html += '<div style="font-size:12px;color:#64748b;margin-top:2px;">' + escapeHtml(log.details) + '</div>';
    html += '</div>';
    html += '<div style="font-size:11px;color:#94a3b8;white-space:nowrap;margin-left:12px;">' + time + '</div>';
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;

  // Pagination
  const totalPages = data.pages || 1;
  const pg = document.getElementById('action-logs-pagination');
  if (totalPages <= 1) { pg.innerHTML = ''; return; }
  let pgHtml = '';
  if (actionLogsPage > 1) pgHtml += '<button class="btn-secondary" onclick="loadActionLogs(' + (actionLogsPage - 1) + ')">上一页</button>';
  pgHtml += '<span style="padding:0 12px;font-size:13px;color:#64748b;">第 ' + actionLogsPage + ' / ' + totalPages + ' 页</span>';
  if (actionLogsPage < totalPages) pgHtml += '<button class="btn-secondary" onclick="loadActionLogs(' + (actionLogsPage + 1) + ')">下一页</button>';
  pg.innerHTML = pgHtml;
}

function goCheckin() {
  const user = getUser();
  if (!user) return showLogin();
  showView('settings');
  switchCheckinTab('sign');
  loadCheckinStatus();
}

function goApply() {
  window.location.href = '/apply.html';
}

function goAdmin() {
  var user = getUser();
  if (user && user.role === 'admin') {
    window.location.href = '/admin-login';
  } else {
    showToast('只有管理员才能访问后台', 'error');
  }
}

function parseUrlFilters() {
  var params = new URLSearchParams(window.location.search);
  if (params.get("sort")) {
    currentSort = params.get("sort");
    var sel = document.getElementById("sort-select");
    if (sel) sel.value = currentSort;
  }
  if (params.get("time_range")) {
    currentTimeRange = params.get("time_range");
    var tsel = document.getElementById("time-select");
    if (tsel) tsel.value = currentTimeRange;
  }
  if (params.get("points_min") && params.get("points_max")) {
    currentPointsRange = params.get("points_min") + "-" + params.get("points_max");
    var psel = document.getElementById("points-range-select");
    if (psel) psel.value = currentPointsRange;
  }
  if (params.get("search")) {
    var inp = document.getElementById("search-input");
    if (inp) inp.value = params.get("search");
  }
}

function showView(name) {
  document.querySelectorAll('[id^="view-"]').forEach(el => el.style.display = 'none');
  const target = document.getElementById(`view-${name}`);
  if (!target) return;

  // Home keeps CSS-driven layout (including desktop grid), other views force show.
  target.style.display = name === 'home' ? '' : 'block';
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`nav-${name === 'home' ? 'home' : name}`)?.classList.add('active');
  // Update bottom nav active state
  setBottomNav(name);
  const isHome = name === 'home';
  document.body.classList.toggle('home-view-active', isHome);

  // Toggle panda FAB visibility - show only on home
  const fab = document.getElementById('panda-fab-container');
  if (fab) fab.style.display = isHome ? '' : 'none';

  if (isHome) {
    parseUrlFilters();
    initPetalRain();
  }
}

// Auth Modal
function showLogin() {
  document.getElementById('auth-modal').style.display = 'flex';
  document.getElementById('auth-form-login').style.display = 'block';
  document.getElementById('auth-form-register').style.display = 'none';
  const usernameInput = document.getElementById('login-username');
  if (usernameInput) {
    setTimeout(() => usernameInput.focus(), 20);
  }
}

function showRegister() {
  closeModal();
  // Set anti-bot timestamp when form is first shown
  var tsInput = document.getElementById('reg-form-ts');
  if (tsInput) tsInput.value = Date.now().toString();
  goApply();
}

function closeModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

function switchToRegister() {
  showRegister();
}

function switchToLogin() {
  showLogin();
}

// ============ FORGOT PASSWORD ============
function showForgotPassword() {
  const loginForm = document.getElementById('auth-form-login');
  const registerForm = document.getElementById('auth-form-register');
  const forgotForm = document.getElementById('auth-form-forgot');
  if (!forgotForm) return;
  if (loginForm) loginForm.style.display = 'none';
  if (registerForm) registerForm.style.display = 'none';
  forgotForm.style.display = 'block';
  const verifyRow = document.getElementById('forgot-verify-row');
  const btnSend = document.getElementById('btn-forgot-send');
  const btnReset = document.getElementById('btn-forgot-reset');
  const msg = document.getElementById('forgot-msg');
  if (verifyRow) verifyRow.style.display = 'none';
  if (btnSend) btnSend.style.display = 'inline-block';
  if (btnReset) btnReset.style.display = 'none';
  if (msg) msg.textContent = '';
  const emailInput = document.getElementById('forgot-email');
  const codeInput = document.getElementById('forgot-code');
  const passInput = document.getElementById('forgot-new-password');
  if (emailInput) emailInput.value = '';
  if (codeInput) codeInput.value = '';
  if (passInput) passInput.value = '';
}

function switchToLoginFromForgot() {
  document.getElementById('auth-form-forgot').style.display = 'none';
  document.getElementById('auth-form-login').style.display = 'block';
}

let forgotCountdown = 0;
let forgotTimer = null;

async function forgotSendCode() {
  const email = document.getElementById('forgot-email').value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    document.getElementById('forgot-msg').style.color = '#ef4444';
    document.getElementById('forgot-msg').textContent = '请输入正确的邮箱地址';
    return;
  }

  const btn = document.getElementById('btn-forgot-send');
  btn.disabled = true;
  btn.textContent = '发送中...';

  try {
    const res = await fetch(`${API_BASE}/email/forgot/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    }).then(r => r.json());

    if (res.error) {
      document.getElementById('forgot-msg').style.color = '#ef4444';
      document.getElementById('forgot-msg').textContent = res.error;
      return;
    }

    document.getElementById('forgot-msg').style.color = '#10b981';
    document.getElementById('forgot-msg').textContent = res.message;
    document.getElementById('forgot-verify-row').style.display = 'block';
    document.getElementById('btn-forgot-send').style.display = 'none';
    document.getElementById('btn-forgot-reset').style.display = 'inline-block';
    document.getElementById('forgot-code').focus();

    // Countdown
    forgotCountdown = 60;
    clearInterval(forgotTimer);
    updateForgotCountdown();
  } catch (e) {
    document.getElementById('forgot-msg').style.color = '#ef4444';
    document.getElementById('forgot-msg').textContent = '发送失败，请稍后重试';
  } finally {
    btn.disabled = false;
    btn.textContent = '发送验证码';
  }
}

function updateForgotCountdown() {
  const el = document.getElementById('forgot-msg');
  if (!el) return;
  if (forgotCountdown <= 0) {
    el.textContent = '';
    forgotTimer = null;
    return;
  }
  el.textContent = `${forgotCountdown}s 后可重新发送`;
  el.style.color = '#888';
  forgotCountdown--;
  forgotTimer = setTimeout(updateForgotCountdown, 1000);
}

async function forgotResetPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  const code = document.getElementById('forgot-code').value.trim();
  const password = document.getElementById('forgot-new-password').value;
  const confirmPassword = document.getElementById('forgot-confirm-password').value;

  if (!code || code.length !== 6) {
    document.getElementById('forgot-msg').style.color = '#ef4444';
    document.getElementById('forgot-msg').textContent = '请输入6位验证码';
    return;
  }

  if (password.length < 6) {
    document.getElementById('forgot-msg').style.color = '#ef4444';
    document.getElementById('forgot-msg').textContent = '密码长度不能少于6位';
    return;
  }

  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    document.getElementById('forgot-msg').style.color = '#ef4444';
    document.getElementById('forgot-msg').textContent = '密码必须包含大小写字母和数字';
    return;
  }

  if (password !== confirmPassword) {
    document.getElementById('forgot-msg').style.color = '#ef4444';
    document.getElementById('forgot-msg').textContent = '两次输入的密码不一致';
    return;
  }

  const btn = document.getElementById('btn-forgot-reset');
  btn.disabled = true;
  btn.textContent = '重置中...';

  try {
    const res = await fetch(`${API_BASE}/email/forgot/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, password })
    }).then(r => r.json());

    if (res.error) {
      document.getElementById('forgot-msg').style.color = '#ef4444';
      document.getElementById('forgot-msg').textContent = res.error;
      return;
    }

    document.getElementById('forgot-msg').style.color = '#10b981';
    document.getElementById('forgot-msg').textContent = '密码重置成功！即将跳转登录...';

    setTimeout(() => {
      switchToLoginFromForgot();
      document.getElementById('login-password').value = password;
      showToast('请使用新密码登录', 'success');
    }, 1500);
  } catch (e) {
    document.getElementById('forgot-msg').style.color = '#ef4444';
    document.getElementById('forgot-msg').textContent = '重置失败，请稍后重试';
  } finally {
    btn.disabled = false;
    btn.textContent = '重置密码';
  }
}

function initModalInteractions() {
  const modalMap = [
    { id: 'auth-modal', close: closeModal },
    { id: 'ai-modal', close: closeAIChat },
    { id: 'notif-modal', close: closeNotifications },
    { id: 'captcha-modal', close: closeCaptchaModal }
  ];

  modalMap.forEach(({ id, close }) => {
    const modal = document.getElementById(id);
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  });

  if (document.body.dataset.modalEscBound !== '1') {
    document.body.dataset.modalEscBound = '1';
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const modalOrder = [
        { id: 'confirm-modal', close: () => resolveConfirm(false) },
        { id: 'captcha-modal', close: closeCaptchaModal },
        { id: 'ai-modal', close: closeAIChat },
        { id: 'notif-modal', close: closeNotifications },
        { id: 'auth-modal', close: closeModal }
      ];
      for (const item of modalOrder) {
        const modal = document.getElementById(item.id);
        if (modal && modal.style.display === 'flex') {
          item.close();
          break;
        }
      }
    });
  }

  const loginPassword = document.getElementById('login-password');
  if (loginPassword && loginPassword.dataset.bound !== '1') {
    loginPassword.dataset.bound = '1';
    loginPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        login();
      }
    });
  }

  const registerPassword = document.getElementById('register-password');
  if (registerPassword && registerPassword.dataset.bound !== '1') {
    registerPassword.dataset.bound = '1';
    registerPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        register();
      }
    });
  }
}

// Captcha - In-page modal version
let captchaCallback = null;
let captchaSolved = false;
let captchaTargetX = 0;
let captchaToken = '';
let isCaptchaDragging = false;
let captchaStartX = 0;
let currentCaptchaX = 0;

const CAPTCHA_THRESHOLD = 12;
const captchaIcons = ['→', '↑', '←', '↓', '➤', '▲', '◀', '▼'];
const CAPTCHA_HINT_TEXT = '请拖动滑块完成验证';

async function openCaptcha(callback) {
  captchaCallback = callback;
  captchaSolved = false;
  window._captchaPassed = false;
  try {
    const res = await api('/captcha/challenge');
    captchaToken = res.token;
    captchaTargetX = res.targetX;
  } catch (e) {
    showToast('验证服务异常，请重试', 'error');
    return;
  }
  document.getElementById('captcha-modal').style.display = 'flex';
  initCaptchaModal();
}

function closeCaptchaModal() {
  document.getElementById('captcha-modal').style.display = 'none';
  captchaSolved = false;
  captchaCallback = null;
}

function initCaptchaModal() {
  captchaSolved = false;
  const btn = document.getElementById('captchaConfirmBtn');
  const msg = document.getElementById('captchaMsg');
  const thumb = document.getElementById('captchaSliderThumb');
  const track = document.getElementById('captchaSliderTrack');

  btn.disabled = true;
  msg.className = 'captcha-msg';
  msg.textContent = CAPTCHA_HINT_TEXT;
  thumb.style.left = '0px';
  thumb.classList.remove('success');
  thumb.querySelector('span').textContent = '⇀';
  track.classList.remove('success');

  // Random icon
  document.getElementById('captchaIcon').textContent = captchaIcons[Math.floor(Math.random() * captchaIcons.length)];

  // Random target position
  const container = document.getElementById('captchaContainer');
  captchaTargetX = 25 + Math.floor(Math.random() * (container.offsetWidth - 100));

  const piece = document.getElementById('captchaPiece');
  piece.style.display = 'flex';
  piece.style.left = captchaTargetX + 'px';
  piece.style.top = (container.offsetHeight / 2 - 25) + 'px';
  piece.innerHTML = document.getElementById('captchaIcon').textContent;
}

function startCaptchaDrag(e) {
  if (captchaSolved) return;
  isCaptchaDragging = true;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  captchaStartX = clientX;
  const thumb = document.getElementById('captchaSliderThumb');
  thumb.querySelector('span').textContent = '⟿';
  thumb.style.cursor = 'grabbing';
  e.preventDefault();
}

function doCaptchaDrag(e) {
  if (!isCaptchaDragging || captchaSolved) return;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  currentCaptchaX = clientX;
  const delta = currentCaptchaX - captchaStartX;
  const track = document.getElementById('captchaSliderTrack');
  const maxX = track.offsetWidth - 50;
  let newX = Math.max(0, Math.min(delta, maxX));
  document.getElementById('captchaSliderThumb').style.left = newX + 'px';
  e.preventDefault();
}

async function endCaptchaDrag() {
  if (!isCaptchaDragging || captchaSolved) return;
  isCaptchaDragging = false;
  const thumb = document.getElementById('captchaSliderThumb');
  const track = document.getElementById('captchaSliderTrack');
  const finalX = parseInt(thumb.style.left) || 0;
  const msg = document.getElementById('captchaMsg');
  thumb.style.cursor = 'grab';

  // Server-side verification first
  if (captchaToken) {
    try {
      const res = await api('/captcha/verify', {
        method: 'POST',
        body: JSON.stringify({ token: captchaToken, slideX: finalX })
      });
      if (res && res.ok) {
        captchaSolved = true;
        window._captchaToken = captchaToken; // Save before clearing
        captchaToken = '';
        thumb.classList.add('success');
        track.classList.add('success');
        thumb.querySelector('span').textContent = '✓';
        const btn = document.getElementById('captchaConfirmBtn');
        btn.disabled = false;
        msg.className = 'captcha-msg success';
        msg.textContent = '验证成功，点击继续';
        return;
      }
    } catch (_) {}
    // Token consumed (fail or error), clear it for retry
    captchaToken = '';
  }

  // Fallback: client-side tolerance check
  if (Math.abs(finalX - captchaTargetX) <= CAPTCHA_THRESHOLD) {
    captchaSolved = true;
    thumb.classList.add('success');
    track.classList.add('success');
    thumb.querySelector('span').textContent = '✓';
    const btn = document.getElementById('captchaConfirmBtn');
    btn.disabled = false;
    msg.className = 'captcha-msg success';
    msg.textContent = '验证成功，点击继续';
  } else {
    thumb.style.left = '0px';
    thumb.querySelector('span').textContent = '⇀';
    msg.className = 'captcha-msg error';
    msg.textContent = '位置不对，再试一次';
    setTimeout(() => {
      if (!captchaSolved) {
        msg.className = 'captcha-msg';
        msg.textContent = CAPTCHA_HINT_TEXT;
      }
    }, 1400);
  }
}

function confirmCaptchaModal() {
  if (!captchaSolved) {
    showToast('请先完成验证', 'error');
    return;
  }
  if (!captchaCallback) {
    showToast('验证已过期，请重新打开', 'error');
    return;
  }
  const callback = captchaCallback; // Save callback before clearing
  window._captchaPassed = true; // Set flag BEFORE closing
  closeCaptchaModal();
  try {
    callback();
  } catch (e) {
    showToast('操作失败，请重试', 'error');
    console.error(e);
  }
}

// Touch and mouse events for captcha slider
const sliderThumb = document.getElementById('captchaSliderThumb');
const sliderTrack = document.getElementById('captchaSliderTrack');

sliderThumb.addEventListener('mousedown', startCaptchaDrag);
sliderThumb.addEventListener('touchstart', startCaptchaDrag, { passive: false });
document.addEventListener('mousemove', doCaptchaDrag);
document.addEventListener('touchmove', doCaptchaDrag, { passive: false });
document.addEventListener('mouseup', endCaptchaDrag);
document.addEventListener('touchend', endCaptchaDrag);
sliderTrack.addEventListener('click', (e) => {
  if (e.target === sliderThumb || e.target === sliderTrack) {
    const rect = sliderTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left - 25;
    const maxX = rect.width - 50;
    let newX = Math.max(0, Math.min(clickX, maxX));
    document.getElementById('captchaSliderThumb').style.left = newX + 'px';
  }
});

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) {
    showToast('请填写用户名和密码', 'error');
    return;
  }

  // Use a saved state from confirmCaptchaModal to avoid race condition
  if (!window._captchaPassed) {
    openCaptcha(() => login());
    return;
  }
  window._captchaPassed = false;

  const resetLoginBtn = setButtonBusy('btn-login-submit', '登录中...');
  try {
    const res = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    setAuth(res.token, res.user);
    closeModal();
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    showToast('登录成功，欢迎回来', 'success');
  } catch (e) {
    console.error(e);
    showToast(e?.message || '登录失败', 'error');
  } finally {
    resetLoginBtn();
  }
}

// ============ Registration with Email Verification ============
let regVerifyEmail = '';
let regCodeCountdown = 0;
let regCodeTimer = null;

function updateRegStep(step) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('reg-step-' + i);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < step) el.classList.add('done');
    else if (i === step) el.classList.add('active');
  }
}

async function sendRegCode() {
  const emailInput = document.getElementById('register-email');
  const email = emailInput ? emailInput.value.trim() : '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) { showToast('请先填写邮箱', 'error'); return; }
  if (!emailRegex.test(email)) { showToast('邮箱格式不正确', 'error'); return; }

  const btn = document.getElementById('btn-reg-send-code');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '发送中...';

  const username = document.getElementById('register-username') ? document.getElementById('register-username').value.trim() : '';
  const password = document.getElementById('register-password') ? document.getElementById('register-password').value : '';
  const hp = document.getElementById('reg-website') ? document.getElementById('reg-website').value : '';
  const ts = document.getElementById('reg-form-ts') ? document.getElementById('reg-form-ts').value : '';

  // Helper: actually send the code request
  async function doSendCode(captchaToken) {
    const res = await fetch('/auth/send-register-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password, __hp: hp, __ts: ts, captchaToken: captchaToken || undefined })
    });
    return res.json();
  }

  try {
    const data = await doSendCode();

    // Server says CAPTCHA required — open it and retry with token
    if (data.captchaRequired) {
      btn.disabled = false;
      btn.textContent = '重新发送';
      openCaptcha(async () => {
        btn.disabled = true;
        btn.textContent = '发送中...';
        const retryData = await doSendCode(window._captchaToken);
        window._captchaToken = '';
        window._captchaPassed = false;
        if (!retryData.success) {
          showToast(retryData.error || '发送失败', 'error');
          btn.disabled = false;
          btn.textContent = '重新发送';
          return;
        }
        showToast('验证码已发送到邮箱', 'success');
        regVerifyEmail = email;
        updateRegStep(2);
        startRegCountdown();
      });
      return;
    }

    if (!data.success) { showToast(data.error || '发送失败', 'error'); btn.disabled = false; btn.textContent = '重新发送'; return; }
    showToast('验证码已发送到邮箱', 'success');
    regVerifyEmail = email;
    updateRegStep(2);
    startRegCountdown();
  } catch (e) {
    console.error('[Auth]', e);
    showToast('网络错误，请重试', 'error');
    btn.disabled = false;
    btn.textContent = '重新发送';
  }
}

function startRegCountdown() {
  regCodeCountdown = 300;
  const el = document.getElementById('reg-code-countdown');
  const btn = document.getElementById('btn-reg-send-code');
  el.textContent = '5分钟后可重发';
  if (regCodeTimer) clearInterval(regCodeTimer);
  regCodeTimer = setInterval(() => {
    regCodeCountdown--;
    if (regCodeCountdown <= 0) {
      clearInterval(regCodeTimer);
      el.textContent = '';
      btn.disabled = false;
      btn.textContent = '重新发送';
    } else if (regCodeCountdown >= 60) {
      el.textContent = Math.floor(regCodeCountdown / 60) + '分' + (regCodeCountdown % 60) + '秒后可重发';
    } else {
      el.textContent = regCodeCountdown + '秒后可重发';
    }
  }, 1000);
}

async function register() {
  const username = document.getElementById('register-username').value.trim();
  const nickname = document.getElementById('register-nickname').value.trim();
  const password = document.getElementById('register-password').value;
  const email = document.getElementById('register-email').value.trim();
  const code = document.getElementById('register-code').value.trim();
  const hp = document.getElementById('reg-website') ? document.getElementById('reg-website').value : '';
  const ts = document.getElementById('reg-form-ts') ? document.getElementById('reg-form-ts').value : '';

  if (!email || !code || !username || !password) {
    showToast('请填写完整信息（邮箱、验证码、用户名、密码）', 'error');
    return;
  }
  if (password.length < 6) {
    showToast('密码长度不能少于6位', 'error');
    return;
  }
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    showToast('密码必须包含大小写字母和数字', 'error');
    return;
  }
  if (email !== regVerifyEmail) {
    showToast('验证码与邮箱不匹配，请重新获取', 'error');
    return;
  }
  if (code.length !== 6) {
    showToast('验证码为6位数字', 'error');
    return;
  }

  if (!window._captchaPassed) {
    openCaptcha(() => register());
    return;
  }
  window._captchaPassed = false;

  const resetRegisterBtn = setButtonBusy('btn-register-submit', '注册中...');
  try {
    // Step 1: verify the code first
    const verifyRes = await api('/auth/verify-register', {
      method: 'POST',
      body: JSON.stringify({ username, email, code })
    });
    if (verifyRes.error) {
      showToast(verifyRes.error, 'error');
      resetRegisterBtn();
      return;
    }

    // Step 2: login to get token
    const loginRes = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (loginRes.error) {
      showToast('账号已创建但自动登录失败，请手动登录', 'warn', 3500);
      closeModal();
      showLogin();
      return;
    }

    setAuth(loginRes.token, loginRes.user);
    updateRegStep(3);
    closeModal();
    showToast('注册成功，欢迎加入熊猫社区！🎉', 'success');
  } catch (e) {
    showToast('注册失败，请重试', 'error');
    resetRegisterBtn();
  }
}

function logout() {
  // Notify server (admin logout is logged)
  if (getUser() && getUser().role === 'admin') {
    api('/auth/logout', { method: 'POST' }).catch(function() {});
  }
  clearAuth();
  goHome();
}

// Posts
async function loadTags() {
  try {
    const res = await api('/tags');
    const container = document.getElementById('tags-filter');
    container.innerHTML = `<span class="tag-chip ${!currentTagId ? 'active' : ''}" onclick="filterByTag(null)">全部</span>`;
    res.tags.forEach(tag => {
      container.innerHTML += `<span class="tag-chip ${currentTagId == tag.id ? 'active' : ''}" 
        style="${currentTagId == tag.id ? '' : `background:${tag.color}20;border-color:${tag.color}`}" 
        onclick="filterByTag(${tag.id}, '${tag.color}')">${tag.name}</span>`;
    });
  } catch (e) {
    console.error(e);
  }
}

function filterByTag(tagId, color) {
  currentTagId = tagId;
  currentPage = 1;
  loadTags();
  loadPosts();
}

let currentSort = 'newest';
let currentTimeRange = '';

function handleSearch(e) {
  if (e.key === 'Enter') searchPosts();
}

function searchPosts() {
  currentPage = 1;
  loadPosts();
}

function setPointsRange(range) {
    currentPointsRange = range || null;
    currentPage = 1;
    searchPosts();
}

function setSearchSort(sort) {
  if (sort === 'following' && !getUser()) {
    showLogin();
    // Reset to newest
    var sel = document.getElementById('sort-select');
    if (sel) sel.value = 'newest';
    return;
  }
  currentSort = sort;
  var sel = document.getElementById('sort-select');
  if (sel) sel.value = sort;
  searchPosts();
}

function setSearchTime(range) {
  currentTimeRange = range;
  var sel = document.getElementById('time-select');
  if (sel) sel.value = range;
  ['time-all', 'time-day', 'time-week', 'time-month'].forEach(function(id) {
    var btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', id === 'time-' + (range || 'all'));
  });
  currentPage = 1;
  searchPosts();
}

window.setSearchSort = setSearchSort;
window.setSearchTime = setSearchTime;

function renderPostsLoading() {
  const container = document.getElementById('post-list');
  if (!container) return;
  container.innerHTML = [1, 2, 3].map(() => `
    <div class="post-card post-loading-card">
      <div class="skeleton-line title"></div>
      <div class="skeleton-line meta"></div>
      <div class="skeleton-line body"></div>
      <div class="skeleton-line body short"></div>
    </div>
  `).join('');
  const pager = document.getElementById('pagination');
  if (pager) pager.innerHTML = '';
}

async function loadPosts() {
  renderPostsLoading();
  const user = getUser();
  const params = new URLSearchParams({ page: currentPage, limit: 20 });
  // If "following" sort, call API differently
  if (currentSort === 'following') {
    if (!user) {
      showLogin();
      renderPostsEmpty();
      return;
    }
    params.set('following', user.id);
  } else if (currentSort === 'featured') {
    params.set('featured', '1');
  } else {
    params.set('sort', currentSort);
  }
  if (currentTagId) params.set('tag_id', currentTagId);
  if (currentTimeRange) params.set('time_range', currentTimeRange);
  const search = document.getElementById('search-input')?.value.trim();
  if (search) params.set('search', search);

  try {
  if (currentPointsRange) {
    var prParts = currentPointsRange.split("-");
    if (prParts.length === 2) { params.set("points_min", prParts[0]); params.set("points_max", prParts[1]); }
  }
  history.replaceState(null, "", window.location.pathname + "?" + params.toString());
    const res = await api(`/posts?${params}`);
    const container = document.getElementById('post-list');

    if (!res.posts.length) {
      container.innerHTML = '<div class="empty-state-card">暂无帖子，来发布第一条内容吧</div>';
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    container.innerHTML = res.posts.map(post => {
        const e = (name) => name ? name[0].toUpperCase() + name.slice(1) : "A";
        return `
      <div class="post-card" data-post-id="${post.id}" onclick="viewPost(${post.id})">
        <div class="post-top-meta">
          ${post.is_pinned ? '<span style="background:#f59e0b;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;margin-right:4px;">🏆 置顶</span>' : ''}
          ${post.is_featured ? '<span style="background:#ec4899;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;margin-right:4px;">⭐ 精选</span>' : ''}
          ${post.tag_name ? `<span class="post-tag" style="background:${post.tag_color}">${escapeHtml(post.tag_name)}</span>` : ''}
        </div>
        <div class="post-title">${escapeHtml(post.title)}</div>
        <div class="post-excerpt">${escapeHtml(stripMarkdown(post.content).substring(0, 80))}${stripMarkdown(post.content).length > 80 ? '…' : ''}</div>
        <div class="post-bottom-meta">
          <div class="post-author-info">
            <span class="avatar-small">${post.avatar ? `<img src="${post.avatar}" alt="avatar">` : (post.nickname || post.username)[0].toUpperCase()}</span>
            <span style="font-size:11px;color:#7a9ab0;">${escapeHtml(post.nickname || post.username)}</span>
            <span style="font-size:11px;color:#a8bfc9;">🕐 ${formatDate(post.created_at)}</span>
          </div>
          <div class="post-stats-row">
            <span title="赞" style="font-size:11px;color:#94a3b8;">👍 ${post.like_count || 0}</span>
            <span title="评论" style="font-size:11px;color:#94a3b8;">💬 ${post.comment_count || 0}</span>
            <span title="浏览" style="font-size:11px;color:#94a3b8;">👁 ${post.views || 0}</span>
            <span onclick="event.stopPropagation();toggleFavorite(${post.id})" id="fav-btn-${post.id}" title="收藏" style="font-size:11px;color:#94a3b8;cursor:pointer;">☆ 收藏</span>
          </div>
        </div>
      </div>
        `;
    }).join('');

    renderPagination(res.pages, res.page);
  } catch (e) {
    console.error(e);
    const container = document.getElementById('post-list');
    if (container) {
      container.innerHTML = '<div class="empty-state-card">帖子加载失败，请稍后重试</div>';
    }
    showToast('帖子加载失败', 'error');
  }
}

function renderPagination(totalPages, current) {
  const container = document.getElementById('pagination');
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === current ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  loadPosts();
}

async function viewPost(id) {
  const user = getUser();
  if (!user) {
    showToast('请先登录后查看帖子详情', 'info', 2600);
    showLogin();
    return;
  }

  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) {
    showToast('帖子参数无效', 'error');
    return;
  }

  currentPostId = postId;
  showView('post');
  const postDetailEl = document.getElementById('post-detail');
  const commentsListEl = document.getElementById('comments-list');
  const commentFormEl = document.getElementById('comment-form');
  if (postDetailEl) {
    postDetailEl.innerHTML = '<div class="empty-state-card">帖子加载中...</div>';
  }
  if (commentsListEl) {
    commentsListEl.innerHTML = '';
  }
  if (commentFormEl) {
    commentFormEl.style.display = 'none';
  }

  try {
    const res = await api(`/posts/${postId}`);
    if (res.error || !res.post) {
      showToast(res.error || '帖子不存在或暂不可见', 'error');
      if (postDetailEl) {
        postDetailEl.innerHTML = '<div class="empty-state-card">帖子不存在或暂不可见</div>';
      }
      return;
    }

    // Fetch user's vote status
    let userVote = null;
    if (user) {
      try {
        const voteRes = await api(`/posts/${postId}/votes`);
        userVote = voteRes.userVote;
      } catch (e) {
        // Ignore vote fetch error
      }
    }

    // Load favorite status
    if (user) {
      loadFavoriteStatus(postId);
    }

    postDetailEl.innerHTML = `
      <div class="post-detail-card">
        <div class="post-detail-title">${res.post.is_pinned ? '<span style="background:#f59e0b;color:#fff;font-size:12px;padding:2px 8px;border-radius:10px;margin-right:8px;">🏆 置顶</span>' : ''}${res.post.is_featured ? '<span style="background:#ec4899;color:#fff;font-size:12px;padding:2px 8px;border-radius:10px;margin-right:8px;">⭐ 精选</span>' : ''}${escapeHtml(res.post.title)}</div>
        <div class="post-meta">
          ${res.post.tag_name ? `<span class="post-tag" style="background:${res.post.tag_color}">${escapeHtml(res.post.tag_name)}</span>` : ''}
          <span class="avatar-small">${res.post.avatar ? `<img src="${res.post.avatar}" alt="avatar">` : (res.post.nickname || res.post.username)[0].toUpperCase()}</span>
          <span>${escapeHtml(res.post.nickname || res.post.username)}</span>
          ${user && user.id !== res.post.user_id ? `<button class="msg-author-btn" onclick="openMsgDetailFromUser(${res.post.user_id}, '${e(res.post.nickname || res.post.username)}')" style="background:none;border:none;cursor:pointer;font-size:12px;padding:2px 6px;color:#5d6dff;">💬 发私信</button>` : ''}
          <span>🕐 ${formatDate(res.post.created_at)}</span>
          <span>👁 ${res.post.views}</span>
        </div>
        <div class="post-vote-bar">
          <button id="vote-like-btn" class="vote-btn ${userVote === 'like' ? 'active' : ''}" onclick="event.stopPropagation();votePost(${res.post.id}, 'like')">
            👍 <span id="vote-like-count">${res.post.like_count || 0}</span>
          </button>
          <button id="vote-dislike-btn" class="vote-btn ${userVote === 'dislike' ? 'active' : ''}" onclick="event.stopPropagation();votePost(${res.post.id}, 'dislike')">
            👎 <span id="vote-dislike-count">${res.post.dislike_count || 0}</span>
          </button>
        </div>
        <div class="post-detail-content">${renderContent(res.post.content)}</div>
        ${user ? `
        <div class="post-actions">
          <button id="btn-favorite" onclick="toggleFavorite(${res.post.id})">☆ 收藏</button>
          <button onclick="sharePost(${res.post.id}, '${escapeHtml(res.post.title)}')">🔗 分享</button>
          ${user && user.id !== res.post.user_id ? `<button onclick="openReportModal('post', ${res.post.id}, '${escapeHtml(res.post.title.replace(/'/g, "\\'"))}')" style="color:#94a3b8;">🚩 举报</button>` : ''}
          ${res.user && res.user.id === res.post.user_id || (user && user.role === 'admin') ? `<button onclick="editPost(${res.post.id})" style="color:#5d6dff">✏️ 编辑</button>` : ''}
          ${res.user && res.user.id === res.post.user_id || (user && user.role === 'admin') ? `<button onclick="deletePost(${res.post.id})" style="color:#ef4444">🗑 删除</button>` : ''}
        </div>` : ''}
      </div>
    `;

    if (commentFormEl) {
      commentFormEl.style.display = user ? 'block' : 'none';
    }

    const comments = Array.isArray(res.comments) ? res.comments : [];

    // Build comment tree
    function buildCommentTree(flat) {
      var map = {};
      var roots = [];
      flat.forEach(function(c) { map[c.id] = { ...c, replies: [] }; });
      flat.forEach(function(c) {
        if (c.parent_id && map[c.parent_id]) {
          map[c.parent_id].replies.push(map[c.id]);
        } else if (!c.parent_id) {
          roots.push(map[c.id]);
        }
      });
      return roots;
    }

    // Count all descendants
    function countReplies(comment) {
      var count = comment.replies ? comment.replies.length : 0;
      if (comment.replies) {
        comment.replies.forEach(function(r) { count += countReplies(r); });
      }
      return count;
    }

    // Render a single comment item
    function renderCommentItem(comment, depth) {
      var indentClass = depth === 0 ? 'comment-depth-root' : depth === 1 ? 'comment-depth-1' : 'comment-depth-2';
      var replyLine = comment.reply_to_nickname || comment.reply_to_username
        ? '<span class="comment-reply-to">回复 <b>' + escapeHtml(comment.reply_to_nickname || comment.reply_to_username) + '</b></span>'
        : '';
      var avatar = comment.avatar
        ? '<img src="' + comment.avatar + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
        : (comment.nickname || comment.username)[0].toUpperCase();

      var actionsHtml = '<div class="comment-actions">' +
        '<button class="comment-action-btn comment-like-btn" id="clike-btn-' + comment.id + '" onclick="voteComment(' + comment.id + ')" title="赞一个" style="color:#94a3b8;">' +
        '👍 <span id="clike-count-' + comment.id + '">' + (comment.like_count || 0) + '</span></button>' +
        (user && user.id !== comment.user_id ? '<button class="comment-action-btn" onclick="openReportModal(\'comment\', ' + comment.id + ')" style="color:#94a3b8;">🚩 举报</button>' : '') +
        (user ? '<button class="comment-action-btn" onclick="startReply(' + comment.id + ', ' + comment.user_id + ', \'' + escapeHtml(comment.nickname || comment.username) + '\')">回复</button>' : '') +
        '</div>';

      var repliesHtml = '';
      if (comment.replies && comment.replies.length > 0) {
        if (depth === 0) {
          // Root: render direct replies (depth 1), collect deeper for collapse
          var directReplies = comment.replies;
          var deeperReplies = [];
          directReplies.forEach(function(r) {
            if (r.replies && r.replies.length > 0) {
              deeperReplies = deeperReplies.concat(r.replies);
            }
          });
          var directHtml = directReplies.map(function(r) { return renderCommentItem(r, 1); }).join('');
          repliesHtml = '<div class="reply-list">' + directHtml + '</div>';
          if (deeperReplies.length > 0) {
            repliesHtml += '<div class="reply-collapsed" id="reply-collapsed-' + comment.id + '">' +
              '<button class="reply-expand-btn" onclick="expandReplies(' + comment.id + ')">' +
              '💬 查看 ' + deeperReplies.length + ' 条更多回复 ↓</button></div>';
            repliesHtml += '<div id="reply-expanded-' + comment.id + '" style="display:none;"></div>';
          }
        } else if (depth === 1) {
          // Depth 1: collect ALL deeper replies for collapse
          var allDeeper = [];
          function collectDeeper(c) {
            if (c.replies) {
              c.replies.forEach(function(r) {
                allDeeper.push(r);
                collectDeeper(r);
              });
            }
          }
          collectDeeper(comment);
          var directHtml = comment.replies.map(function(r) { return renderCommentItem(r, 2); }).join('');
          repliesHtml = '<div class="reply-list depth-1">' + directHtml + '</div>';
          if (allDeeper.length > 0) {
            repliesHtml += '<div class="reply-collapsed" id="reply-collapsed-' + comment.id + '">' +
              '<button class="reply-expand-btn" onclick="expandReplies(' + comment.id + ')">' +
              '💬 查看 ' + allDeeper.length + ' 条更多回复 ↓</button></div>';
            repliesHtml += '<div id="reply-expanded-' + comment.id + '" style="display:none;"></div>';
          }
        }
      }

      return '<div class="comment-item ' + indentClass + '" data-comment-id="' + comment.id + '">' +
        '<div class="comment-header">' +
        '<span class="avatar-small">' + avatar + '</span>' +
        '<span class="comment-author">' + escapeHtml(comment.nickname || comment.username) + '</span>' +
        replyLine +
        '<span class="comment-time">' + formatDate(comment.created_at) + '</span>' +
        '</div>' +
        '<div class="comment-content">' + escapeHtml(comment.content) + '</div>' +
        actionsHtml +
        repliesHtml +
        '</div>';
    }

    var commentTree = buildCommentTree(comments);
    var renderedComments = commentTree.map(function(c) { return renderCommentItem(c, 0); }).join('');

    if (commentsListEl) {
      commentsListEl.innerHTML = renderedComments
        ? renderedComments
        : '<div style="color:#888;padding:20px;text-align:center;">暂无评论</div>';
    }
    loadCommentVoteStatus();
    window._commentsFlatData = comments; // expose for expandReplies
  } catch (e) {
    console.error(e);
    showToast('加载失败', 'error');
    if (postDetailEl) {
      postDetailEl.innerHTML = '<div class="empty-state-card">加载失败，请稍后重试</div>';
    }
  }
}

let mentionSearchTimeout = null;
let mentionQuery = '';

function handleCommentInput(el) {
  var val = el.value;
  var cursor = el.selectionStart;
  // Check if @ typed before cursor
  var beforeCursor = val.substring(0, cursor);
  var atMatch = beforeCursor.match(/@([\w\u4e00-\u9fa5]*)$/);
  var dropdown = document.getElementById('mention-dropdown');
  var list = document.getElementById('mention-list');
  if (!dropdown || !list) return;

  if (atMatch) {
    mentionQuery = atMatch[1];
    dropdown.style.display = 'block';
    clearTimeout(mentionSearchTimeout);
    mentionSearchTimeout = setTimeout(function() {
      searchMentionUsers(mentionQuery, list);
    }, 200);
  } else {
    dropdown.style.display = 'none';
    mentionQuery = '';
  }
}

async function searchMentionUsers(query, list) {
  if (!query) {
    // Show recent users or popular users
    list.innerHTML = '<div style="padding:10px 12px;color:#94a3b8;font-size:12px;">输入用户名搜索...</div>';
    return;
  }
  try {
    var res = await api('/users/search?q=' + encodeURIComponent(query) + '&limit=5');
    var users = res.users || [];
    if (users.length === 0) {
      list.innerHTML = '<div style="padding:10px 12px;color:#94a3b8;font-size:12px;">未找到用户</div>';
      return;
    }
    list.innerHTML = users.map(function(u) {
      var name = u.nickname || u.username;
      return '<div onclick="insertMention(\'' + (u.username) + '\', \'' + name.replace(/'/g, "\\'") + '\')" style="padding:8px 12px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f0f4f8;" onmouseover="this.style.background=\'#f0f2ff\'" onmouseout="this.style.background=\'\'">' +
        '<span style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;">' + name[0].toUpperCase() + '</span>' +
        '<span style="color:#1e3a5f;font-weight:600;">' + name + '</span>' +
        '<span style="color:#94a3b8;font-size:11px;margin-left:auto;">@' + u.username + '</span></div>';
    }).join('');
  } catch (e) {
    list.innerHTML = '<div style="padding:10px 12px;color:#ef4444;font-size:12px;">搜索失败</div>';
  }
}

function insertMention(username, displayName) {
  var ta = document.getElementById('comment-input');
  if (!ta) return;
  var cursor = ta.selectionStart;
  var val = ta.value;
  // Find the @ position
  var before = val.substring(0, cursor);
  var atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return;
  var newVal = val.substring(0, atIdx) + '@' + username + ' ' + val.substring(cursor);
  ta.value = newVal;
  ta.focus();
  var newPos = atIdx + username.length + 2;
  ta.setSelectionRange(newPos, newPos);
  var dropdown = document.getElementById('mention-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  mentionQuery = '';
}

window.insertMention = insertMention;

async function submitComment() {
  var user = getUser();
  if (user && !user.email_verified) {
    showToast('请先验证邮箱后再评论', 'info', 3500);
    openSettingsTab('email');
    return;
  }
  const content = document.getElementById('comment-input').value.trim();
  if (!content && commentImages.length === 0) {
    showToast('请输入评论内容', 'error');
    return;
  }

  const resetCommentBtn = setButtonBusy('btn-submit-comment', '发布中...');
  try {
    // Upload comment images first
    let finalContent = content;
    if (commentImages.length > 0) {
      uploadedImageUrls = [];
      for (const file of commentImages) {
        const formData = new FormData();
        formData.append('image', file);
        const uploadRes = await fetch(`${API_BASE}/upload/image`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}` },
          body: formData
        }).then(r => r.json());
        if (!uploadRes.url) {
          throw new Error(uploadRes.error || '图片上传失败');
        }
        uploadedImageUrls.push(uploadRes.url);
      }
      if (uploadedImageUrls.length > 0) {
        finalContent = content + '\n\n' + uploadedImageUrls.map(url => `![图片](${url})`).join('\n');
      }
    }

    const payload = { content: finalContent };
    if (currentReplyTo) {
      payload.parent_id = currentReplyTo.commentId;
      payload.reply_to_user_id = currentReplyTo.userId;
    }

    const res = await api(`/posts/${currentPostId}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast(res.points_deducted ? '评论成功，-' + res.points_deducted + '积分' : '评论成功', 'success');
    document.getElementById('comment-input').value = '';
    commentImages = [];
    uploadedImageUrls = [];
    document.getElementById('comment-image-preview').innerHTML = '';
    document.getElementById('comment-image-preview').style.display = 'none';
    cancelReply();
    viewPost(currentPostId);
  } catch (e) {
    showToast(e?.message || '评论失败', 'error');
  } finally {
    resetCommentBtn();
  }
}

function startReply(commentId, userId, userName) {
  closeAllInlineReplyForms();
  cancelReply();
  currentReplyTo = { commentId: commentId, userId: userId, name: userName };
  var commentEl = document.querySelector('.comment-item[data-comment-id="' + commentId + '"]');
  if (!commentEl) return;
  var formId = 'inline-reply-form-' + commentId;
  if (document.getElementById(formId)) { return; }
  var formDiv = document.createElement('div');
  formDiv.id = formId;
  formDiv.className = 'inline-reply-form';
  var taId = 'inline-reply-text-' + commentId;
  formDiv.innerHTML = '<textarea id="' + taId + '" placeholder="回复 @' + escAttr(userName) + '..." rows="2"></textarea>' +
    '<button class="btn-send" onclick="submitInlineReply(' + commentId + ')">发送</button>' +
    '<button class="btn-cancel" onclick="closeInlineReplyForm(' + commentId + ')">取消</button>';
  var actionsDiv = commentEl.querySelector('.comment-actions');
  if (actionsDiv && actionsDiv.nextSibling) {
    commentEl.insertBefore(formDiv, actionsDiv.nextSibling);
  } else {
    commentEl.appendChild(formDiv);
  }
  var textarea = document.getElementById(taId);
  if (textarea) {
    textarea.focus();
    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitInlineReply(commentId);
      }
    });
    textarea.addEventListener('input', function() {
      autoResizeTextarea(textarea);
    });
  }
}

function closeAllInlineReplyForms() {
  document.querySelectorAll('.inline-reply-form').forEach(function(el){ el.remove(); });
}

function closeInlineReplyForm(commentId) {
  var el = document.getElementById('inline-reply-form-' + commentId);
  if (el) el.remove();
  if (currentReplyTo && currentReplyTo.commentId === commentId) currentReplyTo = null;
}

function submitInlineReply(commentId) {
  var textarea = document.getElementById('inline-reply-text-' + commentId);
  if (!textarea) return;
  var content = textarea.value.trim();
  if (!content) { showToast('回复内容不能为空', 'error'); return; }
  var replyTo = currentReplyTo;
  if (!replyTo || replyTo.commentId !== commentId) return;
  var user = getUser();
  if (!user) { showLogin(); return; }
  fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
    body: JSON.stringify({ post_id: replyTo.commentId, content: content, parent_id: commentId })
  }).then(function(res){ return res.json(); })
    .then(function(data) {
      if (data.error) { showToast(data.error, 'error'); return; }
      showToast('回复成功', 'success');
      closeInlineReplyForm(commentId);
      var postId = window._currentPostId;
      if (postId) loadPostDetail(postId);
    })
    .catch(function(){ showToast('发送失败', 'error'); });
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}


function removeCommentImage(index) {
  commentImages.splice(index, 1);
  const preview = document.getElementById('comment-image-preview');
  if (commentImages.length === 0) {
    preview.style.display = 'none';
    preview.innerHTML = '';
  } else {
    // Re-render previews
    preview.innerHTML = '';
    commentImages.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'comment-img-thumb';
        div.innerHTML = `<img src="${e.target.result}"><button onclick="removeCommentImage(${i})">×</button>`;
        preview.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  }
}

window.sharePost = function(id, title) {
  const url = window.location.origin + '/#/post/' + id;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function() {
      showToast('链接已复制到剪贴板', 'success');
    }, function() {
      showToast('复制失败，请手动复制链接', 'error');
    });
  } else {
    // Fallback
    var ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('链接已复制到剪贴板', 'success');
  }
};

async function deletePost(id) {

// ============ Report ============
var _currentReport = { targetType: null, targetId: null };

var REPORT_REASONS = [
  { value: 'spam', label: '🚨 垃圾广告' },
  { value: 'harmful', label: '⚠️ 有害信息' },
  { value: 'harassment', label: '😠 人身攻击' },
  { value: 'misinformation', label: '📰 虚假信息' },
  { value: 'copyright', label: '©️ 侵权抄袭' },
  { value: 'other', label: '📝 其他问题' },
];

async function openReportModal(targetType, targetId, targetTitle) {
  var user = getUser();
  if (!user) { showToast('请先登录', 'error'); return; }

  _currentReport = { targetType: targetType, targetId: targetId };

  var modal = document.getElementById('report-modal');
  var targetEl = document.getElementById('report-target');
  var reasonsEl = document.getElementById('report-reasons');
  var descEl = document.getElementById('report-description');

  targetEl.textContent = targetTitle
    ? (targetType === 'post' ? '帖子：' + targetTitle : '评论：' + targetTitle)
    : (targetType === 'post' ? '这篇帖子' : '这条评论');

  // Render reason buttons
  reasonsEl.innerHTML = REPORT_REASONS.map(function(r) {
    return '<button onclick="selectReportReason(this, \'' + r.value + '\')" data-reason="' + r.value + '" style="padding:6px 12px;border-radius:20px;border:1.5px solid #e2e8f0;background:#fff;font-size:12px;color:#627582;cursor:pointer;transition:all 0.2s;">' + r.label + '</button>';
  }).join('');

  if (descEl) descEl.value = '';
  if (modal) modal.style.display = 'flex';
}

function selectReportReason(btn, value) {
  // Deselect all, select this one
  var reasonsEl = document.getElementById('report-reasons');
  reasonsEl.querySelectorAll('button').forEach(function(b) {
    b.style.background = '#fff';
    b.style.borderColor = '#e2e8f0';
    b.style.color = '#627582';
  });
  btn.style.background = 'linear-gradient(135deg,#ef444422,#dc262622)';
  btn.style.borderColor = '#ef4444';
  btn.style.color = '#ef4444';
  btn.dataset.selected = '1';
}

function closeReportModal() {
  var modal = document.getElementById('report-modal');
  if (modal) modal.style.display = 'none';
  _currentReport = { targetType: null, targetId: null };
}

async function submitReport() {
  if (!_currentReport.targetType || !_currentReport.targetId) {
    showToast('举报信息不完整', 'error');
    return;
  }

  // Get selected reason
  var reasonsEl = document.getElementById('report-reasons');
  var selectedBtn = reasonsEl.querySelector('button[data-selected="1"]');
  var reason = selectedBtn ? selectedBtn.dataset.reason : null;
  if (!reason) {
    showToast('请选择举报原因', 'error');
    return;
  }

  var descEl = document.getElementById('report-description');
  var description = descEl ? descEl.value.trim() : '';

  try {
    var res = await api('/reports', {
      method: 'POST',
      body: JSON.stringify({
        target_type: _currentReport.targetType,
        target_id: _currentReport.targetId,
        reason: reason,
        description: description
      })
    });
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast('举报已提交，感谢您的反馈', 'success');
    closeReportModal();
  } catch (e) {
    showToast('提交失败，请稍后重试', 'error');
  }
}

window.openReportModal = openReportModal;
window.closeReportModal = closeReportModal;
window.submitReport = submitReport;
window.selectReportReason = selectReportReason;
  const ok = await askConfirm('删除后不可恢复，确定要继续吗？', '删除帖子');
  if (!ok) return;
  try {
    await api(`/posts/${id}`, { method: 'DELETE' });
    showToast('帖子已删除', 'success');
    goHome();
  } catch (e) {
    showToast('删除失败', 'error');
  }
}

let editingPostId = null;

window.editPost = async function(id) {
  editingPostId = id;
  var res = await api('/posts/' + id);
  if (res.error || !res.post) { showToast('帖子加载失败', 'error'); return; }
  var p = res.post;
  document.getElementById('post-title').value = p.title || '';
  document.getElementById('content').value = p.content || '';
  var tagsRes = await api('/tags');
  document.getElementById('post-tag').innerHTML = '<option value="">无标签</option>' +
    (tagsRes.tags || []).map(function(t) { return '<option value="' + t.id + '">' + t.name + '</option>'; }).join('');
  if (p.tag_id) { document.getElementById('post-tag').value = p.tag_id; }
  var submitBtn = document.getElementById('btn-submit-post');
  if (submitBtn) { submitBtn.textContent = '保存编辑'; }
  var formTitle = document.querySelector('#view-new-post h2');
  if (formTitle) formTitle.textContent = '✏️ 编辑帖子';
  showView('new-post');
};

window.goNewPost = function() {
  var user = getUser();
  if (user && !user.email_verified) {
    showToast('请先验证邮箱后再发帖', 'info', 3500);
    openSettingsTab('email');
    return;
  }
  editingPostId = null;
  showNewPost();
};

// Vote on a post (like or dislike)
async function votePost(id, voteType) {
  const user = getUser();
  if (!user) {
    showToast('请先登录后进行投票', 'info', 2600);
    showLogin();
    return;
  }

  try {
    const res = await api(`/posts/${id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote_type: voteType })
    });

    if (res.error) {
      showToast(res.error, 'error');
      return;
    }

    // Update UI: like button
    const likeBtn = document.getElementById('vote-like-btn');
    const dislikeBtn = document.getElementById('vote-dislike-btn');
    const likeCount = document.getElementById('vote-like-count');
    const dislikeCount = document.getElementById('vote-dislike-count');

    if (likeBtn && dislikeBtn) {
      likeBtn.classList.remove('active');
      dislikeBtn.classList.remove('active');
      if (res.currentVote === 'like') {
        likeBtn.classList.add('active');
      } else if (res.currentVote === 'dislike') {
        dislikeBtn.classList.add('active');
      }
    }

    if (likeCount) likeCount.textContent = res.like_count;
    if (dislikeCount) dislikeCount.textContent = res.dislike_count;

    // Update post list if visible
    updatePostListVoteCounts(id, res.like_count, res.dislike_count, res.currentVote);

  } catch (e) {
    showToast('投票失败', 'error');
  }
}

// Update vote counts in the post list cards (without reloading)
function updatePostListVoteCounts(postId, likeCount, dislikeCount, currentVote) {
  const cards = document.querySelectorAll(`.post-card[data-post-id="${postId}"]`);
  cards.forEach(function(card) {
    var likeEl = card.querySelector('.vote-like-count');
    var dislikeEl = card.querySelector('.vote-dislike-count');
    var likeBtn = card.querySelector('.vote-inline-btn');
    var dislikeBtn = card.querySelectorAll('.vote-inline-btn')[1];
    if (likeEl) likeEl.textContent = likeCount;
    if (dislikeEl) dislikeEl.textContent = dislikeCount;
    if (likeBtn) {
      likeBtn.style.color = currentVote === 'like' ? '#ef4444' : '#94a3b8';
    }
    if (dislikeBtn) {
      dislikeBtn.style.color = currentVote === 'dislike' ? '#8b5cf6' : '#94a3b8';
    }
  });
}

// New Post
function updatePostContentMeta() {
  const editor = document.getElementById('post-content');
  const meta = document.getElementById('post-content-meta');
  if (!editor || !meta) return;

  const text = editor.value || '';
  const lines = text.length ? text.split('\n').length : 1;
  meta.textContent = `${text.length} 字 · ${lines} 行`;
}

function resizePostContentEditor() {
  const editor = document.getElementById('post-content');
  if (!editor) return;

  const minHeight = window.innerWidth <= 640 ? 320 : 420;
  editor.style.height = 'auto';
  editor.style.height = `${Math.max(minHeight, editor.scrollHeight)}px`;
}

function initPostComposer() {
  const editor = document.getElementById('post-content');
  if (!editor) return;

  if (!editor.dataset.editorBound) {
    editor.dataset.editorBound = '1';
    editor.addEventListener('input', () => {
      updatePostContentMeta();
      resizePostContentEditor();
    });
    editor.addEventListener('focus', resizePostContentEditor);
  }

  updatePostContentMeta();
  resizePostContentEditor();
}

function initPetalRain() {
  if (petalRainInitialized) return;

  const rain = document.getElementById('petal-rain');
  if (!rain) return;

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rain.style.display = 'none';
    petalRainInitialized = true;
    return;
  }

  const count = window.innerWidth <= 640 ? 12 : 22;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const petal = document.createElement('span');
    petal.className = 'petal';
    petal.style.setProperty('--x', `${Math.random() * 100}%`);
    petal.style.setProperty('--size', `${10 + Math.random() * 14}px`);
    petal.style.setProperty('--scale', `${0.75 + Math.random() * 0.6}`);
    petal.style.setProperty('--drift', `${-70 + Math.random() * 140}px`);
    petal.style.setProperty('--fall-duration', `${10 + Math.random() * 11}s`);
    petal.style.setProperty('--delay', `${-Math.random() * 20}s`);
    petal.style.setProperty('--rotate-start', `${Math.floor(Math.random() * 180)}deg`);
    petal.style.setProperty('--rotate-end', `${Math.floor(300 + Math.random() * 360)}deg`);
    petal.style.setProperty('--petal-opacity', `${0.45 + Math.random() * 0.5}`);
    frag.appendChild(petal);
  }

  rain.appendChild(frag);
  petalRainInitialized = true;
}

async function loadPanda3DModule() {
  if (window.PandaMascot3D) return window.PandaMascot3D;
  if (!panda3DModulePromise) {
    panda3DModulePromise = import(PANDA_3D_MODULE_URL)
      .then((mod) => mod.PandaMascot3D || window.PandaMascot3D)
      .catch((err) => {
        panda3DModulePromise = null;
        throw err;
      });
  }
  return panda3DModulePromise;
}

function initPandaPlayground() {
  const scene = document.getElementById('panda-scene');
  const panda = document.getElementById('panda-character');
  const status = document.getElementById('panda-status');
  const hearts = document.getElementById('panda-hearts');
  const feedBtn = document.getElementById('panda-feed-btn');
  const countLabel = document.getElementById('panda-play-count');
  const pupilLeft = document.getElementById('panda-pupil-left');
  const pupilRight = document.getElementById('panda-pupil-right');
  const webglMount = document.getElementById('panda-webgl');
  if (!scene || !panda || !status || !hearts || !feedBtn || !countLabel || !pupilLeft || !pupilRight) return;
  if (scene.dataset.bound === '1') return;
  scene.dataset.bound = '1';

  const desktopMedia = window.matchMedia(`(min-width: ${PANDA_3D_MIN_WIDTH}px)`);
  let tried3D = false;
  let is3DReady = false;
  let fallbackReasonShown = false;

  const hoverLines = [
    '看我跳舞，鼠标动我也动',
    '悬停就开跳，今天状态满分',
    '你指哪我跳哪，节奏跟上啦'
  ];
  const playLines = [
    '哇，击掌成功！',
    '再来一次，我还能翻滚',
    '你点得太可爱了',
    '嗷呜~继续玩！'
  ];
  const feedLines = [
    '竹子收到，幸福+1',
    '咔嚓咔嚓，太好吃啦',
    '谢谢投喂，我超开心'
  ];

  const randomLine = (list) => list[Math.floor(Math.random() * list.length)];
  const setStatus = (text) => {
    status.textContent = text;
  };
  const setEyeOffset = (x, y) => {
    pupilLeft.style.setProperty('--eye-x', `${x}px`);
    pupilLeft.style.setProperty('--eye-y', `${y}px`);
    pupilRight.style.setProperty('--eye-x', `${x}px`);
    pupilRight.style.setProperty('--eye-y', `${y}px`);
  };
  const resetEyeOffset = () => setEyeOffset(0, 0);
  const supports3D = () => {
    if (!desktopMedia.matches) return false;
    if (!window.WebGLRenderingContext) return false;
    if (!webglMount) return false;
    return true;
  };

  const disable3D = () => {
    is3DReady = false;
    scene.classList.remove('is-3d-active');
    if (panda3DInstance) {
      panda3DInstance.dispose();
      panda3DInstance = null;
    }
  };

  const enable3D = async () => {
    if (is3DReady) return true;
    if (!supports3D()) {
      disable3D();
      return false;
    }
    if (panda3DInstance) {
      scene.classList.add('is-3d-active');
      is3DReady = true;
      return true;
    }
    tried3D = true;
    try {
      // Show loading state
      webglMount.classList.add('is-loading');
      setStatus('🐼 正在加载 3D 模型...');
      const PandaMascot3D = await loadPanda3DModule();
      panda3DInstance = new PandaMascot3D({
        mount: webglMount,
        modelUrl: PANDA_3D_MODEL_URL
      });
      await panda3DInstance.init();
      webglMount.classList.remove('is-loading');
      scene.classList.add('is-3d-active');
      is3DReady = true;
      return true;
    } catch (err) {
      console.warn('3D 熊猫加载失败，回退到 CSS 熊猫：', err);
      webglMount.classList.remove('is-loading');
      disable3D();
      if (!fallbackReasonShown) {
        fallbackReasonShown = true;
        setStatus('3D熊猫加载中断，已自动切回经典熊猫');
      }
      return false;
    }
  };

  const emitFloat = (emoji) => {
    const item = document.createElement('span');
    item.className = 'panda-float-item';
    item.textContent = emoji;
    item.style.setProperty('--float-x', `${20 + Math.random() * 60}%`);
    item.style.setProperty('--float-drift', `${-34 + Math.random() * 68}px`);
    item.style.setProperty('--float-rotate', `${-24 + Math.random() * 48}deg`);
    hearts.appendChild(item);
    setTimeout(() => item.remove(), 1450);
  };

  const triggerPlay = (mode) => {
    pandaPlayCount += 1;
    countLabel.textContent = `玩耍次数: ${pandaPlayCount}`;
    panda.classList.add('is-wave');
    panda.classList.remove('is-play');
    void panda.offsetWidth;
    panda.classList.add('is-play');
    setTimeout(() => panda.classList.remove('is-play'), 620);
    setTimeout(() => panda.classList.remove('is-wave'), 1300);

    if (is3DReady && panda3DInstance) {
      if (mode === 'feed') {
        panda3DInstance.playEat();
      } else {
        panda3DInstance.reactTap();
      }
    }

    const bag = mode === 'feed' ? ['🎋', '💚', '✨'] : ['💚', '✨', '🌸'];
    const count = mode === 'feed' ? 5 : 3;
    for (let i = 0; i < count; i++) {
      setTimeout(() => emitFloat(bag[Math.floor(Math.random() * bag.length)]), i * 90);
    }

    if (pandaPlayCount % 10 === 0) {
      setStatus(`你已经陪我玩了 ${pandaPlayCount} 次，今天超开心！`);
      return;
    }
    setStatus(mode === 'feed' ? randomLine(feedLines) : randomLine(playLines));
  };

  const handleBreakpoint = () => {
    if (!desktopMedia.matches) {
      disable3D();
      return;
    }
    if (!tried3D || !is3DReady) {
      void enable3D();
    }
  };

  scene.addEventListener('mouseenter', () => {
    scene.classList.add('is-hover');
    panda.classList.add('is-wave');
    if (is3DReady && panda3DInstance) {
      panda3DInstance.setHover(true);
      panda3DInstance.startDance();
    }
    setStatus(randomLine(hoverLines));
  });

  scene.addEventListener('mouseleave', () => {
    scene.classList.remove('is-hover');
    panda.classList.remove('is-wave');
    resetEyeOffset();
    if (is3DReady && panda3DInstance) {
      panda3DInstance.setHover(false);
      panda3DInstance.stopDance(0.28);
    }
    setStatus('把鼠标悬停在熊猫上看它跳舞');
  });

  scene.addEventListener('mousemove', (event) => {
    const rect = scene.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const moveX = Math.max(-3, Math.min(3, (px - 0.5) * 7.5));
    const moveY = Math.max(-3, Math.min(3, (py - 0.48) * 7.5));
    setEyeOffset(moveX, moveY);
    if (is3DReady && panda3DInstance) panda3DInstance.setPointer(px, py);
  });

  scene.addEventListener('click', () => {
    triggerPlay('tap');
  });

  scene.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    triggerPlay('tap');
  });

  feedBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    triggerPlay('feed');
  });

  if (desktopMedia.addEventListener) {
    desktopMedia.addEventListener('change', handleBreakpoint);
  } else if (desktopMedia.addListener) {
    desktopMedia.addListener(handleBreakpoint);
  }

  void enable3D();
}

async function showNewPost() {
  var user = getUser();
  if (user && !user.email_verified) {
    showToast('请先验证邮箱后再发帖', 'info', 3500);
    openSettingsTab('email');
    return;
  }
  showView('new-post');
  initPostComposer();
  // Reset image state
  selectedImages = [];
  uploadedImageUrls = [];
  document.getElementById('image-preview-list').innerHTML = '';
  const placeholder = document.querySelector('.upload-placeholder');
  if (placeholder) placeholder.style.display = 'flex';
  // Reset edit mode
  editingPostId = null;
  var submitBtn = document.getElementById('btn-submit-post');
  if (submitBtn) submitBtn.textContent = '发布帖子';
  var formTitle = document.querySelector('#view-new-post h2');
  if (formTitle) formTitle.textContent = '发布新帖子';

  const res = await api('/tags');
  document.getElementById('post-tag').innerHTML = '<option value="">无标签</option>' +
    res.tags.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

async function submitPost() {
  const title = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  const tag_id = document.getElementById('post-tag').value;

  if (!title || !content) {
    showToast('标题和内容不能为空', 'error');
    return;
  }

  const resetSubmitPostBtn = setButtonBusy('btn-submit-post', '发布中...');
  try {
    // First upload any selected images
    if (selectedImages.length > 0) {
      uploadedImageUrls = [];
      // Update button text with progress
      var imgCount = selectedImages.length;
      var submitBtn = document.getElementById('btn-submit-post');
      if (submitBtn) submitBtn.textContent = `上传图片(${imgCount})中...`;
      // Mark all as uploading
      document.querySelectorAll('.image-preview-item').forEach(el => {
        el.classList.add('uploading');
        el.classList.remove('done', 'error');
        if (!el.querySelector('.upload-spinner')) {
          const spinner = document.createElement('div');
          spinner.className = 'upload-spinner';
          el.appendChild(spinner);
        }
      });
      for (let i = 0; i < selectedImages.length; i++) {
        const file = selectedImages[i];
        const formData = new FormData();
        formData.append('image', file);
        try {
          const uploadRes = await fetch(`${API_BASE}/upload/image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData
          }).then(r => r.json());
          if (!uploadRes.url) {
            throw new Error(uploadRes.error || '图片上传失败，请重试');
          }
          uploadedImageUrls.push(uploadRes.url);
          // Update progress text
          var submitBtn = document.getElementById('btn-submit-post');
          if (submitBtn) submitBtn.textContent = `上传图片(${uploadedImageUrls.length}/${imgCount})中...`;
          // Mark this one as done
          var items = document.querySelectorAll('.image-preview-item');
          if (items[i]) {
            items[i].classList.remove('uploading');
            items[i].classList.add('done');
            var spinner = items[i].querySelector('.upload-spinner');
            if (spinner) spinner.remove();
            var check = document.createElement('span');
            check.className = 'done-check';
            check.textContent = '✓';
            check.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;color:#fff;background:#10b981;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;';
            items[i].appendChild(check);
          }
        } catch (err) {
          var items = document.querySelectorAll('.image-preview-item');
          if (items[i]) {
            items[i].classList.remove('uploading');
            items[i].classList.add('error');
            var spinner = items[i].querySelector('.upload-spinner');
            if (spinner) spinner.remove();
          }
          var submitBtn = document.getElementById('btn-submit-post');
          if (submitBtn) submitBtn.textContent = '发布';
          throw err;
        }
      }
      // Clear all done/error states after a short delay
      setTimeout(function() {
        document.querySelectorAll('.image-preview-item.done, .image-preview-item.error').forEach(function(el) {
          el.classList.remove('done', 'error');
          var check = el.querySelector('.done-check');
          if (check) check.remove();
        });
      }, 1500);
    }

    // Build content with images
    let fullContent = content;
    if (uploadedImageUrls.length > 0) {
      fullContent += '\n\n' + uploadedImageUrls.map(url => `![图片](${url})`).join('\n');
    }

    var apiUrl = '/posts';
    var apiMethod = 'POST';
    var successMsg = '发布成功！';
    if (editingPostId) {
      apiUrl = '/posts/' + editingPostId;
      apiMethod = 'PUT';
      successMsg = '编辑成功！';
    }

    const res = await api(apiUrl, {
      method: apiMethod,
      body: JSON.stringify({ title, content: fullContent, tag_id: tag_id || null })
    });

    // Reset
    selectedImages = [];
    uploadedImageUrls = [];
    editingPostId = null;
    var submitBtn = document.getElementById('btn-submit-post');
    if (submitBtn) submitBtn.textContent = '发布帖子';
    var formTitle = document.querySelector('#view-new-post h2');
    if (formTitle) formTitle.textContent = '发布新帖子';

    if (res.message) {
      showToast(res.message, 'success', 2600);
    } else {
      showToast(successMsg, 'success');
    }
    goHome();
  } catch (e) {
    showToast(e?.message || '发布失败', 'error');
  } finally {
    resetSubmitPostBtn();
  }
}

function handleImageSelect(event) {
  const files = Array.from(event.target.files);
  if (selectedImages.length + files.length > 9) {
    showToast('最多只能上传9张图片', 'error');
    return;
  }

  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    selectedImages.push(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewList = document.getElementById('image-preview-list');
      const placeholder = document.querySelector('.upload-placeholder');
      if (placeholder) placeholder.style.display = 'none';

      const div = document.createElement('div');
      div.className = 'image-preview-item';
      div.innerHTML = `
        <img src="${e.target.result}">
        <button class="remove-btn" onclick="removeImage(${selectedImages.length - 1})">×</button>
      `;
      previewList.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
  event.target.value = '';
}

function removeImage(index) {
  selectedImages.splice(index, 1);
  renderImagePreviews();
}

function renderImagePreviews() {
  const previewList = document.getElementById('image-preview-list');
  const placeholder = document.querySelector('.upload-placeholder');

  if (selectedImages.length === 0) {
    previewList.innerHTML = '';
    if (placeholder) placeholder.style.display = 'flex';
    return;
  }

  previewList.innerHTML = selectedImages.map((file, i) => {
    const reader = new FileReader();
    // Use a data URL for preview
    let dataUrl = '';
    reader.onload = (e) => dataUrl = e.target.result;
    reader.readAsDataURL(file);
    return `
      <div class="image-preview-item">
        <img src="${URL.createObjectURL(file)}" onclick="removeImage(${i})">
        <button class="remove-btn" onclick="removeImage(${i})">×</button>
      </div>
    `;
  }).join('');
}

// ============ CHECK-IN ============
async function loadCheckinStatus() {
  try {
    const res = await api('/checkin/status');
    const container = document.getElementById('checkin-sign-panel');
    if (!container) return;

    const bonuses = res.streakBonuses || { 1: 5, 2: 8, 3: 10, 4: 12, 5: 15, 6: 18, 7: 25 };
    const maxStreak = 7;

    // Determine which streak rung we're on (capped at 7)
    const currentStreak = res.currentStreak || 0;
    const displayStreak = Math.min(currentStreak, maxStreak);

    // Build 7-step streak ladder
    const streakSteps = [1, 2, 3, 4, 5, 6, 7].map(day => {
      const bonus = bonuses[day];
      // Active: this step is <= current streak (already achieved)
      const isActive = displayStreak >= day;
      // Current step: the rung matching current streak (for "checked in today" state)
      const isCurrent = res.checkedInToday && displayStreak === day;
      // Next step: tomorrow's target (not checked in yet)
      const nextTarget = res.nextStreak !== null ? Math.min(res.nextStreak, maxStreak) : 1;
      const isNext = !res.checkedInToday && day === nextTarget;
      // Week bonus ring (day 7) gets special styling
      const isWeekBonus = day === 7;

      let statusClass = '';
      if (isCurrent) statusClass = 'current';
      else if (isNext) statusClass = 'next';
      else if (isActive) statusClass = 'active';

      return `<div class="streak-step ${statusClass} ${isWeekBonus ? 'week-bonus' : ''}">
        <div class="streak-step-ring">${isActive ? '🔥' : day}</div>
        <div class="streak-step-label">第${day}天</div>
        <div class="streak-step-pts ${isActive ? 'pts-active' : ''}">+${bonus}</div>
      </div>`;
    }).join('');

    // Progress bar width: if checked in, show full; if not, show partial
    const progressPct = res.checkedInToday
      ? 100
      : displayStreak > 0
        ? (displayStreak / maxStreak) * 100
        : 0;

    // Connecting line segments between steps
    const connector = `<div class="streak-connector" style="width:${progressPct}%"></div>`;

    if (res.checkedInToday) {
      container.innerHTML = `
        <div class="checkin-done">
          <div class="checkin-rewards-header">
            <div class="checkin-rewards-left">
              <div class="checkin-big-streak">🔥 <b>${res.currentStreak}</b> 天</div>
              <div class="checkin-points-display">💰 ${res.points} 积分</div>
            </div>
            <div class="checkin-week-badge">
              ${res.currentStreak >= 7 ? '🏆 周冠霸 | ' : ''}已签到
            </div>
          </div>
          <div class="streak-ladder-wrap">
            <div class="streak-ladder-track">${streakSteps}</div>
            <div class="streak-progress-line"><div class="streak-progress-fill" style="width:${progressPct}%"></div></div>
          </div>
          <p class="checkin-tip">✅ 今日已签到！明天继续签到可获 +${bonuses[Math.min(res.currentStreak + 1, 7)]} 积分</p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="checkin-pending">
          <div class="checkin-rewards-header">
            <div class="checkin-rewards-left">
              <div class="checkin-big-streak">🔥 <b>${res.currentStreak}</b> 天</div>
              <div class="checkin-points-display">💰 ${res.points} 积分</div>
            </div>
            <div class="streak-next-bonus" id="streak-next-bonus">
              下次 +${res.nextBonus}积分
            </div>
          </div>
          <div class="streak-ladder-wrap">
            <div class="streak-ladder-track">${streakSteps}</div>
            <div class="streak-progress-line"><div class="streak-progress-fill" style="width:${progressPct}%"></div></div>
          </div>
          <div class="checkin-action">
            <button class="btn-primary checkin-btn-large" onclick="doCheckin()">
              🎁 立即签到 <span class="checkin-btn-pts">+${res.nextBonus}积分</span>
            </button>
          </div>
          <p class="checkin-tip">${res.currentStreak > 0 ? `再连续签到 ${7 - displayStreak} 天即可解锁第7天 +25 积分周奖励！` : '开始你的第一次签到，连续7天可获最高 +25 积分/天！'}</p>
        </div>
      `;
    }

    // Load reminder settings
    loadReminderSettings();
  } catch (e) {
    console.error(e);
    const container = document.getElementById('checkin-sign-panel');
    if (container) container.innerHTML = '<div style="color:#888;">签到加载失败</div>';
  }
}


async function loadReminderSettings() {
  var panel = document.getElementById('checkin-sign-panel');
  if (!panel) return;
  try {
    var res = await api('/reminder/settings');
    var subRes = await api('/reminder/subscribed');
    var isSubscribed = subRes.subscribed;

    var dayLabels = { '0': '日', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六' };
    var currentDays = (res.reminder_days || '1,2,3,4,5,6,0').split(',');
    var daysHtml = Object.keys(dayLabels).map(function(d) {
      var checked = currentDays.indexOf(d) !== -1;
      return '<label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;font-size:11px;color:' + (checked ? '#667eea' : '#94a3b8') + ';white-space:nowrap;"><input type="checkbox" value="' + d + '" ' + (checked ? 'checked' : '') + ' onchange="updateReminderDays(this)" style="accent-color:#667eea;">' + dayLabels[d] + '</label>';
    }).join('&nbsp;');

    // Remove existing before re-adding to prevent duplicates
    var existing = document.getElementById('checkin-reminder-section');
    if (existing) existing.remove();

    var reminderSection = '<div id="checkin-reminder-section" style="margin-top:16px;padding-top:14px;border-top:1.5px dashed #d5ddff;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">' +
      '<div style="font-size:13px;font-weight:700;color:#1e3a5f;">🔔 每日签到提醒</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<select id="reminder-time-select" onchange="updateReminderTime()" style="padding:5px 8px;border:1.5px solid #d5ddff;border-radius:8px;font-size:12px;color:#1e3a5f;background:#fff;cursor:pointer;">' +
      '<option value="08:00"' + (res.reminder_time === '08:00' ? ' selected' : '') + '>08:00</option>' +
      '<option value="09:00"' + (res.reminder_time === '09:00' ? ' selected' : '') + '>09:00</option>' +
      '<option value="10:00"' + (res.reminder_time === '10:00' ? ' selected' : '') + '>10:00</option>' +
      '<option value="12:00"' + (res.reminder_time === '12:00' ? ' selected' : '') + '>12:00</option>' +
      '<option value="18:00"' + (res.reminder_time === '18:00' ? ' selected' : '') + '>18:00</option>' +
      '<option value="20:00"' + (res.reminder_time === '20:00' ? ' selected' : '') + '>20:00</option>' +
      '<option value="21:00"' + (res.reminder_time === '21:00' ? ' selected' : '') + '>21:00</option>' +
      '</select>' +
      '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;">' +
      '<input type="checkbox" id="reminder-enabled" ' + (res.reminder_enabled ? 'checked' : '') + ' onchange="toggleReminder(this.checked)" style="width:15px;height:15px;accent-color:#667eea;cursor:pointer;">' +
      '<span style="color:#667eea;font-weight:600;">启用</span>' +
      '</label>' +
      '</div></div>' +
      '<div id="reminder-days-row" style="margin-bottom:8px;font-size:12px;color:#64748b;' + (res.reminder_enabled ? '' : 'opacity:0.4;pointer-events:none;') + '">' +
      '<div style="margin-bottom:5px;font-size:11px;color:#94a3b8;">推送日期：</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + daysHtml + '</div>' +
      '</div>' +
      '<div id="push-status" style="font-size:11px;color:#94a3b8;margin-top:6px;">' +
      (isSubscribed ? '✅ 浏览器通知已开启' : '⚠️ 请先允许浏览器通知推送权限') +
      '</div>' +
      '</div>';

    panel.insertAdjacentHTML('beforeend', reminderSection);

    // Auto-subscribe to push if enabled but not subscribed
    if (res.reminder_enabled && !isSubscribed) {
      subscribePush();
    }
  } catch (e) {
    console.warn('Reminder settings load failed:', e);
  }
}

async function toggleReminder(enabled) {
  try {
    var time = document.getElementById('reminder-time-select').value;
    var days = getReminderDays();
    await api('/reminder/settings', {
      method: 'PUT',
      body: JSON.stringify({ reminder_enabled: enabled, reminder_time: time, reminder_days: days.join(',') })
    });
    document.getElementById('reminder-days-row').style.opacity = enabled ? '1' : '0.4';
    document.getElementById('reminder-days-row').style.pointerEvents = enabled ? '' : 'none';
    if (enabled) subscribePush();
    showToast(enabled ? '提醒已开启' : '提醒已关闭', 'success');
  } catch (e) { showToast('设置失败', 'error'); }
}

async function updateReminderTime() {
  var enabled = document.getElementById('reminder-enabled').checked;
  var time = document.getElementById('reminder-time-select').value;
  var days = getReminderDays();
  await api('/reminder/settings', {
    method: 'PUT',
    body: JSON.stringify({ reminder_enabled: enabled, reminder_time: time, reminder_days: days.join(',') })
  });
}

function updateReminderDays(checkbox) {
  var enabled = document.getElementById('reminder-enabled').checked;
  var time = document.getElementById('reminder-time-select').value;
  var days = getReminderDays();
  api('/reminder/settings', {
    method: 'PUT',
    body: JSON.stringify({ reminder_enabled: enabled, reminder_time: time, reminder_days: days.join(',') })
  });
}

function getReminderDays() {
  var checkboxes = document.querySelectorAll('#reminder-days-row input[type="checkbox"]');
  return Array.from(checkboxes).filter(function(cb){ return cb.checked; }).map(function(cb){ return cb.value; });
}

async function subscribePush() {
  if (!('Notification' in window)) {
    document.getElementById('push-status').textContent = '⚠️ 您的浏览器不支持通知推送';
    return;
  }
  var permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    document.getElementById('push-status').textContent = '⚠️ 拒绝了通知权限，请到浏览器设置开启';
    return;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    document.getElementById('push-status').textContent = '⚠️ 浏览器不支持 Push API';
    return;
  }
  try {
    var reg = await navigator.serviceWorker.register('/sw.js');
    var sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array('BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U')
    });
    await api('/reminder/subscribe', {
      method: 'POST',
      body: JSON.stringify(sub.toJSON())
    });
    document.getElementById('push-status').textContent = '✅ 浏览器通知已开启！';
    showToast('推送订阅成功', 'success');
  } catch (e) {
    console.warn('Push subscribe failed:', e);
    document.getElementById('push-status').textContent = '⚠️ 订阅失败，请刷新重试';
  }
}

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = window.atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function doCheckin() {
  const btn = document.querySelector('.checkin-action button');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '签到中...';
  }
  try {
    const res = await api('/checkin/checkin', { method: 'POST' });
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast(res.message, 'success');
    loadCheckinStatus();
    loadNotifCount();
  } catch (e) {
    showToast('签到失败', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🎁 立即签到';
    }
  }
}

function switchCheckinTab(tab) {
  var signBtn = document.getElementById('tab-sign-btn');
  var histBtn = document.getElementById('tab-history-btn');
  if (tab === 'sign') {
    if (signBtn) { signBtn.classList.add('active'); signBtn.style.color = '#667eea'; }
    if (histBtn) { histBtn.classList.remove('active'); histBtn.style.color = '#94a3b8'; }
    var sp = document.getElementById('checkin-sign-panel');
    var hp = document.getElementById('checkin-history-panel');
    if (sp) sp.style.display = '';
    if (hp) hp.style.display = 'none';
    loadCheckinStatus();
  } else {
    if (signBtn) { signBtn.classList.remove('active'); signBtn.style.color = '#94a3b8'; }
    if (histBtn) { histBtn.classList.add('active'); histBtn.style.color = '#667eea'; }
    var sp2 = document.getElementById('checkin-sign-panel');
    var hp2 = document.getElementById('checkin-history-panel');
    if (sp2) sp2.style.display = 'none';
    if (hp2) hp2.style.display = '';
    loadCheckinHistory();
  }
}

async function loadCheckinHistory() {
  var el = document.getElementById('checkin-history-body');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">加载中...</div>';
  try {
    var res = await api('/checkin/history?limit=60');
    var records = res.history || [];
    if (records.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;">暂无签到记录，开始你的第一次签到吧～</div>';
      return;
    }
    var dateMap = {};
    records.forEach(function(r) { dateMap[r.checkin_date] = r; });
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var monthName = year + '年' + (month + 1) + '月';
    var cells = [];
    for (var i = 0; i < firstDay; i++) { cells.push('<div style="width:36px;height:36px;"></div>'); }
    for (var d = 1; d <= daysInMonth; d++) {
      var mm = String(month + 1).padStart(2, '0');
      var dd = String(d).padStart(2, '0');
      var dateStr = year + '-' + mm + '-' + dd;
      var rec = dateMap[dateStr];
      if (rec) {
        cells.push('<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;" title="' + dateStr + ' 连续' + rec.streak_before + '天 +' + rec.points_earned + '分">🔥</div>');
      } else {
        cells.push('<div style="width:36px;height:36px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:12px;">' + d + '</div>');
      }
    }
    var recentHtml = records.slice(0, 10).map(function(r) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#f8fafc;border-radius:8px;font-size:13px;">' +
        '<span style="color:#1e3a5f;">' + r.checkin_date + '</span>' +
        '<span style="color:#10b981;font-weight:700;">+' + r.points_earned + '积分</span>' +
        '<span style="color:#94a3b8;font-size:12px;">🔥' + r.streak_before + '天</span></div>';
    }).join('');
    el.innerHTML = '<div style="margin-bottom:12px;font-size:13px;color:#667eea;font-weight:700;">' + monthName + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:16px;">' + cells.join('') + '</div>' +
      '<div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">最近签到记录：</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">' + recentHtml + '</div>';
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">加载失败</div>';
  }
}

window.switchCheckinTab = switchCheckinTab;
window.loadCheckinHistory = loadCheckinHistory;


async function loadSettings() {
  try {
    bindThemeSelector();
    applyTheme(getStoredTheme(), false);

    const res = await api('/profile/me');
    const hobbiesRes = await api('/profile/hobbies');

    if (res.error) {
      showToast(res.error, 'error', 2800);
      return;
    }
    if (hobbiesRes.error) {
      showToast(hobbiesRes.error, 'error', 2800);
      return;
    }

    const user = res.user;
    const userHobbies = res.hobbies;
    const allHobbies = hobbiesRes.hobbies;

    // Set basic info
    document.getElementById('settings-nickname').value = user.nickname || '';
    document.getElementById('settings-bio').value = user.bio || '';

    // Set avatar
    const avatarPreview = document.getElementById('settings-avatar-preview');
    const avatarLetter = document.getElementById('settings-avatar-letter');
    if (user.avatar) {
      avatarPreview.innerHTML = `<img src="${user.avatar}" alt="avatar">`;
    } else {
      avatarLetter.textContent = (user.nickname || user.username)[0].toUpperCase();
    }

    // Build hobby grid
    const hobbyGrid = document.getElementById('hobby-grid');
    const selectedIds = userHobbies.map(h => h.id);

    hobbyGrid.innerHTML = allHobbies.map(h => `
      <div class="hobby-chip ${selectedIds.includes(h.id) ? 'selected' : ''}" 
           data-id="${h.id}" 
           onclick="toggleHobby(this)">
        <span class="hobby-icon">${h.icon}</span>
        <span>${h.name}</span>
      </div>
    `).join('');

    const themeSelector = document.getElementById('settings-theme');
    if (themeSelector) {
      themeSelector.value = getStoredTheme();
    }

  } catch (e) {
    console.error(e);
    showToast('加载设置失败', 'error', 2800);
  } finally {
    // Always load check-in and email binding independently
    loadCheckinStatus();
    loadEmailBind();
    // Load push subscription status
    initPushNotification();
  }
}

// ============ PUSH NOTIFICATION ============
async function initPushNotification() {
  const toggle = document.getElementById('push-toggle');
  const status = document.getElementById('push-status');
  if (!toggle) return;

  try {
    // Check if service worker is supported
    if (!('serviceWorker' in navigator)) {
      status.textContent = '(浏览器不支持)';
      toggle.disabled = true;
      return;
    }
    if (!('Notification' in window)) {
      status.textContent = '(浏览器不支持)';
      toggle.disabled = true;
      return;
    }

    // Check current subscription status
    const res = await api('/push/status');
    if (res.subscribed) {
      toggle.checked = true;
      status.textContent = Notification.permission === 'granted' ? '(已开启)' : '(需授权)';
    } else {
      toggle.checked = false;
      status.textContent = '(未开启)';
    }
  } catch (e) {
    status.textContent = '(服务不可用)';
    toggle.disabled = true;
  }
}

async function handlePushToggle(checkbox) {
  const status = document.getElementById('push-status');
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    showToast('当前浏览器不支持推送通知', 'error');
    checkbox.checked = false;
    return;
  }

  if (checkbox.checked) {
    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('请允许通知权限', 'error');
      checkbox.checked = false;
      status.textContent = '(已拒绝)';
      return;
    }

    // Subscribe
    try {
      const reg = await navigator.serviceWorker.register('/push-sw.js');
      const vapidRes = await api('/push/vapid-key');
      if (vapidRes.error) {
        showToast('推送服务未配置', 'error');
        checkbox.checked = false;
        status.textContent = '(服务未配置)';
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidRes.key)
      });

      await api('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });

      showToast('已开启浏览器通知', 'success');
      status.textContent = '(已开启)';
    } catch (e) {
      console.error('[Push] 订阅失败:', e);
      showToast('开启通知失败: ' + (e.message || '未知错误'), 'error');
      checkbox.checked = false;
    }
  } else {
    // Unsubscribe
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await api('/push/unsubscribe', { method: 'POST' });
      showToast('已关闭浏览器通知', 'success');
      status.textContent = '(未开启)';
    } catch (e) {
      console.error('[Push] 取消订阅失败:', e);
    }
  }
}

// Utility: convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ============ EMAIL BINDING ============
let emailBindCountdown = 0;
let emailBindTimer = null;

async function loadEmailBind() {
  const area = document.getElementById('email-bind-area');
  if (!area) return;
  try {
    const res = await api('/profile/me');

    // If error (not logged in / token expired), show login
    if (res.error) {
      area.innerHTML = '<div style="color:#94a3b8;font-size:13px;">请先 <a href="#" onclick="showLogin();return false;">登录</a> 后绑定邮箱</div>';
      return;
    }

    const user = res.user || {};
    const isVerified = user.email_verified === 1;
    const email = user.email || '';

    if (email && isVerified) {
      area.innerHTML = `
        <div class="email-bound">
          <span class="email-bound-info">📧 ${escapeHtml(email)}</span>
          <span class="email-verified-badge">已验证</span>
          <button class="btn-secondary btn-small" onclick="showEmailChange()">更换邮箱</button>
        </div>
      `;
    } else {
      area.innerHTML = `
        <div class="email-bind-form" id="email-bind-form">
          <div class="email-input-row">
            <input type="email" id="email-input" placeholder="输入邮箱地址" value="${escapeHtml(email)}">
            <button id="btn-send-email-code" class="btn-secondary" onclick="sendEmailCode()">发送验证码</button>
          </div>
          <div id="email-verify-row" style="display:none;margin-top:8px;">
            <div class="email-input-row">
              <input type="text" id="email-code-input" placeholder="输入6位验证码" maxlength="6">
              <button id="btn-bind-email" class="btn-primary" onclick="verifyEmailCode()">绑定邮箱</button>
            </div>
            <div id="email-code-timer" style="font-size:12px;color:#888;margin-top:4px;"></div>
          </div>
          <div id="email-bind-msg" style="font-size:13px;margin-top:6px;"></div>
        </div>
      `;
    }
  } catch (e) {
    console.error('[loadEmailBind]', e);
    area.innerHTML = '<div style="color:#888;">加载失败</div>';
  }
}

async function sendEmailCode() {
  const email = document.getElementById('email-input').value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast('请输入正确的邮箱地址', 'error');
    return;
  }

  const btn = document.getElementById('btn-send-email-code');
  btn.disabled = true;
  btn.textContent = '发送中...';

  try {
    const res = await api('/email/send-code', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast(res.message, 'success');

    // Show verify row
    document.getElementById('email-verify-row').style.display = 'block';
    document.getElementById('email-code-input').focus();

    // Start countdown
    emailBindCountdown = 60;
    clearInterval(emailBindTimer);
    updateEmailCountdown();
  } catch (e) {
    showToast('发送失败', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '发送验证码';
  }
}

function updateEmailCountdown() {
  const el = document.getElementById('email-code-timer');
  if (!el) return;
  if (emailBindCountdown <= 0) {
    el.textContent = '';
    emailBindTimer = null;
    return;
  }
  el.textContent = `验证码 ${emailBindCountdown}s 后可重新发送`;
  emailBindCountdown--;
  emailBindTimer = setTimeout(updateEmailCountdown, 1000);
}

async function verifyEmailCode() {
  const email = document.getElementById('email-input').value.trim();
  const code = document.getElementById('email-code-input').value.trim();
  if (!code || code.length !== 6) {
    showToast('请输入6位验证码', 'error');
    return;
  }

  const btn = document.getElementById('btn-bind-email');
  btn.disabled = true;
  btn.textContent = '绑定中...';

  try {
    const res = await api('/email/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    });
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast(res.message, 'success');
    loadEmailBind();
  } catch (e) {
    showToast('绑定失败', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '绑定邮箱';
  }
}

function showEmailChange() {
  const area = document.getElementById('email-bind-area');
  area.innerHTML = `
    <div class="email-bind-form" id="email-bind-form">
      <div class="email-input-row">
        <input type="email" id="email-input" placeholder="输入新邮箱地址">
        <button id="btn-send-email-code" class="btn-secondary" onclick="sendEmailCode()">发送验证码</button>
      </div>
      <div id="email-verify-row" style="display:none;margin-top:8px;">
        <div class="email-input-row">
          <input type="text" id="email-code-input" placeholder="输入6位验证码" maxlength="6">
          <button id="btn-bind-email" class="btn-primary" onclick="verifyEmailCode()">绑定邮箱</button>
        </div>
        <div id="email-code-timer" style="font-size:12px;color:#888;margin-top:4px;"></div>
      </div>
      <div id="email-bind-msg" style="font-size:13px;margin-top:6px;"></div>
    </div>
  `;
}

function toggleHobby(el) {
  el.classList.toggle('selected');
}

async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showToast('图片不能超过2MB', 'error', 2800);
    return;
  }

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res = await fetch(`${API_BASE}/profile/avatar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    }).then(r => r.json());

    if (res.avatar) {
      const avatarPreview = document.getElementById('settings-avatar-preview');
      avatarPreview.innerHTML = `<img src="${res.avatar}" alt="avatar">`;
      showToast('头像上传成功', 'success');
    } else {
      showToast('上传失败', 'error', 2800);
    }
  } catch (e) {
    showToast('上传失败', 'error', 2800);
  }

  event.target.value = '';
}

async function saveSettings() {
  const saveBtn = document.getElementById('btn-save-settings');
  const originalText = saveBtn ? saveBtn.textContent : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
  }

  const nickname = document.getElementById('settings-nickname').value.trim();
  const bio = document.getElementById('settings-bio').value.trim();
  const selectedTheme = document.getElementById('settings-theme')?.value || 'mint';
  applyTheme(selectedTheme, true);

  const selectedHobbies = Array.from(document.querySelectorAll('#hobby-grid .hobby-chip.selected'))
    .map(el => Number(el.dataset.id))
    .filter(id => Number.isInteger(id) && id > 0);

  try {
    const res = await api('/profile/me', {
      method: 'PUT',
      body: JSON.stringify({ nickname, bio, hobby_ids: selectedHobbies })
    });

    if (res.user) {
      // Update stored user
      const user = getUser() || {};
      user.id = res.user.id;
      user.username = res.user.username;
      user.nickname = res.user.nickname;
      user.avatar = res.user.avatar;
      user.bio = res.user.bio;
      user.role = res.user.role;
      localStorage.setItem('user', JSON.stringify(user));
      updateNav();

      showToast('设置已保存', 'success');
      goHome();
    } else {
      showToast(res.error || '保存失败', 'error', 2800);
    }
  } catch (e) {
    showToast('保存失败', 'error', 2800);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText || '保存设置';
    }
  }
}

// Profile
async function loadProfile(userId) {
  window._currentProfileUserId = userId;
  try {
    const res = await api(`/users/${userId}`);
    const profileRes = await api('/profile/me');
    const userHobbies = userId === getUser()?.id ? profileRes.hobbies : [];

    const avatarContent = res.user.avatar
      ? `<img src="${res.user.avatar}" alt="avatar">`
      : (res.user.nickname || res.user.username)[0].toUpperCase();

    const isSelf = userId === getUser()?.id;
    const level = getUserLevel(res.user.points);
    const levelColor = level.color || '#667eea';
    const levelIcon = level.icon || '⭐';
    const levelName = level.name || '新手上路';

    document.getElementById('profile-content').innerHTML = `
      <div class="profile-page">
        <div class="profile-hero" style="background:linear-gradient(135deg,${levelColor}22,${levelColor}11);border-radius:18px;padding:24px 20px 20px;text-align:center;margin-bottom:20px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;background:${levelColor}18;border-radius:50%;"></div>
          <div style="position:absolute;bottom:-10px;left:-10px;width:80px;height:80px;background:${levelColor}15;border-radius:50%;"></div>
          <div class="profile-avatar-lg" style="width:88px;height:88px;border-radius:50%;background:linear-gradient(140deg,${levelColor},${levelColor}bb);display:flex;align-items:center;justify-content:center;color:#fff;font-size:36px;font-weight:700;margin:0 auto 12px;overflow:hidden;box-shadow:0 4px 16px ${levelColor}44;border:3px solid #fff;">
            ${res.user.avatar ? `<img src="${res.user.avatar}" alt="avatar" style="width:100%;height:100%;object-fit:cover;">` : (res.user.nickname || res.user.username)[0].toUpperCase()}
          </div>
          <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <h2 style="font-size:22px;color:#1e3a5f;margin:0;">${escapeHtml(res.user.nickname || res.user.username)}</h2>
            <span style="background:${levelColor}22;color:${levelColor};border:1px solid ${levelColor}44;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;">${levelIcon} ${levelName}</span>
            ${res.user.role === 'admin' ? '<span style="background:#ef444422;color:#ef4444;border:1px solid #ef444444;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;">👑 管理员</span>' : ''}
          </div>
          <p style="color:#627582;font-size:14px;margin:0 0 14px;">${escapeHtml(res.user.bio || '这个人很懒，什么都没写')}</p>
          ${userHobbies.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">${userHobbies.map(h => `<span style="background:#f0f2ff;color:#5d6dff;font-size:12px;padding:3px 10px;border-radius:20px;"><span>${h.icon}</span> ${h.name}</span>`).join('')}</div>` : ''}
          <div class="profile-stats-row" style="display:flex;gap:0;margin-top:16px;background:rgba(255,255,255,0.7);border-radius:12px;padding:4px;border:1px solid ${levelColor}22;">
            <div style="flex:1;text-align:center;padding:8px 4px;">
              <div style="font-size:18px;font-weight:800;color:#1e3a5f;">${res.user.points}</div>
              <div style="font-size:11px;color:#94a3b8;">积分</div>
            </div>
            <div style="width:1px;background:${levelColor}22;margin:8px 0;"></div>
            <div style="flex:1;text-align:center;padding:8px 4px;">
              <div style="font-size:18px;font-weight:800;color:#1e3a5f;">${res.posts.length}</div>
              <div style="font-size:11px;color:#94a3b8;">帖子</div>
            </div>
            <div style="width:1px;background:${levelColor}22;margin:8px 0;"></div>
            <div style="flex:1;text-align:center;padding:8px 4px;">
              <div style="font-size:18px;font-weight:800;color:#f97316;">🔥 ${res.user.checkin_streak || 0}</div>
              <div style="font-size:11px;color:#94a3b8;">连续签到</div>
            </div>
            <div id="profile-followers-stat" style="width:1px;background:${levelColor}22;margin:8px 0;"></div>
            <div style="flex:1;text-align:center;padding:8px 4px;cursor:pointer;border-radius:8px;transition:background 0.2s;" onclick="showFollowList(${userId}, 'followers')" title="查看粉丝列表">
              <div style="font-size:18px;font-weight:800;color:#667eea;" id="profile-followers-count">-</div>
              <div style="font-size:11px;color:#94a3b8;">粉丝</div>
            </div>
            <div style="width:1px;background:${levelColor}22;margin:8px 0;"></div>
            <div style="flex:1;text-align:center;padding:8px 4px;cursor:pointer;border-radius:8px;transition:background 0.2s;" onclick="showFollowList(${userId}, 'following')" title="查看关注列表">
              <div style="font-size:18px;font-weight:800;color:#10b981;" id="following-count">-</div>
              <div style="font-size:11px;color:#94a3b8;">关注</div>
            </div>
          </div>
          ${!isSelf ? `<div style="margin-top:14px;"><button id="btn-follow" class="btn-follow" onclick="toggleFollow(${userId})" style="min-width:120px;">+ 关注</button><button class="btn-follow" style="margin-left:8px;background:linear-gradient(135deg,#5d6dff22,#7e5ad622);border:1.5px solid #d5ddff;color:#667eea;" onclick="startChat(${userId})">💬 发私信</button></div>` : ''}
          ${isSelf ? `<div style="margin-top:14px;font-size:12px;color:#94a3b8;">🕐 加入于 ${formatDate(res.user.created_at)}</div>` : ''}
        </div>
        ${isSelf ? `<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
          <button onclick="goSettings()" style="flex:1;padding:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">⚙️ 编辑个人资料</button>
          <button onclick="goCheckin()" style="flex:1;padding:12px;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">🎁 每日签到</button>
        </div>` : ''}
        ${isSelf ? `
        <div class="profile-tabs" style="display:flex;gap:0;background:#f0f2ff;border-radius:12px;padding:4px;margin-bottom:16px;">
          <button id="tab-posts-btn" class="profile-tab-btn active" onclick="switchProfileTab('posts')" style="flex:1;padding:8px;border:none;border-radius:8px;background:transparent;font-size:14px;font-weight:600;cursor:pointer;color:#667eea;">📝 帖子</button>
          <button id="tab-activity-btn" class="profile-tab-btn" onclick="switchProfileTab('activity')" style="flex:1;padding:8px;border:none;border-radius:8px;background:transparent;font-size:14px;font-weight:600;cursor:pointer;color:#94a3b8;">🔥 活跃</button>
          <button id="tab-fav-btn" class="profile-tab-btn" onclick="switchProfileTab('favorites')" style="flex:1;padding:8px;border:none;border-radius:8px;background:transparent;font-size:14px;font-weight:600;cursor:pointer;color:#94a3b8;">⭐ 收藏</button>
        </div>
        <div id="profile-tab-posts">
          <h3 style="font-size:16px;color:#667eea;font-weight:700;margin-bottom:12px;">📝 他的帖子 <span style="font-size:13px;color:#94a3b8;font-weight:400;">(${res.posts.length})</span></h3>
          <div class="post-list">
            ${res.posts.length ? res.posts.map(p => `
              <div class="post-card" onclick="viewPost(${p.id})" style="cursor:pointer;padding:14px 16px;border-bottom:1px solid #f0f4f8;">
                <div style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">${escapeHtml(p.title)}</div>
                <div style="display:flex;gap:8px;align-items:center;font-size:12px;color:#94a3b8;flex-wrap:wrap;">
                  ${p.tag_name ? `<span style="background:${p.tag_color}33;color:${p.tag_color};padding:2px 8px;border-radius:10px;font-weight:600;">${escapeHtml(p.tag_name)}</span>` : ''}
                  <span>💬 ${p.comment_count}</span>
                  <span>🕐 ${formatDate(p.created_at)}</span>
                </div>
              </div>
            `).join('') : '<div style="text-align:center;padding:32px;color:#94a3b8;font-size:14px;">暂无帖子</div>'}
          </div>
        </div>
        <div id="profile-tab-activity" style="display:none;">
          <div id="activity-heatmap"><div style="text-align:center;padding:32px;color:#94a3b8;">加载中...</div></div>
        </div>
        <div id="profile-tab-favorites" style="display:none;">
          <h3 style="font-size:16px;color:#667eea;font-weight:700;margin-bottom:12px;">⭐ 我的收藏</h3>
          <div id="favorites-list"><div style="text-align:center;padding:32px;color:#94a3b8;font-size:14px;">加载中...</div></div>
        </div>
        ` : `
        <h3 style="font-size:16px;color:#667eea;font-weight:700;margin-bottom:12px;">📝 他的帖子 <span style="font-size:13px;color:#94a3b8;font-weight:400;">(${res.posts.length})</span></h3>
        <div class="post-list">
          ${res.posts.length ? res.posts.map(p => `
            <div class="post-card" onclick="viewPost(${p.id})" style="cursor:pointer;padding:14px 16px;border-bottom:1px solid #f0f4f8;">
              <div style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">${escapeHtml(p.title)}</div>
              <div style="display:flex;gap:8px;align-items:center;font-size:12px;color:#94a3b8;flex-wrap:wrap;">
                ${p.tag_name ? `<span style="background:${p.tag_color}33;color:${p.tag_color};padding:2px 8px;border-radius:10px;font-weight:600;">${escapeHtml(p.tag_name)}</span>` : ''}
                <span>💬 ${p.comment_count}</span>
                <span>🕐 ${formatDate(p.created_at)}</span>
              </div>
            </div>
          `).join('') : '<div style="text-align:center;padding:32px;color:#94a3b8;font-size:14px;">暂无帖子</div>'}
        </div>
        `}
      </div>
    `;

    // Load follow status for non-self profiles

    // Load follow status for non-self profiles
    if (!isSelf) {
      loadFollowStatus(userId);
    }
  } catch (e) {
    console.error(e);
  }
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[c]));
}

function sanitizeImageUrl(url) {
  if (!url) return '';
  const cleanUrl = String(url).trim().replace(/&amp;/g, '&');
  if (/^\/uploads\/[\w\-./%]+$/i.test(cleanUrl)) return cleanUrl;
  if (/^https?:\/\/[^\s]+$/i.test(cleanUrl)) return cleanUrl;
  return '';
}

function copyCode(btn) {
  var pre = btn.closest('.md-code-block');
  if (!pre) return;
  var code = pre.querySelector('code');
  if (!code) return;
  var text = code.textContent;
  // Include collapsed lines if any
  var collapsed = pre.querySelector('.code-collapsed-lines');
  if (collapsed) text += '\n' + collapsed.textContent;
  navigator.clipboard.writeText(text).then(function() {
    btn.textContent = '✅';
    setTimeout(function() { btn.textContent = '📋'; }, 1500);
  }).catch(function() {
    btn.textContent = '❌';
    setTimeout(function() { btn.textContent = '📋'; }, 1500);
  });
}

function expandCode(id, btn) {
  var collapsed = document.getElementById(id);
  if (!collapsed) return;
  var isHidden = collapsed.style.display === 'none' || !collapsed.style.display;
  if (isHidden) {
    collapsed.style.display = 'block';
    btn.textContent = '收起 ▲';
  } else {
    collapsed.style.display = 'none';
    btn.textContent = '展开 ' + collapsed.textContent.split('\n').length + ' 行 ▼';
  }
}

function renderContent(str) {
  if (!str) return '';
  let html = str; // NO escapeHtml here first - process markdown FIRST

  // Step 1: Escape HTML first (neutralizes raw < > & to prevent XSS)
  html = escapeHtml(html);

  // Step 2: Match markdown images (unescaped brackets/parens survive escapeHtml)
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function(match, alt, url) {
    // Only & in URL needs decoding (other chars don't get escaped)
    url = url.replace(/&amp;/g, '&');
    alt = alt.replace(/&amp;/g, '&');
    return '<img class="post-inline-image" src="' + url + '" alt="' + alt + '" loading="lazy">';
  });

  // Step 3: Standalone upload URLs: /uploads/...png wrapped in <br>
  html = html.replace(/(^|<br>)(\/uploads\/[\w\-./%]+?\.(?:png|jpe?g|gif|webp))(?=<br>|$)/gi, function(all, prefix, url) {
    url = url.replace(/&amp;/g, '&');
    return prefix + '<img class="post-inline-image" src="' + url + '" alt="帖子图片" loading="lazy">';
  });

  // Step 5: Code blocks (```...```) - styled with traffic lights + copy + collapse
  html = html.replace(/```([\s\S]*?)```/g, function(match, code) {
    code = code.trim();
    var lines = code.split('\n');
    var isLong = lines.length > 10;
    var displayCode = isLong ? lines.slice(0, 10).join('\n') : code;
    var lineCount = lines.length;
    var collapsedId = 'code-' + Math.random().toString(36).substr(2, 9);
    var headerBtns = '<div class="code-header-btns"><span class="code-dot" style="background:#ff5f56;"></span><span class="code-dot" style="background:#ffbd2e;"></span><span class="code-dot" style="background:#27c93f;"></span></div>';
    var copyBtn = '<button class="code-copy-btn" onclick="copyCode(this)" title="复制代码">📋</button>';
    var expandBtn = isLong ? '<button class="code-expand-btn" onclick="expandCode(\'' + collapsedId + '\', this)">展开 ' + lineCount + ' 行 ▼</button>' : '';
    var collapseSection = isLong ? '<div id="' + collapsedId + '" class="code-collapsed-lines" style="display:none;">' + escapeHtml(lines.slice(10).join('\n')) + '</div>' : '';
    return '<pre class="md-code-block">' + headerBtns + copyBtn + '<code>' + escapeHtml(displayCode) + '</code>' + collapseSection + (isLong ? '<div class="code-fade-overlay"></div>' : '') + expandBtn + '</pre>';
  });

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Bold (**...**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic (*...*)
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

  // Headers (### ...  ## ...  # ...)
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');

  // Unordered lists (- item or * item)
  html = html.replace(/^[-*] (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/(<li class="md-li">.*<\/li>)(?=\n(?!<li))/gs, '$1');

  // Blockquote (> quote)
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-quote">$1</blockquote>');

  // Step 4: Standalone upload image URLs (before newlines become <br>)
  html = html.replace(/(^|\n)(\/uploads\/[\w\-./%]+?\.(?:png|jpe?g|gif|webp))(?=\n|$)/gi, function(all, prefix, url) {
    url = url.replace(/&amp;/g, '&');
    return '<img class="post-inline-image" src="' + url + '" alt="帖子图片" loading="lazy">';
  });

  // Convert newlines to <br> (but preserve existing tags)
  html = html.replace(/\n/g, '<br>');
  return html;
}

// Notifications
async function loadNotifCount() {
  try {
    const res = await api('/notifications/unread-count');
    const badge = document.getElementById('notif-badge');
    if (res.count > 0) {
      badge.textContent = res.count > 99 ? '99+' : res.count;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
    // Also update bottom nav badge
    var bnBadge = document.getElementById('bn-notif-badge');
    if (bnBadge) {
      if (res.count > 0) {
        bnBadge.textContent = res.count > 99 ? '99+' : res.count;
        bnBadge.style.display = 'flex';
      } else {
        bnBadge.style.display = 'none';
      }
    }
  } catch (e) {
    console.error(e);
  }
}

let notifPage = 1;
let notifFilter = '';
let notifTotal = 0;
let notifLimit = 15;

async function openNotifications() {
  setBottomNav('notif');
  const user = getUser();
  if (!user) return showLogin();
  document.getElementById('notif-modal').style.display = 'flex';
  notifPage = 1;
  notifFilter = '';
  var filterBtns = document.querySelectorAll('.notif-filter-btn');
  filterBtns.forEach(function(b) { b.classList.remove('active'); });
  var allBtn = document.getElementById('notif-filter-tabs');
  if (allBtn) allBtn.querySelector('.notif-filter-btn') && allBtn.querySelector('.notif-filter-btn').classList.add('active');
  loadNotifications();
}

function closeNotifications() {
  document.getElementById('notif-modal').style.display = 'none';
}

function setNotifFilter(type) {
  notifFilter = type;
  notifPage = 1;
  var filterBtns = document.querySelectorAll('.notif-filter-btn');
  filterBtns.forEach(function(b) { b.classList.remove('active'); });
  if (event && event.target && event.target.classList) event.target.classList.add('active');
  loadNotifications();
}

async function loadNotifications() {
  const container = document.getElementById('notif-list');
  if (container) container.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;">加载中...</div>';

  try {
    var url = '/notifications?page=' + notifPage + '&limit=' + notifLimit;
    if (notifFilter) url += '&type=' + notifFilter;
    const res = await api(url);
    const list = document.getElementById('notif-list');
    notifTotal = res.total || 0;

    document.getElementById('notif-unread-count').textContent = res.unreadCount > 0 ? res.unreadCount + '条未读' : '';

    if (!res.notifications || res.notifications.length === 0) {
      if (list) list.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px;">暂无通知</div>';
      document.getElementById('notif-pagination').style.display = 'none';
      return;
    }

    var typeClassMap = {
      new_comment: 'comment',
      new_reply: 'reply',
      post_approved: 'approved',
      post_rejected: 'rejected',
      mention: 'mention',
      system: 'system'
    };

    if (list) {
      list.innerHTML = res.notifications.map(function(n) {
        var tc = typeClassMap[n.type] || 'system';
        return '<div class="notif-item ' + (n.is_read ? '' : 'unread') + '" onclick="handleNotifClick(' + n.id + ',' + (n.post_id || 'null') + ')">' +
          '<div class="notif-title"><span class="notif-type-badge ' + tc + '">' + (n.typeLabel || '通知') + '</span>' + escapeHtml(n.title) + '</div>' +
          '<div class="notif-content">' + escapeHtml(n.content || '') + '</div>' +
          '<div class="notif-time">' + formatDate(n.created_at) + '</div></div>';
      }).join('');
    }

    var totalPages = Math.ceil(notifTotal / notifLimit);
    document.getElementById('notif-pagination').style.display = totalPages > 1 ? 'flex' : 'none';
    document.getElementById('notif-page-info').textContent = '第' + notifPage + '/' + totalPages + '页，共' + notifTotal + '条';
    var prevBtn = document.getElementById('notif-prev');
    var nextBtn = document.getElementById('notif-next');
    if (prevBtn) prevBtn.disabled = notifPage <= 1;
    if (nextBtn) nextBtn.disabled = notifPage >= totalPages;

  } catch (e) {
    console.error(e);
    if (container) container.innerHTML = '<div style="text-align:center;padding:32px;color:#ef4444;">加载失败</div>';
  }
}

async function loadNotificationsPrev() {
  if (notifPage <= 1) return;
  notifPage--;
  loadNotifications();
}

async function loadNotificationsNext() {
  var totalPages = Math.ceil(notifTotal / notifLimit);
  if (notifPage >= totalPages) return;
  notifPage++;
  loadNotifications();
}

// ============ Follow System ============
let followCache = {}; // userId -> { isFollowing, followers_count, following_count }

async function toggleFollow(targetId) {
  if (!user) { showToast('请先登录', 'error'); return; }
  var btn = document.getElementById('btn-follow');
  var currentState = followCache[targetId] && followCache[targetId].isFollowing;

  try {
    if (currentState) {
      // Unfollow
      var res = await api('/follow/' + targetId, { method: 'DELETE' });
      if (res.error) { showToast(res.error, 'error'); return; }
      showToast('已取消关注', 'success');
      if (followCache[targetId]) followCache[targetId].isFollowing = false;
    } else {
      // Follow
      var res2 = await api('/follow/' + targetId, { method: 'POST' });
      if (res2.error) { showToast(res2.error, 'error'); return; }
      showToast('关注成功！', 'success');
      if (followCache[targetId]) followCache[targetId].isFollowing = true;
    }
    // Update button
    if (btn) {
      btn.textContent = currentState ? '+ 关注' : '已关注 ✓';
      btn.style.background = currentState ? '' : 'linear-gradient(135deg,#10b981,#059669)';
      btn.style.color = currentState ? '' : '#fff';
      btn.style.borderColor = currentState ? '' : 'transparent';
    }
    // Update counts in header if shown
    var followerEl = document.getElementById('follower-count');
    if (followerEl && followCache[targetId]) {
      var delta = currentState ? -1 : 1;
      var newCount = (followCache[targetId].followers_count || 0) + delta;
      followerEl.textContent = newCount + ' 粉丝';
    }
  } catch (e) {
    showToast('操作失败，请重试', 'error');
  }
}

async function loadFollowStatus(targetId) {
  try {
    var res = await api('/follow/status/' + targetId);
    if (res.error) return;
    followCache[targetId] = {
      isFollowing: res.is_following,
      followers_count: res.followers_count,
      following_count: res.following_count
    };
    var btn = document.getElementById('btn-follow');
    if (btn) {
      btn.textContent = res.is_following ? '已关注 ✓' : '+ 关注';
      btn.style.background = res.is_following ? 'linear-gradient(135deg,#10b981,#059669)' : '';
      btn.style.color = res.is_following ? '#fff' : '';
      btn.style.borderColor = res.is_following ? 'transparent' : '';
    }
    var fcEl = document.getElementById('follower-count');
    if (fcEl) fcEl.textContent = res.followers_count + ' 粉丝';
    var fingEl = document.getElementById('following-count');
    if (fingEl) fingEl.textContent = res.following_count + ' 关注';
  } catch (e) {}
}

window.toggleFollow = toggleFollow;

async function loadFollowStatus(targetId) {
  try {
    var res = await api('/follow/status/' + targetId);
    if (res.error) return;
    followCache[targetId] = {
      isFollowing: res.is_following,
      followers_count: res.followers_count,
      following_count: res.following_count
    };
    var btn = document.getElementById('btn-follow');
    if (btn) {
      btn.textContent = res.is_following ? '已关注 ✓' : '+ 关注';
      btn.style.background = res.is_following ? 'linear-gradient(135deg,#10b981,#059669)' : '';
      btn.style.color = res.is_following ? '#fff' : '';
      btn.style.borderColor = res.is_following ? 'transparent' : '';
    }
    var fcEl = document.getElementById('follower-count');
    if (fcEl) fcEl.textContent = res.followers_count + ' 粉丝';
    var fingEl = document.getElementById('following-count');
    if (fingEl) fingEl.textContent = res.following_count + ' 关注';
  } catch (e) {}
}

window.loadFollowStatus = loadFollowStatus;
window.goCheckin = goCheckin;
window.startChat = startChat;

function startChat(userId) {
  openMsgDetailFromUser(userId, '用户');
}

// ============ Followers / Following List Modal ============
async function showFollowList(userId, type) {
  window._lastFollowListUserId = userId;
  var modal = document.getElementById('follow-list-modal');
  var title = document.getElementById('follow-list-title');
  var content = document.getElementById('follow-list-content');
  if (!modal) return;
  title.textContent = type === 'followers' ? '👥 粉丝列表' : '👥 关注列表';
  content.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;">加载中...</div>';
  modal.style.display = 'flex';
  loadFollowList(userId, type);
}

async function loadFollowList(userId, type) {
  var content = document.getElementById('follow-list-content');
  if (!content) return;
  try {
    var endpoint = type === 'followers' ? '/followers/' + userId : '/following/' + userId;
    var res = await api(endpoint);
    if (res.error || !res.users) {
      content.innerHTML = '<div style="text-align:center;padding:32px;color:#ef4444;">加载失败</div>';
      return;
    }
    if (res.users.length === 0) {
      content.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;">' + (type === 'followers' ? '还没有粉丝' : '还没有关注') + '</div>';
      return;
    }
    var currentUser = getUser();
    content.innerHTML = res.users.map(function(u) {
      var level = getUserLevel(u.points || 0);
      var levelColor = level.color || '#667eea';
      var levelIcon = level.icon || '⭐';
      var isSelf = currentUser && currentUser.id === u.id;
      var avatarContent = u.avatar
        ? '<img src="' + u.avatar + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
        : (u.nickname || u.username)[0].toUpperCase();
      return '<div style="display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid #f0f4f8;' + (u.avatar ? '' : 'background:linear-gradient(140deg,' + levelColor + ',' + levelColor + 'bb);width:44px;height:44px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;') + '">' +
        '<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(140deg,' + levelColor + ',' + levelColor + 'cc);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;flex-shrink:0;">' + avatarContent + '</div>' +
        '<div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><b style="color:#1e3a5f;font-size:14px;">' + escapeHtml(u.nickname || u.username) + '</b><span style="background:' + levelColor + '22;color:' + levelColor + ';font-size:11px;font-weight:700;padding:1px 6px;border-radius:10px;">' + levelIcon + ' ' + escapeHtml(level.name) + '</span></div><div style="font-size:12px;color:#94a3b8;">积分 ' + (u.points || 0) + '</div></div>' +
        (!isSelf && currentUser ? '<button class="btn-follow" id="fl-btn-' + u.id + '" onclick="toggleFollow(' + u.id + ', true)" style="min-width:72px;padding:6px 12px;font-size:12px;">+ 关注</button>' : '') +
        (!isSelf && currentUser ? '<button onclick="startChat(' + u.id + ')" style="margin-left:6px;background:linear-gradient(135deg,#5d6dff22,#7e5ad622);border:1.5px solid #d5ddff;color:#667eea;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;">💬</button>' : '') +
        (isSelf ? '<span style="font-size:12px;color:#94a3b8;">我</span>' : '') +
        '</div>';
    }).join('');

    // Load follow status for all users in list
    if (currentUser) {
      res.users.forEach(function(u) {
        if (u.id !== currentUser.id) {
          api('/follow/status/' + u.id).then(function(status) {
            var btn = document.getElementById('fl-btn-' + u.id);
            if (!btn) return;
            if (status.is_following) {
              btn.textContent = '已关注 ✓';
              btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
              btn.style.color = '#fff';
              btn.style.borderColor = 'transparent';
              btn.dataset.following = '1';
            }
          });
        }
      });
    }
  } catch (e) {
    content.innerHTML = '<div style="text-align:center;padding:32px;color:#ef4444;">加载失败</div>';
  }
}

function closeFollowList() {
  var modal = document.getElementById('follow-list-modal');
  if (modal) modal.style.display = 'none';
}

// Override toggleFollow to support follow-list modal refresh
var _origToggleFollow = toggleFollow;
async function toggleFollow(userId, fromList) {
  await _origToggleFollow(userId);
  if (fromList) {
    // Re-load the list to update button states
    var modal = document.getElementById('follow-list-modal');
    if (modal && modal.style.display !== 'none') {
      var title = document.getElementById('follow-list-title');
      var type = title && title.textContent.indexOf('粉丝') !== -1 ? 'followers' : 'following';
      var userIdMatch = document.getElementById('follow-list-content');
      // Find the profile user id from the list title
      loadFollowList(window._lastFollowListUserId, type);
    }
  }
}

window.showFollowList = showFollowList;
window.closeFollowList = closeFollowList;
window.loadFollowList = loadFollowList;

// ============ Favorites / Bookmarks ============
async function toggleFavorite(postId) {
  if (!getUser()) { showToast('请先登录', 'error'); return; }
  var btn = document.getElementById('btn-favorite');
  var listBtn = document.getElementById('fav-btn-' + postId);
  var isFav = btn && btn.dataset.favorited === '1';

  try {
    if (isFav) {
      var res = await api('/favorites/' + postId, { method: 'DELETE' });
      if (res.error) { showToast(res.error, 'error'); return; }
      showToast('已取消收藏', 'success');
      if (btn) { btn.textContent = '☆ 收藏'; btn.dataset.favorited = '0'; }
      if (listBtn) { listBtn.textContent = '☆ 收藏'; listBtn.style.color = '#94a3b8'; }
    } else {
      var res2 = await api('/favorites', { method: 'POST', body: JSON.stringify({ post_id: postId }) });
      if (res2.error) { showToast(res2.error, 'error'); return; }
      showToast('收藏成功！', 'success');
      if (btn) { btn.textContent = '★ 已收藏'; btn.dataset.favorited = '1'; }
      if (listBtn) { listBtn.textContent = '★ 已收藏'; listBtn.style.color = '#f59e0b'; }
    }
  } catch (e) {
    showToast('操作失败', 'error');
  }
}

async function loadFavoriteStatus(postId) {
  try {
    var res = await api('/favorites/status/' + postId);
    if (res.error) return;
    var btn = document.getElementById('btn-favorite');
    if (btn) {
      if (res.is_favorited) {
        btn.textContent = '★ 已收藏';
        btn.dataset.favorited = '1';
      } else {
        btn.textContent = '☆ 收藏';
        btn.dataset.favorited = '0';
      }
    }
  } catch (e) {}
}

window.toggleFavorite = toggleFavorite;
window.loadFavoriteStatus = loadFavoriteStatus;

function switchProfileTab(tab) {
  var postsPanel = document.getElementById('profile-tab-posts');
  var favPanel = document.getElementById('profile-tab-favorites');
  var activityPanel = document.getElementById('profile-tab-activity');
  var postsBtn = document.getElementById('tab-posts-btn');
  var favBtn = document.getElementById('tab-fav-btn');
  var activityBtn = document.getElementById('tab-activity-btn');

  if (tab === 'posts') {
    if (postsPanel) postsPanel.style.display = '';
    if (favPanel) favPanel.style.display = 'none';
    if (activityPanel) activityPanel.style.display = 'none';
    if (postsBtn) { postsBtn.classList.add('active'); postsBtn.style.color = '#667eea'; }
    if (favBtn) { favBtn.classList.remove('active'); favBtn.style.color = '#94a3b8'; }
    if (activityBtn) { activityBtn.classList.remove('active'); activityBtn.style.color = '#94a3b8'; }
  } else if (tab === 'activity') {
    if (postsPanel) postsPanel.style.display = 'none';
    if (favPanel) favPanel.style.display = 'none';
    if (activityPanel) activityPanel.style.display = '';
    if (postsBtn) { postsBtn.classList.remove('active'); postsBtn.style.color = '#94a3b8'; }
    if (favBtn) { favBtn.classList.remove('active'); favBtn.style.color = '#94a3b8'; }
    if (activityBtn) { activityBtn.classList.add('active'); activityBtn.style.color = '#667eea'; }
    loadActivityCalendar(window._currentProfileUserId);
  } else {
    if (postsPanel) postsPanel.style.display = 'none';
    if (favPanel) favPanel.style.display = '';
    if (postsBtn) { postsBtn.classList.remove('active'); postsBtn.style.color = '#94a3b8'; }
    if (favBtn) { favBtn.classList.add('active'); favBtn.style.color = '#667eea'; }
    // Load favorites
    loadFavoritesList();
  }
}

window.switchProfileTab = switchProfileTab;

async function loadFavoritesList() {
  var el = document.getElementById('favorites-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;">加载中...</div>';
  try {
    var res = await api('/favorites');
    if (res.error) { el.innerHTML = '<div style="text-align:center;padding:32px;color:#ef4444;">加载失败</div>'; return; }
    if (!res.favorites || res.favorites.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;font-size:14px;">暂无收藏，快去收藏感兴趣的帖子吧～</div>';
      return;
    }
    el.innerHTML = res.favorites.map(p => `
      <div class="post-card" onclick="viewPost(${p.id})" style="cursor:pointer;padding:14px 16px;border-bottom:1px solid #f0f4f8;">
        <div style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">${escapeHtml(p.title)}</div>
        <div style="display:flex;gap:8px;align-items:center;font-size:12px;color:#94a3b8;flex-wrap:wrap;">
          ${p.tag_name ? `<span style="background:${p.tag_color}33;color:${p.tag_color};padding:2px 8px;border-radius:10px;font-weight:600;">${escapeHtml(p.tag_name)}</span>` : ''}
          <span>👤 ${escapeHtml(p.author_nickname || p.author_username)}</span>
          <span>💬 ${p.comment_count || 0}</span>
          <span>🕐 ${formatDate(p.favorited_at)}</span>
        </div>
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:#ef4444;">加载失败</div>';
  }
}

window.loadFavoritesList = loadFavoritesList;

// ============ Leaderboard ============
let leaderboardLoaded = false;

window.toggleLeaderboard = function() {
  var panel = document.getElementById('leaderboard-panel');
  if (!panel) return;
  if (panel.style.display === 'none') {
    panel.style.display = '';
    if (!leaderboardLoaded) loadLeaderboard();
  } else {
    panel.style.display = 'none';
  }
};

async function loadLeaderboard() {
  var el = document.getElementById('leaderboard-list');
  var myRankEl = document.getElementById('lb-my-rank-mini');
  if (!el) return;
  leaderboardLoaded = true;
  el.innerHTML = '<div style="text-align:center;padding:16px;color:#94a3b8;">加载中...</div>';

  var currentUser = getUser();
  var myUserId = currentUser ? currentUser.id : null;

  // Load my rank if logged in
  if (myRankEl) {
    if (myUserId) {
      try {
        var myRankRes = await api('/leaderboard/me');
        if (!myRankRes.error && myRankRes.rank) {
          var lvl = getUserLevel(myRankRes.points || 0);
          var isTop = myRankRes.rank <= 10;
          myRankEl.innerHTML = '<div style="background:' + (isTop ? 'linear-gradient(135deg,#667eea22,#764ba222)' : 'rgba(255,255,255,0.7)') + ';border:1.5px solid ' + (isTop ? '#667eea' : '#e2e8f0') + ';border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:10px;font-size:12px;cursor:pointer;" onclick="window.open(\'/leaderboard.html\',\'_blank\')" title="查看完整排名">' +
            '<span style="font-weight:800;color:#667eea;min-width:28px;">' + (myRankRes.rank <= 3 ? ['🥇','🥈','🥉'][myRankRes.rank-1] : '#' + myRankRes.rank) + '</span>' +
            '<span style="flex:1;color:#1e3a5f;font-weight:600;">我的排名</span>' +
            '<span style="color:#f59e0b;font-weight:800;">' + myRankRes.points + ' 积分</span>' +
            (isTop ? '<span style="color:#667eea;font-size:11px;">查看完整榜单 →</span>' : '') +
            '</div>';
        } else {
          myRankEl.innerHTML = '';
        }
      } catch(e) { myRankEl.innerHTML = ''; }
    } else {
      myRankEl.innerHTML = '';
    }
  }

  try {
    var res = await api('/leaderboard?limit=10');
    var users = res.users || [];
    if (users.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:16px;color:#94a3b8;">暂无数据</div>';
      return;
    }
    el.innerHTML = users.map(function(u) {
      var name = u.nickname || u.username;
      var rank = u.rank;
      var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank + 'th';
      var isMe = myUserId && u.id === myUserId;
      var bg = isMe ? 'background:linear-gradient(135deg,#667eea22,#764ba222);border-color:#667eea;' : rank <= 3 ? 'background:linear-gradient(135deg,#fef3c7,#fde68a);border-color:#f59e0b;' : 'background:#fff;border-color:#e2e8f0;';
      var levelColor = u.level_color || '#667eea';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;border:1.5px solid;' + bg + '">' +
        '<span style="font-size:18px;width:28px;text-align:center;">' + medal + '</span>' +
        '<div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,' + levelColor + ',#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;">' + (u.avatar ? '<img src="' + u.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : name[0].toUpperCase()) + '</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;color:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + (isMe ? ' <span style="background:#667eea22;color:#667eea;font-size:10px;font-weight:700;padding:1px 5px;border-radius:6px;">我</span>' : '') + '</div><div style="font-size:11px;color:' + levelColor + ';">' + u.level_icon + ' ' + u.level_name + '</div></div>' +
        '<div style="text-align:right;"><div style="font-size:14px;font-weight:800;color:#f59e0b;">' + u.points + '</div><div style="font-size:10px;color:#94a3b8;">积分</div></div></div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:#ef4444;">加载失败</div>';
  }
}


// ============ Comment Likes ============
async function voteComment(commentId) {
  var user = getUser();
  if (!user) { showToast('请先登录', 'error'); return; }
  var btn = document.getElementById('clike-btn-' + commentId);
  var countEl = document.getElementById('clike-count-' + commentId);
  if (!btn) return;
  var isLiked = btn.dataset.liked === '1';
  try {
    var res = await api('/comments/' + commentId + '/vote', {
      method: 'POST',
      body: JSON.stringify({ vote_type: 'like' })
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    if (countEl) countEl.textContent = res.like_count;
    if (isLiked) {
      btn.style.color = '#94a3b8';
      btn.dataset.liked = '0';
    } else {
      btn.style.color = '#ef4444';
      btn.dataset.liked = '1';
    }
  } catch (e) {
    showToast('操作失败', 'error');
  }
}


var _expandedReplies = {}; // commentId -> { page, total, items }

function expandReplies(commentId) {
  var btn = document.getElementById('reply-collapsed-' + commentId);
  var container = document.getElementById('reply-expanded-' + commentId);
  if (!container) return;

  // Collapse if already expanded
  if (_expandedReplies[commentId]) {
    container.style.maxHeight = '0';
    container.style.opacity = '0';
    container.style.overflow = 'hidden';
    container.style.transition = 'max-height 0.3s ease, opacity 0.2s ease';
    setTimeout(function(){ container.style.display = 'none'; }, 300);
    _expandedReplies[commentId] = null;
    if (btn) {
      btn.textContent = btn.textContent.replace('收起', '查看更多回复');
      btn.style.display = '';
    }
    return;
  }

  var flat = window._commentsFlatData || [];
  var directIds = {};
  flat.forEach(function(c){ if(Number(c.parent_id)===Number(commentId)) directIds[c.id]=true; });

  var allDescendants = [];
  function collectDescendants(parentId) {
    flat.forEach(function(c){
      if(Number(c.parent_id)===Number(parentId)){
        allDescendants.push(c);
        collectDescendants(c.id);
      }
    });
  }
  collectDescendants(commentId);

  var hiddenOnes = allDescendants.filter(function(c){ return !directIds[c.id]; });
  if (hiddenOnes.length === 0) {
    if (btn) btn.style.display = 'none';
    return;
  }

  var PAGE = 10;
  _expandedReplies[commentId] = { page: 1, total: hiddenOnes.length, items: hiddenOnes };

  function renderPage(cid, pageNum) {
    var state = _expandedReplies[cid];
    if (!state) return '';
    var start = 0;
    var end = pageNum * PAGE;
    var pageItems = state.items.slice(start, end);
    var hasMore = end < state.items.length;
    var html = '<div class="reply-list depth-expanded">';
    pageItems.forEach(function(r) {
      var avatar = r.avatar
        ? '<img src="' + r.avatar + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
        : (r.nickname || r.username)[0].toUpperCase();
      var replyTo = r.reply_to_nickname || r.reply_to_username
        ? '<span class="comment-reply-to">回复 <b>' + escapeHtml(r.reply_to_nickname || r.reply_to_username) + '</b></span>'
        : '';
      var levelColor = r.level_color || '#667eea';
      html += '<div class="comment-item comment-depth-2" data-comment-id="' + r.id + '">' +
        '<div class="comment-header">' +
        '<span class="avatar-small" style="background:linear-gradient(135deg,' + levelColor + ',#764ba2);color:#fff;font-weight:700;">' + avatar + '</span>' +
        '<span class="comment-author">' + escapeHtml(r.nickname || r.username) + '</span>' +
        replyTo +
        '<span class="comment-time">' + formatDate(r.created_at) + '</span>' +
        '</div>' +
        '<div class="comment-content">' + escapeHtml(r.content) + '</div>' +
        '<div class="comment-actions">' +
        '<button class="comment-action-btn comment-like-btn" id="clike-btn-' + r.id + '" onclick="voteComment(' + r.id + ')" style="color:#94a3b8;">👍 <span id="clike-count-' + r.id + '">' + (r.like_count || 0) + '</span></button>' +
        '</div></div>';
    });
    html += '</div>';
    if (hasMore) {
      html += '<button onclick="loadMoreReplies(' + cid + ')" class="reply-expand-btn" style="width:100%;margin-top:6px;">加载更多 ' + (state.items.length - end) + ' 条回复 ↓</button>';
    }
    return html;
  }

  container.innerHTML = renderPage(commentId, 1);
  container.style.display = '';
  container.style.maxHeight = '2000px';
  container.style.opacity = '1';
  container.style.overflow = 'hidden';
  container.style.transition = 'max-height 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.25s ease';
  if (btn) btn.style.display = 'none';
}

function loadMoreReplies(commentId) {
  var container = document.getElementById('reply-expanded-' + commentId);
  if (!container) return;
  var state = _expandedReplies[commentId];
  if (!state) return;
  state.page++;
  var PAGE = 10;
  var start = (state.page - 1) * PAGE;
  var end = state.page * PAGE;
  var pageItems = state.items.slice(start, end);
  var hasMore = end < state.items.length;

  var html = '';
  pageItems.forEach(function(r) {
    var avatar = r.avatar
      ? '<img src="' + r.avatar + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : (r.nickname || r.username)[0].toUpperCase();
    var replyTo = r.reply_to_nickname || r.reply_to_username
      ? '<span class="comment-reply-to">回复 <b>' + escapeHtml(r.reply_to_nickname || r.reply_to_username) + '</b></span>'
      : '';
    var levelColor = r.level_color || '#667eea';
    html += '<div class="comment-item comment-depth-2" data-comment-id="' + r.id + '" style="animation:inline-reply-in 0.2s ease both;">' +
      '<div class="comment-header">' +
      '<span class="avatar-small" style="background:linear-gradient(135deg,' + levelColor + ',#764ba2);color:#fff;font-weight:700;">' + avatar + '</span>' +
      '<span class="comment-author">' + escapeHtml(r.nickname || r.username) + '</span>' +
      replyTo +
      '<span class="comment-time">' + formatDate(r.created_at) + '</span>' +
      '</div>' +
      '<div class="comment-content">' + escapeHtml(r.content) + '</div>' +
      '<div class="comment-actions">' +
      '<button class="comment-action-btn comment-like-btn" id="clike-btn-' + r.id + '" onclick="voteComment(' + r.id + ')" style="color:#94a3b8;">👍 <span id="clike-count-' + r.id + '">' + (r.like_count || 0) + '</span></button>' +
      '</div></div>';
  });

  var existingList = container.querySelector('.reply-list');
  if (existingList) {
    existingList.insertAdjacentHTML('beforeend', html);
  }
  var loadMoreBtn = container.querySelector('button[onclick^="loadMoreReplies"]');
  if (loadMoreBtn) {
    if (hasMore) {
      loadMoreBtn.textContent = '加载更多 ' + (state.items.length - end) + ' 条回复 ↓';
    } else {
      loadMoreBtn.remove();
    }
  }
}

window.expandReplies = expandReplies;


// Load comment vote status after comments are rendered
async function loadCommentVoteStatus() {
  var user = getUser();
  if (!user) return;
  var btns = document.querySelectorAll('.comment-like-btn');
  btns.forEach(function(btn) {
    var id = btn.id.replace('clike-btn-', '');
    if (!id) return;
    api('/comments/' + id + '/votes')
      .then(function(res) {
        if (res.error) return;
        var countEl = document.getElementById('clike-count-' + id);
        if (countEl) countEl.textContent = res.like_count;
        if (res.userVote === 'like') {
          btn.style.color = '#ef4444';
          btn.dataset.liked = '1';
        }
      })
      .catch(function() {});
  });
}

window.voteComment = voteComment;
window.loadCommentVoteStatus = loadCommentVoteStatus;


// ============ Theme Toggle ============
function toggleLang() {
  var newLang = i18n.getLang() === 'zh' ? 'en' : 'zh';
  i18n.switchLang(newLang).then(function() {
    showToast(newLang === 'en' ? 'Switched to English' : '已切换到中文', 'success');
    var h2 = document.querySelector('.home-hero h2');
    if (h2) h2.textContent = i18n.t('hero_title');
    var p = document.querySelector('.home-hero p');
    if (p) p.textContent = i18n.t('hero_subtitle');
    var searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.setAttribute('placeholder', i18n.t('search_placeholder'));
    if (typeof loadPosts === 'function') loadPosts(1);
  });
}

var themes = ['mint', 'sunset', 'sky', 'cyber', 'aurora'];
var themeEmoji = { mint: '🌙', sunset: '🌅', sky: '🌤️', cyber: '🤖', aurora: '✨' };

function toggleTheme() {
  var body = document.body;
  var current = body.getAttribute('data-theme') || 'mint';
  var idx = themes.indexOf(current);
  var next = themes[(idx + 1) % themes.length];
  setTheme(next);
}

function setTheme(theme) {
  var body = document.body;
  if (theme === 'mint') {
    body.removeAttribute('data-theme');
  } else {
    body.setAttribute('data-theme', theme);
  }
  var btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = themeEmoji[theme] || '🌙';
  localStorage.setItem(THEME_STORAGE_KEY, theme === 'mint' ? 'mint' : theme);
}

window.toggleTheme = toggleTheme;
window.setTheme = setTheme;
// ============ Messages ============
let currentMsgPartner = null;

async function loadMsgConversations() {
  const el = document.getElementById('msg-conversations');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">加载中...</div>';
  try {
    const res = await api('/messages/conversations');
    if (res.error) { el.innerHTML = '<div style="padding:20px;color:#888;">加载失败</div>'; return; }
    const convs = res.conversations || [];
    if (!convs.length) {
      el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#a8b3d4;font-size:14px;">暂无消息记录<br><span style="font-size:12px;margin-top:8px;display:block;">快去找感兴趣的人发私信吧！</span></div>';
      return;
    }
    var html = '';
    for (var i = 0; i < convs.length; i++) {
      var c = convs[i];
      var isMe = c.sender_id === user.id;
      var msgText = isMe ? '我：' + c.content : c.content;
      var hasUnread = c.unread_count > 0;
      html += '<div class="notif-item' + (hasUnread ? ' unread' : '') + '" onclick="openMsgDetail(' + c.partner_id + ',\'' + e(c.partner_nickname || c.partner_username || '') + '\')" style="cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #f0f2ff;">';
      html += '<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#5d6dff,#7e5ad6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;flex-shrink:0;">' + (c.partner_nickname || c.partner_username || '?')[0].toUpperCase() + '</div>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-weight:700;font-size:14px;color:#1e2d5a;margin-bottom:3px;">' + e(c.partner_nickname || c.partner_username) + (hasUnread ? ' <span style="background:#ef4444;border-radius:50%;width:8px;height:8px;display:inline-block;vertical-align:middle;margin-left:4px;"></span>' : '') + '</div>';
      html += '<div style="font-size:13px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + e(c.content) + '</div>';
      html += '</div><div style="font-size:11px;color:#a8b3d4;flex-shrink:0;">' + fd(c.created_at) + '</div></div>';
    }
    el.innerHTML = html;
  } catch (e) {
    console.error('[Messages]', e);
    el.innerHTML = '<div style="padding:20px;color:#888;">加载失败，请重试</div>';
  }
}

window.openMessages = async function() {
  if (!user) { showToast('请先登录', 'error'); return; }
  document.getElementById('msg-modal').style.display = 'flex';
  document.getElementById('msg-detail-modal').style.display = 'none';
  await loadMsgConversations();
  await loadMsgUnreadCount();
};

window.closeMessages = function() {
  document.getElementById('msg-modal').style.display = 'none';
  currentMsgPartner = null;
};

window.closeMsgDetail = function() {
  document.getElementById('msg-detail-modal').style.display = 'none';
};

window.openMsgDetailFromUser = async function(partnerId, partnerName) {
  await openMsgDetail(partnerId, partnerName || '用户');
};

window.openMsgDetail = async function(partnerId, partnerName) {
  currentMsgPartner = partnerId;
  document.getElementById('msg-partner-name').textContent = '💬 与 ' + partnerName + ' 的对话';
  document.getElementById('msg-modal').style.display = 'none';
  document.getElementById('msg-detail-modal').style.display = 'flex';
  await loadMsgHistory(partnerId);
  await loadMsgUnreadCount();
};

async function loadMsgHistory(partnerId) {
  var el = document.getElementById('msg-history');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">加载中...</div>';
  try {
    var res = await api('/messages/with/' + partnerId);
    if (res.error) { el.innerHTML = '<div style="padding:20px;color:#888;">加载失败</div>'; return; }
    var msgs = res.messages || [];
    if (!msgs.length) {
      el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#a8b3d4;font-size:13px;">暂无消息记录，快发送第一条吧！</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var isMe = m.sender_id === user.id;
      var bubbleClass = isMe ? 'msg-bubble-me' : 'msg-bubble-other';
      html += '<div class="' + bubbleClass + '" style="margin:8px 0;display:flex;' + (isMe ? 'justify-content:flex-end' : 'justify-content:flex-start') + ';">';
      html += '<div style="max-width:75%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.55;' + (isMe ? 'background:linear-gradient(135deg,#5d6dff,#7e5ad6);color:#fff;border-bottom-right-radius:4px;' : 'background:#f0f2ff;color:#1e2d5a;border-bottom-left-radius:4px;') + '">' + e(m.content).replace(/\n/g, '<br>') + '</div>';
      html += '</div>';
    }
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  } catch (e) {
    console.error('[Messages]', e);
    el.innerHTML = '<div style="padding:20px;color:#888;">加载失败</div>';
  }
}

window.sendMsgFromInput = async function() {
  var input = document.getElementById('msg-input');
  if (!input) return;
  var content = input.value.trim();
  if (!content) return;
  if (!currentMsgPartner) return;
  input.value = '';
  await sendMsg(currentMsgPartner, content);
};

async function sendMsg(partnerId, content) {
  try {
    var res = await api('/messages', {
      method: 'POST',
      body: JSON.stringify({ receiver_id: partnerId, content: content })
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    await loadMsgHistory(partnerId);
  } catch (e) {
    showToast('发送失败', 'error');
  }
}

async function loadMsgUnreadCount() {
  if (!user) return;
  try {
    var res = await api('/messages/unread-count');
    var badge = document.getElementById('msg-badge');
    if (!badge) return;
    if (res.count > 0) {
      badge.textContent = res.count > 99 ? '99+' : res.count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {}
}

// Poll messages every 30s when logged in
var _msgPollInterval = null;
function startMsgPolling() {
  if (_msgPollInterval) clearInterval(_msgPollInterval);
  _msgPollInterval = setInterval(loadMsgUnreadCount, 30000);
}


async function loadActivityCalendar(userId) {
  var el = document.getElementById('activity-heatmap');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;">加载中...</div>';
  try {
    var res = await api('/users/' + userId + '/activity?days=90');
    var activityMap = {};
    (res.activity || []).forEach(function(a) { activityMap[a.day] = a.count; });
    var now = new Date();
    var weeks = [];
    var cur = new Date(now);
    cur.setDate(cur.getDate() - 89);
    // Align to start of week (Sunday)
    cur.setDate(cur.getDate() - cur.getDay());
    var maxCount = 0;
    Object.values(activityMap).forEach(function(c) { if (c > maxCount) maxCount = c; });
    var levelColors = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
    function getColor(count) {
      if (count === 0) return levelColors[0];
      if (maxCount === 0) return levelColors[0];
      var level = Math.ceil((count / maxCount) * 4);
      if (level > 4) level = 4;
      return levelColors[level];
    }
    // Build 13 weeks
    var html = '<div style="font-size:12px;color:#667eea;font-weight:700;margin-bottom:10px;">🔥 近90天活跃热力图</div>';
    html += '<div style="display:flex;gap:3px;overflow-x:auto;padding-bottom:8px;">';
    for (var w = 0; w < 13; w++) {
      html += '<div style="display:flex;flex-direction:column;gap:3px;">';
      for (var d = 0; d < 7; d++) {
        var dd = new Date(cur);
        dd.setDate(dd.getDate() + w * 7 + d);
        if (dd > now) break;
        var ymd = dd.getFullYear() + '-' + String(dd.getMonth()+1).padStart(2,'0') + '-' + String(dd.getDate()).padStart(2,'0');
        var cnt = activityMap[ymd] || 0;
        html += '<div style="width:14px;height:14px;border-radius:3px;background:' + getColor(cnt) + ';" title="' + ymd + ' ' + cnt + '次活跃"></div>';
      }
      html += '</div>';
    }
    html += '</div>';
    html += '<div style="display:flex;gap:4px;align-items:center;margin-top:8px;font-size:11px;color:#94a3b8;flex-wrap:wrap;">';
    html += '<span>少</span>';
    levelColors.forEach(function(c) { html += '<div style="width:12px;height:12px;border-radius:2px;background:' + c + ';"></div>'; });
    html += '<span>多</span></div>';
    el.innerHTML = html;
    // Also append points trend
    loadPointsTrend(userId, el);
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:#ef4444;">加载失败</div>';
  }
}

function loadPointsTrend(userId, container) {
  var trendEl = document.createElement('div');
  trendEl.id = 'points-trend-chart';
  trendEl.style.marginTop = '16px';
  trendEl.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:13px;">加载积分趋势...</div>';
  container.appendChild(trendEl);

  api('/users/' + userId + '/points-trend?days=30').then(function(res) {
    if (!res.labels || !res.data || res.labels.length === 0) {
      trendEl.innerHTML = '';
      return;
    }
    var max = Math.max.apply(null, res.data.concat([1]));
    var html = '<div style="font-size:12px;color:#f59e0b;font-weight:700;margin-bottom:8px;">💰 近30天积分获取</div>';
    html += '<div style="display:flex;align-items:flex-end;gap:2px;height:48px;">';
    var step = Math.max(1, Math.floor(res.labels.length / 15));
    res.data.forEach(function(val, i) {
      var h = max > 0 ? Math.max(3, Math.round((val / max) * 40)) : 3;
      var label = res.labels[i];
      var shortLabel = label.substring(5);
      html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;" title="' + label + ' +' + val + '积分">';
      html += '<div style="width:100%;height:' + h + 'px;background:linear-gradient(to top,#f59e0b,#fbbf24);border-radius:2px 2px 0 0;min-height:3px;"></div>';
      html += '<div style="font-size:8px;color:#c0cfdb;height:12px;overflow:hidden;">' + (i % step === 0 ? shortLabel : '') + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:4px;"><span>30天前</span><span>今天</span></div>';
    trendEl.innerHTML = html;
  }).catch(function() {
    trendEl.innerHTML = '';
  });
}

window.loadActivityCalendar = loadActivityCalendar;

// ============ Notifications ============
async function loadNotifications() {
  const container = document.getElementById('notif-list');
  if (container) {
    container.innerHTML = '<div class="empty-state-card">通知加载中...</div>';
  }

  try {
    const res = await api('/notifications');
    const list = document.getElementById('notif-list');
    const unreadCount = res.unreadCount;

    document.getElementById('notif-unread-count').textContent = unreadCount > 0 ? `${unreadCount}条未读` : '';

    if (res.notifications.length === 0) {
      if (list) list.innerHTML = '<div class="empty-state-card">暂无通知</div>';
      return;
    }

    if (list) {
      list.innerHTML = res.notifications.map(n => `
      <div class="notif-item ${n.is_read ? 'read' : 'unread'}" onclick="handleNotifClick(${n.id}, ${n.post_id || 'null'})">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        <div class="notif-content">${escapeHtml(n.content || '')}</div>
        <div class="notif-time">${formatDate(n.created_at)}</div>
      </div>
    `).join('');
    }

  } catch (e) {
    console.error(e);
    if (container) {
      container.innerHTML = '<div class="empty-state-card">通知加载失败，请稍后再试</div>';
    }
  }
}

async function handleNotifClick(notifId, postId) {
  try {
    await api(`/notifications/${notifId}/read`, { method: 'POST' });
    loadNotifCount();
    loadNotifications();
  } catch (e) { }

  if (postId) {
    closeNotifications();
    viewPost(postId);
  }
}

async function markAllNotifRead() {
  try {
    await api('/notifications/read-all', { method: 'POST' });
    loadNotifCount();
    loadNotifications();
  } catch (e) {
    console.error(e);
  }
}

// AI Chat
let aiSending = false;

function openAIChat() {
  const user = getUser();
  if (!user) return showLogin();
  setBottomNav('ai');
  window.location.href = '/ai';
}

function closeAIChat() {
  document.getElementById('ai-modal').style.display = 'none';
}

async function loadAIQuota() {
  try {
    const res = await api('/ai/quota');
    const quotaText = res.unlimited ? '今日剩余: 不限' : `今日剩余: ${res.quota}/${res.total}`;
    document.getElementById('ai-quota-display').textContent = quotaText;
    document.getElementById('ai-quota-badge').textContent = res.unlimited ? '∞' : res.quota;
    document.getElementById('ai-quota-badge').style.display = res.unlimited ? 'none' : (res.quota < 10 ? 'inline' : 'none');
  } catch (e) {
    console.error(e);
  }
}

async function loadAISessions(preferredSessionId = '') {
  try {
    const res = await api('/ai/sessions');
    aiSessions = normalizeSessionList(res.sessions);

    if (preferredSessionId && aiSessions.some(item => item.id === preferredSessionId)) {
      currentAISessionId = preferredSessionId;
    } else if (currentAISessionId && aiSessions.some(item => item.id === currentAISessionId)) {
      // keep current session
    } else {
      currentAISessionId = aiSessions[0]?.id || '';
    }

    renderAISessionList();

    if (currentAISessionId) {
      await loadAIHistory(currentAISessionId);
    } else {
      aiChatHistory = [];
      renderAIChatMessages(aiChatHistory);
    }
  } catch (e) {
    console.error(e);
    aiSessions = [];
    currentAISessionId = '';
    renderAISessionList();
    aiChatHistory = [];
    renderAIChatMessages(aiChatHistory);
  }
}

var _aiHistoryPage = 1;
var _aiHistoryPages = 1;

async function loadAIHistory(sessionId, append) {
  if (!sessionId) {
    aiChatHistory = [];
    renderAIChatMessages(aiChatHistory);
    return;
  }

  if (!append) {
    _aiHistoryPage = 1;
    _aiHistoryPages = 1;
  }

  try {
    var res = await api(`/ai/history?session_id=${encodeURIComponent(sessionId)}&page=${_aiHistoryPage}&limit=20`);
    var newChats = Array.isArray(res.chats) ? res.chats : [];
    _aiHistoryPages = res.pages || 1;

    if (append) {
      // Prepend older messages (they come sorted ASC from backend)
      aiChatHistory = newChats.concat(aiChatHistory);
    } else {
      aiChatHistory = newChats;
    }

    currentAISessionId = sessionId;
    renderAIChatMessages(aiChatHistory);
    renderAIHistoryLoadMore();
    renderAISessionList();
  } catch (e) {
    console.error(e);
    if (!append) {
      aiChatHistory = [];
      const container = document.getElementById('ai-chat-messages');
      if (container) container.innerHTML = renderAIBubble('assistant', '聊天记录加载失败，请稍后重试。');
    }
    renderAISessionList();
  }
}

function renderAIHistoryLoadMore() {
  var container = document.getElementById('ai-chat-messages');
  if (!container) return;
  var existingBtn = document.getElementById('ai-load-more-btn');
  if (existingBtn) existingBtn.remove();

  if (_aiHistoryPage >= _aiHistoryPages) return;

  var btn = document.createElement('button');
  btn.id = 'ai-load-more-btn';
  btn.className = 'ai-load-more-btn';
  btn.textContent = `加载更多 ${_aiHistoryPages > 0 ? (_aiHistoryPages - _aiHistoryPage) * 20 : ''} 条更早的消息`;
  btn.onclick = function() {
    _aiHistoryPage++;
    loadAIHistory(currentAISessionId, true);
    btn.textContent = '加载中...';
    btn.disabled = true;
  };
  container.insertBefore(btn, container.firstChild);
}

async function loadMoreAIHistory() {
  if (_aiHistoryPage >= _aiHistoryPages) return;
  _aiHistoryPage++;
  await loadAIHistory(currentAISessionId, true);
}

async function sendAIMessage() {
  if (aiSending) return;

  const input = document.getElementById('ai-input');
  const message = input.value.trim();

  if (!message) return;

  const { provider: selectedProvider, model: selectedModel } = getCurrentAISelection();
  if (!currentAISessionId) {
    createNewAIChat();
  }
  const sendingSessionId = currentAISessionId || createClientSessionId();

  aiSending = true;
  const resetSendBtn = setButtonBusy('ai-send-btn', '思考中...');

  appendAIMessage('user', message, `${getAIProviderLabel(selectedProvider)} · ${getAIModelLabel(selectedProvider, selectedModel)}`);
  input.value = '';
  input.focus();

  try {
    const res = await api('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        model: selectedModel,
        provider: selectedProvider,
        session_id: sendingSessionId
      })
    });

    if (res.error) {
      showToast(res.error, 'error', 2600);
      if (res.quota !== undefined && res.quota === 0) {
        closeAIChat();
      }
      return;
    }

    currentAISessionId = String(res.session_id || sendingSessionId);
    appendAIMessage('assistant', res.response);

    // Update quota display
    document.getElementById('ai-quota-display').textContent = res.unlimited ? '今日剩余: 不限' : `今日剩余: ${res.quota}/${res.total}`;
    document.getElementById('ai-quota-badge').textContent = res.unlimited ? '∞' : res.quota;
    document.getElementById('ai-quota-badge').style.display = res.unlimited ? 'none' : (res.quota < 10 ? 'inline' : 'none');

    await loadAISessions(currentAISessionId);

  } catch (e) {
    showToast('发送失败，请重试', 'error');
  } finally {
    aiSending = false;
    resetSendBtn();
  }
}

async function clearAIChat() {
  const ok = await askConfirm('将清空全部会话记录且不可恢复，确定继续吗？', '清空全部聊天记录');
  if (!ok) return;
  try {
    await api('/ai/history', { method: 'DELETE' });
    aiSessions = [];
    currentAISessionId = '';
    aiChatHistory = [];
    renderAISessionList();
    renderAIChatMessages([]);
    showToast('聊天记录已清空', 'success');
  } catch (e) {
    console.error(e);
    showToast('清空失败，请稍后重试', 'error');
  }
}

// ============ WEATHER ============
const WEATHER_CITY_KEY = 'forum_weather_city';
const WEATHER_CITIES = [
  { name: '北京', city: 'Beijing' },
  { name: '上海', city: 'Shanghai' },
  { name: '广州', city: 'Guangzhou' },
  { name: '深圳', city: 'Shenzhen' },
  { name: '成都', city: 'Chengdu' },
  { name: '杭州', city: 'Hangzhou' },
  { name: '武汉', city: 'Wuhan' },
  { name: '西安', city: "Xi'an" },
  { name: '重庆', city: 'Chongqing' },
  { name: '南京', city: 'Nanjing' },
  { name: '天津', city: 'Tianjin' },
  { name: '苏州', city: 'Suzhou' },
  { name: '长沙', city: 'Changsha' },
  { name: '郑州', city: 'Zhengzhou' },
  { name: '沈阳', city: 'Shenyang' },
  { name: '青岛', city: 'Qingdao' },
  { name: '大连', city: 'Dalian' },
  { name: '哈尔滨', city: 'Harbin' },
  { name: '长春', city: 'Changchun' },
  { name: '福州', city: 'Fuzhou' },
  { name: '厦门', city: 'Xiamen' },
  { name: '昆明', city: 'Kunming' },
  { name: '贵阳', city: 'Guiyang' },
  { name: '香港', city: 'Hong+Kong' },
  { name: '澳门', city: 'Macau' },
  { name: '台北', city: 'Taipei' },
];

function getWeatherEmoji(condition) {
  const c = (condition || '').toLowerCase();
  if (c.includes('sun') || c.includes('clear')) return '☀️';
  if (c.includes('partly')) return '⛅';
  if (c.includes('cloud') || c.includes('overcast')) return '☁️';
  if (c.includes('rain') || c.includes('drizzle')) return '🌧️';
  if (c.includes('thunder') || c.includes('storm')) return '⛈️';
  if (c.includes('snow')) return '❄️';
  if (c.includes('fog') || c.includes('mist')) return '🌫️';
  if (c.includes('wind')) return '💨';
  return '🌤️';
}

function getSavedCity() {
  return localStorage.getItem(WEATHER_CITY_KEY) || 'Beijing';
}

let weatherDropdownOpen = false;

function toggleWeatherDropdown() {
  weatherDropdownOpen = !weatherDropdownOpen;
  renderWeatherDropdown();
}

function renderWeatherDropdown() {
  const widget = document.getElementById('weather-widget');
  if (!widget) return;
  const existing = widget.querySelector('.weather-dropdown');
  if (existing) existing.remove();
  if (!weatherDropdownOpen) return;

  const savedCity = getSavedCity();
  const html = `<div class="weather-dropdown">
    <div style="padding:4px 8px 8px;font-size:11px;color:rgba(255,255,255,0.5);">选择城市</div>
    ${WEATHER_CITIES.map(c => `
      <div class="weather-dropdown-item ${c.city === savedCity ? 'active' : ''}" onclick="setWeatherCity('${c.city}', '${c.name}')">
        <span>${c.name}</span>
      </div>
    `).join('')}
  </div>`;
  widget.insertAdjacentHTML('beforeend', html);
}

function setWeatherCity(city, name) {
  localStorage.setItem(WEATHER_CITY_KEY, city);
  weatherDropdownOpen = false;
  loadWeatherData();
}

async function loadWeatherData() {
  const widget = document.getElementById('weather-widget');
  if (!widget) return;
  const city = getSavedCity();
  widget.innerHTML = `<span class="weather-loading">🌤️ 加载中...</span>`;
  try {
    const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%l|%c|%t|%h|%w&m`);
    const text = await response.text();
    const parts = text.split('|');
    if (parts.length < 4) throw new Error('Invalid');
    const location = parts[0].trim();
    const condition = parts[1].trim();
    const temp = parts[2].trim();
    const humidity = parts[3].trim();
    const wind = parts[4] ? parts[4].trim() : '';
    const emoji = getWeatherEmoji(condition);
    widget.innerHTML = `
      <div class="weather-city">${emoji} ${location}</div>
      <div class="weather-temp">${temp}</div>
    `;
    widget.title = `点击切换城市 | ${location} · ${condition} · ${temp} · ${humidity}${wind ? ' · ' + wind : ''}`;
  } catch (e) {
    widget.innerHTML = `<span class="weather-error">🌤️ 加载失败</span>`;
  }
}

function initWeather() {
  const widget = document.getElementById('weather-widget');
  if (!widget) return;
  loadWeatherData();
  widget.addEventListener('click', (e) => {
    if (e.target.closest('.weather-dropdown')) return;
    toggleWeatherDropdown();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#weather-widget') && weatherDropdownOpen) {
      weatherDropdownOpen = false;
      renderWeatherDropdown();
    }
  });
}

// Init
async function init() {
  applyTheme(getStoredTheme(), false);
  bindThemeSelector();
  await loadI18n();
  initConfirmModal();
  initModalInteractions();
  currentUser = getUser();
  updateNav();
  loadTags();
  loadPosts();
  loadTrending();
  initPostComposer();
  document.body.classList.add('home-view-active');
  initPetalRain();
  initPandaPlayground();
  initWeather();

  // Show panda FAB on home
  var fab = document.getElementById('panda-fab-container');
  if (fab) fab.style.display = '';

  // Register Service Worker for caching + push
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(function(reg) {
      console.log('[SW] Registered, scope:', reg.scope);
    }).catch(function(err) {
      console.warn('[SW] Registration failed:', err);
    });
  }

  // Restore announcement dismissal
  if (localStorage.getItem('announcement_dismissed') === '1') {
    var bar = document.getElementById('announcement-bar');
    if (bar) { bar.style.display = 'none'; }
  }

  document.getElementById('search-input').addEventListener('keyup', handleSearch);
}

init();
