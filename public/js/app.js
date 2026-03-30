const API_BASE = '/api';
let currentUser = null;
let currentTagId = null;
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
function getToken() {
  return localStorage.getItem('token');
}

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
function updateNav() {
  const user = getUser();
  document.getElementById('nav-login').style.display = user ? 'none' : 'inline-block';
  document.getElementById('nav-register').style.display = user ? 'none' : 'inline-block';
  document.getElementById('nav-profile').style.display = user ? 'inline-block' : 'none';
  document.getElementById('nav-settings').style.display = user ? 'inline-block' : 'none';
  document.getElementById('nav-admin').style.display = (user && user.role === 'admin') ? 'inline-block' : 'none';
  document.getElementById('nav-ai').style.display = user ? 'inline-block' : 'none';
  document.getElementById('nav-notif').style.display = user ? 'inline-block' : 'none';
  document.getElementById('nav-toolbox').style.display = 'inline-block';
  document.getElementById('nav-logout').style.display = user ? 'inline-block' : 'none';
  document.getElementById('btn-new-post').style.display = user ? 'inline-block' : 'none';

  if (user) {
    loadNotifCount();
    // Poll notifications every 30 seconds
    if (!window._notifPollInterval) {
      window._notifPollInterval = setInterval(loadNotifCount, 30000);
    }
  } else {
    if (window._notifPollInterval) {
      clearInterval(window._notifPollInterval);
      window._notifPollInterval = null;
    }
  }
}

function goToolbox() {
  window.open('/toolbox', '_blank');
}

function goHome() {
  showView('home');
  loadPosts();
}

function goProfile() {
  const user = getUser();
  if (!user) return showLogin();
  showView('profile');
  loadProfile(user.id);
}

