# pandahub feature-next 功能规划

> v1.5 功能开发分支 · 基于 master 的增量开发

---

## P1 功能

### 1.1 COS 图片存储 ✅ 已完成
**目标**：将本地存储改为腾讯云 COS，提升图片加载速度，支持 CDN 加速

**实现**：
- `lib/cos.js` - COS 上传工具封装（uploadToCOS / deleteFromCOS）
- `routes/upload.js` - multer memoryStorage + COS SDK v5 直传
- `.env` - TENCENT_COS_SECRET_ID / SECRET_KEY / REGION / BUCKET 四要素
- `cos-nodejs-sdk-v5` - 官方 Node.js SDK

**COS 配置**：
- Bucket: `fly-1300576097`
- Region: `ap-singapore`
- 上传路径: `uploads/img-{timestamp}-{random}.{ext}`

---

### 1.2 管理后台 - 安全管控 ✅ 已完成
**文件**：`routes/admin.js`（新增 `/api/admin/security-logs` + `/api/admin/unlock-ip`）

---

### 1.3 评论楼内回复嵌套展示 ✅ 已完成
**文件**：`public/js/app.js`（展开动画 + 深层嵌套分页加载 + 内嵌回复输入框）

---

## P2 功能

### 2.1 每日签到提醒（Web Push）✅ 已完成
**文件**：`routes/reminder.js` + `public/sw.js` + `public/js/app.js`

---

### 2.2 前端 i18n（国际化）✅ 已完成
**文件**：`public/i18n/zh.json` + `en.json` + `public/js/i18n.js` + `toggleLang()`

---

## P3 功能

### 3.1 Service Worker + 资源缓存优化 ✅ 已完成
**文件**：`public/sw.js`（Cache-First / Network-First 分层策略）

---

### 3.2 用户关注/粉丝系统 ✅ 已完成
**文件**：`routes/follows.js` + `public/js/app.js`

---

### 3.3 精华帖标记 ✅ 已完成
**文件**：`routes/posts.js` + `public/js/app.js`

---

## P4 功能

### 4.1 AI 对话历史分页 ✅ 已完成
**目标**：支持加载更多 AI 聊天历史记录

**实现**：
- 后端 `/ai/history` 新增 `page` / `limit` / `total` / `pages` 参数
- 前端消息顶部显示「加载更多 N 条更早消息」按钮
- 点击追加历史记录到顶部，分页加载

---

### 4.2 帖子多条件筛选增强 ✅ 已完成
**目标**：支持按标签+时间+积分范围组合筛选，URL 参数化分享

**实现**：
- 工具栏新增积分范围下拉（0-100 / 100-500 / 500-2000 / 2000+）
- 筛选条件写入 URL（`history.replaceState`）
- 页面刷新自动从 URL 恢复所有筛选状态
- 切换筛选器自动重置到第一页

---

## 已完成汇总

| 功能 | 分支 | 状态 |
|------|------|------|
| P1.1 COS 图片存储 | feature-next | ✅ |
| P1.2 管理后台安全管控 | feature-next | ✅ |
| P1.3 评论嵌套四大优化 | feature-next | ✅ |
| P2.1 每日签到提醒 | feature-next | ✅ |
| P2.2 前端 i18n | feature-next | ✅ |
| P3.1 SW 缓存优化 | feature-next | ✅ |
| P3.2 关注/粉丝系统 | feature-next | ✅ |
| P3.3 精华帖标记 | feature-next | ✅ |
| P4.1 AI 对话分页 | feature-next | ✅ |
| P4.2 多条件筛选 | feature-next | ✅ |

**v1.5 功能全部完成 ✅**

---

## P4 功能

### 4.1 AI聊天历史记录加载更多
**目标**：支持加载更多 AI 聊天历史记录

**现状**：聊天只显示最近20条，加载更多按钮未实现

**实现**：前端已有"加载更多"按钮，补全后端API支持分页

---

### 4.2 筛选条件 URL 参数化 ✅
**目标**：标签+时间+积分范围组合筛选，链接可直接分享

**现状**：筛选条件只在页内状态，刷新丢失

**实现**：URL query string 同步筛选状态

---

### 4.1 AI聊天历史记录加载更多 ✅
**实现**：
- 新建 `ai_chat_history` 表持久化存储聊天记录
- `POST /api/ai-chat` 保存单条，`POST /api/ai-chat/batch` 批量保存
- `GET /api/ai-chat?limit=20&before=` 分页获取历史
- 前端 `loadHistory()` 优先从服务器加载，加载失败回退 localStorage
- `loadMore()` 使用 `before` 参数向服务器请求更早的消息
- 发消息时同时 POST 到服务器（fire-and-forget）
