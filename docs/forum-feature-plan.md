# pandahub.cloud 论坛功能规划

> 更新时间：2026-03-30
> 当前状态：v1.1 全部功能完成 ✅ | https://github.com/TimeIsShort/pandahub

---

## 一、运营管理

### 1.1 内容审核体系
**现状**：已完成基础审核功能 + AI 自动审核，2026-03-30 实施<br>
**已实现**：
- ✅ 发帖/评论提交后状态设为 `pending`，需管理员审核后发布
- ✅ 管理后台已有「内容审核」面板（`admin-login.html`）
- ✅ 驳回时可选原因，用户收到站内通知
- ✅ **AI 自动审核**（见 1.4）

**涉及文件**：
- `routes/posts.js` - 发帖/评论 pending 状态
- `routes/admin.js` - 审核 API
- `models/database.js` - moderation_log 表
- `admin-login.html` - 管理后台页面

---

### 1.2 敏感词过滤
**现状**：无<br>
**规划**：
- [ ] 使用 `better-sqlite3` FTS5 全文索引 + 敏感词词典匹配
- [ ] 敏感词库支持从文件加载（`data/word-filter.txt`，每行一个词）
- [ ] 提交内容时先过过滤层，命中敏感词的内容被拦截或打码
- [ ] 管理后台可查看/添加/删除敏感词

**涉及文件**：
- `middleware/wordFilter.js` - 新建敏感词中间件
- `routes/posts.js`、`routes/comments.js` - 接入过滤
- `data/word-filter.txt` - 词库文件

---

### 1.3 操作日志
**现状**：无<br>
**规划**：
- [ ] 新增 `admin_actions` 表（管理员ID、动作类型、目标ID、详情、时间）
- [ ] 记录范围：删除帖子、禁言/解封用户、审核通过/驳回、修改用户角色
- [ ] 管理后台「操作日志」页面，支持按时间和管理员过滤

**涉及文件**：
- `models/database.js` - 新增 admin_actions 表
- `middleware/auth.js` - 新增操作记录中间件
- `admin.html` - 日志查看页面

---

### 1.4 统计看板
**现状**：无<br>
**规划**：
- [ ] 新增 `admin_stats` 表或直接 SQL 聚合查询
- [ ] 管理员后台「数据统计」页面，展示：
  - 近 7/30 天日活用户数（按 last_login 算）
  - 近 7/30 天发帖量趋势
  - 注册用户总量、待审核申请数
  - 各标签帖子分布
- [ ] 数据每 5 分钟刷新一次，支持手动刷新

**涉及文件**：
- `routes/admin.js` - 新增统计 API
- `admin.html` - 统计图表页面（用 Chart.js）

---

## 二、用户激励

### 2.1 积分与等级系统 ✅ 已完成
**已实现**：2026-03-30 实施<br>
- ✅ 等级规则定义（`models/database.js`）：
  - 🌱 萌新（0-100分）、🌿 入门（101-500）、🌳 进阶（501-1000）、🔥 老鸟（1001-3000）、⭐ 大佬（3000+）
- ✅ 发帖扣积分（5分/篇），积分不足时返回 403 并提示
- ✅ 用户登录后返回等级信息（level_name / level_icon / level_color）
- ✅ 个人主页 `/api/users/:id` 返回等级信息
- ✅ `auth /me` 和 `auth /login` 返回等级信息

**涉及文件**：
- `models/database.js` - LEVELS 规则、POINT_COST 定义
- `routes/posts.js` - 发帖扣积分逻辑
- `routes/users.js` - 资料页等级展示
- `routes/auth.js` - 登录/我的信息等级展示

---

### 2.2 签到提醒
**现状**：签到功能已有<br>
**规划**：
- [ ] 管理后台可设置「每日签到提醒时间」（如每天 09:00）
- [ ] 到点给所有当日未签到用户发站内通知

**涉及文件**：
- `scripts/daily-reminder.js` - 新建定时脚本
- `routes/notifications.js` - 通知发送

---

## 三、安全与账号

### 3.1 邮箱验证 ✅ 已完成
**现状**：已完成，2026-03-30 实施<br>
**已实现**：
- ✅ 注册接口 (`/auth/register`) 新增 `email` 字段，账号创建后 `approved=0`
- ✅ `/auth/send-register-code` 发送 6 位验证码（有效期 10 分钟）
- ✅ `/auth/verify-register` 验证成功后账号自动激活 (`approved=1`)，无需管理员审核
- ✅ AI 对话拦截未验证邮箱用户（返回 403 + `need_email_verify: true`）
- ✅ SMTP 已配置（QQ邮箱：1224899945@qq.com，SMTP_HOST=smtp.qq.com）
- ✅ 内测申请页 (`/apply`) 增加邮箱验证码流程（`/apply/send-code` + `/apply` 提交时验证）
- ✅ 内测申请页面 UI 全新美化（三步进度指示器、渐变按钮、动效、响应式）

**涉及文件**：
- `routes/auth.js` - 注册、发送验证码、验证接口
- `routes/apply.js` - 内测申请验证码发送和验证（新建 `/send-code` 接口）
- `routes/ai.js` - AI 对话邮箱拦截中间件
- `public/apply.html` - 内测申请页面（全新 UI + 验证码流程）

---

### 3.2 防机器人措施
**现状**：有滑动验证前端 `slider-captcha.html`<br>
**规划**：
- [ ] 注册和发帖必须先完成滑动验证
- [ ] 同一 IP 1小时内注册超过3次触发验证码

**涉及文件**：
- `routes/auth.js` - 接入验证
- `routes/posts.js` - 接入验证

