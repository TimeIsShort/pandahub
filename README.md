# PandaHub 🐼

[![CI](https://github.com/TimeIsShort/pandahub/actions/workflows/ci.yml/badge.svg)](https://github.com/TimeIsShort/pandahub/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

> **English**: A lightweight, full-stack forum for tech communities with AI-powered features, gamification, and modern UX.
>
> **中文**: 一个简洁高效的小圈子技术交流论坛，支持 AI 主题讨论、游戏化积分体系与现代交互体验。

[🇨🇳 中文说明](#中文) · [🚀 Quick Start](#-quick-start) · [🛠 Tech Stack](#-tech-stack) · [📦 Deploy](#-deploy)

---

## 📸 Screenshots | 项目截图

![首页](./screenshots/home.png)
*首页 — 帖子列表 + 侧边栏*

![排行榜](./screenshots/leaderboard.png)
*积分排行榜 + 本周活跃榜*

![AI 助手](./screenshots/ai-chat.png)
*AI 助手 — Kimi 大模型对话*

![工具箱](./screenshots/toolbox.png)
*工具箱 — 签到 · 抽奖 · 任务*

![移动端](./screenshots/home-mobile.png)
*移动端自适应界面*

![管理员后台](./screenshots/admin.png)
*管理员后台 — 数据总览*

---

## ✨ Features | 功能亮点

| | |
|---|---|
| 🤖 **AI Integration** | AI chat, auto post review, AI daily digest | AI 助手 · AI 自动审核 · AI 日报 |
| 🎮 **Gamification** | Points, daily check-in, tasks, shop, lottery, leaderboard | 积分体系 · 每日签到 · 任务商店 · 抽奖转盘 · 排行榜 |
| 👥 **Social** | Follow/fans, private messages, comments & reactions | 关注/粉丝 · 私信 · 评论互动 · 表情反应 |
| 📱 **PWA** | Offline caching, add to home screen, push notifications | PWA 安装 · 离线缓存 · Web Push 通知 |
| 🌙 **Themes** | 5 dark themes: Mint · Sunset · Sky · Cyber · Aurora | 5 套暗色主题 |
| 🌐 **i18n** | Chinese (简体中文) + English | 中英双语 |
| 📰 **RSS** | Full RSS 2.0 subscription support | RSS 订阅支持 |
| 🔒 **Security** | JWT auth, rate limiting, sensitive word filter, ban system | JWT 认证 · 频率限制 · 敏感词过滤 · 封禁系统 |

---

## 🚀 Quick Start

### 🐳 Docker (Recommended — 3 min)

```bash
# Clone the project
git clone https://github.com/TimeIsShort/pandahub.git
cd pandahub

# Copy and edit environment variables
cp .env.example .env
# Fill in MINIMAX_API_KEY and JWT_SECRET

# Start (data persists automatically)
docker-compose up -d

# Visit http://localhost:3000
# Demo data (optional): SEED_DEMO_PASSWORD=<your-password> npm run db:seed
# No admin account is seeded by default — see "🔐 Accounts" below.
```

### 💻 Local Development

```bash
npm install
cp .env.example .env   # Fill in API keys
npm run db:seed        # Seed demo data (6 users, 6 posts)
npm start
# Visit http://localhost:3000
```

---

## 🛠 Tech Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express 5 |
| Database | SQLite (better-sqlite3) |
| Auth | JWT + bcrypt |
| Email | Nodemailer (QQ Mail SMTP) |
| Push | Web Push (VAPID) |
| Frontend | Vanilla HTML/CSS/JS, marked, Chart.js |
| Deploy | Docker, systemd |

---

## 📁 Project Structure

```
pandahub/
├── index.js              # Entry point
├── package.json
├── data/                 # SQLite DB (auto-created)
│   └── forum.db
├── models/
│   └── database.js       # Schema & migrations
├── routes/
│   ├── auth.js           # Register / login
│   ├── posts.js          # Posts, comments, votes
│   ├── users.js          # Profiles, search
│   ├── checkin.js        # Daily check-in
│   ├── notifications.js  # Notification center
│   ├── messages.js       # Private messages
│   ├── follow.js         # Follow / fans
│   ├── favorites.js      # Bookmarks
│   ├── leaderboard.js    # Points ranking
│   ├── points.js         # Points transfer
│   ├── shop.js           # Points shop
│   ├── lottery.js        # Lottery
│   ├── challenges.js     # Weekly challenges
│   ├── badges.js         # Achievement badges
│   ├── admin.js          # Admin panel
│   ├── rss.js            # RSS feed
│   └── ws.js             # WebSocket server
├── middleware/
│   └── auth.js           # JWT middleware
├── utils/
│   └── pushHelper.js     # Web Push + email helper
├── public/               # Frontend static files
│   ├── index.html        # Main page
│   ├── css/style.css
│   └── js/app.js
└── docs/                 # Feature plans
```

---

## ⚙️ Environment Variables

| Variable | Description | Example |
|---|---|---|
| `MINIMAX_API_KEY` | Kimi AI API key (post review & AI features) | `sk-xxx` |
| `JWT_SECRET` | JWT signing secret | Random string |
| `VAPID_PUBLIC_KEY` | Web Push public key | (generate) |
| `VAPID_PRIVATE_KEY` | Web Push private key | (generate) |
| `VAPID_SUBJECT` | Web Push subject | `mailto:admin@example.com` |
| `SMTP_HOST` | SMTP server | `smtp.qq.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | Your email |
| `SMTP_PASS` | SMTP password | Auth code |
| `SITE_URL` | Site URL (no trailing slash) | `https://pandahub.cloud` |
| `PORT` | Server port (default 3000) | `3000` |
| `SEED_DEMO_PASSWORD` | Password for seed demo users (`npm run db:seed`); if unset, a random one is generated and printed once to the console | Your own password |
| `SEED_ADMIN_USERNAME` | Admin username created by the seed script (only when set together with `SEED_ADMIN_PASSWORD`) | `admin` |
| `SEED_ADMIN_PASSWORD` | Admin password created by the seed script | Strong password |

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

---

## 🔐 Accounts

**No default admin account is seeded.** To create one, set both `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD` before running the seed:

```bash
SEED_ADMIN_USERNAME=admin SEED_ADMIN_PASSWORD=<strong-password> npm run db:seed
```

Seed demo users (`demo`, `alice`, `bob`, …) use the password from `SEED_DEMO_PASSWORD`; if unset, a random password is generated and printed once to the console. Never commit real passwords to the repo.

---

## 📦 Deploy

### Docker Production

```bash
cp .env.example .env   # Fill in all variables

docker-compose -f docker-compose.prod.yml up -d

# Auto-update (Webhook):
# POST http://your-ip:3001/webhook
# Header: X-Webhook-Secret: <your-secret>

# Auto-update (git pull every 5 min):
# auto-updater container handles this automatically
```

> **Data persistence**: SQLite and uploads are stored in Docker volumes — deleting containers does NOT lose data.

### nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 📝 API Overview

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/register` | POST | Register |
| `/api/auth/login` | POST | Login |
| `/api/posts` | GET | Post list |
| `/api/posts` | POST | Create post |
| `/api/posts/:id/comments` | POST | Comment |
| `/api/checkin/checkin` | POST | Daily check-in |
| `/api/follow/follow/:userId` | POST | Follow user |
| `/api/messages/:userId` | POST | Send DM |
| `/api/leaderboard` | GET | Points leaderboard |
| `/api/shop/items` | GET | Shop items |
| `/api/lottery/spin` | POST | Spin lottery |
| `/api/admin/posts` | GET | Pending posts (admin) |

---

## 🧪 Testing

```bash
npm run test:smoke       # Playwright smoke tests
node scripts/release-gate.js  # Pre-commit gate
```

---

## 📄 License

MIT © 2026 PandaHub — see [LICENSE](LICENSE).

---

[🔝 Back to top](#pandahub-)

---

# 🐼 PandaHub 中文说明

一个简洁高效的小圈子技术交流论坛，支持 AI 主题讨论与游戏化积分体系。

## 快速启动

### 🐳 Docker（推荐，3 分钟）

```bash
git clone https://github.com/TimeIsShort/pandahub.git
cd pandahub
cp .env.example .env   # 填入 MINIMAX_API_KEY 和 JWT_SECRET
docker-compose up -d
# 访问 http://localhost:3000
# 演示数据（可选）：SEED_DEMO_PASSWORD=<你的密码> npm run db:seed
# 默认不创建管理员账号，见下方「账号说明」。
```

### 💻 本地开发

```bash
npm install
cp .env.example .env
npm run db:seed   # 初始化示例数据（6 用户 + 6 帖子）
npm start
```

## 账号说明

**默认不创建管理员账号。** 需要管理员时，在执行种子前同时设置 `SEED_ADMIN_USERNAME` 与 `SEED_ADMIN_PASSWORD`：

```bash
SEED_ADMIN_USERNAME=admin SEED_ADMIN_PASSWORD=<强口令> npm run db:seed
```

种子生成的演示用户（`demo`、`alice`、`bob` 等）口令来自 `SEED_DEMO_PASSWORD`；未设置时随机生成并在终端输出一次。请勿把真实口令提交到仓库。

## 技术栈

Node.js 20+ · Express 5 · SQLite (better-sqlite3) · JWT · Nodemailer · Web Push · Vanilla JS

## 主要功能

- ✅ 用户注册/登录（JWT + 滑块验证码）
- ✅ 帖子发布（Markdown）+ 图片上传
- ✅ 评论互动（嵌套回复 + 表情反应）
- ✅ AI 助手（Kimi API，每天 10 次额度）
- ✅ AI 自动审核帖子
- ✅ 积分系统（发帖/评论扣积分，签到/任务得积分）
- ✅ 每日签到（7 天连续奖励阶梯）
- ✅ 积分商城（商品兑换）
- ✅ 积分抽奖转盘（每日一次）
- ✅ 排行榜（top 10 + top 100）
- ✅ 成就徽章系统（12 个徽章）
- ✅ 社区挑战周赛季
- ✅ 私信系统（WebSocket 实时推送）
- ✅ 关注/粉丝系统
- ✅ 收藏/书签
- ✅ Web Push 浏览器通知
- ✅ 邮件通知（新评论/回复/审核结果）
- ✅ 管理后台（审核/封禁/统计）
- ✅ PWA（离线缓存 + 添加到主屏幕）
- ✅ 黑暗模式（5 套主题）
- ✅ 中英双语
- ✅ RSS 订阅
- ✅ Docker 一键部署

## 环境变量

`.env.example` 中有完整说明。必须配置：`MINIMAX_API_KEY`、`JWT_SECRET`、`SITE_URL`、SMTP 配置。

## 生产部署

```bash
docker-compose -f docker-compose.prod.yml up -d
# 自动更新由 auto-updater 容器处理（每 5 分钟 git pull）
```

## 开源协议

MIT License，详见 [LICENSE](LICENSE)。

## 贡献

欢迎提交 Issue 和 Pull Request！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

[🔝 返回顶部](#pandahub-)
