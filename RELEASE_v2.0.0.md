# v2.0.0 - Docker 容器化生产部署 🐳

**发布时间：** 2026-04-07

---

## 🎉 主要更新

### Docker 容器化生产部署
PM2 → Docker 完整迁移，服务稳定性提升到新台阶。

- `Dockerfile` — Node.js 20 Alpine 精简镜像
- `docker-compose.prod.yml` — 生产环境完整配置
- `auto-updater` 服务 — Git webhook 自动构建更新（5分钟检测一次 + Webhook 触发）
- **数据持久化** — SQLite 和上传文件通过 Docker volume 映射，删除容器不丢数据

### 系统级稳定性
- systemd pm2-root 服务配置完成，机器重启后自动恢复
- PM2 dump 保存在 `/root/.pm2/dump.pm2`

---

## 🐛 Bug 修复

- auto-updater 容器内 git pull SSH 认证失败（挂载 id_ed25519）
- README 三个问题修复（Docker 待办勾选/v1.9 重复标题/生产部署说明）
- RSS Content-Type 正确返回 application/rss+xml

---

## 📦 基础设施

- **GitHub Actions CI/CD** — 烟雾测试 + API 检查，每次 PR 自动运行
- **CONTRIBUTING.md** — 贡献指南，Docker/本地两种开发方式
- **Bug Report / Feature Request / PR 模板** — 规范 Issue 和 PR
- **CHANGELOG.md** — 完整版本变更日志

---

## 🔄 如何升级

### 服务器已部署？

```bash
cd /root/forum
git pull origin master
docker compose -f docker-compose.prod.yml up -d
```

### 想本地跑？

```bash
git clone https://github.com/TimeIsShort/pandahub.git
cd pandahub
cp .env.example .env   # 填入 API Key
docker-compose up -d
# 访问 http://localhost:3000
# 示例账号: demo / demo123
```

---

## 📊 版本信息

- **版本号：** v2.0.0
- **许可证：** MIT
- **仓库：** github.com/TimeIsShort/pandahub

---

*查看完整变更：https://github.com/TimeIsShort/pandahub/compare/v1.9...v2.0.0*