---

## 四、搜索功能

### 4.1 全文搜索
**现状**：无<br>
**规划**：
- [ ] 使用 SQLite FTS5（`better-sqlite3` 已支持）建立 posts 全文索引
- [ ] 新增 `GET /api/search?q=关键词` 接口
- [ ] 支持按标签、时间来筛选
- [ ] 高亮匹配关键词

**涉及文件**：
- `models/database.js` - 创建 FTS5 虚拟表
- `routes/search.js` - 新建搜索路由
- `index.html` - 搜索框 UI

---

## 五、用户体验

### 5.1 消息推送（站内）✅ 已完成
**已实现**：2026-03-30 实施<br>
- ✅ 前端每 30 秒自动轮询通知数量（`loadNotifCount()` + `setInterval`）
- ✅ 浏览器 Web Push 授权流程（Service Worker + VAPID）
- ✅ 用户设置页面可开关推送通知（`个人设置 → 消息通知`）
- ✅ 管理接口：`GET /push/status`、`POST /push/subscribe`、`POST /push/unsubscribe`

**涉及文件**：
- `public/push-sw.js` - Service Worker（新建）
- `routes/push.js` - Web Push 后端路由（新建）
- `public/js/app.js` - 推送开关 UI 和逻辑
- `public/index.html` - 设置页推送选项

---

### 5.2 移动端适配 ✅ 已完成
**已实现**：2026-03-30 实施<br>
- ✅ `style.css` 底部新增 `@media (max-width: 768px)` 和 `@media (max-width: 480px)` 响应式规则
- ✅ 适配内容：导航折叠、首页单列布局、侧边栏隐藏、表格横向滚动、模态框自适应
- ✅ 适配内容：移动端隐藏非必要元素、优化按钮/标签/头像尺寸

**涉及文件**：
- `public/css/style.css` - 新增移动端媒体查询

---

### 5.3 国际化（i18n）✅ 基础设施已完成
**已实现**：2026-03-30 实施<br>
- ✅ `data/i18n/zh.json`（简体中文）、`data/i18n/en.json`（English）翻译文件
- ✅ `middleware/i18n.js` 国际化中间件
- ✅ `routes/i18n.js` 后端接口：`GET /api/i18n/languages`、`GET /api/i18n/t?lang=`
- ✅ 前端 `window._i18n` 状态 + `t('key')` 翻译函数
- ✅ 设置页新增「界面语言」选择器，切换后持久化到 localStorage
- ✅ 框架已就绪，前端各页面可逐步通过 `data-i18n` 属性接入

**涉及文件**：
- `data/i18n/zh.json` - 中文翻译（新建）
- `data/i18n/en.json` - 英文翻译（新建）
- `middleware/i18n.js` - i18n 工具（新建）
- `routes/i18n.js` - i18n API（新建）
- `public/index.html` - 语言选择器 UI

---

## 六、性能优化

### 6.1 3D 模型懒加载 ✅ 已完成
**已实现**：2026-03-30 实施<br>
- ✅ 3D 模型在鼠标悬停熊猫区域时才加载（原有实现）
- ✅ 新增加载动画（`is-loading` CSS 状态 + "🐼 正在加载 3D 模型..." 提示）
- ⚠️ 模型文件 40MB，建议后续配置 CDN 加速或使用 gltf-pipeline 压缩

**涉及文件**：
- `public/css/style.css` - 新增 `is-loading` 动画
- `public/js/app.js` - 加载状态切换

---

### 6.2 资源缓存优化
**现状**：静态资源已设置 7 天缓存（Nginx 配置）<br>
**规划**：
- [ ] 静态资源加版本号（`/css/style.css?v=20260330`）解决更新缓存问题
- [ ] 图片走 `uploads/` 目录，配置独立的缓存策略

---

## 七、优先顺序建议

| 优先级 | 功能 | 理由 |
|--------|------|------|
| P0 | 邮箱验证 ✅ | 防止垃圾账号注册 | 已完成（2026-03-30） |
| P0 | PM2 守护 ✅ | 防止进程挂掉 | 已完成（2026-03-30） |
| P1 | 敏感词过滤 ✅ | 防止垃圾内容 | 已完成（2026-03-30） |
| P1 | 内容审核 ✅ | 配合敏感词过滤，提升社区质量 | 已完成（2026-03-30） |
| P1 | 操作日志 ✅ | 管理员行为可追溯 | 已完成（2026-03-30） |
| P2 | 全文搜索 ✅ | 用户体验提升 | 已完成（2026-03-30） |
| P2 | 积分等级 ✅ | 提升活跃度 | 已完成（2026-03-30） |
| P2 | 统计看板 ✅ | 方便运营决策 | 已完成（2026-03-30） |
| P3 | 移动端适配 ✅ | 用户体验 | 已完成（2026-03-30） |
| P3 | Web Push ✅ | 通知实时性 | 已完成（2026-03-30） |
| P4 | 3D 模型懒加载 ✅ | 性能优化 | 已完成（2026-03-30） |
| P4 | 国际化 ✅ | 扩展性 | 基础设施已完成（2026-03-30） |

---

## 八、技术债务

- [ ] `deploy.sh` 里的 `pkill -f "node index.js"` 会误杀其他 node 进程，应改为精确 PID 文件方式
- [ ] AI 对话轮询数据库，没有用 Redis，量大会成问题（当前量小可忽略）
- [ ] `better-sqlite3` 不支持并发写入，并发高时需考虑迁移 PostgreSQL 或加锁

---

## P1 开发记录（2026-03-30）

