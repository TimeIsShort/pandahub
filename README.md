# 技术交流社区论坛

一个简洁高效的小圈子技术交流论坛，支持 AI 主题讨论。

---

## 📌 项目概述

| 项目 | 内容 |
|------|------|
| **项目名称** | 技术交流社区（pandahub.cloud） |
| **类型** | Node.js 全栈论坛 |
| **版本** | v1.9（2026-04-02） |
| **端口** | 3000 |
| **访问地址** | http://localhost:3000 |

---

## 🛠 技术栈

### 后端
- **Runtime**: Node.js 22+
- **Framework**: Express 5
- **Database**: SQLite (better-sqlite3)
- **Auth**: JWT + bcrypt
- **Email**: Nodemailer（QQ邮箱 SMTP）
- **Push**: Web Push（VAPID）
- **Upload**: Multer

### 前端
- 原生 HTML/CSS/JavaScript
- 无框架依赖，轻量级
- Markdown 渲染（marked）
- Chart.js 图表库

---

## 📁 项目结构

```
forum/
├── index.js              # 主入口，服务器启动
├── package.json          # 项目配置
├── data/                  # SQLite 数据库文件目录
│   └── forum.db          # 数据库文件（自动生成）
├── models/
│   └── database.js       # 数据库初始化 & 表结构
├── routes/
│   ├── auth.js           # 用户注册/登录/Token
│   ├── posts.js          # 帖子 CRUD + 评论 + @提及
│   ├── tags.js           # 标签管理
│   ├── users.js          # 用户信息 + 用户搜索
│   ├── upload.js         # 图片上传
│   ├── checkin.js        # 每日签到 + 连续奖励
│   ├── notifications.js  # 通知中心（分页+筛选）
│   ├── messages.js       # 私信系统
│   ├── follow.js         # 关注/粉丝系统
│   ├── favorites.js       # 收藏/书签
│   ├── leaderboard.js    # 积分排行榜
│   └── reports.js        # 帖子/评论举报
│   └── points.js        # 积分转账
│   └── rss.js          # RSS 订阅 Feed
│   └── admin.js          # 管理后台 + AI审核
├── middleware/
│   └── auth.js           # JWT 认证中间件
├── utils/
│   └── pushHelper.js     # Web Push + 邮件通知
├── scripts/
│   └── daily-ai-news.js  # 定时AI日报
├── public/                # 前端静态资源
│   ├── index.html        # 主页面
│   ├── admin-login.html  # 管理后台
│   ├── ai.html           # AI助手页面
│   ├── css/
│   │   └── style.css     # 样式文件
│   ├── js/
│   │   └── app.js        # 前端逻辑
│   └── uploads/          # 上传的图片存放目录
└── docs/                 # 项目文档
    ├── forum-feature-plan.md  # 功能规划
    ├── forum-v1.2-plan.md     # v1.2 规划
    └── forum-v1.3-plan.md     # v1.3 规划
    └── forum-v1.4-plan.md     # v1.4 规划
```

---

## ✨ 功能列表（v1.9）

### 核心功能
- [x] 用户注册 / 登录（JWT + 滑块验证码）
- [x] 邮箱验证注册（发送验证码 → 验证 → 创建账号）
- [x] 个人主页（头像/昵称/等级/积分/简介）
- [x] 个人主页增强（粉丝/关注数可点击跳转列表弹窗）
- [x] 个人主页自定义背景图（上传/移除，模糊暗化处理）
- [x] 个人设置（昵称/头像/简介/爱好标签）
- [x] 邮箱绑定 + 找回密码

### 内容发布
- [x] 发布帖子（支持 Markdown）
- [x] 富文本编辑器（工具栏：加粗/斜体/代码/链接/标题/列表/引用）
- [x] Markdown 渲染（标题/加粗/斜体/代码/链接/列表/引用/图片）
- [x] 帖子编辑 + 删除（作者/管理员）
- [x] 图片上传（最多9张，Markdown 嵌入）
- [x] 标签分类筛选
- [x] 关键词搜索（FTS5 全文搜索）
- [x] 搜索优化（最新/最热排序 + 今天/本周/本月时间筛选）
- [x] 筛选条件URL参数化（tag/tags/sort/author/min_points/page，支持分享链接和浏览器前进后退）
- [x] 评论互动（嵌套回复，扣积分，层级缩进+竖线+深层展开，树形结构，层级颜色标识+深度徽章）
- [x] 帖子分享海报生成（Canvas绘制，可下载PNG/复制链接）
- [x] @提及用户（评论中 @username 触发通知）
- [x] 评论点赞（👍 可点击，点赞数实时显示）
- [x] 帖子Reaction表情（6种：👍❤️😂😮😢😡）
- [x] 评论表情反应（6种表情，点击切换，显示反应计数）

