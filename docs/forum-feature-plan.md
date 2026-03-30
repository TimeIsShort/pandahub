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

