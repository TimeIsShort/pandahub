# 技术交流社区论坛

一个简洁高效的小圈子技术交流论坛，支持 AI 主题讨论。

---

## 📌 项目概述

| 项目 | 内容 |
|------|------|
| **项目名称** | 技术交流社区（pandahub.cloud） |
| **类型** | Node.js 全栈论坛 |
| **版本** | v1.4（2026-03-31） |
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

## ✨ 功能列表（v1.4）

### 核心功能
- [x] 用户注册 / 登录（JWT + 滑块验证码）
- [x] 邮箱验证注册（发送验证码 → 验证 → 创建账号）
- [x] 个人主页（头像/昵称/等级/积分/简介）
- [x] 个人主页增强（粉丝/关注数可点击跳转列表弹窗）
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
- [x] 评论互动（嵌套回复，扣积分，层级缩进+竖线+深层展开）
- [x] @提及用户（评论中 @username 触发通知）
- [x] 评论点赞（👍 可点击，点赞数实时显示）

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
- [x] 用户活跃日历（GitHub风格90天热力图）

### 通知体系
- [x] Web Push 浏览器通知（新私信/新评论/审核结果）
- [x] 邮件通知（新评论/回复/审核通过/审核拒绝/@提及）
- [x] 通知中心（分类筛选/历史记录/分页/全部已读）

### 运营管理
- [x] 管理后台（审核帖子/管理用户/敏感词过滤/举报管理）
- [x] AI 自动审核帖子（Kim i API）
- [x] 操作日志（管理员操作记录，含登录登出/置顶加精/封禁等，含用户行为日志和帖子访问日志）
- [x] 统计看板（Chart.js 柱状图+环形图，7天/30天切换）
- [x] 帖子审核（pending → approved/rejected）

### 其他
- [x] AI 助手（每天10次额度，可搜索帖子）
- [x] 工具箱（URL/Base64/JSON/时间戳等）
- [x] 定时 AI 日报（每天8点）
- [x] SEO 优化（robots.txt/sitemap/og:tags）
- [x] 分享功能（一键复制链接）
- [x] 移动端适配
- [x] RSS 订阅（/feed.xml，RSS 2.0 标准格式）
- [x] 黑暗模式（5套主题：薄荷/夕阳/天空/赛博/极光）

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

### v1.4（2026-03-31）
- ✅ P0 评论点赞（comment_votes表/API/帖子详情页👍按钮）
- ✅ P1 黑暗模式（5套主题切换/自动保存/系统偏好检测）
- ✅ P1 个人主页增强（粉丝/关注数可点击跳转列表弹窗）
- ✅ P1 积分排行榜入口优化（top10高亮/我的排名/完整榜单页）
- ✅ P2 帖子举报功能（reports表/举报弹窗/管理后台举报管理Tab）
- ✅ P2 评论嵌套展示优化（树形结构/层级缩进/竖线/深层展开）
- ✅ P3 积分转账（point_transfers表/设置页转账卡片/转账记录）
- ✅ P3 RSS订阅（/feed.xml RSS2.0最新20帖/导航栏📡RSS按钮）
- ✅ P3 操作日志完善（用户行为日志/帖子访问日志/管理后台访问日志Tab）

### v1.5（进行中）
- ✅ P0 Bug修复（帖子摘要去Markdown源码/JS函数缺失修复）
- ✅ P1 防机器人增强（登录失败锁定蜜罐时间检测）
- ✅ P1 版面收纳术（导航瘦身/公告栏改造/筛选区分双层）
- 🚧 P2 每日签到提醒
- 🚧 P2 前端i18n接入

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

*文档更新时间：2026-03-31（v1.4）*