### 社交体系
- [x] 私信系统（会话列表/气泡聊天/实时推送）
- [x] 关注/粉丝系统
- [x] 收藏/书签（个人主页收藏 tab）

### 激励体系
- [x] 积分系统（发帖/评论扣积分）
- [x] 积分转账（用户间互转，即时到账，记录可查）
- [x] 等级系统（5级，等级图标+颜色）
- [x] 每日签到（7天连续奖励阶梯：5→8→10→12→15→18→25 积分）
- [x] 签到历史（日历视图+最近记录列表）
- [x] 积分排行榜（🏆 top 10 + 独立排行榜页 top 100 + 我的排名）
- [x] 社区热议榜（72h热度算法，侧边栏Top5展示）
- [x] 用户活跃日历（GitHub风格90天热力图）
- [x] 每日任务系统（发帖/评论/签到3个日常任务，完成领积分）
- [x] 成就徽章系统（12个徽章，发帖/签到/评论/等级/人气等条件解锁，徽章详情弹窗+进度追踪）
- [x] 社区挑战周赛季（每周挑战任务，完成领取积分奖励）

### 通知体系
- [x] Web Push 浏览器通知（新私信/新评论/审核结果）
- [x] 邮件通知（新评论/回复/审核通过/审核拒绝/@提及）
- [x] 通知中心（分类筛选/历史记录/分页/全部已读）
- [x] 每日签到提醒（定时提醒，未签到用户站内通知）

### 运营管理
- [x] 管理后台（审核帖子/管理用户/敏感词过滤/举报管理）
- [x] AI 自动审核帖子（Kim i API）
- [x] 操作日志（管理员操作记录，含登录登出/置顶加精/封禁等，含用户行为日志和帖子访问日志）
- [x] 统计看板（Chart.js 柱状图+环形图，7天/30天切换）
- [x] 帖子审核（pending → approved/rejected）
- [x] API 频率限制（滑动窗口：匿名120次/分钟，已登录300次/分钟）
- [x] 发帖/评论冷却时间（发帖30秒冷却，评论15秒冷却）
- [x] 恶意注册拦截（临时邮箱域名黑名单 + IP注册频率限制 + 用户名黑名单）

### 其他
- [x] AI 助手（每天10次额度，可搜索帖子，聊天历史持久化）
- [x] AI 聊天历史（服务器分页存储，加载更多，localStorage回退）
- [x] 工具箱（URL/Base64/JSON/时间戳等）
- [x] 定时 AI 日报（每天8点）
- [x] SEO 优化（robots.txt/sitemap/og:tags）
- [x] 分享功能（一键复制链接）
- [x] 移动端适配（viewport-fit/100dvh/键盘感知/底部导航隐藏）
- [x] 移动端触摸手势（帖子列表左右滑动 → 右滑快速收藏）
- [x] RSS 订阅（/feed.xml，RSS 2.0 标准格式 + 完整订阅UI页面）
- [x] 黑暗模式（5套主题：薄荷/夕阳/天空/赛博/极光）
- [x] 国际化i18n（简体中文/English，设置页语言切换）

---

## 🗄 数据库结构

### users 用户表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| username | TEXT | 用户名（唯一） |
| password | TEXT | 加密密码 |
| nickname | TEXT | 昵称 |
| avatar | TEXT | 头像URL |
| bio | TEXT | 个人简介 |
| role | TEXT | 角色（member/admin） |
| points | INTEGER | 积分余额 |
| level | INTEGER | 等级（1-5） |
| checkin_streak | INTEGER | 连续签到天数 |
| email | TEXT | 绑定邮箱（唯一） |
| email_verified | INTEGER | 邮箱是否已验证（0/1） |
| push_subscription | TEXT | Web Push 订阅信息 |
| created_at | DATETIME | 注册时间 |
| last_login | DATETIME | 最后登录 |

