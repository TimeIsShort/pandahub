# v1.5 功能规划

> 规划时间：2026-03-31

---

## P0 功能

### P0 Bug修复
**目标**：上线前必须消灭的"一眼毛坯房"痕迹

- [x] 帖子摘要去 Markdown 源码：新增 `stripMarkdown()` 过滤所有 Markdown 语法（图片/加粗/链接等），摘要只显示纯文本前120字符
- [x] JS Bug 修复：`goCheckin` 函数缺失（已添加）；`startChat` 函数缺失（已添加）；`loadPosts` 中 `user` 变量定义顺序错误（已修复）

## P1 功能

### 1.1 防机器人措施增强 ✅
**目标**：增强现有防机器人机制，阻止批量注册和暴力破解

- [x] 登录失败锁定：同一账号或IP连续5次登录失败，锁定1小时
- [x] `login_attempts` 表：记录每次登录尝试（IP/user_id/username/success/时间）
- [x] IP注册频率限制：同一IP 1小时内最多注册5个账号
- [x] 注册表单蜜罐字段：隐藏的 `website` 字段，机器人会填写、人类不会
- [x] 注册时间检测：表单显示到提交需超过2秒（机器人提交极快）
- [ ] 管理后台查看被锁定的账号/IP

**涉及文件**：
- `models/database.js` - login_attempts 表
- `routes/auth.js` - checkLoginAttempts / recordLoginAttempt / checkRegistrationRate / recordRegistrationAttempt / getClientIp
- `public/index.html` - 蜜罐字段 `#reg-website` + 时间戳 `#reg-form-ts`
- `public/js/app.js` - showRegister() 初始化时间戳，sendRegCode() 发送蜜罐+时间戳

### 1.2 版面收纳术（UI整理）
**目标**：减少视觉拥挤，让页面呼吸

- [x] 顶部导航「瘦身」：设置/管理/退出移入头像下拉菜单（`nav-user-menu`）
- [x] 公告栏改造：去掉跑马灯，改简洁可关闭通知条（localStorage 记住关闭状态）
- [x] 筛选区分双层：第一层标签横向滚动，第二层搜索框+下拉选择器+发布按钮
- [x] 排行榜按钮保留在首页右侧边栏收起面板

**涉及文件**：
- `public/index.html` - 导航栏重构（头像下拉菜单）/ 公告栏简化 / 筛选区双层布局
- `public/js/app.js` - updateNav() 加 null 检查 / toggleUserMenu() / closeUserMenu() / dismissAnnouncement()
- `public/css/style.css` - dropdown 动画样式 / tags-filter 横向滚动 / announcement-bar 高度过渡

### 1.3 前端 i18n 接入
**目标**：为中英文切换奠基

- [ ] 基础设施接入（进行中）
- [ ] 各页面逐步启用

---


### 1.4 视觉引导与熊猫安置（P2）
**目标**：释放首屏黄金位给内容，熊猫作为特色但不挡路

- [x] 熊猫改为右下角 60px 悬浮小球（fixed定位），hover放大，点击全屏
- [x] 右侧边栏熊猫位替换为「🔥 社区热议榜」（今日最热5帖，按评论数排序）
- [x] 熊猫FAB仅在首页显示（showView控制），离开首页自动隐藏
- [x] `loadTrending()` 函数调用 `/api/posts?sort=hot&time_range=day&limit=5`

**涉及文件**：
- `public/index.html` - 移除侧边栏熊猫HTML，新增热议榜HTML + 熊猫FAB全屏浮层HTML
- `public/js/app.js` - `loadTrending()` / `togglePandaMini()` / `togglePandaFullscreen()` / `showView()` 更新
- `public/css/style.css` - 移除旧熊猫卡片样式，新增 `.panda-fab` / `#panda-fab-container` 样式

## P2 功能

### 2.1 每日签到提醒
**目标**：管理后台设置提醒时间，到点 Web Push 推送

### 2.2 前端 i18n 逐步启用
**目标**：关键页面中英文切换

---

## P3 功能

### 3.1 资源缓存优化
**目标**：Service Worker / 静态资源长期缓存

---

### 布局重构详情（2026-03-31 中午）