function goSettings() {
  const user = getUser();
  if (!user) return showLogin();
  showView('settings');
  loadSettings();
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

function showView(name) {
  document.querySelectorAll('[id^="view-"]').forEach(el => el.style.display = 'none');
  const target = document.getElementById(`view-${name}`);
  if (!target) return;

  // Home keeps CSS-driven layout (including desktop grid), other views force show.
  target.style.display = name === 'home' ? '' : 'block';
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`nav-${name === 'home' ? 'home' : name}`)?.classList.add('active');
  const isHome = name === 'home';
  document.body.classList.toggle('home-view-active', isHome);

  // Toggle panda playground visibility - hide when not on home
  const panda = document.getElementById('panda-playground');
  if (panda) panda.classList.toggle('panda-hidden', !isHome);

  if (isHome) {
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
let isCaptchaDragging = false;
let captchaStartX = 0;
let currentCaptchaX = 0;

const CAPTCHA_THRESHOLD = 12;
const captchaIcons = ['→', '↑', '←', '↓', '➤', '▲', '◀', '▼'];
const CAPTCHA_HINT_TEXT = '请拖动滑块完成验证';

function openCaptcha(callback) {
  captchaCallback = callback;
  captchaSolved = false;
  window._captchaPassed = false;
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

function endCaptchaDrag() {
  if (!isCaptchaDragging || captchaSolved) return;
  isCaptchaDragging = false;
  const thumb = document.getElementById('captchaSliderThumb');
  const track = document.getElementById('captchaSliderTrack');
  const finalX = parseInt(thumb.style.left) || 0;
  const msg = document.getElementById('captchaMsg');
  thumb.style.cursor = 'grab';

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
  try {
    const res = await fetch('/auth/send-register-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || '发送失败', 'error'); btn.disabled = false; btn.textContent = '重新发送'; return; }
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

function handleSearch(e) {
  if (e.key === 'Enter') searchPosts();
}

function searchPosts() {
  currentPage = 1;
  loadPosts();
}

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
  const params = new URLSearchParams({ page: currentPage, limit: 20 });
  if (currentTagId) params.set('tag_id', currentTagId);
  const search = document.getElementById('search-input')?.value.trim();
  if (search) params.set('search', search);

  try {
    const res = await api(`/posts?${params}`);
    const container = document.getElementById('post-list');

    if (!res.posts.length) {
      container.innerHTML = '<div class="empty-state-card">暂无帖子，来发布第一条内容吧</div>';
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    container.innerHTML = res.posts.map(post => `
      <div class="post-card" data-post-id="${post.id}" onclick="viewPost(${post.id})">
        <div class="post-title">${escapeHtml(post.title)}</div>
        <div class="post-meta">
          ${post.tag_name ? `<span class="post-tag" style="background:${post.tag_color}">${escapeHtml(post.tag_name)}</span>` : ''}
          <span class="avatar-small">${post.avatar ? `<img src="${post.avatar}" alt="avatar">` : (post.nickname || post.username)[0].toUpperCase()}</span>
          <span>${escapeHtml(post.nickname || post.username)}</span>
          ${user && user.id !== post.user_id ? `<button class="msg-author-btn" onclick="event.stopPropagation();openMsgDetailFromUser(${post.user_id}, '${e(post.nickname || post.username)}')" style="background:none;border:none;cursor:pointer;font-size:12px;padding:2px 6px;color:#5d6dff;">💬</button>` : ''}
          <span>👍 <span class="vote-like-count">${post.like_count || 0}</span></span>
          <span>👎 <span class="vote-dislike-count">${post.dislike_count || 0}</span></span>
          <span>💬 ${post.comment_count}</span>
          <span>👁 ${post.views}</span>
          <span>🕐 ${formatDate(post.created_at)}</span>
        </div>
        <div class="post-excerpt">${escapeHtml(post.content.substring(0, 150))}</div>
      </div>
    `).join('');

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

    postDetailEl.innerHTML = `
      <div class="post-detail-card">
        <div class="post-detail-title">${escapeHtml(res.post.title)}</div>
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
          <button onclick="sharePost(${res.post.id}, '${escapeHtml(res.post.title)}')">🔗 分享</button>
          ${res.user && res.user.id === res.post.user_id || (user && user.role === 'admin') ? `<button onclick="deletePost(${res.post.id})" style="color:#ef4444">🗑 删除</button>` : ''}
        </div>` : ''}
      </div>
    `;

    if (commentFormEl) {
      commentFormEl.style.display = user ? 'block' : 'none';
    }

    const comments = Array.isArray(res.comments) ? res.comments : [];
    const rootComments = comments.filter(c => !c.parent_id);
    const replies = comments.filter(c => c.parent_id);

    // Flat replies under each root comment - all at same level
    const renderComment = (comment) => {
      const replyToName = comment.reply_to_nickname || comment.reply_to_username;
      const replyLine = replyToName ? `<span class="comment-reply-to">回复 <b>${escapeHtml(replyToName)}</b></span>` : '';

      // Get direct replies to this comment (only one level deep)
      const directReplies = replies
        .filter(r => Number(r.parent_id) === Number(comment.id))
        .map(r => `
          <div class="comment-item comment-reply" data-comment-id="${r.id}">
            <div class="comment-header">
              <span class="avatar-small">${r.avatar ? `<img src="${r.avatar}" alt="avatar">` : (r.nickname || r.username)[0].toUpperCase()}</span>
              <span class="comment-author">${escapeHtml(r.nickname || r.username)}</span>
              ${(r.reply_to_nickname || r.reply_to_username) ? `<span class="comment-reply-to">回复 <b>${escapeHtml(r.reply_to_nickname || r.reply_to_username)}</b></span>` : ''}
              <span class="comment-time">${formatDate(r.created_at)}</span>
            </div>
            <div class="comment-content">${escapeHtml(r.content)}</div>
            <div class="comment-actions">
              ${user ? `<button class="comment-action-btn" onclick="startReply(${r.id}, ${r.user_id}, '${escapeHtml(r.nickname || r.username)}')">回复</button>` : ''}
            </div>
          </div>`).join('');

      return `
        <div class="comment-item" data-comment-id="${comment.id}">
          <div class="comment-header">
            <span class="avatar-small">${comment.avatar ? `<img src="${comment.avatar}" alt="avatar">` : (comment.nickname || comment.username)[0].toUpperCase()}</span>
            <span class="comment-author">${escapeHtml(comment.nickname || comment.username)}</span>
            ${replyLine}
            <span class="comment-time">${formatDate(comment.created_at)}</span>
          </div>
          <div class="comment-content">${escapeHtml(comment.content)}</div>
          <div class="comment-actions">
            ${user ? `<button class="comment-action-btn" onclick="startReply(${comment.id}, ${comment.user_id}, '${escapeHtml(comment.nickname || comment.username)}')">回复</button>` : ''}
          </div>
          ${directReplies ? `<div class="reply-list">${directReplies}</div>` : ''}
        </div>`;
    };

    if (commentsListEl) {
      commentsListEl.innerHTML = rootComments.length
        ? rootComments.map(c => renderComment(c)).join('')
        : '<div style="color:#888;padding:20px;text-align:center;">暂无评论</div>';
    }
  } catch (e) {
    console.error(e);
    showToast('加载失败', 'error');
    if (postDetailEl) {
      postDetailEl.innerHTML = '<div class="empty-state-card">加载失败，请稍后重试</div>';
    }
  }
}

async function submitComment() {
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
  currentReplyTo = { commentId, userId, name: userName };
  document.getElementById('reply-indicator').style.display = 'block';
  document.getElementById('reply-to-name').textContent = `回复 @${userName}`;
  document.getElementById('comment-input').focus();
  // Scroll to comment form
  document.getElementById('comment-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelReply() {
  currentReplyTo = null;
  document.getElementById('reply-indicator').style.display = 'none';
  document.getElementById('reply-to-name').textContent = '';
}

function handleCommentImage(event) {
  const files = Array.from(event.target.files);
  if (commentImages.length + files.length > 3) {
    showToast('评论最多上传3张图片', 'error');
    return;
  }

  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    commentImages.push(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById('comment-image-preview');
      preview.style.display = 'flex';
      const div = document.createElement('div');
      div.className = 'comment-img-thumb';
      div.innerHTML = `<img src="${e.target.result}"><button onclick="removeCommentImage(${commentImages.length - 1})">×</button>`;
      preview.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
  event.target.value = '';
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
    updatePostListVoteCounts(id, res.like_count, res.dislike_count);

  } catch (e) {
    showToast('投票失败', 'error');
  }
}

// Update vote counts in the post list cards (without reloading)
function updatePostListVoteCounts(postId, likeCount, dislikeCount) {
  const cards = document.querySelectorAll(`.post-card[data-post-id="${postId}"]`);
  cards.forEach(card => {
    const likeEl = card.querySelector('.vote-like-count');
    const dislikeEl = card.querySelector('.vote-dislike-count');
    if (likeEl) likeEl.textContent = likeCount;
    if (dislikeEl) dislikeEl.textContent = dislikeCount;
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
  showView('new-post');
  initPostComposer();
  // Reset image state
  selectedImages = [];
  uploadedImageUrls = [];
  document.getElementById('image-preview-list').innerHTML = '';
  const placeholder = document.querySelector('.upload-placeholder');
  if (placeholder) placeholder.style.display = 'flex';

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
      for (const file of selectedImages) {
        const formData = new FormData();
        formData.append('image', file);
        const uploadRes = await fetch(`${API_BASE}/upload/image`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}` },
          body: formData
        }).then(r => r.json());
        if (!uploadRes.url) {
          throw new Error(uploadRes.error || '图片上传失败，请重试');
        }
        uploadedImageUrls.push(uploadRes.url);
      }
    }

    // Build content with images
    let fullContent = content;
    if (uploadedImageUrls.length > 0) {
      fullContent += '\n\n' + uploadedImageUrls.map(url => `![图片](${url})`).join('\n');
    }

    const res = await api('/posts', {
      method: 'POST',
      body: JSON.stringify({ title, content: fullContent, tag_id: tag_id || null })
    });

    // Reset
    selectedImages = [];
    uploadedImageUrls = [];

    if (res.message) {
      showToast(res.message, 'success', 2600);
    } else {
      showToast('发布成功！', 'success');
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
    const container = document.getElementById('checkin-status');
    if (!container) return;

    const streakDays = [1, 2, 3, 4, 5, 6, 7];
    const bonuses = res.streakBonuses || { 1: 5, 2: 8, 3: 10, 4: 12, 5: 15, 6: 18, 7: 25 };

    const streakDots = streakDays.map(day => {
      const dayDate = new Date(Date.now() - (7 - day) * 86400000).toISOString().slice(0, 10);
      const checked = res.checkedInDates && res.checkedInDates.includes(dayDate);
      const isNextDay = res.nextStreak !== null && day === Math.min(res.nextStreak, 7);
      return `<div class="streak-day ${checked ? 'checked' : ''} ${isNextDay ? 'today' : ''}">
        <div class="streak-dot">${checked ? '✓' : day}</div>
        <div class="streak-pts">+${bonuses[day]}</div>
      </div>`;
    }).join('');

    if (res.checkedInToday) {
      container.innerHTML = `
        <div class="checkin-done">
          <div class="checkin-done-info">
            <span class="checkin-points">💰 ${res.points} 积分</span>
            <span class="checkin-streak">🔥 连续签到 <b>${res.currentStreak}</b> 天</span>
          </div>
          <div class="streak-calendar">${streakDots}</div>
          <p class="checkin-tip">✅ 今日已签到，明天再来吧～</p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="checkin-pending">
          <div class="checkin-done-info">
            <span class="checkin-points">💰 ${res.points} 积分</span>
            <span class="checkin-streak">🔥 连续签到 <b>${res.currentStreak}</b> 天</span>
          </div>
          <div class="streak-calendar">${streakDots}</div>
          <div class="checkin-action">
            <button class="btn-primary" onclick="doCheckin()">
              🎁 立即签到（+${res.nextBonus}积分）
            </button>
          </div>
          <p class="checkin-tip">${res.currentStreak > 0 ? `明天继续签到可获 +${bonuses[Math.min(res.currentStreak + 1, 7)]} 积分` : '开始你的第一次签到吧！'}</p>
        </div>
      `;
    }
  } catch (e) {
    console.error(e);
    const container = document.getElementById('checkin-status');
    if (container) container.innerHTML = '<div style="color:#888;">签到加载失败</div>';
  }
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

// ============ SETTINGS ============
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
    const user = res.user;
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
            <input type="email" id="email-input" placeholder="输入邮箱地址" value="${email}">
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
  try {
    const res = await api(`/users/${userId}`);
    const profileRes = await api('/profile/me');
    const userHobbies = userId === getUser()?.id ? profileRes.hobbies : [];

    const avatarContent = res.user.avatar
      ? `<img src="${res.user.avatar}" alt="avatar">`
      : (res.user.nickname || res.user.username)[0].toUpperCase();

    document.getElementById('profile-content').innerHTML = `
      <div class="profile-header">
        <div class="profile-avatar">${avatarContent}</div>
        <div class="profile-info">
          <h2>${escapeHtml(res.user.nickname || res.user.username)}</h2>
          <p>${escapeHtml(res.user.bio || '暂无简介')}</p>
          <p style="font-size:12px;margin-top:4px;">加入于 ${formatDate(res.user.created_at)}</p>
          ${userHobbies.length ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">${userHobbies.map(h => `<span class="hobby-chip" style="cursor:default;"><span class="hobby-icon">${h.icon}</span><span>${h.name}</span></span>`).join('')}</div>` : ''}
        </div>
      </div>
      <h3>我的帖子</h3>
      <div class="post-list">
        ${res.posts.length ? res.posts.map(p => `
          <div class="post-card" onclick="viewPost(${p.id})">
            <div class="post-title">${escapeHtml(p.title)}</div>
            <div class="post-meta">
              ${p.tag_name ? `<span class="post-tag" style="background:${p.tag_color}">${escapeHtml(p.tag_name)}</span>` : ''}
              <span>💬 ${p.comment_count}</span>
              <span>🕐 ${formatDate(p.created_at)}</span>
            </div>
          </div>
        `).join('') : '<div class="empty-state-card">暂无帖子</div>'}
      </div>
    `;
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

function renderContent(str) {
  if (!str) return '';
  let html = escapeHtml(str);

  // Code blocks (```...```) - render as styled pre blocks
  html = html.replace(/```([\s\S]*?)```/g, function(match, code) {
    return '<pre class="md-code-block"><code>' + code.trim() + '</code></pre>';
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

  // Convert markdown images to img tags
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, function(match, alt, url) {
    const safeUrl = sanitizeImageUrl(url);
    if (!safeUrl) return match;
    return '<img class="post-inline-image" src="' + safeUrl + '" alt="' + alt + '" loading="lazy">';
  });

  // Convert standalone upload links to img tags for legacy content
  html = html.replace(/(^|<br>)(\/uploads\/[^\s<]+?\.(?:png|jpe?g|gif|webp))(?=<br>|$)/gi, function(all, prefix, url) {
    const safeUrl = sanitizeImageUrl(url);
    if (!safeUrl) return all;
    return prefix + '<img class="post-inline-image" src="' + safeUrl + '" alt="帖子图片" loading="lazy">';
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
  } catch (e) {
    console.error(e);
  }
}

async function openNotifications() {
  const user = getUser();
  if (!user) return showLogin();

  document.getElementById('notif-modal').style.display = 'flex';
  loadNotifications();
}

function closeNotifications() {
  document.getElementById('notif-modal').style.display = 'none';
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

async function loadAIHistory(sessionId = currentAISessionId) {
  if (!sessionId) {
    aiChatHistory = [];
    renderAIChatMessages(aiChatHistory);
    return;
  }

  try {
    const res = await api(`/ai/history?session_id=${encodeURIComponent(sessionId)}`);
    aiChatHistory = Array.isArray(res.chats) ? res.chats : [];
    currentAISessionId = sessionId;
    renderAIChatMessages(aiChatHistory);
    renderAISessionList();
  } catch (e) {
    console.error(e);
    aiChatHistory = [];
    const container = document.getElementById('ai-chat-messages');
    if (container) container.innerHTML = renderAIBubble('assistant', '聊天记录加载失败，请稍后重试。');
    renderAISessionList();
  }
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
  initPostComposer();
  document.body.classList.add('home-view-active');
  initPetalRain();
  initPandaPlayground();
  initWeather();

  document.getElementById('search-input').addEventListener('keyup', handleSearch);
}

init();
