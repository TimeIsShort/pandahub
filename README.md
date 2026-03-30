# 技术交流社区论坛

一个简洁高效的小圈子技术交流论坛，支持 AI 主题讨论。

---

## 📌 项目概述

| 项目 | 内容 |
|------|------|
| **项目名称** | 技术交流社区 |
| **类型** | Node.js 全栈论坛 |
| **版本** | 1.0.0 |
| **端口** | 3000 |
| **访问地址** | http://localhost:3000 |

---

## 🛠 技术栈

### 后端
- **Runtime**: Node.js 22+
- **Framework**: Express 5
- **Database**: SQLite (better-sqlite3)
- **Auth**: JWT + bcrypt
- **Upload**: Multer

### 前端
- 原生 HTML/CSS/JavaScript
- 无框架依赖，轻量级

### 依赖包
```
express, better-sqlite3, jsonwebtoken, bcryptjs, cors, helmet, morgan, multer
```

---

## 📁 项目结构

```
forum/
├── index.js              # 主入口，服务器启动
├── package.json           # 项目配置
├── data/                  # SQLite 数据库文件目录
│   └── forum.db          # 数据库文件（自动生成）
├── models/
│   └── database.js       # 数据库初始化 & 表结构
├── routes/
│   ├── auth.js           # 用户注册/登录/Token
│   ├── posts.js          # 帖子 CRUD + 评论
│   ├── tags.js           # 标签管理
│   ├── users.js          # 用户信息
│   └── upload.js         # 图片上传
├── middleware/
│   └── auth.js           # JWT 认证中间件
├── public/                # 前端静态资源
│   ├── index.html        # 主页面
│   ├── slider-captcha.html # 滑块验证码页面
│   ├── css/
│   │   └── style.css     # 样式文件
│   ├── js/
│   │   └── app.js        # 前端逻辑
│   └── uploads/          # 上传的图片存放目录
└── README.md             # 项目文档
```

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
| checkin_streak | INTEGER | 连续签到天数 |
| email | TEXT | 绑定邮箱（唯一） |
| email_verified | INTEGER | 邮箱是否已验证（0/1） |
| created_at | DATETIME | 注册时间 |
| last_login | DATETIME | 最后登录 |

### checkins 签到记录表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| user_id | INTEGER | 用户ID |
| checkin_date | DATE | 签到日期 |
| points_earned | INTEGER | 本次获得积分 |
| streak_before | INTEGER | 签到前的连续天数 |
| created_at | DATETIME | 记录创建时间 |
| UNIQUE(user_id, checkin_date) | | 每人每天只能签到一次 |

### email_codes 邮箱验证码表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| email | TEXT | 邮箱地址 |
| user_id | INTEGER | 用户ID |
| code | TEXT | 6位验证码 |
| purpose | TEXT | 用途（默认 bind） |
| expires_at | DATETIME | 过期时间（10分钟内） |
| used | INTEGER | 是否已使用（0/1） |
| created_at | DATETIME | 创建时间 |

### posts 帖子表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| user_id | INTEGER | 发帖人ID |
| title | TEXT | 标题 |
| content | TEXT | 内容（支持图片Markdown） |
| tag_id | INTEGER | 标签ID |
| views | INTEGER | 浏览量 |
| like_count | INTEGER | 点赞数 |
| dislike_count | INTEGER | 倒赞数 |
| status | TEXT | pending/approved/rejected |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### post_votes 帖子投票表（点赞/倒赞）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| post_id | INTEGER | 帖子ID |
| user_id | INTEGER | 用户ID |
| vote_type | TEXT | like（点赞）或 dislike（倒赞） |
| created_at | DATETIME | 投票时间 |
| UNIQUE(post_id, user_id) | | 每用户每帖只能投票一次 |

### tags 标签表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| name | TEXT | 标签名 |
| color | TEXT | 颜色代码 |
| created_at | DATETIME | 创建时间 |

### comments 评论表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| post_id | INTEGER | 所属帖子ID |
| user_id | INTEGER | 评论人ID |
| content | TEXT | 评论内容（支持图片Markdown） |
| parent_id | INTEGER | 父评论ID（用于回复功能） |
| reply_to_user_id | INTEGER | 被回复的用户ID |
| created_at | DATETIME | 评论时间 |

### hobbies 爱好表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| name | TEXT | 爱好名称 |
| icon | TEXT | 表情图标 |
| created_at | DATETIME | 创建时间 |

### user_hobbies 用户爱好关联表
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | INTEGER | 用户ID |
| hobby_id | INTEGER | 爱好ID |