**外层骨架**：统一安全区容器 `max-width:1400px; padding:16px 20px`

**两栏布局**：
- 左侧主栏（`1fr`，最大4/12）：标签行（独立横向滚动）+ 工具栏（搜索框+下拉选择器+发布按钮）+ 帖子列表（2列grid）
- 右侧栏（`320px fixed`，`position:sticky top:80px`）：热议榜塞入白色玻璃卡片

**CSS类**：
- `.home-layout` — 两栏grid `1fr 320px`
- `.home-main` — 左侧主栏 flex-column
- `.home-sidebar` — 右侧栏 sticky
- `.tags-scroll-wrap` — 横向滚动标签行
- `.toolbar-row` — 搜索+筛选+发布工具栏
- `.sidebar-card` — 白色玻璃卡片（`bg:rgba(255,255,255,0.88); backdrop-filter:blur(10px); shadow`）

**响应式**：
- `≤1100px` — 侧栏收窄至280px
- `≤900px` — 侧栏隐藏
- `≤600px` — 帖子列表强制1列


---

## Bug修复（2026-03-31 下午）

### 首页两栏Grid布局重构
**问题**：热议榜变成 fixed 悬浮窗，帖子列表 3 列过窄
**修复**：重构为正经两栏 Grid（7fr 主内容 + 3fr 侧边栏），侧边栏取消 fixed/absolute 定位
**结构**：
- （Grid，7fr + 3fr，gap 20px）
- （主内容）：hero + tags + 搜索筛选 + 帖子列表(2列) + 分页
- （侧边栏）：积分排行榜 + 社区热议榜（白色玻璃卡片）
**CSS**： 下启用两栏， 侧边栏隐藏， 单列
**版本**：v=20260401d（style.css 版本号同步升级），已推送 GitHub（commit 4695fca）


---

## 功能更新（2026-03-31 16:30）

### 主页全面视觉减肥
**Hero 区精简**：三个长条卡片替换为横排图标词组（💡高质量交流 | 🛠️AI·开发·实战 | 🤝提问+复盘+共享），去掉「快速搜索」按钮
**工具栏合并**：标签 Tabs + 搜索框合并为一行，发布按钮移至熊猫 FAB
**帖子卡片重构**：标题突出，标签/徽章置顶，互动数据（👍💬👁）统一右下角，摘要去掉
**帖子网格**：宽屏（≥960px）3 列，中屏（640-960px）2 列，手机单列
**版本**：v=20260401e，已推送 GitHub（commit 52a5cda）


### 帖子卡片悬停微交互（2026-03-31 16:55）
**目标**：激活右下角互动图标，提升点击欲望
**实现**：
- 图标配 `transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)` Q弹回弹曲线
- 悬停卡片时：👍💬👁 统一 `scale(1.15)` + 颜色变深亮
- 👍 点赞额外加 `bounce` keyframe：0.4s 向上跳 4px 再回落，主打撒娇感
- 标题/摘要区域 `transition: none` 避免布局抖动
**版本**：v=20260401h，已推送 GitHub（commit 8969a56）


### 代码块高定西装（2026-03-31 17:05）
**目标**：代码块 Mac 风格 + 复制功能 + 长代码折叠
**实现**：
- 左上角 Mac 红绿灯 🔴🟡🟢
- 右上角 📋一键复制按钮（点击显示 ✅/❌反馈）
- 超过 10 行底部渐变遮罩 + 「展开 N 行 ▼」按钮
- 代码区使用 `#1e1e1e` 深色背景，适配暗黑主题
- `md-inline-code` / `md-link` 改用 CSS 变量，暗黑模式自动适配
**版本**：v=20260401j，已推送 GitHub（commit 6b3876f）


### renderContent图片解析修复（2026-03-31 17:12）
**问题**：`escapeHtml()` 先转义导致 `![alt](url)` 语法被破坏，图片不显示
**修复**：图片 markdown 在 `escapeHtml()` 之前用 base64 placeholder 保护，等 HTML 转义完再还原
**版本**：v=20260401m（escapeHtml后直接匹配markdown图片语法，防XSS），已推送 GitHub（commit d691538）