### follows 关注表
| 字段 | 类型 | 说明 |
|------|------|------|
| follower_id | INTEGER | 关注者ID |
| following_id | INTEGER | 被关注者ID |
| created_at | DATETIME | 关注时间 |
| PRIMARY KEY | | (follower_id, following_id) |

### favorites 收藏表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| user_id | INTEGER | 用户ID |
| post_id | INTEGER | 帖子ID |
| created_at | DATETIME | 收藏时间 |
| UNIQUE | | (user_id, post_id) |

### notifications 通知表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| user_id | INTEGER | 接收用户ID |
| type | TEXT | new_comment/new_reply/post_approved/post_rejected/mention |
| title | TEXT | 通知标题 |
| content | TEXT | 通知内容 |
| post_id | INTEGER | 相关帖子ID |
| is_read | INTEGER | 是否已读（0/1） |
| created_at | DATETIME | 创建时间 |

### messages 私信表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| sender_id | INTEGER | 发送者ID |
| receiver_id | INTEGER | 接收者ID |
| content | TEXT | 私信内容 |
| is_read | INTEGER | 是否已读（0/1） |
| created_at | DATETIME | 发送时间 |

### push_subscriptions Web Push 订阅表
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | INTEGER | 用户ID |
| endpoint | TEXT | 订阅 endpoint |
| p256dh | TEXT | 密钥 |
| auth | TEXT | 认证密钥 |

### checkins 签到记录表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| user_id | INTEGER | 用户ID |
| checkin_date | DATE | 签到日期 |
| points_earned | INTEGER | 本次获得积分 |
| streak_before | INTEGER | 签到前的连续天数 |
| created_at | DATETIME | 记录创建时间 |
| UNIQUE | | (user_id, checkin_date) |

### posts 帖子表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| user_id | INTEGER | 发帖人ID |
| title | TEXT | 标题 |
| content | TEXT | 内容（支持 Markdown） |
| tag_id | INTEGER | 标签ID |
| views | INTEGER | 浏览量 |
| like_count | INTEGER | 点赞数 |
| dislike_count | INTEGER | 倒赞数 |
| comment_count | INTEGER | 评论数 |
| status | TEXT | pending/approved/rejected |
| is_pinned | INTEGER | 是否置顶（0/1） |
| is_featured | INTEGER | 是否加精（0/1） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### post_votes 帖子投票表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| post_id | INTEGER | 帖子ID |
| user_id | INTEGER | 用户ID |
| vote_type | TEXT | like/dislike |
| created_at | DATETIME | 投票时间 |
| UNIQUE | | (post_id, user_id) |

### comments 评论表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| post_id | INTEGER | 所属帖子ID |
| user_id | INTEGER | 评论人ID |
| content | TEXT | 评论内容 |
| parent_id | INTEGER | 父评论ID |
| reply_to_user_id | INTEGER | 被回复的用户ID |
| created_at | DATETIME | 评论时间 |

### tags 标签表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| name | TEXT | 标签名 |
| color | TEXT | 颜色代码 |
| icon | TEXT | 图标 |
| created_at | DATETIME | 创建时间 |

### moderation_log 操作日志表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| admin_id | INTEGER | 管理员ID |
| action | TEXT | 操作类型 |
| target_type | TEXT | 目标类型 |
| target_id | INTEGER | 目标ID |
| reason | TEXT | 原因 |
| details | TEXT | 详情 |
| created_at | DATETIME | 操作时间 |

---

## 🔌 API 接口

### 认证 `/api/auth`
| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | /register | 注册（需邀请码） | username, password, nickname, invite_code |
| POST | /login | 登录 | username, password |
| GET | /me | 获取当前用户 | Token |

### 帖子 `/api/posts`
| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | / | 帖子列表 | page, limit, tag_id, search |
| GET | /:id | 帖子详情 | - |
| POST | / | 发布帖子 | title, content, tag_id |
| PUT | /:id | 编辑帖子 | title, content, tag_id（作者/管理员） |
| DELETE | /:id | 删除帖子 | （作者/管理员） |
| POST | /:id/comments | 评论/回复 | content, parent_id, reply_to_user_id |
| DELETE | /comments/:id | 删除评论 | - |
| POST | /:id/vote | 点赞/倒赞 | vote_type: like/dislike |
| GET | /:id/votes | 获取投票状态 | - |

