#!/bin/bash
# /root/publish.sh - 更新文档 + 提交代码 + 推送到 GitHub
# 用法: bash /root/publish.sh "提交信息"

MSG="${1:-update: 功能优化}"
FORUM_DIR="/root/forum"

cd "$FORUM_DIR"

echo "========== 开始发布流程 =========="

# 1. 更新文档时间戳
sed -i "s/> 更新时间：.*/> 更新时间：$(date '+%Y-%m-%d')/" /root/.openclaw/workspace/forum-feature-plan.md 2>/dev/null

# 2. 提交所有改动
echo "[1/3] 提交代码..."
git add -A
git commit -m "$MSG" 2>/dev/null && echo "  提交完成: $MSG" || echo "  无新改动"

# 3. 推送到 GitHub
echo "[2/3] 推送到 GitHub..."
git push origin master 2>&1 | tee /tmp/push.log
if [ $? -eq 0 ]; then
  echo "  推送成功 ✅"
else
  echo "  推送失败，请检查网络或 SSH 配置"
fi

# 4. PM2 重启（如有必要）
echo "[3/3] 检查论坛状态..."
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 | grep -q "200" && echo "  论坛运行正常" || (echo "  论坛异常，重启中..." && pm2 restart forum)

echo "========== 发布完成 =========="