### ai_chats AI聊天记录表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| user_id | INTEGER | 用户ID |
| role | TEXT | user/assistant |
| content | TEXT | 消息内容 |
| created_at | DATETIME | 创建时间 |

### applications 内测申请表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| username | TEXT | 申请的用户名 |
| nickname | TEXT | 昵称 |
| email | TEXT | 邮箱（必填） |
| reason | TEXT | 申请理由 |
| status | TEXT | pending/approved/rejected |
| created_at | DATETIME | 申请时间 |
| processed_at | DATETIME | 处理时间 |
| processed_by | INTEGER | 处理人ID |


---

## 🔌 API 接口

### 认证相关 `/api/auth`

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | /register | 注册 | username, password, nickname |
| POST | /login | 登录 | username, password |
| GET | /me | 获取当前用户 | 需要Token |

### 帖子 `/api/posts`

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | / | 获取帖子列表 | page, limit, tag_id, search |
| GET | /:id | 获取帖子详情 | - |
| POST | / | 发布帖子 | title, content, tag_id |
| PUT | /:id | 修改帖子 | title, content, tag_id |
| DELETE | /:id | 删除帖子 | - |
| POST | /:id/comments | 添加评论 | content, parent_id（可选）, reply_to_user_id（可选） |
| DELETE | /comments/:id | 删除评论 | - |
| POST | /:id/vote | 点赞/倒赞（需登录） | vote_type: like/dislike |
| GET | /:id/votes | 获取投票状态 | - |

### 标签 `/api/tags`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 获取所有标签（带帖子数量） |

### 内测申请 `/apply`

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | /apply | 申请页面 | - |
| POST | /apply | 提交申请 | username, nickname, email, reason |
| GET | /apply/status | 查询申请状态 | username |

### 管理后台 `/api/admin`（需管理员权限）

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | /applications | 获取所有申请 | - |
| POST | /approve | 通过申请并创建用户 | application_id, password |
| POST | /reject | 拒绝申请 | application_id |
| GET | /posts | 获取待审核帖子 | - |
| POST | /posts/:id/approve | 通过帖子 | - |
| POST | /posts/:id/reject | 拒绝帖子 | - |
| GET | /all-posts | 获取所有帖子 | - |

### 通知 `/api/notifications`（需登录）

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | / | 获取通知列表 | - |
| GET | /unread-count | 获取未读数量 | - |
| POST | /:id/read | 标记已读 | - |
| POST | /read-all | 全部已读 | - |

### AI助手 `/api/ai`（需登录）

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | /quota | 获取今日剩余额度 | - |
| GET | /history | 获取聊天历史 | - |
| DELETE | /history | 清空聊天记录 | - |
| POST | /chat | 发送消息 | message |

### 个人设置 `/api/profile`

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | /me | 获取个人设置 | 需要Token |
| PUT | /me | 更新个人设置 | nickname, bio, hobby_ids |
| POST | /avatar | 上传头像 | avatar (multipart) |
| GET | /hobbies | 获取所有爱好标签 | - |

### 签到 `/api/checkin`（需登录）

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | /status | 获取签到状态 | - |
| POST | /checkin | 执行签到 | - |
| GET | /history | 获取签到历史 | page, limit |

### 签到积分规则

| 连续签到天数 | 每日积分奖励 |
|------|------|
| 第1天 | +5 积分 |
| 第2天 | +8 积分 |
| 第3天 | +10 积分 |
| 第4天 | +12 积分 |
| 第5天 | +15 积分 |
| 第6天 | +18 积分 |
| 第7天及以上 | +25 积分 |

> ⚠️ 若中断签到，连续天数归零，从头开始计算。

### 邮箱绑定 `/api/email`

#### 绑定邮箱（需登录）
| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | /send-code | 发送验证码到邮箱 | email |
| POST | /verify-code | 验证并绑定邮箱 | email, code |
| POST | /unbind-email | 解除邮箱绑定 | - |

#### 找回密码（无需登录）
| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | /forgot/send-code | 发送重置验证码 | email |
| POST | /forgot/reset-password | 验证并重置密码 | email, code, password |

> 📧 验证码有效期 10 分钟，每个邮箱同时只能有一个有效验证码。
> ⚠️ 更换邮箱需要重新验证，一个用户只能绑定一个已验证邮箱。
> 🔐 找回密码时，若邮箱未绑定或未验证，返回同样提示（不暴露邮箱是否存在）
> 📋 前端验证：邮箱格式校验 + 两次密码一致性校验 + 密码强度校验（大小写字母+数字）