### 收藏 `/api/favorites`（需登录）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 我的收藏列表（分页） |
| POST | / | 收藏帖子（body: post_id） |
| DELETE | /:postId | 取消收藏 |
| GET | /status/:postId | 查询收藏状态 |

### 关注 `/api/follow`（需登录）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /follow/:userId | 关注用户 |
| DELETE | /follow/:userId | 取消关注 |
| GET | /followers/:userId | 粉丝列表（分页） |
| GET | /following/:userId | 关注列表（分页） |
| GET | /status/:userId | 查询关注状态 |

### 私信 `/api/messages`（需登录）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /conversations | 会话列表 |
| GET | /:userId | 与某用户的聊天记录 |
| POST | /:userId | 发送私信 |

### 通知 `/api/notifications`（需登录）
| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | / | 通知列表（支持分页+type筛选） | page, limit, type |
| GET | /unread-count | 未读数量 | - |
| POST | /:id/read | 标记已读 | - |
| POST | /read-all | 全部已读 | - |

### 排行榜 `/api/leaderboard`
| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | / | top 用户列表 | limit（默认10） |

### 签到 `/api/checkin`（需登录）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /status | 签到状态（7天阶梯/今日是否签到） |
| POST | /checkin | 执行签到 |
| GET | /history | 签到历史（分页） |

### 用户 `/api/users`
| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | /:id | 用户信息和帖子 | - |
| GET | /search | 搜索用户（@提及用） | q, limit |

### 管理后台 `/api/admin`（需管理员权限）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /applications | 内测申请列表 |
| POST | /approve | 通过申请 |
| POST | /reject | 拒绝申请 |
| GET | /posts | 待审核帖子 |
| POST | /posts/:id/approve | 通过帖子 |
| POST | /posts/:id/reject | 拒绝帖子 |
| POST | /auto-review | AI 自动审核单帖 |
| POST | /posts/auto-review-all | AI 批量审核 |
| GET | /all-posts | 所有帖子 |
| GET | /stats | 统计数据 | range=7/30 |
| GET | /sensitive-words | 敏感词列表 | - |
| POST | /sensitive-words | 添加敏感词 | word |
| DELETE | /sensitive-words/:id | 删除敏感词 | - |
| GET | /logs | 操作日志 | page, limit, action |
| POST | /users/:id/ban | 封禁用户 | - |
| POST | /users/:id/unban | 解封用户 | - |

### 个人设置 `/api/profile`（需登录）
| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | /me | 获取设置 | - |
| PUT | /me | 更新设置 | nickname, bio, hobby_ids |
| POST | /avatar | 上传头像 | avatar |
| GET | /hobbies | 所有爱好标签 | - |

### 积分规则
| 操作 | 积分变化 |
|------|------|
| 发帖 | -5 积分 |
| 评论 | -2 积分 |
| 每日签到 | +5~25 积分（连续7天阶梯） |

### 等级系统
| 等级 | 积分门槛 | 图标 |
|------|----------|------|
| 新手上路 | 0+ | ⭐ |
| 初露锋芒 | 50+ | 🌱 |
| 小有名气 | 200+ | 🔥 |
| 声名鹊起 | 500+ | 🌟 |
| 炉火纯青 | 1000+ | 👑 |

### 连续签到奖励
| 连续天数 | 每日奖励 |
|------|------|
| 第1天 | +5 积分 |
| 第2天 | +8 积分 |
| 第3天 | +10 积分 |
| 第4天 | +12 积分 |
| 第5天 | +15 积分 |
| 第6天 | +18 积分 |
| 第7天+ | +25 积分 |

> ⚠️ 中断签到，连续天数归零重新计算

---

## 🚀 快速启动

```bash
# 进入目录
cd /root/forum

# 安装依赖
npm install

# 配置环境变量（复制 .env.example）
cp .env.example .env
# 编辑 .env 填入 SMTP / VAPID 等配置

# 启动服务
npm start

# 开发模式
npm run dev
```

服务地址：http://0.0.0.0:3000

---

## ⚙️ 环境变量配置

