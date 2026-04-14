# 贡献指南

感谢你对 PandaHub 的关注！欢迎提交 Issue 和 Pull Request。

## 如何贡献

### 报告 Bug
- 使用 Issue 模板提交，描述清楚问题现象和复现步骤
- 附上环境信息（Node 版本、操作系统等）

### 提交代码
1. Fork 本仓库
2. 创建特性分支 `git checkout -b feature/你的功能名`
3. 编写代码并确保通过现有测试
4. 提交时写清修改内容（中文）
5. Push 后提交 Pull Request

### 代码规范
- 使用 `ESLint` 检查代码风格
- 提交前运行 `npm run lint` 确保无警告
- 新功能请附带测试用例

### 本地开发

```bash
git clone https://github.com/TimeIsShort/pandahub.git
cd pandahub
npm install
cp .env.example .env   # 按需配置
npm run dev            # 开发模式
```

## 分支规范

- `master` — 稳定版本，只接受 PR 合并
- `dev` — 开发分支，所有新功能先合到这里

## License

提交代码即表示你同意你的贡献以 MIT License 发布。