### 用户 `/api/users`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /:id | 获取用户信息和帖子 |

### 上传 `/api/upload`

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | /image | 上传图片 | image (multipart) |

---

## ✨ 功能列表

- [x] 用户注册 / 登录
- [x] JWT Token 认证
- [x] 滑块验证码（注册/登录）
- [x] 发布帖子（支持 Markdown）
- [x] 标签分类筛选
- [x] 关键词搜索
- [x] 评论互动
- [x] 图片上传（最多9张）
- [x] 个人主页
- [x] 浏览量统计
- [x] 横向滚动公告栏
- [x] Admin 管理功能
- [x] 定时AI日报（每天8点自动发布）
- [x] 个人设置页（昵称/头像/介绍/爱好标签）
- [x] 帖子/评论显示用户头像
- [x] 内测申请制（管理员审核后开通账号）
- [x] AI助手（每天10次额度，可搜索帖子）
- [x] 帖子审核功能（管理员审核后展示）
- [x] 审核通知（通过/拒绝后发帖人收到通知）
- [x] 帖子点赞/倒赞（登录用户可投票，支持toggle取消）
- [x] 评论回复（支持一级嵌套，含图片）
- [x] 每日签到（连续签到积分递增，断签重置）
- [x] 天气显示（公告栏左侧，点击可切换城市）
- [x] 邮箱绑定（设置页绑定/更换邮箱，验证码验证）
- [x] 找回密码（通过绑定邮箱重置密码）
- [x] 工具箱（URL/Base64/HTML编码、MD5/SHA-256加密、JSON格式化、时间戳转换、Unicode转换、进制转换、JWT解码、UUID生成、颜色转换）

---

## ⏰ 定时任务

每天早上8点自动发布AI日报：

```bash
# 手动测试脚本
node scripts/daily-ai-news.js

# 查看发布日志
cat /tmp/ai-daily.log

# Cron任务（自动）
0 8 * * * cd /root/forum && node scripts/daily-ai-news.js >> /tmp/ai-daily.log 2>&1
```

---

## 🚀 快速启动

```bash
# 进入目录
cd /root/forum

# 安装依赖
npm install

# 启动服务
npm start

# 或开发模式
npm run dev
```

服务地址：http://0.0.0.0:3000

---

## 🔐 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | admin123 |

---

## 📝 帖子发布示例

```bash
# 登录获取Token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 发布帖子
curl -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"title":"标题","content":"内容","tag_id":1}'
```

---

## ⚙️ 配置说明

### 端口修改
编辑 `index.js` 中的 `PORT` 环境变量或默认值。

### JWT密钥
编辑 `middleware/auth.js` 中的 `JWT_SECRET`，生产环境请使用复杂随机字符串。

### 上传限制
编辑 `routes/upload.js` 中的 `fileSize` 配置（默认5MB）。

---

## 🎯 爱好标签预设

| 标签名 | 图标 |
|--------|------|
| AI人工智能 | 🤖 |
| 编程开发 | 💻 |
| 数据分析 | 📊 |
| 产品设计 | 🎨 |
| 摄影摄像 | 📷 |
| 阅读写作 | 📚 |
| 音乐娱乐 | 🎵 |
| 游戏电竞 | 🎮 |
| 旅行探索 | ✈️ |
| 健身运动 | 🏃 |
| 美食烹饪 | 🍳 |
| 影视综艺 | 🎬 |
| 科技数码 | 📱 |
| 商业创业 | 🚀 |
| 学术研究 | 🔬 |

---

## 🌐 标签预设

| 标签名 | 颜色 | 用途 |
|--------|------|------|
| AI工具 | #10b981 | 分享AI工具 |
| 使用技巧 | #6366f1 | 使用教程 |
| 问题求助 | #f59e0b | 提问 |
| 资源分享 | #ec4899 | 分享资源 |
| 日常闲聊 | #8b5cf6 | 随便聊聊 |
| 游戏资讯 | #22c55e | 游戏相关资讯 |
| 二次元 | #ec4899 | 动漫、轻小说相关内容 |
| 求助贴 | #f97316 | 寻求帮助 |
| 公益贴 | #06b6d4 | 公益活动、志愿者 |

---

## 🔜 后续可扩展功能

- [ ] 富文本编辑器
- [ ] 私信功能
- [ ] 积分系统
- [ ] 版主权限分级
- [ ] 邮件通知
- [ ] 帖子置顶/精华
- [ ] 用户头像上传
- [ ] 敏感词过滤
- [ ] 操作日志

---

*文档生成时间：2026-03-25*