| 变量 | 说明 | 示例 |
|------|------|------|
| PORT | 服务端口 | 3000 |
| JWT_SECRET | JWT 密钥 | 随机字符串 |
| SMTP_HOST | SMTP 服务器 | smtp.ethereal.email |
| SMTP_PORT | SMTP 端口 | 587 |
| SMTP_USER | SMTP 用户 | your@email.com |
| SMTP_PASS | SMTP 密码 | yourpassword |
| SMTP_FROM | 发件人 | noreply@pandahub.cloud |
| VAPID_PUBLIC_KEY | Web Push 公钥 | （生成） |
| VAPID_PRIVATE_KEY | Web Push 私钥 | （生成） |
| VAPID_SUBJECT | Web Push Subject | mailto:admin@pandahub.cloud |
| KIMI_API_KEY | Kimi API（AI审核） | sk-xxx |

---

## 🔐 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | admin123 |

---

## 🔜 后续可扩展功能

- [ ] Docker 部署
- [ ] 积分转账/交易
- [x] 帖子置顶/加精（管理后台）
- [ ] 黑暗模式
- [ ] 移动端长按图片保存
- [ ] GDPR 数据导出
- [ ] 用户封禁/解封通知邮件

---

## 📝 更新日志

### v1.9（2026-04-02）
- ✅ P0 WEB-001~004 全部完成（可访问性修复/移动端体验/SEO/缓存策略）
- ✅ P1 WEB-005~011 全部完成（i18n补齐/天气缓存/API缓存/首屏并行/懒加载）
- ✅ P2 WEB-012~020 全部完成（Cloudflare规则/域名规范/游客可读/验证码交互/冒烟测试/性能监控/发布门禁）
- ✅ P2 Playwright冒烟测试（tests/smoke.spec.js 9项测试覆盖首页/移动端/登录/注册/工具箱/i18n）
- ✅ P2 性能监控面板（routes/metrics.js DCL/LCP/FID/API p50/p95/p99/JS错误上报）
- ✅ P2 发布验收门禁（scripts/release-gate.js i18n覆盖率/无障碍/构建完整性/Git状态/冒烟）
- ✅ P2 SEO增强（canonical/hreflang/og:image/twitter:image动态更新）
- ✅ P2 游客可读策略（viewPost移除强制登录，评论表单展示登录提示）
- ✅ 运维：.env.example规范化 + RSS域名统一

### v1.8（2026-04-02）
- ✅ P0 版块系统（sections表/CRUD API/4个默认版块/版块筛选）
- ✅ P0 每日任务增强（AI独立完成，周冠军机制，排行榜）
- ✅ P1 积分商城（shop_items表/4款默认商品/积分兑换）
- ✅ P1 评论楼中楼（parent_id树形/2层缩进/展开更多）
- ✅ P2 社区投票系统（单选/多选/截止日期/实时结果）
- ✅ P3 积分抽奖转盘（权重随机/每日一次/积分消耗）
- ✅ 积分经济闭环完成：任务→流通→兑换→抽奖

### v1.7（2026-04-02）
- ✅ P0 AI聊天历史持久化（ai_chat_history表/POST存档/分页20条/加载更多回退localStorage）
- ✅ P0 筛选条件URL参数化（tag/tags/sort/author/min_points/page，支持分享链接和浏览器前进后退）
- ✅ P1 RSS订阅完整UI（头像菜单📡入口/订阅页展示最新帖子/一键复制订阅地址/Reeder/Feedly/Inoreader兼容）
- ✅ P1 成就徽章系统（12个徽章：发帖/签到/评论/等级/人气等，checkBadges自动检查并授章，个人主页展示+详情弹窗+锁定徽章进度条）
- ✅ P1 社区挑战周赛季（赛季/周挑战任务/用户进度追踪/积分奖励自动发放/导航入口+挑战面板）
- ✅ P1 帖子Reaction表情（6种表情👍❤️😂😮😢😡，点击切换，后端reactions表独立存储）
- ✅ P1 评论表情反应（6种表情，点击切换，显示反应计数，独立reactions表）
- ✅ P1 每日任务系统（3个日常任务：发帖/评论/签到，完成可领积分奖励，前端进度条展示）
- ✅ P1 私信已读状态完整串联（打开对话窗口自动标已读，导航栏红点Badge实时更新）
- ✅ P1 社区热议榜API升级（72h热度算法：views+likes*5+comments*3*2，加权评分排序）
- ✅ P2 评论嵌套展示（后端树形结构返回replies，前端3层缩进渲染+深层展开）
- ✅ P2 前端i18n基础设施（zh.json/en.json翻译文件/i18n中间件/设置页语言切换器）
- ✅ P2 每日签到提醒（定时任务/签到提醒卡片/设置开关）
- ✅ 技术债务：PM2部署脚本优化 + better-sqlite3并发锁修复（WAL模式+busy_timeout）