### 1.1 敏感词过滤 ✅
**已实现**：
- ✅ `middleware/wordFilter.js` - 敏感词中间件，支持从 `data/word-filter.txt` 加载
- ✅ 发帖/评论时自动检测标题和内容，命中敏感词返回 400 错误
- ✅ 管理后台 API：`GET /api/admin/word-filter`（查）、`POST /api/admin/word-filter`（增）、`DELETE /api/admin/word-filter`（删）
- ✅ 词库文件：`/root/forum/data/word-filter.txt`

**涉及文件**：
- `middleware/wordFilter.js` - 新建
- `routes/posts.js` - 发帖/评论接入过滤
- `routes/admin.js` - 敏感词管理 API
- `data/word-filter.txt` - 新建

### 1.2 内容审核 ✅
**已实现**：
- ✅ 发帖/评论自动 pending 状态（原有逻辑，保留）
- ✅ 审核通过/拒绝后自动发送站内通知给用户
- ✅ 管理后台已有 `/api/admin/posts`（待审帖子列表）

### 1.3 操作日志 ✅
**已实现**：
- ✅ `moderation_log` 表记录所有管理操作
- ✅ 记录动作：approve_application、reject_application、approve_post、reject_post、delete_post、ban_user、unban_user、add_word_filter、remove_word_filter、auto_approve_post、auto_reject_post、auto_review_post
- ✅ API：`GET /api/admin/moderation-log`（支持按动作类型和管理员过滤分页）

**涉及文件**：
- `models/database.js` - 新增 `moderation_log` 表
- `middleware/moderationLog.js` - 新建
- `routes/admin.js` - 日志 API
- `routes/posts.js` - 删除帖子时写入日志

### 1.4 AI 自动审核 ✅
**已实现**：2026-03-30 实施<br>
- ✅ 调用百炼 API（`qwen3.5-plus`）对帖子内容进行安全判断
- ✅ AI 返回三类结果：安全(APPROVED) → 自动放行；违规(REJECTED) → 自动下架；不确定(MANUAL_REVIEW) → 保留人工审核
- ✅ 审核结果写入 `posts.moderation_result` 字段
- ✅ 批量审核接口 `POST /api/admin/posts/auto-review-all`（一次最多 50 条）
- ✅ 管理后台页面添加「🤖 AI 批量审核」按钮和单帖「🤖 AI」按钮
- ⚠️ AI 审核依赖 `BAILIAN_API_KEY`，未配置时跳过自动审核

**涉及文件**：
- `middleware/autoModeration.js` - 新建，AI 审核中间件
- `routes/admin.js` - 新增 `/auto-review`、`/auto-review-all` 接口
- `admin-login.html` - 管理后台 AI 审核按钮 UI
- `models/database.js` - 新增 `posts.moderation_result` 字段

---

## P2 开发记录（2026-03-30）

### 2.1 全文搜索 ✅
**已实现**：
- ✅ SQLite FTS5 全文索引（`posts_fts` 虚拟表）
- ✅ 接口 `GET /api/search?q=&tag_id=&page=&limit=`，按相关性 BM25 排序
- ✅ 发帖/更新/删帖自动同步 FTS 索引
- ✅ 管理员手动重建索引 `POST /api/admin/rebuild-fts`

**涉及文件**：
- `routes/search.js` - 新建搜索路由
- `models/database.js` - posts_fts 表、FTS 同步函数
- `index.js` - 注册 `/api/search` 路由
- `routes/posts.js` - 发帖/更新/删帖时同步 FTS

### 2.2 积分与等级系统 ✅
**已实现**：
- ✅ 五级等级规则（萌新/入门/进阶/老鸟/大佬）
- ✅ 发帖扣 5 积分，积分不足返回 403
- ✅ 用户资料和登录响应返回 level_name / level_icon / level_color

**涉及文件**：
- `models/database.js` - LEVELS 规则、POINT_COST、getUserLevel()
- `routes/posts.js` - 发帖扣积分
- `routes/users.js` - 资料页返回等级
- `routes/auth.js` - /me 和 /login 返回等级

### 2.3 统计看板 ✅
**已实现**：
- ✅ `GET /api/admin/stats?range=7|30` 返回完整统计数据
- ✅ 数据维度：用户总量/日活/新增、帖子总量/新增/待审
- ✅ 趋势数据：每日发帖/注册/活跃用户折线图
- ✅ 标签分布统计、发帖排行榜 TOP10

**涉及文件**：
- `routes/admin.js` - `/stats` API

---

## P3 开发记录（2026-03-30）

### 5.1 消息推送 ✅
- ✅ Service Worker (`/push-sw.js`) 处理 Web Push 事件
- ✅ 后端 `routes/push.js`：`/vapid-key`、`/subscribe`、`/unsubscribe`、`/status` 四个接口
- ✅ `push_subscriptions` 表存储用户订阅信息
- ✅ 前端设置页新增「消息通知」开关，可开启/关闭浏览器推送
- ⚠️ 正式 Web Push 需要配置 VAPID 公私钥（`.env` 中 `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`）

### 5.2 移动端适配 ✅
- ✅ `style.css` 新增两档媒体查询（768px / 480px）
- ✅ 覆盖：导航、首页布局、侧边栏、表格、模态框、按钮、头像等
- ✅ 登录后每 30 秒轮询通知数量并更新角标

### 5.3 国际化（i18n）✅ 基础设施已完成
- ✅ 翻译文件 `zh.json` / `en.json`（约 50 个 key，覆盖主要 UI 文案）
- ✅ i18n 中间件 + 后端 API
- ✅ 前端 `t('key')` 翻译函数，settings 页面语言切换器
- ⏳ 各页面 `data-i18n` 属性接入（可持续完善）

