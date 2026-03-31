# PandaHub 功能规划 (feature-next)

> 分支：feature-next | 基于 v1.5 master 分支

---

## P1 功能

### 1.1 COS 图片存储 ⏳ 待开发
**目标**：用户发帖上传的图片存到腾讯云 COS，CDN 全球加速分发
**方案**：
1. 开通腾讯云 COS + CI 图片处理
2. 新增 `/api/upload/image` 路由调用 COS SDK，返回 CDN URL
3. 前端发帖图片上传改用 COS URL
4. 存量 `/uploads/` 图片迁移到 COS
5. COS bucket 绑定自定义域名，Cloudflare 回源 COS

---

### 1.2 管理后台 - 安全管控 ✅ 已完成
**文件**：`routes/admin.js`（新增 `/api/admin/security-logs` + `/api/admin/unlock-ip`）

---

### 1.3 评论楼内回复嵌套展示 ✅ 已完成
**优化内容**：
- 竖线醒目：depth-1 紫色渐变 3px 竖线 + 左端点连接（::before）；depth-2 更细浅紫
- 展开动画：max-height Q弹展开 + opacity 淡入（cubic-bezier 回弹曲线）
- 内嵌回复输入框：点「回复」直接在楼层下方出现输入框，Enter 发送，取消消失
- 深层评论分页：每次最多显示 10 条，「加载更多」按钮逐步展开

---

## P2 功能

### 2.1 每日签到提醒（Web Push）✅ 已完成
**文件**：`services/reminderScheduler.js` / `routes/reminder.js` / `public/sw.js`
**commit**：feature-next

---

### 2.2 前端 i18n（国际化）✅ 已完成
**文件**：`public/i18n/zh.json` / `en.json` / `public/js/i18n.js`
**commit**：feature-next

---

### 2.3 回复通知推送 ✅ 已完成
**说明**：v1.4 已完整实现（通知表 + API + 导航栏通知按钮 + 轮询）

---

## P3 功能

### 3.1 Service Worker + 资源缓存优化 ✅ 已完成
**文件**：`public/sw.js`（Cache-First / Network-First 分层策略）
**commit**：feature-next

---

### 3.2 用户关注/粉丝系统 ✅ 已完成
**文件**：`routes/follow.js` / `models/database.js`（follows 表）/ `public/js/app.js`
**commit**：feature-next

---

### 3.3 精华帖标记 ✅ 已完成
**实现**：首页工具栏排序下拉新增「⭐ 精选」选项，后端 `featured=1` 参数过滤，管理后台已有完整加精/取消功能
**commit**：feature-next（225ca15）

---

## P4 功能

### 4.1 AI 对话历史分页 ✅ 已完成
**实现**：
- 后端 `/ai/history` 新增 `page` + `limit` 参数，返回 `total`/`pages`/`page`
- 每页最多 20 条，默认 LIMIT 50，上限 50
- 前端 AI 聊天框顶部新增「加载更多」按钮（追加历史消息到顶部）
- 按钮显示剩余页数，点击后追加更早的消息
**commit**：feature-next（6c67b12）

### 4.2 帖子多条件筛选增强 ⏳ 待开发
**目标**：AI 对话历史支持翻页，不只是最新 20 条

### 4.2 帖子多条件筛选增强 ⏳ 待开发
**目标**：支持按标签+时间+积分范围组合筛选，URL 参数化分享

---

## 已完成汇总

| 功能 | 分支 | 状态 |
|------|------|------|
| P1.2 管理后台安全管控 | feature-next | ✅ |
| P1.3 评论嵌套四大优化 | feature-next | ✅ |
| P2.1 每日签到提醒 | feature-next | ✅ |
| P2.2 前端 i18n | feature-next | ✅ |
| P2.3 回复通知推送 | v1.4 | ✅ |
| P3.1 SW 缓存优化 | feature-next | ✅ |
| P3.2 关注/粉丝系统 | feature-next | ✅ |
| P3.3 精华帖标记 | feature-next | ✅ |
| COS 图片存储 | 待开发 | ⏳ |
| P4.1 AI 对话分页 | feature-next | ✅ |
| P4.2 多条件筛选 | ✅ 完成 | ⏳ |