### v1.5（2026-04-01）
- ✅ P0 Bug修复（帖子摘要去Markdown源码/JS函数缺失修复）
- ✅ P1 防机器人增强（登录失败锁定蜜罐时间检测）
- ✅ P1 版面收纳术（导航瘦身/公告栏改造/筛选区分双层）
- ✅ P2 视觉引导（熊猫右下角悬浮球/侧边栏换热议榜/帖子列表3列网格/公告栏毛玻璃降噪）
- ✅ P2 个人主页粉丝Tab修复（loadFollowCounts调用/fans Following列表弹窗）

### v1.4（2026-03-31）

### v1.3（2026-03-30）
- ✅ P0 收藏/书签（收藏表/API/个人主页tab）
- ✅ P0 @提及用户（评论@触发通知+搜索下拉）
- ✅ P0 通知中心（分类筛选/分页/类型标签）
- ✅ P0 帖子编辑/删除（编辑弹窗复用）
- ✅ P0 积分排行榜（top10 + 前三名奖牌）
- ✅ P1 签到历史（签到日历+最近记录列表）
- ✅ P1 搜索优化（最新/最热排序+时间筛选）
- ✅ P1 用户活跃日历（GitHub风格90天热力图）
- ✅ P2 点赞功能（帖子列表👍👎可点击+热度排序）
- ✅ P2 精选/置顶（🏆置顶⭐加精+管理后台按钮）
- ✅ P2 标签管理后台（增删改+颜色图标）

### v1.9（2026-04-03）
- ✅ 顶部加载进度条（三色渐变横条，帖子/首页/评论加载时显示）
- ✅ 按钮涟漪 + 按下缩放动画
- ✅ 帖子卡片毛玻璃增强 + 3D倾斜hover
- ✅ 通知列表unread渐变背景 + 右滑hover
- ✅ 空状态卡片emoji图标 + hover光圈 + CSS变量支持各主题适配
- ✅ 页面切换过渡动画（translateY+scale淡入，前5个帖子卡片依次延迟出现）
- ✅ 深色主题CSS变量统一（认证弹窗/工具栏/表单/Markdown编辑器等）
- ✅ Toast图标 + 渐变背景 + 弹入缩放动画
- ✅ 底部导航激活态主色发光圆点indicator
- ✅ 评论折叠按钮hover边框实线 + 阴影扩散
- ✅ 标签pill毛玻璃内嵌发光边框
- ✅ 输入框focus双层光圈
- ✅ 骨架屏同款毛玻璃背景
- ✅ 帖子详情页毛玻璃卡片 + 三色顶条动画 + 弹入动画
- ✅ 精选/置顶帖子列表持续发光脉冲动画
- ✅ 帖子操作按钮hover上浮 + 阴影 + 按下缩放
- ✅ 全局硬编码颜色修复（5套主题一致性：导航/分页/评论/通知/帖子元数据）
- ✅ AI摘要帖 excerpt 高亮标签

### v1.2（2026-03-30）
- ✅ P1.1 富文本编辑器（Markdown 工具栏+快捷键）
- ✅ P1.2 私信系统（会话列表/气泡聊天/Web Push）
- ✅ P1.3 关注系统（关注/粉丝/API）
- ✅ P2 签到连续奖励（7天阶梯 UI+脉冲动画）
- ✅ P2 管理后台图表（Chart.js 柱状图+环形图）
- ✅ P3 用户主页优化（卡片式布局+等级徽章）
- ✅ P3 邮件通知触发（评论/回复/审核结果自动发邮件）

### v1.1（2026-03-30）
- ✅ 敏感词过滤 + 操作日志
- ✅ AI 自动审核
- ✅ 邮箱验证注册
- ✅ AI 日报定时推送
- ✅ SEO 优化

---

*文档更新时间：2026-04-03（v1.9 UI打磨）*