---

## P4 开发记录（2026-03-30）

### 6.1 3D 模型懒加载 ✅
- ✅ 原有：鼠标悬停时动态加载 GLB 模型
- ✅ 新增：加载中显示 "🐼 正在加载 3D 模型..." 动画提示

### 6.2 国际化 ✅ 基础设施已完成
- ✅ `data/i18n/zh.json`（简体中文）、`en.json`（English）翻译词库
- ✅ `middleware/i18n.js`：`t(key)`、`loadI18n()`、`getAvailableLanguages()`
- ✅ `routes/i18n.js`：`GET /api/i18n/languages`、`GET /api/i18n/t?lang=`
- ✅ 设置页语言切换器（简体中文 / English），切换后持久化到 localStorage
- ⚠️ 前端各页面需逐步将硬编码中文替换为 `data-i18n` 属性

---
## 代码备份（2026-03-30）

-  - P0~P4 开发完成全量备份
- 内含：所有路由、前端页面、中间件、i18n 词库


---

## 代码备份（2026-03-30）

- `/root/forum_backup_202603301432/` - P0~P4 开发完成全量备份（包含所有路由、前端页面、中间件、i18n 词库等）

---

## v1.1 开发记录（2026-03-30）

### P1.1 注册流程补全 ✅
**已实现**：
- ✅ 注册表单新增邮箱验证流程（三步进度指示器：验证邮箱 → 填写信息 → 完成注册）
- ✅ 后端 `/auth/send-register-code` 重构：接收密码 + 同时创建待激活用户 + 发送验证码（一气呵成）
- ✅ `/auth/verify-register` 验证成功后账号自动激活（`approved=1`），无需管理员审核
- ✅ 前端 `app.js` 新增 `sendRegCode()` + `startRegCountdown()` + `updateRegStep()` 函数
- ✅ 验证码 5 分钟倒计时，60s 以下显示秒数

**涉及文件**：
- `public/index.html` - 注册表单 HTML（邮箱、验证码、三步进度条）
- `public/css/style.css` - `.reg-steps` / `.btn-send-code-mini` / 输入框样式
- `public/js/app.js` - 新增注册验证码相关函数
- `routes/auth.js` - `/send-register-code` 重构（创建用户+发验证码）

---

## v1.1 开发记录（2026-03-30 下午）

### P1.2 管理后台敏感词/日志页面 ✅
- ✅ 管理后台新增「🛡️ 敏感词」Tab（查看列表、批量添加、单个删除）
- ✅ 管理后台新增「📊 操作日志」Tab（分页 30条/页、按动作类型筛选）
- ✅ 新增 `loadWords()`、`renderWords()`、`removeWord()`、`loadLogs()`、`renderLogs()` 函数
- ✅ 涉及文件：`public/admin-login.html`


---

### P1.3 评论扣积分 ✅
- ✅ 评论前检查积分余额，扣除 2 积分/条
- ✅ 积分不足返回 403 并提示当前余额
- ✅ 前端评论成功后显示「评论成功，-2积分」


---

### P2 AI 审核体验优化 ✅
- ✅ 批量审核 UI 大改版：紫色进度卡片 + 进度条动画 + 实时计数
- ✅ 审核完成后显示详细结果摘要（通过/拒绝/需人工各多少篇）
- ✅ 涉及文件：`public/admin-login.html`（`autoReviewAll` 函数）


---

## P3 开发记录（2026-03-30 下午）

### Web Push 通知落地 ✅
- ✅ 新建 `utils/pushHelper.js` - 独立的推送工具（避免循环依赖）
- ✅ 评论时通知帖子作者（`routes/posts.js`）
- ✅ 被回复时通知父评论作者（`routes/posts.js`）
- ✅ 帖子审核通过/拒绝时通知作者（`routes/admin.js`）
- ✅ AI 自动审核结果也会触发 Web Push

### Markdown 渲染增强 ✅
- ✅ 支持标题（# / ## / ###）、加粗、斜体、行内代码、代码块、链接、列表、引用
- ✅ 深色代码块样式 + 浅色行内代码样式
- ✅ 用户发帖时可直接使用 Markdown 语法


---

## P4 开发记录（2026-03-30 下午）

### 分享功能 ✅
- ✅ 每个帖子详情页底部新增「🔗 分享」按钮
- ✅ 一键复制帖子链接到剪贴板
- ✅ 涉及文件：`public/js/app.js`（`sharePost` 函数）

### SEO 优化 ✅
- ✅ `robots.txt` - 允许搜索引擎收录
- ✅ `sitemap.xml` - 自动生成（首页 + 标签页 + 所有帖子页，最多 500 条）
- ✅ `public/index.html` - 新增 meta description / og:title / og:description / twitter:card
- ✅ 涉及文件：`routes/sitemap.js`（新建）、`public/index.html`


---

## v1.2 开发记录（2026-03-30 下午）

### P1.2 私信系统 ✅
- ✅ 新建 `routes/messages.js`：`GET /conversations`、`GET /with/:userId`、`POST /`、`GET /unread-count`
- ✅ 新建 `utils/pushHelper.js`：独立推送工具（避免循环依赖）
- ✅ 导航栏新增 💬 私信入口 + 未读角标
- ✅ 会话列表弹窗 + 私信详情弹窗（气泡样式）
- ✅ 评论/回复时 Web Push 通知帖子作者
- ✅ 帖子作者卡片 + 帖子列表作者旁新增「💬发私信」按钮
- ✅ 私信气泡样式（我的/对方的，颜色区分）
- ✅ Enter 键发送（Shift+Enter 换行）

