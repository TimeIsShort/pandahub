# Changelog

所有重要的版本更新都会记录在此文件。

格式遵循 [Keep a Changelog](https://keepachangelog.com/) 和 [Semantic Versioning](https://semver.org/)。

## [Unreleased]

---

## [2.0.0] - 2026-04-07

### 🎉 Major
- **Docker 容器化生产部署** — PM2 → Docker 完整迁移，Dockerfile + docker-compose.prod.yml + auto-updater 自动更新服务
- **数据持久化修复** — SQLite 数据库和上传文件通过 Docker volume 映射，删除容器不丢数据
- **系统级开机自启** — systemd pm2-root 服务配置完成，机器重启后自动恢复

### 🐛 Fixes
- auto-updater 容器内 git pull SSH 认证失败（挂载 id_ed25519 + GIT_SSH_COMMAND）
- README 三个问题修复（Docker 待办重复/v1.9 重复/生产部署说明缺失）

### 📦 Infrastructure
- GitHub Actions CI/CD（烟雾测试 + API 检查）
- CONTRIBUTING.md 贡献指南
- Bug Report / Feature Request / PR 模板
- CHANGELOG.md 变更日志

---

## [1.9] - 2026-04-03

### ✨ Features
- UI 打磨集（顶部加载进度条/按钮涟漪/毛玻璃卡片/骨架屏/深色主题/CSS 变量统一/Toast 动画等）
- P0 SEO/缓存策略增强
- i18n 补齐 + API 缓存 + 首屏并行 + 懒加载

### 🔧 Infrastructure
- MIT License 正式落地
- Docker 一键部署 + seed.js 示例数据（6 用户 + 6 帖子）
- .env.example 规范化 + RSS 域名统一

---

## [1.8] - 2026-04-02

### ✨ Features
- 版块系统（sections 表 / 4 个默认版块 / 版块筛选）
- 每日任务增强 + 周冠军机制 + 排行榜
- 积分商城（shop_items 表 / 4 款默认商品 / 积分兑换）
- 评论楼中楼（parent_id 树形 / 2 层缩进）
- 社区投票系统（单选/多选/截止日期）
- 积分抽奖转盘（权重随机/每日一次）
- 积分经济闭环完成：任务→流通→兑换→抽奖

---

## [1.7] - 2026-04-02

### ✨ Features
- AI 聊天历史持久化（ai_chat_history 表）
- 筛选条件 URL 参数化（支持分享链接和浏览器前进后退）
- RSS 订阅完整 UI（订阅页 / 一键复制 / Reeder/Feedly/Inoreader 兼容）
- 成就徽章系统（12 个徽章 / checkBadges 自动检查）
- 社区挑战周赛季（赛季/周挑战任务/积分奖励）
- 帖子 Reaction 表情（6 种）
- 评论表情反应（6 种）
- 每日任务系统（3 个日常任务）
- 私信已读状态完整串联
- 社区热议榜 72h 热度算法

---

## [1.5] - 2026-04-01

### ✨ Features
- 导航瘦身 / 公告栏改造 / 筛选区分双层
- 熊猫右下角悬浮球 / 侧边栏换热议榜 / 帖子列表 3 列网格
- 个人主页粉丝 Tab 修复

---

## [1.4] - 2026-03-31

### ✨ Features
- 收藏/书签（favorites 表/API/个人主页 tab）
- @提及用户（评论 @ 触发通知 + 搜索下拉）
- 通知中心（分类筛选/分页/类型标签）
- 帖子编辑/删除
- 积分排行榜（top10 + 前三名奖牌）
- 签到历史（签到日历 + 最近记录列表）
- 搜索优化（最新/最热排序 + 时间筛选）
- 用户活跃日历（GitHub 风格 90 天热力图）
- 点赞功能 / 精选/置顶 / 标签管理后台

---

## [1.2] - 2026-03-30

### ✨ Features
- 富文本编辑器（Markdown 工具栏 + 快捷键）
- 私信系统（会话列表/气泡聊天/Web Push）
- 关注系统（关注/粉丝/API）
- 签到连续奖励（7 天阶梯 UI + 脉冲动画）
- 管理后台图表（Chart.js DAU/MAU 趋势 / 热力图）
- 邮件通知触发（评论/回复/审核结果）

---

## [1.1] - 2026-03-30

### ✨ Features
- 敏感词过滤 + 操作日志
- AI 自动审核（Kimi API）
- 邮箱验证注册
- AI 日报定时推送
- SEO 优化

---

[Unreleased]: https://github.com/TimeIsShort/pandahub/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/TimeIsShort/pandahub/compare/v1.9...v2.0.0
[1.9]: https://github.com/TimeIsShort/pandahub/compare/v1.8...v1.9
[1.8]: https://github.com/TimeIsShort/pandahub/compare/v1.7...v1.8
[1.7]: https://github.com/TimeIsShort/pandahub/compare/v1.5...v1.7
[1.5]: https://github.com/TimeIsShort/pandahub/compare/v1.4...v1.5
[1.4]: https://github.com/TimeIsShort/pandahub/compare/v1.2...v1.4
[1.2]: https://github.com/TimeIsShort/pandahub/compare/v1.1...v1.2
[1.1]: https://github.com/TimeIsShort/pandahub/releases/tag/v1.1
