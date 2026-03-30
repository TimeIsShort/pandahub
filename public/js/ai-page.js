const API_BASE = '/api';
const AI_MODEL_STORAGE_KEY = 'forum_ai_model';
const AI_PROVIDER_STORAGE_KEY = 'forum_ai_provider';
const AI_LAST_SESSION_PREFIX = 'forum_ai_last_session_';
const AI_SESSION_COLLAPSED_KEY = 'ai_session_collapsed';

let aiChatHistory = [];
let aiSessions = [];
let currentAISessionId = '';
let aiSending = false;

const AI_PROVIDER_MODELS = {
  minimax: {
    label: 'MinMax',
    enabled: true,
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
    enabled: true,
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
    label: '月之暗面（待接入）',
    enabled: false,
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

function getToken() {
  return localStorage.getItem('token');
}

function getCurrentUserId() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    const user = JSON.parse(raw);
    return String(user?.id || '').trim();
  } catch (e) {
    return '';
  }
}

function getLastSessionStorageKey() {
  const userId = getCurrentUserId();
  return userId ? `${AI_LAST_SESSION_PREFIX}${userId}` : `${AI_LAST_SESSION_PREFIX}guest`;
}

function getLastOpenedSessionId() {
  return localStorage.getItem(getLastSessionStorageKey()) || '';
}

function setLastOpenedSessionId(sessionId) {
  const value = String(sessionId || '').trim();
  if (!value) return;
  localStorage.setItem(getLastSessionStorageKey(), value);
}

function hydrateUserAvatar() {
  const node = document.querySelector('.top-nav-avatar');
  if (!node) return;
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return;
    const user = JSON.parse(raw);
    const name = String(user?.username || user?.name || '').trim();
    if (name) node.textContent = name.slice(0, 1).toUpperCase();
  } catch (e) {
    // ignore malformed local storage
  }
}

function clearLastOpenedSessionId(sessionId = '') {
  const key = getLastSessionStorageKey();
  const current = localStorage.getItem(key) || '';
  if (!sessionId || current === sessionId) {
    localStorage.removeItem(key);
  }
}

function showToast(message, type = 'info', duration = 2200) {
  if (!message) return;

  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    document.body.appendChild(toast);
    const base = toast.style;
    base.position = 'fixed';
    base.top = '20px';
    base.right = '20px';
    base.zIndex = '9999';
    base.padding = '10px 14px';
    base.borderRadius = '10px';
    base.fontSize = '13px';
    base.boxShadow = '0 10px 22px rgba(0,0,0,0.12)';
    base.transition = 'opacity .2s ease, transform .2s ease';
  }

  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  toast.style.background = type === 'error' ? '#fef2f2' : '#ecfdf5';
  toast.style.color = type === 'error' ? '#b91c1c' : '#065f46';
  toast.style.border = type === 'error' ? '1px solid #fecaca' : '1px solid #a7f3d0';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
  }, duration);
}

function setButtonBusy(target, busyText = '处理中...') {
  const button = typeof target === 'string' ? document.getElementById(target) : target;
  if (!button) return () => {};

  const originalText = button.textContent;
  const originalDisabled = button.disabled;
  button.disabled = true;
  button.textContent = busyText;

  return () => {
    button.disabled = originalDisabled;
    button.textContent = originalText;
  };
}

function setSendButtonRunning(running) {
  const button = document.getElementById('ai-send-btn');
  if (!button) return;

  if (running) {
    button.classList.add('is-running');
    button.textContent = '■';
    button.setAttribute('aria-label', '发送中');
  } else {
    button.classList.remove('is-running');
    button.textContent = '↑';
    button.setAttribute('aria-label', '发送');
  }
}

async function api(endpoint, options = {}) {
  const token = getToken();
  if (!token) {
    window.location.href = '/';
    throw new Error('NO_TOKEN');
  }

  const headers = { 'Content-Type': 'application/json', ...options.headers };
  headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json().catch(() => ({ error: '服务器返回格式异常' }));
  data._status = res.status;

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
    throw new Error('UNAUTHORIZED');
  }

  return data;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function escapeAttr(str) {
  return String(str || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function sanitizeMarkdownUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(value)) return value;
  return '';
}