### 涉及文件
- `models/database.js` - messages 表 + follows 表（建表）
- `routes/messages.js` - 私信 API（新建）
- `public/index.html` - 私信弹窗 UI
- `public/js/app.js` - 私信函数（loadMsgConversations/openMsgDetail/sendMsg 等）
- `public/css/style.css` - 气泡样式 + msg-author-btn 按钮样式


---

## v1.2 开发记录（续）

### P1.3 关注系统 ✅
- ✅ 新建 `routes/follow.js`：`POST /follow/:userId`、`DELETE /follow/:userId`、`GET /followers/:userId`、`GET /following/:userId`、`GET /follow/status/:userId`
- ✅ 用户主页已有关注按钮（之前 UI 已埋入），补全 `toggleFollow()` + `loadFollowStatus()` JS 函数
- ✅ 关注后按钮变绿色「已关注 ✓」，取消后恢复紫色「+ 关注」
- ✅ 关注/粉丝数实时更新显示

### 涉及文件
- `routes/follow.js`（新建）
- `public/js/app.js` - toggleFollow / loadFollowStatus 函数
- `public/css/style.css` - .btn-follow 样式
- `models/database.js` - follows 表（建表）


---

## v1.2 开发记录（续）

### P1.1 富文本编辑器 ✅
- ✅ Markdown 工具栏（加粗/斜体/行内代码/代码块/链接/标题/列表/引用）
- ✅ Tab 键缩进代码块
- ✅ Ctrl+B 加粗 / Ctrl+I 斜体 快捷键
- ✅ Markdown 工具栏样式（悬停渐变色、紫色主题）
- ✅ 发帖框获得焦点时边框高亮（和现有设计语言一致）

### 涉及文件
- `public/index.html` - 发帖弹窗 textarea → md-editor-wrap + md-toolbar
- `public/js/app.js` - mdInsert / mdHandleTab（Ctrl+B/I/Tab）函数
- `public/css/style.css` - .md-editor-wrap / .md-toolbar / .md-tool-btn 样式


---

## v1.2 开发记录（续）

### P2 签到连续奖励 UI 优化 ✅
- ✅ 全新7天阶梯进度条：7个圆环表示第1-7天，连线进度填充
- ✅ 当前签到日：橙色脉冲动画高亮
- ✅ 已完成天数：绿色渐变高亮 🔥
- ✅ 明日目标：蓝色虚线边框闪烁
- ✅ 第7天周冠军：特殊皇冠标识 🔥
- ✅ 签到按钮大号渐变色（橙），悬停上浮+阴影
- ✅ "再签到X天解锁周冠军" 提示语引导连续签到

### 涉及文件
- `public/js/app.js` - loadCheckinStatus 完全重写，7阶梯进度UI
- `public/css/style.css` - streak-ladder 整套新样式


---

## v1.2 开发记录（续）

### P2 管理后台图表 ✅
- ✅ 新增「📈 统计看板」Tab
- ✅ 4张统计卡片：用户总数/活跃用户/帖子总数/待审帖子（渐变色卡片）
- ✅ 每日发帖量柱状图（7天/30天切换）
- ✅ 每日新增用户柱状图
- ✅ 每日活跃用户柱状图
- ✅ 标签分布环形图（Top 8）
- ✅ 概览区新增「用户总数」统计卡
- ✅ 使用 Chart.js CDN（v4.4.0）
- ✅ API：`GET /api/admin/stats?range=7|30`（已有后端支持）

### 涉及文件
- `public/admin-login.html` - 图表Tab + CSS + loadCharts() + setChartRange() JS
- `routes/admin.js` - stats API（已有，无需修改）


---

## v1.2 开发记录（续）

### P3 用户主页优化 ✅
- ✅ 全新卡片式布局：渐变色 hero 区域 + 等级徽章
- ✅ 头像大号圆形（渐变背景随等级变色）
- ✅ 等级徽章 + 管理员标识（紫色/红色标签）
- ✅ 积分/帖子/连续签到/粉丝数四格统计栏
- ✅ 非本人主页：「+ 关注」「💬 发私信」按钮组
- ✅ 本人主页：「⚙️ 编辑个人资料」「🎁 每日签到」快捷入口
- ✅ 帖子列表卡片化改造（无标题时代码风格）
- ✅ 发帖数量统计显示

### 涉及文件
- `public/js/app.js` - loadProfile 完全重写，goCheckin/startChat 函数
- `public/css/style.css` - .profile-page / .profile-hero / .profile-avatar-lg / .profile-stats-row 样式


---

## v1.2 开发记录（续）

### P3 邮件通知触发 ✅
- ✅ `utils/pushHelper.js` 重构：邮件模块（sendEmailToUser + 4个通知模板）
- ✅ 评论帖子时 → 邮件通知作者（`notifyUserNewComment`）
- ✅ 回复评论时 → 邮件通知被回复者（`notifyUserNewReply`）
- ✅ 帖子审核通过 → 邮件通知作者（`notifyUserPostApproved`）
- ✅ 帖子审核拒绝 → 邮件通知作者（`notifyUserPostRejected`）
- ✅ AI 自动审核通过/拒绝同样触发邮件
- ✅ 非阻塞：邮件发送为 async，不影响主流程响应速度
- ✅ 已验证邮箱用户才发（`email_verified = 1`）

