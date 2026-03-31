# pandahub.cloud v1.4 功能规划

> 规划版本：v1.4
> 创建时间：2026-03-30
> 当前版本：v1.3（已完成）

---

## 一、功能优先级总览

| 功能 | 优先级 | 难度 |
|------|--------|------|
| 评论点赞 | P0 | 低 |
| 黑暗模式 | P1 | 低 |
| 个人主页增强（关注/粉丝可点击跳转） | P1 | 低 |
| 积分排行榜入口（首页显著位置） | P1 | 低 |
| 帖子举报功能 | P2 | 中 |
| 评论楼内回复嵌套展示优化 | P2 | 中 |
| 用户积分转账/赠予 | P3 | 中 |
| RSS 订阅 | P3 | 低 |
| 管理员操作日志完善 | P3 | 低 |

---

## 二、P0 核心功能

### 2.1 评论点赞
**目标**：对评论进行点赞，丰富互动维度

**功能**：
- [ ] 数据库加 `comment_votes` 表（user_id / comment_id / type）
- [ ] `comment_votes` 表索引优化
- [ ] `POST /comments/:id/vote` API（点赞/取消）
- [ ] `GET /comments/:id/votes` 获取投票状态
- [ ] 帖子详情页评论区域：👍 按钮显示点赞数
- [ ] 点击即时更新（异步无刷新）
- [ ] 评论点赞不扣积分（免费互动）

**涉及文件**：`routes/comments.js`（新建）、`models/database.js`

---

## 三、P1 体验增强

### 3.1 黑暗模式
**目标**：一键切换深色/浅色界面，护眼

**功能**：
- [ ] CSS 变量定义深色主题配色
- [ ] 主题切换按钮（顶部工具栏或设置页）
- [ ] 主题状态存储 `localStorage.theme`
- [ ] 页面加载时检测系统偏好 `prefers-color-scheme`
- [ ] 主题切换动画（0.3s 平滑过渡）

**配色方案**：
```
--bg-primary: #0f172a (深蓝黑)
--bg-secondary: #1e293b
--bg-card: #1e293b
--text-primary: #f1f5f9
--text-secondary: #94a3b8
--border: #334155
--accent: #818cf8 (紫)
```

**涉及文件**：`public/css/style.css`、`public/js/app.js`、`public/index.html`

---

### 3.2 个人主页增强 ✅
**目标**：关注/粉丝数可点击跳转列表

**功能**：
- [x] 个人主页「粉丝」数字加点击事件
- [x] 「关注」数字加点击事件
- [x] 粉丝列表页：所有关注该用户的用户列表
- [x] 关注列表页：该用户关注的所有用户列表
- [x] 弹窗展示，可对列表内用户直接关注/发私信
- [x] 修复原代码 `profileUserId` 未定义 bug

**涉及文件**：`public/js/app.js`、`public/index.html`

---

### 3.3 积分排行榜入口优化 ✅
**目标**：首页显著展示排行榜入口

**功能**：
- [x] 首页工具栏已有「🏆 排行榜」按钮（已有）
- [x] 排行榜面板支持展开/收起（已有）
- [x] 排行榜加当前用户排名显示（如果在前10名内高亮）
- [x] 排行榜加「查看完整榜单」链接（跳转独立排行榜页）
- [x] 独立排行榜页：top 100，支持翻页 + 前三名特殊卡片 + 我的排名卡

**涉及文件**：`public/index.html`、`public/js/app.js`、`routes/leaderboard.js`、`public/leaderboard.html`（新建）

---

## 四、P2 社交扩展

### 4.1 帖子举报功能 ✅
**目标**：用户可举报违规帖子/评论

**功能**：
- [x] 数据库 `reports` 表（reporter_id / target_type / target_id / reason / status / admin_note）
- [x] `POST /api/reports` 提交举报（需登录，不能重复举报，不能举报自己）
- [x] `GET /api/reports/reasons` 举报原因列表
- [x] `GET /api/reports/admin` 管理端举报列表（支持状态筛选+分页）
- [x] `POST /api/reports/admin/:id/dismiss` 忽略举报
- [x] `POST /api/reports/admin/:id/action` 处理举报（删内容/封号）
- [x] `GET /api/reports/admin/count` 待处理举报数 badge
- [x] 帖子详情页「🚩 举报」按钮（登录用户可见，非作者）
- [x] 评论下方「🚩 举报」按钮（登录用户可见，非评论作者）
- [x] 举报弹窗：选择原因（6类）+ 补充说明 + 提交
- [x] 管理后台新增「🚩 举报管理」Tab，支持筛选+分页+操作

**涉及文件**：`routes/reports.js`（新建）、`models/database.js`、`public/js/app.js`、`public/index.html`、`public/admin-login.html`

---

### 4.2 评论楼内回复嵌套展示优化
**目标**：评论的回复以嵌套样式展示，更直观

**功能**：
- [x] 当前：评论平铺，回复混在一起
- [x] 优化：回复缩进并加竖线连接，颜色稍淡
- [x] 评论卡片内：父评论正常显示，子评论缩进+灰色竖线
- [x] 嵌套层级限制：最多显示2层，第3层起显示「查看更多回复」
- [x] 保持性能：大帖子避免递归渲染过深（深层评论按需展开）

**涉及文件**：`public/js/app.js`、`public/css/style.css`

---

## 五、P3 可选功能

### 5.1 用户积分转账/赠予 ✅
**目标**：用户之间可以互相转赠积分

**功能**：
- [x] 数据库 `point_transfers` 表（from/to_user_id / amount / status / note）
- [x] `POST /api/points/transfer`（转出方扣积分，接收方加积分）
- [x] `GET /api/points/transfers`（我的转账记录：sent + received 分页）
- [x] 设置页新增「💸 积分转账」卡片
- [x] 转账表单：对方用户名 / 积分数量 / 备注
- [x] 转账记录：tab 切换「我转出的」/「我收到的」，含头像/昵称/金额/时间/备注

### 5.2 RSS 订阅 ✅
**目标**：提供论坛 RSS Feed，便于 RSS 阅读器订阅

**功能**：
- [x] `GET /feed.xml` 返回 RSS 2.0 XML（最新 20 篇approved帖子）
- [x] 网站导航栏加 📡 RSS 按钮，点击跳转 feed.xml
- [x] RSS 字段：title / link / guid / description / author / pubDate / category

### 5.3 管理员操作日志完善 ✅
**目标**：记录所有管理员敏感操作

**功能**：
- [x] 管理员登录/登出记录（`POST /auth/logout`）
- [x] 置顶/加精/取消操作记录（`pin_post` / `unpin_post` / `feature_post` / `unfeature_post`）
- [x] 用户封禁/解封记录（已有）
- [x] 管理后台操作日志 actionNames 补全（新操作均已显示中文标签）

---

## 六、v1.4 开发顺序建议

1. **评论点赞** → 最简单，P0，互动体系补全
2. **黑暗模式** → 用户体验提升明显，工程量适中
3. **个人主页增强（粉丝/关注可点击）** → 小的体验优化
4. **积分排行榜入口优化** → 小的体验优化
5. **帖子举报功能** → 社区运营必备
6. 剩余功能按需推进