function renderInlineMarkdown(text) {
  const source = String(text || '');
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_/g;
  let out = '';
  let last = 0;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    out += escapeHtml(source.slice(last, match.index));
    if (match[1] != null) {
      out += `<code>${escapeHtml(match[1])}</code>`;
    } else if (match[2] != null) {
      const safeUrl = sanitizeMarkdownUrl(match[3]);
      const label = escapeHtml(match[2]);
      out += safeUrl
        ? `<a href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : label;
    } else if (match[4] != null || match[5] != null) {
      out += `<strong>${escapeHtml(match[4] || match[5])}</strong>`;
    } else if (match[6] != null) {
      out += `<del>${escapeHtml(match[6])}</del>`;
    } else if (match[7] != null || match[8] != null) {
      out += `<em>${escapeHtml(match[7] || match[8])}</em>`;
    }
    last = pattern.lastIndex;
  }

  out += escapeHtml(source.slice(last));
  return out;
}

function splitTableCells(line) {
  let text = String(line || '').trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  return text.split('|').map(cell => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableCells(line);
  if (!cells.length) return false;
  return cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function isUnorderedListItem(line) {
  return /^\s*[-*+]\s+/.test(line);
}

function isOrderedListItem(line) {
  return /^\s*\d+\.\s+/.test(line);
}

function extractListContent(line) {
  if (isUnorderedListItem(line)) return line.replace(/^\s*[-*+]\s+/, '');
  if (isOrderedListItem(line)) return line.replace(/^\s*\d+\.\s+/, '');
  return line;
}

function renderListItemContent(content) {
  const text = String(content || '');
  const todo = text.match(/^\[( |x|X)\]\s+(.*)$/);
  if (todo) {
    const checked = todo[1].toLowerCase() === 'x';
    const label = renderInlineMarkdown(todo[2]);
    return `<label class="ai-md-task"><input type="checkbox" disabled${checked ? ' checked' : ''}><span>${label}</span></label>`;
  }
  return renderInlineMarkdown(text);
}

function renderMarkdown(content) {
  const input = String(content || '').replace(/\r\n?/g, '\n');
  if (!input.trim()) return '';

  const lines = input.split('\n');
  const html = [];
  let i = 0;
  let listType = '';
  let paragraphBuffer = [];

  function flushParagraph() {
    if (!paragraphBuffer.length) return;
    const joined = paragraphBuffer.map(renderInlineMarkdown).join('<br>');
    html.push(`<p>${joined}</p>`);
    paragraphBuffer = [];
  }

  function closeList() {
    if (!listType) return;
    html.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = '';
  }

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      flushParagraph();
      closeList();
      i += 1;
      continue;
    }

    if (/^```/.test(line)) {
      flushParagraph();
      closeList();
      const lang = line.replace(/^```/, '').trim();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      const cls = lang ? ` class="language-${escapeAttr(lang)}"` : '';
      html.push(`<pre><code${cls}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushParagraph();
      closeList();
      html.push('<hr>');
      i += 1;
      continue;
    }

    if (/^\s*>/.test(raw)) {
      flushParagraph();
      closeList();
      const quoteLines = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote>${quoteLines.map(renderInlineMarkdown).join('<br>')}</blockquote>`);
      continue;
    }

    const next = lines[i + 1] ? lines[i + 1].trim() : '';
    if (line.includes('|') && next && isTableSeparator(next)) {
      flushParagraph();
      closeList();
      const headerCells = splitTableCells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitTableCells(lines[i]));
        i += 1;
      }
      let tableHtml = '<table><thead><tr>';
      headerCells.forEach(cell => { tableHtml += `<th>${renderInlineMarkdown(cell)}</th>`; });
      tableHtml += '</tr></thead><tbody>';
      rows.forEach(row => {
        tableHtml += '<tr>';
        for (let c = 0; c < headerCells.length; c += 1) {
          tableHtml += `<td>${renderInlineMarkdown(row[c] || '')}</td>`;
        }
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table>';
      html.push(tableHtml);
      continue;
    }

    if (isUnorderedListItem(raw) || isOrderedListItem(raw)) {
      flushParagraph();
      const nextType = isOrderedListItem(raw) ? 'ol' : 'ul';
      if (listType && listType !== nextType) {
        html.push(listType === 'ol' ? '</ol>' : '</ul>');
        listType = '';
      }
      if (!listType) {
        listType = nextType;
        html.push(nextType === 'ol' ? '<ol>' : '<ul>');
      }
      html.push(`<li>${renderListItemContent(extractListContent(raw))}</li>`);
      i += 1;
      continue;
    }

    paragraphBuffer.push(raw);
    i += 1;
  }

  flushParagraph();
  closeList();
  return html.join('');
}

function renderAIBubble(role, content) {
  const isUser = role === 'user';
  const text = String(content || '');
  const isFeatured = !isUser && /```|(^|\n)\s*#{1,3}\s.+/m.test(text) && text.length > 220;
  const safeContent = !isUser
    ? renderMarkdown(text)
    : escapeHtml(text).replace(/\n/g, '<br>');
  const rowClass = isUser ? 'ai-msg-row ai-msg-row-user' : 'ai-msg-row ai-msg-row-assistant';
  const bubbleClass = isUser
    ? 'ai-msg ai-msg-user'
    : `ai-msg ai-msg-assistant${isFeatured ? ' ai-msg-featured' : ''}`;
  const contentClass = isUser ? 'ai-msg-content' : 'ai-msg-content ai-md';
  return `<div class="${rowClass}"><div class="${bubbleClass}"><div class="${contentClass}">${safeContent}</div></div></div>`;
}

function renderAIWelcomeMessage() {
  return renderAIBubble('assistant', '👋 你好！我是AI助手。可从左侧选择历史会话，或直接输入开始新对话。普通用户每天100次额度。');
}

function getPreferredAIModel() {
  return localStorage.getItem(AI_MODEL_STORAGE_KEY) || '';
}

function getPreferredAIProvider() {
  const saved = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
  if (saved && AI_PROVIDER_MODELS[saved] && AI_PROVIDER_MODELS[saved].enabled !== false) return saved;
  return 'minimax';
}

function setPreferredAIModel(model) {
  if (!model) return;
  localStorage.setItem(AI_MODEL_STORAGE_KEY, model);
}

function setPreferredAIProvider(provider) {
  if (!provider || !AI_PROVIDER_MODELS[provider] || AI_PROVIDER_MODELS[provider].enabled === false) return;
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

function getAIModelLabel(provider, modelValue) {
  const model = getModelsByProvider(provider).find(item => item.value === modelValue);
  return model?.label || modelValue || '未知模型';
}

function getAIProviderLabel(provider) {
  return AI_PROVIDER_MODELS[provider]?.label || provider;
}

function stripMarkdownToPlain(content) {
  const text = String(content || '');
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_~>#-]/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function estimateContextTokens(chats) {
  const totalChars = (Array.isArray(chats) ? chats : [])
    .map(item => String(item?.content || '').length)
    .reduce((sum, n) => sum + n, 0);
  return Math.max(0, Math.round(totalChars / 4));
}

function getAverageLatencyMs(chats) {
  if (!Array.isArray(chats) || chats.length < 2) return null;
  const values = [];
  for (let i = 0; i < chats.length - 1; i += 1) {
    const current = chats[i];
    const next = chats[i + 1];
    if (current?.role !== 'user' || next?.role !== 'assistant') continue;
    const t1 = new Date(current.created_at || current.createdAt || '').getTime();
    const t2 = new Date(next.created_at || next.createdAt || '').getTime();
    if (Number.isFinite(t1) && Number.isFinite(t2) && t2 > t1) {
      values.push(t2 - t1);
    }
  }
  if (values.length === 0) return null;
  const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
  return Math.round(avg);
}

function getActiveSession() {
  return aiSessions.find(item => item.id === currentAISessionId) || null;
}

function updateAIDashboardMeta() {
  const activeSession = getActiveSession();
  const sessionTitle = trimSessionTitle(activeSession?.title || '');
  const titleEl = document.getElementById('ai-current-session-title');
  const subtitleEl = document.getElementById('ai-current-session-subtitle');
  if (titleEl) {
    titleEl.textContent = sessionTitle || '未命名会话';
  }

  const { provider, model } = getCurrentAISelection();
  const providerLabel = getAIProviderLabel(provider);
  const modelLabel = getAIModelLabel(provider, model);
  const modelPair = `${providerLabel} · ${modelLabel}`;

  if (subtitleEl) {
    const messageCount = Array.isArray(aiChatHistory) ? aiChatHistory.length : 0;
    subtitleEl.textContent = `${messageCount} 条消息 · ${providerLabel}`;
  }

  const topModelChip = document.getElementById('ai-model-chip');
  if (topModelChip) topModelChip.textContent = modelPair;

  const workspaceModelTag = document.getElementById('ai-workspace-model-tag');
  if (workspaceModelTag) workspaceModelTag.textContent = modelPair;

  const contextModelName = document.getElementById('ai-context-model-name');
  if (contextModelName) contextModelName.textContent = modelLabel;

  const contextModelStatus = document.getElementById('ai-context-model-status');
  if (contextModelStatus) {
    contextModelStatus.textContent = AI_PROVIDER_MODELS[provider]?.enabled === false ? '待接入' : '可用';
  }

  const capsEl = document.getElementById('ai-context-capabilities');
  if (capsEl) {
    const capMap = {
      minimax: '会话管理 / 内容生成 / 长上下文',
      bailian: '会话管理 / 多模型切换 / 内容生成'
    };
    capsEl.textContent = capMap[provider] || '会话管理 / 内容生成';
  }

  const userCount = aiChatHistory.filter(item => item?.role === 'user').length;
  const statMessages = document.getElementById('ai-stat-messages');
  if (statMessages) statMessages.textContent = String(userCount);

  const statLatency = document.getElementById('ai-stat-latency');
  if (statLatency) {
    const avgMs = getAverageLatencyMs(aiChatHistory);
    statLatency.textContent = avgMs ? `${(avgMs / 1000).toFixed(1)}s` : '--';
  }

  const statContext = document.getElementById('ai-stat-context');
  if (statContext) {
    statContext.textContent = `${estimateContextTokens(aiChatHistory)} tokens(估算)`;
  }

  const summaryEl = document.getElementById('ai-context-summary');
  if (summaryEl) {
    const lastAssistant = [...aiChatHistory].reverse().find(item => item?.role === 'assistant');
    const summary = stripMarkdownToPlain(lastAssistant?.content || '');
    summaryEl.textContent = summary
      ? (summary.length > 180 ? `${summary.slice(0, 180)}...` : summary)
      : '当前会话暂无摘要。发送消息后将自动提取最近一条助手回复。';
  }
}

function formatQuotaText(quota, total, unlimited) {
  if (unlimited) return '今日剩余: 不限';
  return `今日剩余: ${quota}/${total}`;
}

function updateAIModelHint() {
  const selector = document.getElementById('ai-model-select');
  const providerSelector = document.getElementById('ai-provider-select');
  if (!selector || !providerSelector) return;
  const { provider, model } = getCurrentAISelection();
  const hint = `${getAIProviderLabel(provider)} / ${getAIModelLabel(provider, model)}`;
  selector.title = hint;
  providerSelector.title = hint;
  updateAIDashboardMeta();
}

function initAIModelSelector() {
  const providerSelector = document.getElementById('ai-provider-select');
  const selector = document.getElementById('ai-model-select');
  if (!providerSelector || !selector) return;

  providerSelector.innerHTML = Object.entries(AI_PROVIDER_MODELS)
    .filter(([, info]) => info.enabled !== false)
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

  providerSelector.addEventListener('change', () => {
    renderModelsForProvider(providerSelector.value);
  });

  selector.addEventListener('change', () => {
    const provider = providerSelector.value;
    const safeModel = ensureValidAIModel(provider, selector.value);
    selector.value = safeModel;
    setPreferredAIProvider(provider);
    setPreferredAIModel(safeModel);
    updateAIModelHint();
  });
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
    updateAIDashboardMeta();
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
  updateAIDashboardMeta();
}

function renderAIChatMessages(chats) {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;

  if (!Array.isArray(chats) || chats.length === 0) {
    container.innerHTML = renderAIWelcomeMessage();
    updateAIDashboardMeta();
    return;
  }

  container.innerHTML = chats
    .map(chat => renderAIBubble(chat.role === 'user' ? 'user' : 'assistant', chat.content))
    .join('');

  container.scrollTop = container.scrollHeight;
  updateAIDashboardMeta();
}

function appendAIMessage(role, content) {
  aiChatHistory.push({
    role,
    content: String(content || ''),
    created_at: new Date().toISOString()
  });
  renderAIChatMessages(aiChatHistory);
}

function showThinkingIndicator() {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;
  removeThinkingIndicator();

  const node = document.createElement('div');
  node.className = 'ai-msg-row ai-msg-row-assistant';
  node.innerHTML = '<div id="ai-thinking-indicator" class="ai-msg ai-msg-assistant ai-thinking-item"><span class="ai-thinking-spin"></span><span>正在思考...</span></div>';
  container.appendChild(node);
  container.scrollTop = container.scrollHeight;
}

function removeThinkingIndicator() {
  const node = document.getElementById('ai-thinking-indicator');
  if (!node) return;
  const wrapper = node.closest('.ai-msg-row');
  if (wrapper) wrapper.remove();
  else node.remove();
}

function createNewAIChat() {
  currentAISessionId = createClientSessionId();
  setLastOpenedSessionId(currentAISessionId);
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
  setLastOpenedSessionId(sessionId);
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

  const ok = window.confirm('删除后该会话不可恢复，确定继续吗？');
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
    clearLastOpenedSessionId(sessionId);
    aiChatHistory = [];
  }

  await loadAISessions();
}

async function loadAIQuota() {
  try {
    const res = await api('/ai/quota');
    const el = document.getElementById('ai-quota-display');
    if (el) el.textContent = formatQuotaText(res.quota, res.total, !!res.unlimited);
  } catch (e) {
    console.error(e);
  }
}

async function loadAISessions(preferredSessionId = '', autoOpenFirst = true) {
  try {
    const res = await api('/ai/sessions');
    aiSessions = normalizeSessionList(res.sessions);

    if (preferredSessionId && aiSessions.some(item => item.id === preferredSessionId)) {
      currentAISessionId = preferredSessionId;
    } else if (currentAISessionId && aiSessions.some(item => item.id === currentAISessionId)) {
      // keep current
    } else if (autoOpenFirst) {
      currentAISessionId = aiSessions[0]?.id || '';
    } else {
      currentAISessionId = '';
    }

    renderAISessionList();

    if (currentAISessionId) {
      setLastOpenedSessionId(currentAISessionId);
      await loadAIHistory(currentAISessionId);
    } else {
      aiChatHistory = [];
      renderAIChatMessages(aiChatHistory);
    }
  } catch (e) {
    console.error(e);
    showToast('会话列表加载失败，已保留当前对话', 'error');
    renderAISessionList();
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
    setLastOpenedSessionId(sessionId);
    renderAIChatMessages(aiChatHistory);
    renderAISessionList();
  } catch (e) {
    console.error(e);
    aiChatHistory = [];
    renderAIChatMessages(aiChatHistory);
    renderAISessionList();
    showToast('聊天记录加载失败，请稍后重试', 'error');
  }
}

async function sendAIMessage() {
  if (aiSending) return;

  const input = document.getElementById('ai-input');
  const message = input?.value.trim();
  if (!message) return;

  const { provider: selectedProvider, model: selectedModel } = getCurrentAISelection();
  if (selectedProvider === 'moonshot') {
    showToast('月之暗面暂未配置服务端密钥，请先选择 MinMax 或 百炼', 'error');
    return;
  }

  if (!currentAISessionId) {
    createNewAIChat();
  }
  const sendingSessionId = currentAISessionId || createClientSessionId();

  aiSending = true;
  setSendButtonRunning(true);

  appendAIMessage('user', message);
  showThinkingIndicator();
  input.value = '';
  autoResizeAIInput();
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
      removeThinkingIndicator();
      showToast(res.error, 'error', 2600);
      appendAIMessage('assistant', '请求失败了，请稍后重试一次。');
      return;
    }

    removeThinkingIndicator();
    currentAISessionId = String(res.session_id || sendingSessionId);
    setLastOpenedSessionId(currentAISessionId);
    appendAIMessage('assistant', res.response);

    const quotaEl = document.getElementById('ai-quota-display');
    if (quotaEl) quotaEl.textContent = formatQuotaText(res.quota, res.total, !!res.unlimited);

    await loadAISessions(currentAISessionId);
  } catch (e) {
    removeThinkingIndicator();
    console.error(e);
    showToast('发送失败，请重试', 'error');
    appendAIMessage('assistant', '网络有点波动，本次发送失败，请重试。');
  } finally {
    aiSending = false;
    setSendButtonRunning(false);
  }
}