### 涉及文件
- `utils/pushHelper.js`（重构，新增邮件模块）
- `routes/posts.js`（评论路由加 async + 调用 `notifyUserNewComment/Reply`）
- `routes/admin.js`（审核路由导入 + 调用 `notifyUserPostApproved/Rejected`）


---

## v1.3 开发记录（续）

### P0 收藏/书签 ✅
- ✅ `routes/favorites.js` 新建（收藏API）
- ✅ `models/database.js` - `favorites` 表（user_id/post_id/UNIQUE约束）
- ✅ API: `POST /api/favorites` 收藏、`DELETE /api/favorites/:postId` 取消、`GET /api/favorites` 列表、`GET /api/favorites/status/:postId` 状态查询
- ✅ 帖子详情页加「☆ 收藏」按钮（已收藏显示★已收藏）
- ✅ 帖子列表每条加 ☆ 收藏按钮
- ✅ 个人主页「⭐ 收藏」tab（本人可见），点击加载收藏列表
- ✅ 收藏列表显示：标题/标签/作者/评论数/收藏时间
- ✅ `toggleFavorite()` / `loadFavoriteStatus()` / `loadFavoritesList()` / `switchProfileTab()` JS函数

### 涉及文件
- `routes/favorites.js`（新建）
- `models/database.js`（favorites 表）
- `public/js/app.js`（收藏按钮UI + JS函数）
- `public/index.html`（无改动）
- `index.js`（注册 favorites 路由）


---

## v1.3 开发记录（续）

### P0 @提及用户 ✅
- ✅ 评论中 `@username` 解析（正则匹配中文/英文/数字，1-20字符）
- ✅ 提及用户去重（同一评论不重复通知）
- ✅ Web Push + 应用内通知 + 邮件三通道通知
- ✅ `processMentions()` 函数（非阻塞，不影响评论速度）
- ✅ 前端 @ 输入触发用户搜索下拉
- ✅ `GET /users/search?q=` API（按用户名/昵称搜索，返回前5条）
- ✅ 选中用户插入 `@username` 光标位置

### 涉及文件
- `utils/pushHelper.js` - `notifyUserMentioned()` / `processMentions()` 函数
- `routes/posts.js` - 评论插入后调用 `processMentions()`
- `routes/users.js` - 新增 `GET /users/search` API
- `public/index.html` - 评论输入框加 `@mention-dropdown`
- `public/js/app.js` - `handleCommentInput()` / `searchMentionUsers()` / `insertMention()`


---

## v1.3 开发记录（续）

### P0 通知中心 ✅
- ✅ `GET /notifications` API 增强：支持 `type` 筛选 + `page/limit` 分页
- ✅ 通知分类筛选 tab（全部/💬评论/回复/🎉审核通过/❌审核拒绝/@提及）
- ✅ 每条通知加类型标签 badge（彩色样式）
- ✅ 分页器：上一页/下一页/页码信息
- ✅ 通知中心弹窗改造（max-width 限制 + filter tabs + pagination）
- ✅ `setNotifFilter()` / `loadNotifications()` / `loadNotificationsPrev/Next()` JS函数
- ✅ 全部已读按钮 + 标记单条已读（点击跳转帖子）
- ✅ `typeLabel` 字段返回中文类型名

### 涉及文件
- `routes/notifications.js` - GET / 分页+筛选增强
- `public/index.html` - 通知中心弹窗加 filter tabs + pagination
- `public/js/app.js` - 重写通知函数 + 新增分页函数
- `public/css/style.css` - .notif-filter-tabs / .notif-filter-btn / .notif-pagination / .notif-type-badge 样式


---

## v1.3 开发记录（续）

### P0 帖子编辑/删除 ✅
- ✅ 后端 PUT `/posts/:id`（编辑）和 DELETE `/posts/:id`（删除）已有
- ✅ 前端帖子详情页加「✏️ 编辑」按钮（仅作者/管理员可见）
- ✅ 点击编辑 → 复用发帖弹窗，预填标题/正文/标签，按钮文字变为「保存编辑」
- ✅ `editPost(id)` JS函数：加载帖子数据 + 切换编辑模式
- ✅ `submitPost()` 支持编辑模式：检测 `editingPostId`，用 PUT 代替 POST
- ✅ 编辑成功后重置状态（editingPostId=null），按钮恢复「发布帖子」
- ✅ 删除已有确认弹窗（`askConfirm`）

### 涉及文件
- `public/js/app.js` - editPost 函数 + submitPost 编辑模式 + showNewPost 重置
- `routes/posts.js` - PUT/DELETE API（已有，无需修改）


---

## v1.3 开发记录（续）

### P0 积分排行榜 ✅
- ✅ `routes/leaderboard.js` 新建（GET /leaderboard?limit=10）
- ✅ API 返回 top 用户：积分/昵称/头像/等级/等级图标/等级颜色
- ✅ 首页工具栏加「🏆 排行榜」按钮（橙色渐变）
- ✅ 排行榜面板：渐变卡片 + top 10 用户列表
- ✅ 前三名 🥇🥈🥉 奖牌样式 + 黄色背景
- ✅ 每条显示：排名/头像/昵称/等级/积分
- ✅ `toggleLeaderboard()` / `loadLeaderboard()` JS函数
- ✅ 收起/展开切换，内容懒加载

### 涉及文件
- `routes/leaderboard.js`（新建）
- `index.js`（注册 leaderboard 路由）
- `public/index.html`（排行榜面板HTML + 工具栏按钮）
- `public/js/app.js`（toggleLeaderboard / loadLeaderboard 函数）


---

## v1.3 开发记录（续）

