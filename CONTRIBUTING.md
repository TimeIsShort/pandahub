# Contributing to PandaHub 🐼

感谢你关注 PandaHub！欢迎贡献代码、文档或提出问题。

---

## 🚀 快速上手

### 方式一：Docker 本地开发（推荐）

```bash
# 克隆项目
git clone https://github.com/TimeIsShort/pandahub.git
cd pandahub

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入必要的 API Key

# 启动开发环境（带示例数据）
docker-compose up -d

# 访问 http://localhost:3000
# 示例账号: demo / demo123（管理员）
```

### 方式二：本地 Node.js 开发

```bash
npm install
cp .env.example .env   # 填入 API Key
npm run db:seed         # 初始化示例数据
npm start               # 开发模式
npm run test:smoke      # 冒烟测试
```

---

## 🏗️ 开发流程

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/pandahub.git
cd pandahub
```

### 2. 创建分支

```bash
git checkout -b feat/your-feature-name
# 或
git checkout -b fix/your-bug-description
```

分支命名规范：
- `feat/` — 新功能
- `fix/` — Bug 修复
- `docs/` — 文档
- `refactor/` — 重构
- `chore/` — 工具/配置

### 3. 开发 & 测试

```bash
# 开发中运行冒烟测试
npm run test:smoke

# 全部测试通过后提交
git add -A
git commit -m "feat: add xxx"
```

### 4. 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: add new feature
fix: fix bug
docs: update documentation
refactor: restructure code
test: add tests
chore: update build scripts / dependencies
```

### 5. Push & Pull Request

```bash
git push origin your-branch-name
```

然后在 GitHub 打开 Pull Request，填写 PR 模板。

---

## 🧪 测试

### 冒烟测试

```bash
npm run test:smoke
```

测试覆盖：首页加载、移动端视图、登录/注册、工具箱、多语言切换等核心流程。

### 提交门禁（本地）

每次提交前自动运行：

```bash
node scripts/release-gate.js
```

检查项：i18n 覆盖率、无障碍检查、构建完整性、Git 状态。

---

## 📐 代码规范

- 使用 2 空格缩进（与现有代码保持一致）
- `async/await` 优先，避免回调嵌套
- API 路由统一放在 `routes/` 目录
- 中间件统一放在 `middleware/` 目录
- 数据库表结构变更在 `models/database.js` 中管理

---

## 🐛 报告问题

请使用 [GitHub Issues](https://github.com/TimeIsShort/pandahub/issues/new/choose) 报告：

- 🐛 Bug → 使用 Bug Report 模板
- ✨ Feature → 使用 Feature Request 模板

报告时尽量提供：
- 环境信息（浏览器、操作系统）
- 复现步骤
- 期望行为 vs 实际行为
- 截图（如果有）

---

## 📄 License

参与本项目即表示你同意你的代码将遵循项目的 [MIT License](LICENSE)。

---

*有问题？欢迎开 Issue 或提交 PR，社区一起让 PandaHub 更好 🐱*