async function clearAIChat() {
  const ok = window.confirm('将清空全部会话记录且不可恢复，确定继续吗？');
  if (!ok) return;
  try {
    await api('/ai/history', { method: 'DELETE' });
    aiSessions = [];
    currentAISessionId = '';
    aiChatHistory = [];
    renderAISessionList();
    renderAIChatMessages([]);
    showToast('聊天记录已清空', 'info');
  } catch (e) {
    console.error(e);
    showToast('清空失败，请稍后重试', 'error');
  }
}

function autoResizeAIInput() {
  const input = document.getElementById('ai-input');
  if (!input) return;

  const minHeight = 40;
  const maxHeight = 120;
  input.style.height = 'auto';
  const next = Math.max(minHeight, Math.min(maxHeight, input.scrollHeight));
  input.style.height = `${next}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function exportCurrentSession() {
  const activeSession = getActiveSession();
  const title = trimSessionTitle(activeSession?.title || 'AI-会话记录');
  const lines = [];
  lines.push(`# ${title}`);
  lines.push(`导出时间: ${new Date().toLocaleString()}`);
  lines.push('');
  (Array.isArray(aiChatHistory) ? aiChatHistory : []).forEach(item => {
    const role = item?.role === 'user' ? '用户' : 'AI';
    lines.push(`## ${role}`);
    lines.push(String(item?.content || ''));
    lines.push('');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${title.replace(/[\\/:*?"<>|]/g, '_') || 'session'}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

async function copyCurrentSummary() {
  const summaryEl = document.getElementById('ai-context-summary');
  const text = String(summaryEl?.textContent || '').trim();
  if (!text) {
    showToast('暂无可复制摘要', 'error');
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const temp = document.createElement('textarea');
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
    }
    showToast('摘要已复制', 'info');
  } catch (e) {
    showToast('复制失败，请手动复制', 'error');
  }
}

function bindAIDashboardActions() {
  const newBtn = document.getElementById('ai-action-new');
  if (newBtn) newBtn.addEventListener('click', createNewAIChat);

  const exportBtn = document.getElementById('ai-action-export');
  if (exportBtn) exportBtn.addEventListener('click', exportCurrentSession);

  const copyBtn = document.getElementById('ai-action-copy');
  if (copyBtn) copyBtn.addEventListener('click', copyCurrentSummary);

  const switchModelBtn = document.getElementById('ai-action-switch-model');
  if (switchModelBtn) {
    switchModelBtn.addEventListener('click', () => {
      const provider = document.getElementById('ai-provider-select');
      const model = document.getElementById('ai-model-select');
      (model || provider)?.focus();
    });
  }
}

function applySessionPanelCollapsed(collapsed) {
  const panel = document.getElementById('ai-session-panel') || document.querySelector('.ai-session-panel');
  const mainContent = document.getElementById('ai-main-content');
  const btn = document.getElementById('ai-session-toggle');
  if (!panel || !btn) return;

  panel.classList.toggle('collapsed', collapsed);
  if (mainContent) {
    mainContent.classList.toggle('sidebar-collapsed', collapsed);
  }
  btn.textContent = collapsed ? '»' : '☰';
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function toggleAISessionPanel() {
  const panel = document.getElementById('ai-session-panel') || document.querySelector('.ai-session-panel');
  if (!panel) return;
  const collapsed = !panel.classList.contains('collapsed');
  applySessionPanelCollapsed(collapsed);
  localStorage.setItem(AI_SESSION_COLLAPSED_KEY, collapsed ? 'true' : 'false');
}

function initAIPage() {
  if (!getToken()) {
    window.location.href = '/';
    return;
  }

  initAIModelSelector();
  hydrateUserAvatar();
  bindAIDashboardActions();
  updateAIModelHint();
  updateAIDashboardMeta();
  loadAIQuota();
  const lastSessionId = getLastOpenedSessionId();
  loadAISessions(lastSessionId, true);

  const savedCollapsed = localStorage.getItem(AI_SESSION_COLLAPSED_KEY) === 'true';
  applySessionPanelCollapsed(savedCollapsed);

  const input = document.getElementById('ai-input');
  if (input) {
    input.addEventListener('input', autoResizeAIInput);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendAIMessage();
      }
    });
    setTimeout(() => {
      autoResizeAIInput();
      input.focus();
    }, 30);
  }
}

window.createNewAIChat = createNewAIChat;
window.openAISession = openAISession;
window.deleteAISession = deleteAISession;
window.sendAIMessage = sendAIMessage;
window.clearAIChat = clearAIChat;
window.toggleAISessionPanel = toggleAISessionPanel;

document.addEventListener('DOMContentLoaded', initAIPage);