### P1.1 签到历史 ✅
- ✅ 签到卡加「🎁签到 / 📅记录」tab 切换
- ✅ 日历视图：当前月格子，已签到=🔥绿色，未签到=灰色数字
- ✅ 最近10条签到记录列表（日期/积分/连续天数）
- ✅ `switchCheckinTab()` / `loadCheckinHistory()` JS函数

### P1.2 搜索优化 ✅
- ✅ 后端 `GET /posts` 支持 `sort=newest|hot`（最新/最热）
- ✅ 后端支持 `time_range=day|week|month` 时间筛选
- ✅ 前端工具栏加「🕐最新/🔥最热」+「全部/今天/本周/本月」筛选按钮
- ✅ `setSearchSort()` / `setSearchTime()` JS函数
- ✅ 最热排序：views + likes*5 + comments*3 加权

### P1.3 用户活跃日历 ✅
- ✅ `GET /users/:id/activity?days=90` API（posts+comments+checkins 合并统计）
- ✅ 个人主页加「🔥活跃」tab（仅本人可见）
- ✅ GitHub 风格 13周热力图，颜色深浅=活跃度
- ✅ `loadActivityCalendar(userId)` JS函数
- ✅ 悬停显示具体日期+活跃次数

### 涉及文件
- `routes/posts.js` - GET / posts 路由加 sort + time_range 参数
- `routes/users.js` - 新增 `GET /users/:id/activity` API
- `public/index.html` - 签到历史tabHTML + 搜索筛选栏HTML
- `public/js/app.js` - switchCheckinTab / loadCheckinHistory / setSearchSort / setSearchTime / loadActivityCalendar
- `public/css/style.css` - .checkin-sub-tab / .search-filters / .filter-btn / #activity-heatmap 样式


---

## v1.3 开发记录（续）

### P2 点赞功能 ✅
- ✅ 帖子列表：👍👎 变成可点击按钮（不再是纯文字）
- ✅ 点赞后按钮即时变红（👍）/紫色（👎），再次点击取消
- ✅ `updatePostListVoteCounts()` 升级：同时更新按钮颜色
- ✅ `.vote-inline-btn` 样式：悬停灰底，点击高亮
- ✅ 热度排序已实现：views + likes*5 + comments*3 加权

### 涉及文件
- `public/js/app.js` - 帖子列表 vote 按钮模板 + `updatePostListVoteCounts` 升级
- `public/css/style.css` - `.vote-inline-btn` 样式
- `routes/posts.js` - 热度排序（已有）


---

## v1.3 开发记录（续）

### P2 精选/置顶 ✅
- ✅ 数据库加 `is_pinned`（置顶）和 `is_featured`（加精）字段
- ✅ 后端 `POST /api/admin/posts/:id/pin`（置顶/取消）
- ✅ 后端 `POST /api/admin/posts/:id/feature`（加精/取消）
- ✅ 帖子列表：置顶帖显示🏆橙色标签，加精帖显示⭐粉色标签
- ✅ 帖子列表排序：置顶帖优先排在最前
- ✅ 帖子详情页：标题旁显示🏆置顶/⭐精选标签
- ✅ 管理后台帖子列表：已上线帖子旁显示🏆置顶/⭐加精按钮

### 涉及文件
- `models/database.js` - `is_pinned` / `is_featured` 字段
- `routes/admin.js` - `/posts/:id/pin` 和 `/posts/:id/feature` API
- `routes/posts.js` - 排序加 `p.is_pinned DESC` 优先
- `public/js/app.js` - 帖子列表/详情页加标签
- `public/admin-login.html` - 管理后台帖子列表加按钮


---

## v1.3 开发记录（续）

### P2 标签管理后台 ✅
- ✅ `routes/tags.js` 新增 `POST /api/tags`（创建标签）、`PUT /api/tags/:id`（更新）、`DELETE /api/tags/:id`（删除）
- ✅ 管理后台新增「🏷️ 标签管理」Tab
- ✅ 标签卡片：图标/名称/关联帖子数 + ✏️编辑/🗑删除按钮
- ✅ 顶部添加表单：标签名+颜色选择器+图标+添加按钮
- ✅ 删除时显示确认提示，解绑关联帖子
- ✅ 增删改后自动刷新列表

### 涉及文件
- `routes/tags.js` - 新增 3 个管理 API（authMiddleware 保护）
- `public/admin-login.html` - 标签 Tab 按钮 + Tab 内容 + JS CRUD 函数


---

## v1.4 开发记录

### P0 评论点赞 ✅
- ✅ `routes/commentVotes.js` 新建（POST /comments/:id/vote、GET /comments/:id/votes）
- ✅ `models/database.js` - `comment_votes` 表（user_id/comment_id/vote_type/UNIQUE）
- ✅ 评论查询加 `like_count` 字段
- ✅ 帖子详情页评论加 👍 按钮（点赞数显示）
- ✅ 回复评论同样加 👍 按钮
- ✅ 点赞状态异步加载（打开帖子时查询当前用户是否已点赞）
- ✅ 点赞后按钮即时变红，再次点击取消
- ✅ 不能给自己评论点赞

### 涉及文件
- `routes/commentVotes.js`（新建）
- `models/database.js`（comment_votes 表）
- `routes/posts.js`（评论查询加 like_count）
- `public/js/app.js`（评论点赞按钮 + voteComment/loadCommentVoteStatus 函数）


---

## v1.4 开发记录（续）

