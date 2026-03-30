(function () {
  'use strict';

  var KEYS = {
    recent: 'toolbox.recent',
    lastTool: 'toolbox.lastTool',
    lastCategory: 'toolbox.lastCategory',
    collapsed: 'toolbox.collapsed',
    persist: 'toolbox.persistEnabled',
    state: 'toolbox.state.',
    history: 'toolbox.history.'
  };
  var DEFAULT_TOOL = 'url';
  var CATS = [
    { id: 'encoding', label: '编解码', icon: '🔁' },
    { id: 'security', label: '安全与摘要', icon: '🛡️' },
    { id: 'data', label: '数据格式', icon: '🧩' },
    { id: 'network', label: '网络与URL', icon: '🌐' },
    { id: 'text', label: '文本处理', icon: '📝' },
    { id: 'timeid', label: '时间与标识', icon: '⏱️' },
    { id: 'colornum', label: '颜色与数值', icon: '🎨' }
  ];

  var TOOLS = [
    mk('url', 'URL 编码/解码', 'encoding', '自动识别 + 逐行'),
    mk('base64', 'Base64 编解码', 'encoding', 'UTF-8 + URL-safe'),
    mk('html', 'HTML 实体编解码', 'encoding', '自动方向识别'),
    mk('unicode', 'Unicode 转换', 'encoding', '\\uXXXX / \\u{XXXXX}'),
    mk('md5', 'MD5 摘要', 'security', '文本/文件 + 批量'),
    mk('sha256', 'SHA-256 摘要', 'security', '文本/文件 + 批量'),
    mk('hmac', 'HMAC-SHA256', 'security', '密钥签名'),
    mk('jwt', 'JWT 解码', 'security', 'Header/Payload + 时间'),
    mk('json', 'JSON 工具', 'data', '格式化/压缩/校验'),
    mk('json_yaml', 'JSON ↔ YAML', 'data', '离线互转'),
    mk('json_csv', 'JSON ↔ CSV', 'data', '数组对象互转'),
    mk('timestamp', '时间戳转换', 'timeid', '秒/毫秒/ISO'),
    mk('uuid', 'UUID 生成', 'timeid', 'v4/v7 + 批量'),
    mk('radix', '进制转换', 'colornum', '支持前缀与负数'),
    mk('color', '颜色转换', 'colornum', 'HEX/RGB/HSL + 对比度'),
    mk('url_parser', 'URL 解析器', 'network', 'URL 拆解与 Query'),
    mk('query_builder', 'Query 构造器', 'network', '列表 ↔ Query'),
    mk('regex', '正则测试器', 'text', '匹配分组 + 高亮'),
    mk('text_case', 'Case 转换', 'text', 'camel/snake/kebab/pascal'),
    mk('text_clean', '文本整理器', 'text', '去重/排序/去空行/行号')
  ];

  function mk(id, name, category, desc) {
    return { id: id, name: name, category: category, desc: desc };
  }

  var map = {};
  TOOLS.forEach(function (t) { map[t.id] = t; });

  var state = {
    active: DEFAULT_TOOL,
    category: 'all',
    search: '',
    collapsed: {},
    recent: [],
    persist: true,
    tool: {}
  };

  var el = {};
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    applyTheme();
    el.sidebar = q('#toolbox-sidebar');
    el.overlay = q('#sidebar-overlay');
    el.search = q('#tool-search');
    el.cat = q('#category-filter');
    el.list = q('#tool-list');
    el.panel = q('#tool-panel');
    el.recent = q('#recent-tools');
    el.persist = q('#remember-state');
    el.menu = q('#open-sidebar');

    state.recent = jget(KEYS.recent, []);
    state.collapsed = jget(KEYS.collapsed, {});
    state.persist = bget(KEYS.persist, true);
    state.category = localStorage.getItem(KEYS.lastCategory) || 'all';
    if (state.category !== 'all' && !CATS.some(function (c) { return c.id === state.category; })) state.category = 'all';
    el.persist.checked = state.persist;

    bind();
    renderCats();
    renderList();
    activate(resolveInit(), false);
    renderRecent();
  }

  function bind() {
    el.search.addEventListener('input', function () {
      state.search = el.search.value.trim().toLowerCase();
      renderList();
    });
    el.cat.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      state.category = b.getAttribute('data-cat');
      localStorage.setItem(KEYS.lastCategory, state.category);
      renderCats();
      renderList();
    });
    el.list.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tool]');
      if (t) {
        activate(t.getAttribute('data-tool'), true);
        if (mobile()) closeSidebar();
      }
      var c = e.target.closest('[data-collapse]');
      if (c) {
        var id = c.getAttribute('data-collapse');
        state.collapsed[id] = !state.collapsed[id];
        jset(KEYS.collapsed, state.collapsed);
        renderList();
      }
    });
    el.recent.addEventListener('click', function (e) {
      var b = e.target.closest('[data-recent]');
      if (!b) return;
      activate(b.getAttribute('data-recent'), true);
    });
    el.panel.addEventListener('input', onPanelInput);
    el.panel.addEventListener('change', onPanelChange);
    el.panel.addEventListener('click', onPanelClick);
    el.persist.addEventListener('change', function () {
      state.persist = !!el.persist.checked;
      bset(KEYS.persist, state.persist);
      if (!state.persist) clearPersisted();
      saveActive();
    });
    el.menu.addEventListener('click', function () {
      el.sidebar.classList.toggle('open');
      el.overlay.classList.toggle('show');
    });
    el.overlay.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', onKeys);
  }

  function onKeys(e) {
    var key = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'k') {
      e.preventDefault();
      if (mobile()) openSidebar();
      el.search.focus();
      el.search.select();
    } else if ((e.ctrlKey || e.metaKey) && key === 'enter') {
      e.preventDefault();
      run();
    } else if (e.key === 'Escape') {
      if (el.sidebar.classList.contains('open')) return closeSidebar();
      if (state.search || state.category !== 'all') {
        state.search = ''; state.category = 'all'; el.search.value = ''; renderCats(); renderList(); return;
      }
      if (hasInputOrOutput()) return clear(false);
      if (state.active !== DEFAULT_TOOL) activate(DEFAULT_TOOL, true);
    }
  }

  function renderCats() {
    var html = chip('all', '全部', state.category === 'all');
    CATS.forEach(function (c) { html += chip(c.id, c.icon + ' ' + c.label, state.category === c.id); });
    el.cat.innerHTML = html;
  }

  function chip(id, label, active) {
    return '<button class="chip' + (active ? ' active' : '') + '" data-cat="' + esc(id) + '">' + esc(label) + '</button>';
  }

  function filtered() {
    return TOOLS.filter(function (t) {
      if (state.category !== 'all' && t.category !== state.category) return false;
      if (!state.search) return true;
      return (t.name + ' ' + t.desc + ' ' + t.id).toLowerCase().indexOf(state.search) >= 0;
    });
  }

  function renderList() {
    var v = filtered();
    if (!v.length) return (el.list.innerHTML = '<div class="no-tools">没有匹配工具</div>');
    var group = {};
    v.forEach(function (t) { (group[t.category] = group[t.category] || []).push(t); });
    var html = '';
    CATS.forEach(function (c) {
      if (!group[c.id]) return;
      var collapsed = !!state.collapsed[c.id];
      html += '<section class="category-block' + (collapsed ? ' collapsed' : '') + '">';
      html += '<button class="category-block-header" data-collapse="' + c.id + '"><span>' + esc(c.icon + ' ' + c.label) + '</span><span>' + group[c.id].length + ' · ' + (collapsed ? '展开' : '收起') + '</span></button>';
      html += '<div class="category-block-list">';
      group[c.id].forEach(function (t) {
        html += '<button class="tool-item' + (t.id === state.active ? ' active' : '') + '" data-tool="' + t.id + '"><div class="tool-item-title">' + esc(t.name) + '</div><div class="tool-item-desc">' + esc(t.desc) + '</div></button>';
      });
      html += '</div></section>';
    });
    el.list.innerHTML = html;
  }

  function renderRecent() {
    if (!state.recent.length) return (el.recent.innerHTML = '<div class="recent-wrap"><span class="recent-label">最近使用：暂无</span></div>');
    var html = '<div class="recent-wrap"><span class="recent-label">最近使用：</span>';
    state.recent.forEach(function (id) {
      if (!map[id]) return;
      html += '<button class="chip' + (id === state.active ? ' active' : '') + '" data-recent="' + id + '">' + esc(map[id].name) + '</button>';
    });
    html += '</div>';
    el.recent.innerHTML = html;
  }

  function resolveInit() {
    var qv = new URLSearchParams(location.search).get('tool');
    if (qv && map[qv]) return qv;
    var last = localStorage.getItem(KEYS.lastTool);
    return map[last] ? last : DEFAULT_TOOL;
  }

  function activate(id, syncUrl) {
    if (!map[id]) id = DEFAULT_TOOL;
    state.active = id;
    ensure(id);
    localStorage.setItem(KEYS.lastTool, id);
    state.recent = [id].concat(state.recent.filter(function (x) { return x !== id; })).slice(0, 6);
    jset(KEYS.recent, state.recent);
    renderList();
    renderRecent();
    renderPanel();
    if (syncUrl) {
      var u = new URL(location.href);
      u.searchParams.set('tool', id);
      history.replaceState({}, '', u.toString());
    }
  }

  function ensure(id) {
    if (state.tool[id]) return state.tool[id];
    var s = defaults(id);
    if (state.persist) {
      var p = jget(KEYS.state + id, null);
      var h = jget(KEYS.history + id, null);
      if (p) s = Object.assign(s, p, { fields: Object.assign(s.fields, p.fields || {}), options: Object.assign(s.options, p.options || {}) });
      if (Array.isArray(h)) s.history = h.slice(0, 8);
    }
    state.tool[id] = s;
    return s;
  }

  function defaults(id) {
    return {
      mode: modeDefault(id),
      fields: fieldDefaults(id),
      options: optionDefaults(id),
      output: '',
      outputHtml: '',
      status: '',
      statusType: '',
      meta: '',
      history: [],
      file: null
    };
  }

  function modeDefault(id) {
    var m = { url: 'auto', base64: 'auto', html: 'auto', unicode: 'auto', json: 'format', json_yaml: 'auto', json_csv: 'json_to_csv', query_builder: 'build', timestamp: 'ts_to_date', text_case: 'all' };
    return m[id] || 'run';
  }

  function fieldDefaults(id) {
    var d = {
      url: { input: '' }, base64: { input: '' }, html: { input: '' }, unicode: { input: '' },
      md5: { input: '' }, sha256: { input: '' }, hmac: { secret: '', input: '' }, jwt: { input: '' },
      json: { input: '' }, json_yaml: { input: '' }, json_csv: { input: '' },
      timestamp: { input: '' }, uuid: {}, radix: { input: '' }, color: { input: '' },
      url_parser: { input: '' }, query_builder: { baseUrl: '', input: '' },
      regex: { pattern: '', flags: 'g', input: '' }, text_case: { input: '' }, text_clean: { input: '' }
    };
    return d[id] || {};
  }

  function optionDefaults(id) {
    var d = {
      url: { batch: false, plusAsSpace: true }, base64: { batch: false, urlSafe: false }, html: { batch: false }, unicode: { batch: false },
      md5: { source: 'text', batch: false, outputCase: 'lower' }, sha256: { source: 'text', batch: false, outputCase: 'lower' }, hmac: { source: 'text', outputCase: 'lower' },
      json: { sortKeys: false, indent: 2 }, json_yaml: { indent: 2 }, json_csv: { delimiter: ',', pretty: true }, timestamp: { timezone: 'Asia/Shanghai' },
      uuid: { version: 'v4', count: 1 }, radix: { inputBase: 'auto' }, color: {}, url_parser: { decodeQuery: true }, query_builder: { encode: true },
      regex: { maxMatches: 100 }, text_case: {}, text_clean: { trimEach: true, removeEmpty: true, dedupe: false, sort: false, addLineNo: false }
    };
    return d[id] || {};
  }

  function renderPanel() {
    var tool = map[state.active], s = ensure(tool.id), cat = CATS.find(function (c) { return c.id === tool.category; }) || CATS[0];
    var html = '';
    html += '<section class="tool-panel"><header class="tool-panel-header"><div><h2 class="tool-panel-title">' + esc(tool.name) + '</h2><p class="tool-panel-desc">' + esc(tool.desc) + '</p></div><div class="tool-panel-meta"><span class="tool-meta-chip">' + esc(cat.icon + ' ' + cat.label) + '</span><span class="tool-meta-chip">Ctrl/Cmd+Enter 执行</span><span class="tool-meta-chip">Esc 清空</span></div></header>';
    html += controls(tool.id, s) + fields(tool.id, s) + fileBox(tool.id, s);
    html += '<div class="action-row"><button class="btn btn-primary" data-act="run">执行</button><button class="btn btn-secondary" data-act="sample">示例</button><button class="btn btn-secondary" data-act="clear">清空</button><button class="btn btn-secondary" data-act="copy">复制结果</button></div>';
    html += '<div class="status-box' + (s.statusType ? ' ' + s.statusType : '') + '"' + (s.statusType ? '' : ' style="display:none"') + '>' + esc(s.status || '') + '</div>';
    html += '<div class="output-wrap"><div class="output-head"><span>输出结果</span><span>' + esc(s.meta || '') + '</span></div><pre class="output-content" id="tool-output">' + esc(s.output || '') + '</pre><div class="output-preview" id="tool-preview">' + (s.outputHtml || '') + '</div></div>';
    html += historyHtml(s);
    html += '</section>';
    el.panel.innerHTML = html;
    toggleFile();
  }

  function controls(id, s) {
    var html = '<div class="controls-grid">';
    html += '<div class="control-group"><label>模式</label><select data-mode>' + modeOptions(id, s.mode) + '</select></div>';
    Object.keys(s.options).forEach(function (k) {
      var v = s.options[k];
      if (typeof v === 'boolean') html += '<div class="control-group"><label><input type="checkbox" data-opt="' + k + '"' + (v ? ' checked' : '') + '> ' + optLabel(k) + '</label></div>';
      else if (typeof v === 'number') html += '<div class="control-group"><label>' + optLabel(k) + '</label><input type="number" data-opt="' + k + '" value="' + v + '"></div>';
      else html += '<div class="control-group"><label>' + optLabel(k) + '</label>' + optSelect(id, k, v) + '</div>';
    });
    html += '</div>';
    return html;
  }

  function modeOptions(id, current) {
    var cfg = {
      url: [['auto', '自动'], ['encode', '编码'], ['decode', '解码']], base64: [['auto', '自动'], ['encode', '编码'], ['decode', '解码']],
      html: [['auto', '自动'], ['encode', '编码'], ['decode', '解码']], unicode: [['auto', '自动'], ['encode', '转义'], ['decode', '反转义']],
      json: [['format', '格式化'], ['minify', '压缩'], ['validate', '校验']], json_yaml: [['auto', '自动'], ['json_to_yaml', 'JSON→YAML'], ['yaml_to_json', 'YAML→JSON']],
      json_csv: [['json_to_csv', 'JSON→CSV'], ['csv_to_json', 'CSV→JSON']], timestamp: [['ts_to_date', '时间戳→日期'], ['date_to_ts', '日期→时间戳']],
      query_builder: [['build', '列表→Query'], ['parse', 'Query→列表']], text_case: [['all', '全部'], ['camel', 'camel'], ['snake', 'snake'], ['kebab', 'kebab'], ['pascal', 'pascal']]
    };
    var m = cfg[id] || [['run', '执行']];
    return m.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === current ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('');
  }

  function optLabel(k) {
    var m = { batch: '逐行处理', plusAsSpace: '+ 为空格', urlSafe: 'URL-safe', source: '输入源', outputCase: '输出大小写', sortKeys: '排序键', indent: '缩进', delimiter: '分隔符', pretty: 'JSON格式化', timezone: '时区', version: '版本', count: '数量', inputBase: '输入基数', decodeQuery: 'Query解码', encode: '编码输出', maxMatches: '最大匹配', trimEach: '行trim', removeEmpty: '去空行', dedupe: '去重', sort: '排序', addLineNo: '加行号' };
    return m[k] || k;
  }

  function optSelect(id, k, v) {
    function sel(arr) { return '<select data-opt="' + k + '">' + arr.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; }
    if (k === 'source') return sel([['text', '文本'], ['file', '文件']]);
    if (k === 'outputCase') return sel([['lower', '小写'], ['upper', '大写']]);
    if (k === 'delimiter') return sel([[',', '逗号'], [';', '分号'], ['\t', '制表符']]);
    if (k === 'timezone') return sel([['Asia/Shanghai', 'Asia/Shanghai'], ['UTC', 'UTC'], ['America/New_York', 'America/New_York'], ['Europe/London', 'Europe/London']]);
    if (k === 'version') return sel([['v4', 'v4'], ['v7', 'v7']]);
    if (k === 'inputBase') return sel([['auto', '自动'], ['2', '2'], ['8', '8'], ['10', '10'], ['16', '16']]);
    return '<input type="text" data-opt="' + k + '" value="' + esc(v) + '">';
  }

  function fields(id, s) {
    function field(fid, label, type, placeholder, rows) {
      var v = s.fields[fid] || '';
      if (type === 'textarea') return '<div class="field-block"><label>' + label + '</label><textarea rows="' + rows + '" data-field="' + fid + '" placeholder="' + esc(placeholder || '') + '">' + esc(v) + '</textarea></div>';
      return '<div class="field-block"><label>' + label + '</label><input type="' + type + '" data-field="' + fid + '" placeholder="' + esc(placeholder || '') + '" value="' + esc(v) + '"></div>';
    }
    var h = '';
    if (id === 'hmac') h += field('secret', '密钥', 'password', '输入密钥');
    if (id === 'query_builder') h += field('baseUrl', '基础 URL（可选）', 'text', 'https://pandahub.cloud/search');
    if (id === 'regex') { h += field('pattern', '正则表达式', 'text', '(AI|熊猫)\\w*'); h += field('flags', '标志位', 'text', 'gim'); }
    if (id === 'uuid') return h;
    var rows = (id === 'json' || id === 'json_yaml' || id === 'json_csv' || id === 'text_clean' || id === 'regex') ? 9 : 7;
    h += field('input', '输入', id === 'timestamp' || id === 'color' || id === 'radix' || id === 'url_parser' ? 'text' : 'textarea', '', rows);
    return h;
  }

  function fileBox(id, s) {
    if (!(id === 'md5' || id === 'sha256' || id === 'hmac')) return '';
    var name = s.file ? s.file.name + ' · ' + fmtBytes(s.file.size) : '未选择文件';
    return '<div class="tool-file-wrap" data-file-wrap><label>文件输入（source=file 时生效）</label><input type="file" data-file><div class="tool-file-meta">' + esc(name) + '</div></div>';
  }

  function historyHtml(s) {
    if (!s.history || !s.history.length) return '<section class="history-block"><h3 class="history-title">本地历史：暂无</h3></section>';
    return '<section class="history-block"><h3 class="history-title">本地历史（点击恢复）</h3><div class="history-list">' + s.history.map(function (h, i) { return '<button class="history-item" data-act="restore" data-i="' + i + '">' + esc(time(h.at) + ' · ' + h.brief) + '</button>'; }).join('') + '</div></section>';
  }

  function onPanelInput(e) {
    var s = ensure(state.active), f = e.target.getAttribute('data-field'), o = e.target.getAttribute('data-opt');
    if (f) s.fields[f] = e.target.value;
    if (o && e.target.type === 'number') s.options[o] = Number(e.target.value || 0);
    saveActive();
  }

  function onPanelChange(e) {
    var s = ensure(state.active), o = e.target.getAttribute('data-opt');
    if (e.target.hasAttribute('data-mode')) s.mode = e.target.value;
    if (o) s.options[o] = e.target.type === 'checkbox' ? !!e.target.checked : e.target.value;
    if (e.target.hasAttribute('data-file')) s.file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    saveActive(); renderPanel();
  }

  function onPanelClick(e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.getAttribute('data-act');
    if (act === 'run') run();
    else if (act === 'sample') sample();
    else if (act === 'clear') clear(true);
    else if (act === 'copy') copy();
    else if (act === 'restore') restore(Number(a.getAttribute('data-i')));
  }

  function toggleFile() {
    var s = ensure(state.active), box = el.panel.querySelector('[data-file-wrap]');
    if (!box) return;
    box.classList.toggle('hidden', s.options.source !== 'file');
  }

  async function run() {
    var s = ensure(state.active);
    try {
      var r = await RUN[state.active](s);
      s.output = r.data || '';
      s.outputHtml = r.html || '';
      s.status = r.meta || '执行成功';
      s.statusType = 'success';
      s.meta = r.extra || '';
      pushHistory(s);
    } catch (err) {
      s.output = '';
      s.outputHtml = '';
      s.status = err.message || String(err);
      s.statusType = 'error';
      s.meta = '';
    }
    saveActive();
    renderPanel();
  }

  function sample() {
    var s = ensure(state.active), f = s.fields;
    var m = {
      url: 'name=熊猫&city=Hangzhou\nhttps%3A%2F%2Fpandahub.cloud%2Ftoolbox%3Ftool%3Djson',
      base64: '熊猫社区 toolbox V2', html: '<span title="panda">🐼 & AI</span>', unicode: '熊猫社区 🐼', md5: 'pandahub.cloud', sha256: 'pandahub.cloud', hmac: 'POST /api/posts?tag=AI',
      json: '{\n  "name":"panda",\n  "tags":["AI","Forum"]\n}', json_yaml: 'name: panda\nfeatures:\n  - convert', json_csv: '[{"city":"hangzhou","temp":21}]',
      timestamp: String(Math.floor(Date.now() / 1000)), radix: '0x2A', color: '#0f766e', url_parser: 'https://pandahub.cloud/toolbox?tool=json&from=forum',
      query_builder: 'q=熊猫 社区\npage=1', regex: '熊猫社区欢迎你。AI日报每天更新。', text_case: 'panda toolbox page v2', text_clean: 'orange\napple\napple\nbanana\n', jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiUGFuZGEiLCJleHAiOjE4MDAwMDAwMDB9.xxx'
    };
    if (state.active === 'hmac') f.secret = 'panda-secret';
    if (state.active === 'query_builder') f.baseUrl = 'https://pandahub.cloud/search';
    if (state.active === 'regex') { f.pattern = '(AI|熊猫)[^\\s,，。]*'; f.flags = 'gi'; }
    if (state.active !== 'uuid') f.input = m[state.active] || '';
    s.status = ''; s.statusType = ''; s.output = ''; s.outputHtml = ''; s.meta = '';
    saveActive(); renderPanel();
  }

  function clear(resetFile) {
    var s = ensure(state.active);
    Object.keys(s.fields).forEach(function (k) { s.fields[k] = ''; });
    s.output = ''; s.outputHtml = ''; s.status = ''; s.statusType = ''; s.meta = '';
    if (resetFile) s.file = null;
    saveActive(); renderPanel();
  }

  function copy() {
    var s = ensure(state.active);
    if (!s.output) return;
    navigator.clipboard.writeText(s.output).then(function () {
      s.status = '结果已复制到剪贴板'; s.statusType = 'success'; renderPanel();
    }).catch(function () { s.status = '复制失败，请检查权限'; s.statusType = 'error'; renderPanel(); });
  }

  function restore(i) {
    var s = ensure(state.active), h = s.history[i];
    if (!h) return;
    s.mode = h.mode; s.fields = JSON.parse(JSON.stringify(h.fields || {})); s.status = '已恢复历史'; s.statusType = 'success';
    saveActive(); renderPanel();
  }

  function pushHistory(s) {
    var brief = Object.keys(s.fields).map(function (k) { return (s.fields[k] || '').trim(); }).find(function (x) { return x; }) || map[state.active].name;
    s.history.unshift({ at: Date.now(), mode: s.mode, fields: JSON.parse(JSON.stringify(s.fields)), brief: brief.replace(/\s+/g, ' ').slice(0, 36) });
    s.history = s.history.slice(0, 8);
  }

  function saveActive() {
    if (!state.persist) return;
    var s = ensure(state.active);
    jset(KEYS.state + state.active, { mode: s.mode, fields: s.fields, options: s.options });
    jset(KEYS.history + state.active, s.history || []);
  }

  function clearPersisted() {
    TOOLS.forEach(function (t) { localStorage.removeItem(KEYS.state + t.id); localStorage.removeItem(KEYS.history + t.id); });
  }

  function hasInputOrOutput() {
    var s = ensure(state.active);
    if (s.output) return true;
    return Object.keys(s.fields).some(function (k) { return (s.fields[k] || '').trim(); });
  }

  function openSidebar() { el.sidebar.classList.add('open'); el.overlay.classList.add('show'); }
  function closeSidebar() { el.sidebar.classList.remove('open'); el.overlay.classList.remove('show'); }
  function mobile() { return matchMedia('(max-width: 960px)').matches; }
  function q(sel) { return document.querySelector(sel); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function jget(k, d) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (_e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_e) {} }
  function bget(k, d) { var v = localStorage.getItem(k); return v == null ? d : v === 'true'; }
  function bset(k, v) { localStorage.setItem(k, v ? 'true' : 'false'); }
  function fmtBytes(n) { if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(2) + ' MB'; }
  function time(ts) { try { return TimeLite.formatInTimeZone(ts, 'Asia/Shanghai').slice(11); } catch (_e) { return ''; } }
  function applyTheme() { var t = localStorage.getItem('forum_theme') || 'mint'; if (['mint', 'sunset', 'sky', 'cyber', 'aurora'].indexOf(t) < 0) t = 'mint'; document.body.setAttribute('data-theme', t); }

  var RUN = {
    url: function (s) {
      var txt = must(s.fields.input), out = batch(txt, s.options.batch, function (v) {
        if (s.mode === 'encode') return encodeURIComponent(v);
        if (s.mode === 'decode') return decodeURIComponent((s.options.plusAsSpace ? v.replace(/\+/g, ' ') : v));
        if (/%[0-9A-Fa-f]{2}|\+/.test(v)) { try { return decodeURIComponent((s.options.plusAsSpace ? v.replace(/\+/g, ' ') : v)); } catch (_e) {} }
        return encodeURIComponent(v);
      });
      return ok(out, 'URL 处理完成', s.options.batch ? '逐行模式' : '');
    },
    base64: function (s) {
      var txt = must(s.fields.input), out = batch(txt, s.options.batch, function (v) {
        if (s.mode === 'encode') return b64e(v, s.options.urlSafe);
        if (s.mode === 'decode') return b64d(v, s.options.urlSafe);
        try { return b64d(v, s.options.urlSafe); } catch (_e) { return b64e(v, s.options.urlSafe); }
      });
      return ok(out, 'Base64 转换完成');
    },
    html: function (s) {
      var txt = must(s.fields.input), out = batch(txt, s.options.batch, function (v) {
        if (s.mode === 'encode') return henc(v);
        if (s.mode === 'decode') return hdec(v);
        return /&(?:[a-z]+|#\d+|#x[a-f0-9]+);/i.test(v) ? hdec(v) : henc(v);
      });
      return ok(out, 'HTML 实体处理完成');
    },
    unicode: function (s) {
      var txt = must(s.fields.input), out = batch(txt, s.options.batch, function (v) {
        if (s.mode === 'encode') return uenc(v);
        if (s.mode === 'decode') return udec(v);
        return /\\u\{?[0-9a-f]+\}?/i.test(v) ? udec(v) : uenc(v);
      });
      return ok(out, 'Unicode 处理完成');
    },
    md5: async function (s) {
      var out;
      if (s.options.source === 'file') {
        out = md5hex(new Uint8Array(await mustFile(s).arrayBuffer()));
      } else {
        out = await hashTextBatch(s, function (u8) { return md5hex(u8); });
      }
      return ok(caseHex(out, s.options.outputCase), 'MD5 完成', s.options.source === 'file' ? '长度 32' : '');
    },
    sha256: async function (s) {
      var out;
      if (s.options.source === 'file') {
        out = await sha256(new Uint8Array(await mustFile(s).arrayBuffer()));
      } else {
        out = await hashTextBatch(s, sha256);
      }
      return ok(caseHex(out, s.options.outputCase), 'SHA-256 完成', s.options.source === 'file' ? '长度 64' : '');
    },
    hmac: async function (s) {
      var secret = must(s.fields.secret), msg = s.options.source === 'file' ? new Uint8Array(await mustFile(s).arrayBuffer()) : new TextEncoder().encode(must(s.fields.input));
      var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      var sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
      return ok(caseHex(hex(sig), s.options.outputCase), 'HMAC-SHA256 完成', '长度 64');
    },
    jwt: function (s) {
      var p = must(s.fields.input).split('.'); if (p.length < 2) throw Error('JWT 格式无效');
      var h = JSON.parse(b64urlDecode(p[0])), d = JSON.parse(b64urlDecode(p[1])), tz = s.options.timezone || 'Asia/Shanghai';
      var lines = ['[Header]', JSON.stringify(h, null, 2), '', '[Payload]', JSON.stringify(d, null, 2), '', '[Time Claims]', claim(d, 'iat', tz), claim(d, 'nbf', tz), claim(d, 'exp', tz)];
      if (Number.isFinite(Number(d.exp))) lines.push('', 'Token 状态: ' + (Date.now() >= Number(d.exp) * 1000 ? '已过期' : '有效'));
      return ok(lines.join('\n'), 'JWT 解析完成');
    },
    json: function (s) {
      var src = must(s.fields.input).trim(), parsed = parseJSON(src), val = parsed.val;
      if (!parsed.ok) throw Error(parsed.err);
      if (s.mode === 'validate') return ok('✅ JSON 合法\n类型: ' + (Array.isArray(val) ? 'array' : typeof val), '校验通过', '字符数 ' + src.length);
      if (s.mode === 'minify') return ok(JSON.stringify(val), '压缩完成');
      if (s.options.sortKeys) val = sortKeys(val);
      var ind = Math.max(2, Math.min(8, Number(s.options.indent || 2)));
      return ok(JSON.stringify(val, null, ind), '格式化完成', '缩进 ' + ind);
    },
    json_yaml: function (s) {
      if (!window.YamlLite) throw Error('YamlLite 未加载');
      var src = must(s.fields.input).trim(), mode = s.mode;
      if (mode === 'auto') mode = /^[\[{]/.test(src) ? 'json_to_yaml' : 'yaml_to_json';
      if (mode === 'json_to_yaml') { var pj = parseJSON(src); if (!pj.ok) throw Error(pj.err); return ok(YamlLite.stringify(pj.val, { indent: 2 }), 'JSON→YAML 完成'); }
      return ok(JSON.stringify(YamlLite.parse(src), null, Math.max(2, Math.min(8, Number(s.options.indent || 2)))), 'YAML→JSON 完成');
    },
    json_csv: function (s) {
      var src = must(s.fields.input).trim(), d = s.options.delimiter || ',';
      if (s.mode === 'json_to_csv') { var pj = parseJSON(src); if (!pj.ok) throw Error(pj.err); return ok(toCSV(pj.val, d), 'JSON→CSV 完成'); }
      return ok(JSON.stringify(fromCSV(src, d), null, s.options.pretty ? 2 : 0), 'CSV→JSON 完成');
    },
    timestamp: function (s) {
      if (!window.TimeLite) throw Error('TimeLite 未加载');
      var txt = must(s.fields.input).trim(), tz = s.options.timezone || 'Asia/Shanghai';
      if (s.mode === 'ts_to_date') { var ts = TimeLite.fromTimestamp(txt); return ok(['秒: ' + ts.sec, '毫秒: ' + ts.ms, 'ISO: ' + ts.iso, tz + ': ' + TimeLite.formatInTimeZone(ts.ms, tz), 'UTC: ' + TimeLite.formatInTimeZone(ts.ms, 'UTC')].join('\n'), '时间戳转换完成'); }
      var dt = TimeLite.toTimestamp(txt); return ok(['秒: ' + dt.sec, '毫秒: ' + dt.ms, 'ISO: ' + dt.iso].join('\n'), '日期转换完成');
    },
    uuid: function (s) {
      var c = Math.max(1, Math.min(100, Number(s.options.count || 1))), v = s.options.version || 'v4', arr = [];
      for (var i = 0; i < c; i++) arr.push(v === 'v7' ? uuidv7() : uuidv4());
      return ok(arr.join('\n'), 'UUID 生成完成', v + ' · ' + c + ' 条');
    },
    radix: function (s) {
      var n = parseBig(must(s.fields.input), s.options.inputBase || 'auto'), sign = n < 0n ? '-' : '', a = n < 0n ? -n : n;
      return ok(['十进制: ' + n, '十六进制: ' + sign + '0x' + a.toString(16).toUpperCase(), '八进制: ' + sign + '0o' + a.toString(8), '二进制: ' + sign + '0b' + a.toString(2), '位宽: ' + a.toString(2).length + ' bit'].join('\n'), '进制转换完成');
    },
    color: function (s) {
      var c = parseColor(must(s.fields.input).trim()); if (!c) throw Error('颜色格式无效');
      var hsl = rgb2hsl(c.r, c.g, c.b), cw = ratio(c.r, c.g, c.b, 255, 255, 255), cb = ratio(c.r, c.g, c.b, 0, 0, 0), p = palette(hsl);
      return ok(['HEX: ' + c.hex.toUpperCase(), 'RGB: rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')', 'HSL: hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)', '对比度(白字): ' + cw.toFixed(2), '对比度(黑字): ' + cb.toFixed(2), '推荐文字色: ' + (cw >= cb ? '白色' : '黑色')].join('\n'), '颜色转换完成', '', swatches(p));
    },
    url_parser: function (s) {
      var raw = must(s.fields.input).trim(); if (!/^[a-z][a-z\d+\-.]*:/i.test(raw)) raw = 'https://' + raw;
      var u; try { u = new URL(raw); } catch (_e) { throw Error('URL 无效'); }
      var ql = []; u.searchParams.forEach(function (v, k) { ql.push(k + ' = ' + (s.options.decodeQuery ? decodeURIComponent(v) : v)); });
      return ok(['href: ' + u.href, 'protocol: ' + u.protocol, 'host: ' + u.host, 'hostname: ' + u.hostname, 'port: ' + (u.port || '(default)'), 'pathname: ' + u.pathname, 'hash: ' + (u.hash || '(none)'), 'query count: ' + ql.length, '', '[query params]', ql.length ? ql.join('\n') : '(none)'].join('\n'), 'URL 解析完成');
    },
    query_builder: function (s) {
      var input = must(s.fields.input), base = (s.fields.baseUrl || '').trim();
      if (s.mode === 'build') {
        var params = new URLSearchParams(); lines(input).filter(Boolean).forEach(function (ln) { var p = ln.split('='), k = p.shift().trim(); if (k) params.append(k, p.join('=').trim()); });
        var q = params.toString(); if (!s.options.encode) q = q.replace(/%20/g, ' ');
        return ok(base ? base.replace(/\?+$/, '') + '?' + q : q, '参数构造完成');
      }
      var src = input.trim(); if (src.indexOf('?') >= 0) src = src.split('?')[1]; if (src[0] === '?') src = src.slice(1);
      var out = []; new URLSearchParams(src).forEach(function (v, k) { out.push(k + '=' + v); }); return ok(out.join('\n'), 'Query 解析完成');
    },
    regex: function (s) {
      var p = must(s.fields.pattern), flags = (s.fields.flags || '').trim(), input = must(s.fields.input), max = Math.max(10, Math.min(500, Number(s.options.maxMatches || 100)));
      if (!/^[gimsuyd]*$/.test(flags)) throw Error('标志位非法');
      var scan = new RegExp(p, flags.indexOf('g') >= 0 ? flags : flags + 'g'), m, rs = [], safe = 0;
      while ((m = scan.exec(input)) && rs.length < max && safe < 5000) { rs.push({ text: m[0], idx: m.index, groups: m.slice(1) }); if (m[0] === '') scan.lastIndex++; safe++; }
      if (!rs.length) return ok('未匹配到结果', '0 个匹配');
      var txt = rs.map(function (r, i) { return '#' + (i + 1) + ' @' + r.idx + ': ' + JSON.stringify(r.text) + (r.groups.length ? '\n  groups: ' + JSON.stringify(r.groups) : ''); }).join('\n');
      return ok(txt, '匹配 ' + rs.length + ' 项', '', '<div class="output-content" style="min-height:auto; padding:10px 0 0; white-space:pre-wrap;">' + highlight(input, rs) + '</div>');
    },
    text_case: function (s) {
      var w = words(must(s.fields.input).trim()); if (!w.length) throw Error('未识别到单词');
      var out = { camel: w[0] + w.slice(1).map(cap).join(''), snake: w.join('_'), kebab: w.join('-'), pascal: w.map(cap).join('') };
      if (s.mode !== 'all') return ok(out[s.mode] || '', 'Case 转换完成');
      return ok(['camelCase: ' + out.camel, 'snake_case: ' + out.snake, 'kebab-case: ' + out.kebab, 'PascalCase: ' + out.pascal].join('\n'), 'Case 转换完成');
    },
    text_clean: function (s) {
      var arr = lines(must(s.fields.input));
      if (s.options.trimEach) arr = arr.map(function (x) { return x.trim(); });
      if (s.options.removeEmpty) arr = arr.filter(Boolean);
      if (s.options.dedupe) { var seen = new Set(); arr = arr.filter(function (x) { if (seen.has(x)) return false; seen.add(x); return true; }); }
      if (s.options.sort) arr = arr.slice().sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
      if (s.options.addLineNo) arr = arr.map(function (x, i) { return (i + 1) + '. ' + x; });
      return ok(arr.join('\n'), '文本整理完成', '结果 ' + arr.length + ' 行');
    }
  };

  function ok(data, meta, extra, html) { return { data: data, meta: meta, extra: extra || '', html: html || '' }; }
  function must(v) { var s = String(v == null ? '' : v); if (!s.trim()) throw Error('请输入内容'); return s; }
  function mustFile(s) { if (!s.file) throw Error('请选择文件'); return s.file; }
  async function hashTextBatch(s, fn) {
    var inp = must(s.fields.input);
    if (!s.options.batch) {
      var one = await fn(new TextEncoder().encode(inp));
      return one;
    }
    var arr = lines(inp), out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      var d = await fn(new TextEncoder().encode(arr[i]));
      out.push((i + 1) + ': ' + d);
    }
    return out.join('\n');
  }
  function caseHex(h, c) { return (c === 'upper' ? String(h).toUpperCase() : String(h).toLowerCase()); }
  function lines(s) { return String(s).replace(/\r\n?/g, '\n').split('\n'); }
  function batch(s, on, f) { if (!on) return f(s); return lines(s).map(function (ln, i) { if (!ln) return ''; try { return f(ln); } catch (e) { return '❌ 第' + (i + 1) + '行: ' + e.message; } }).join('\n'); }
  function henc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function hdec(s) { var t = document.createElement('textarea'); t.innerHTML = s; return t.value; }
  function uenc(s) { var o = ''; for (var i = 0; i < s.length; i++) { var c = s.codePointAt(i); if (c > 0xffff) i++; o += c <= 0xffff ? '\\u' + c.toString(16).padStart(4, '0') : '\\u{' + c.toString(16) + '}'; } return o; }
  function udec(s) { return s.replace(/\\u\{([0-9a-f]+)\}/ig, function (_, p) { return String.fromCodePoint(parseInt(p, 16)); }).replace(/\\u([0-9a-f]{4})/ig, function (_, p) { return String.fromCharCode(parseInt(p, 16)); }); }
  function b64e(s, urlSafe) { var b = new TextEncoder().encode(s), bin = '', i; for (i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]); var o = btoa(bin); return urlSafe ? o.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') : o; }
  function b64d(s, urlSafe) { var src = s.replace(/\s+/g, ''); if (urlSafe) { src = src.replace(/-/g, '+').replace(/_/g, '/'); while (src.length % 4) src += '='; } var bin = atob(src), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new TextDecoder().decode(arr); }
  function b64urlDecode(s) { var src = s.replace(/-/g, '+').replace(/_/g, '/'); while (src.length % 4) src += '='; return b64d(src, false); }
  function parseJSON(s) { try { return { ok: true, val: JSON.parse(s) }; } catch (e) { var m = e.message || 'JSON 解析失败', p = m.match(/position\s+(\d+)/i); if (p) { var lc = posLC(s, Number(p[1])); m += '（第 ' + lc.l + ' 行，第 ' + lc.c + ' 列）'; } return { ok: false, err: m }; } }
  function posLC(s, p) { var l = 1, c = 1; for (var i = 0; i < p; i++) { if (s[i] === '\n') { l++; c = 1; } else c++; } return { l: l, c: c }; }
  function sortKeys(v) { if (Array.isArray(v)) return v.map(sortKeys); if (!v || typeof v !== 'object') return v; var o = {}; Object.keys(v).sort().forEach(function (k) { o[k] = sortKeys(v[k]); }); return o; }
  function toCSV(arr, d) {
    if (!Array.isArray(arr)) throw Error('需要数组对象');
    if (!arr.length) return '';
    var hs = [];
    arr.forEach(function (o) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) throw Error('元素必须为对象');
      Object.keys(o).forEach(function (k) { if (hs.indexOf(k) < 0) hs.push(k); });
    });
    var rows = [hs.map(function (h) { return csvEsc(h, d); }).join(d)];
    arr.forEach(function (o) {
      rows.push(hs.map(function (h) {
        var v = o[h];
        if (v == null) return '';
        return csvEsc(typeof v === 'object' ? JSON.stringify(v) : String(v), d);
      }).join(d));
    });
    return rows.join('\n');
  }
  function csvEsc(s, d) { s = String(s); return /["\n]/.test(s) || s.indexOf(d) >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function fromCSV(s, d) {
    var rows = parseCSV(s, d); if (!rows.length) return [];
    var h = rows[0], out = [];
    for (var i = 1; i < rows.length; i++) {
      if (rows[i].length === 1 && rows[i][0] === '') continue;
      var o = {};
      for (var j = 0; j < h.length; j++) o[h[j]] = rows[i][j] != null ? rows[i][j] : '';
      out.push(o);
    }
    return out;
  }
  function parseCSV(s, d) {
    var inpt = s.replace(/\r\n?/g, '\n'), rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < inpt.length; i++) {
      var ch = inpt[i];
      if (q) {
        if (ch === '"' && inpt[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    row.push(cur); rows.push(row); return rows;
  }
  function claim(d, k, tz) {
    if (d[k] == null) return k + ': (none)';
    if (!Number.isFinite(Number(d[k]))) return k + ': (invalid)';
    var ms = Number(d[k]) * 1000;
    return k + ': ' + d[k] + ' (' + TimeLite.formatInTimeZone(ms, tz) + ' ' + tz + ')';
  }
  function parseBig(inp, b) {
    var s = inp.trim().toLowerCase(), sign = 1n;
    if (s[0] === '-') { sign = -1n; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
    var base = Number(b);
    if (b === 'auto') {
      if (s.startsWith('0x')) { base = 16; s = s.slice(2); }
      else if (s.startsWith('0b')) { base = 2; s = s.slice(2); }
      else if (s.startsWith('0o')) { base = 8; s = s.slice(2); }
      else base = 10;
    }
    if (!s) throw Error('数值为空');
    var digs = '0123456789abcdefghijklmnopqrstuvwxyz'.slice(0, base), r = 0n, bb = BigInt(base);
    for (var i = 0; i < s.length; i++) {
      var idx = digs.indexOf(s[i]);
      if (idx < 0) throw Error('非法字符: ' + s[i]);
      r = r * bb + BigInt(idx);
    }
    return r * sign;
  }
  function parseColor(inp) {
    var x = inp.trim(), m;
    if (/^#?[0-9a-f]{3}$/i.test(x) || /^#?[0-9a-f]{6}$/i.test(x)) {
      var h = x.replace('#', '');
      if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), hex: '#' + h };
    }
    m = x.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (m) return { r: clamp(+m[1]), g: clamp(+m[2]), b: clamp(+m[3]), hex: toHex(clamp(+m[1]), clamp(+m[2]), clamp(+m[3])) };
    m = x.match(/^hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/i);
    if (m) { var rgb = hsl2rgb(+m[1], +m[2], +m[3]); return { r: rgb.r, g: rgb.g, b: rgb.b, hex: toHex(rgb.r, rgb.g, rgb.b) }; }
    return null;
  }
  function clamp(n) { return Math.max(0, Math.min(255, n)); }
  function toHex(r, g, b) { return '#' + [r, g, b].map(function (v) { return clamp(v).toString(16).padStart(2, '0'); }).join(''); }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  function ratio(r1, g1, b1, r2, g2, b2) {
    var l1 = lum(r1, g1, b1), l2 = lum(r2, g2, b2), hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function lum(r, g, b) { return 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255); }
  function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function palette(hsl) { return [-24, -10, 0, 12, 24].map(function (o) { var rgb = hsl2rgb(hsl.h, hsl.s, Math.max(8, Math.min(92, hsl.l + o))); return { hex: toHex(rgb.r, rgb.g, rgb.b), text: ratio(rgb.r, rgb.g, rgb.b, 255, 255, 255) > 4.5 ? '#fff' : '#111' }; }); }
  function swatches(arr) { return '<div class="swatch-grid">' + arr.map(function (s) { return '<div class="swatch" style="background:' + s.hex + ';color:' + s.text + ';">' + s.hex.toUpperCase() + '</div>'; }).join('') + '</div>'; }
  function words(s) { return s.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_\-\.\s]+/g, ' ').trim().split(' ').filter(Boolean).map(function (x) { return x.toLowerCase(); }); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function highlight(text, rs) {
    var ranges = rs.map(function (r) { return [r.idx, r.idx + r.text.length]; }).sort(function (a, b) { return a[0] - b[0]; });
    var m = [];
    ranges.forEach(function (r) { if (!m.length || r[0] > m[m.length - 1][1]) m.push([r[0], r[1]]); else m[m.length - 1][1] = Math.max(m[m.length - 1][1], r[1]); });
    var out = '', c = 0;
    m.forEach(function (r) { out += esc(text.slice(c, r[0])) + '<mark class="highlight-mark">' + esc(text.slice(r[0], r[1])) + '</mark>'; c = r[1]; });
    return out + esc(text.slice(c));
  }
  function uuidv4() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    return uuidFmt(b);
  }
  function uuidv7() {
    var b = crypto.getRandomValues(new Uint8Array(16)), ts = BigInt(Date.now());
    for (var i = 5; i >= 0; i--) { b[i] = Number(ts & 255n); ts >>= 8n; }
    b[6] = (b[6] & 15) | 112; b[8] = (b[8] & 63) | 128;
    return uuidFmt(b);
  }
  function uuidFmt(b) {
    var h = Array.from(b).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
  }
  async function sha256(u8) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', u8))); }
  function hex(u8) { var o = ''; for (var i = 0; i < u8.length; i++) o += u8[i].toString(16).padStart(2, '0'); return o; }
  function md5hex(bytes) {
    var K = md5hex.K || (md5hex.K = Array.from({ length: 64 }, function (_, i) { return (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0); }));
    var S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    var len = bytes.length, full = ((((len + 8) >>> 6) + 1) * 64), buf = new Uint8Array(full); buf.set(bytes); buf[len] = 128;
    var bit = BigInt(len) * 8n; for (var i = 0; i < 8; i++) buf[full - 8 + i] = Number((bit >> BigInt(i * 8)) & 255n);
    var a0 = 1732584193, b0 = 4023233417, c0 = 2562383102, d0 = 271733878;
    for (var off = 0; off < buf.length; off += 64) {
      var M = new Array(16), j;
      for (j = 0; j < 16; j++) { var x = off + j * 4; M[j] = (buf[x]) | (buf[x + 1] << 8) | (buf[x + 2] << 16) | (buf[x + 3] << 24); }
      var A = a0, B = b0, C = c0, D = d0;
      for (j = 0; j < 64; j++) {
        var F, g;
        if (j < 16) { F = (B & C) | (~B & D); g = j; }
        else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
        else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * j) % 16; }
        var tmp = D; D = C; C = B;
        var sum = (A + F + K[j] + M[g]) >>> 0;
        B = (B + (((sum << S[j]) | (sum >>> (32 - S[j]))) >>> 0)) >>> 0;
        A = tmp;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    return le(a0) + le(b0) + le(c0) + le(d0);
  }
  function le(n) { var s = ''; for (var i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 255).toString(16).padStart(2, '0'); return s; }

  window.ToolboxApp = {
    toolIds: TOOLS.map(function (t) { return t.id; }),
    runTool: async function (toolId, payload) {
      if (!RUN[toolId]) throw new Error('Unknown toolId: ' + toolId);
      var input = Object.assign({}, defaults(toolId), payload || {});
      var result = await RUN[toolId](input);
      return { ok: true, data: result.data || '', error: '', meta: result.meta || '' };
    }
  };
})();