### P1 黑暗模式 ✅
- ✅ CSS 已有 4 套主题（default/sunset/sky/cyber）
- ✅ 导航栏加 🌙 主题切换按钮（循环切换 4 套主题）
- ✅ 切换后自动保存 `localStorage.theme`
- ✅ 页面加载时恢复保存的主题
- ✅ 未保存时检测系统深色模式偏好，自动切换 cyber 主题
- ✅ 4 套主题：default（默认蓝）/ sunset（橙红）/ sky（青）/ cyber（深蓝黑）

### 涉及文件
- `public/index.html` - 导航栏加 `#theme-toggle` 按钮
- `public/js/app.js` - `toggleTheme()` / `setTheme()` / 加载恢复逻辑

### P1 个人主页增强 ✅
- ✅ 粉丝数和关注数均可点击，打开弹窗展示用户列表
- ✅ 列表内显示头像/昵称/等级/积分，可直接关注或发私信
- ✅ 修复原代码 `profileUserId` 未定义变量 bug
- ✅ `showFollowList()` / `loadFollowList()` / `closeFollowList()` JS函数

### 涉及文件
- `public/index.html` - 新增 `#follow-list-modal` 弹窗
- `public/js/app.js` - 个人主页 stats row 加点击，follow list 函数


### P1 积分排行榜入口增强 ✅
- ✅ 排行榜面板新增「完整榜单 →」按钮，可跳转独立排行榜页
- ✅ 排行榜面板新增「我的排名」迷你卡，登录用户显示自己当前排名
- ✅ 当前用户在榜时列表中高亮（紫色边框 + 「我」标签）
- ✅ 新建 `public/leaderboard.html` 独立排行榜页：前三名 podium 卡片、top100 列表、分页
- ✅ 独立页底部显示总人数、页码导航
- ✅ `GET /api/leaderboard/me` 新增接口：返回当前用户排名信息

### 涉及文件
- `public/leaderboard.html` - 新建独立排行榜页
- `public/index.html` - 排行榜面板加「完整榜单 →」按钮 + lb-my-rank-mini 容器
- `public/js/app.js` - loadLeaderboard 升级：加载我的排名、当前用户高亮
- `routes/leaderboard.js` - 新增 `/me` 接口、支持分页参数

### P2 帖子举报功能 ✅
- ✅ `reports` 表：reporter_id / target_type(post|comment) / target_id / reason / status(pending|resolved|dismissed) / admin_note
- ✅ 后端 `routes/reports.js`：POST /api/reports（登录） / GET /api/reports/admin（列表+分页+状态筛选） / POST /admin/:id/dismiss / POST /admin/:id/action
- ✅ 帖子详情页 action bar 加「🚩 举报」按钮（非作者登录用户可见）
- ✅ 每条评论加「🚩 举报」按钮（非评论作者登录用户可见）
- ✅ 举报弹窗：6类原因按钮（单选）+ 补充说明文本框 + 提交
- ✅ 管理后台新增「🚩 举报管理」Tab，支持筛选待处理/已处理/已忽略，分页，操作（忽略/删内容/封号）

### 涉及文件
- `models/database.js` - reports 表
- `routes/reports.js` - 新建后端路由
- `public/index.html` - 举报弹窗 HTML
- `public/js/app.js` - openReportModal / submitReport / selectReportReason 函数
- `public/admin-login.html` - 举报管理 Tab + loadReports / dismissReport / actionReport 函数

### P2 评论楼内回复嵌套展示优化 ✅
- ✅ 重构评论渲染为树形结构（`buildCommentTree` 构建嵌套）
- ✅ 层级缩进：root（无缩进）→ direct reply（缩进20px+左边框）→ deeper（再缩进16px+淡边框）
- ✅ 竖线连接：不同层级用不同粗细/颜色的左边框模拟嵌套线
- ✅ 深层回复按需展开：depth≥3 的回复默认隐藏，点击「💬 查看 N 条更多回复 ↓」按钮展开
- ✅ `expandReplies(commentId)` 函数利用已加载评论数据，无需重复请求
- ✅ CSS：`.comment-depth-1` / `.comment-depth-2` / `.reply-expand-btn` / `.depth-expanded` 新样式

### 涉及文件
- `public/js/app.js` - buildCommentTree / renderCommentItem / expandReplies 重构
- `public/css/style.css` - 嵌套评论 CSS 样式（depth-1 / depth-2 / expand button）

### P3 积分转账 ✅
- ✅ `point_transfers` 表：from_user_id / to_user_id / amount / status / note / created_at
- ✅ `POST /api/points/transfer` - 转账接口，扣转出方积分、加接收方积分
- ✅ `GET /api/points/transfers` - 我的转账记录（sent/received 双列表）
- ✅ 设置页加「💸 积分转账」卡片，包含转账表单和记录 tab
- ✅ 转账记录 tab 切换「我转出的」/「我收到的」，含头像+昵称+金额+时间+备注

### 涉及文件
- `models/database.js` - point_transfers 表
- `routes/points.js` - 新建后端路由
- `public/index.html` - 转账卡片 HTML
- `public/js/app.js` - submitTransfer / loadTransferRecords / switchTransferTab 函数


### P3 RSS订阅 ✅
- ✅ `routes/rss.js` - RSS 2.0 Feed，最新 20 篇 approved 帖子
- ✅ 访问路径：`/feed.xml`
- ✅ 字段：title / link / guid / description / author / pubDate / category
- ✅ 网站导航栏加 📡 RSS 按钮

### 涉及文件
- `routes/rss.js` - 新建 RSS 路由
- `public/index.html` - 导航栏 RSS 按钮
- `public/js/app.js` - 登录后显示 RSS 按钮