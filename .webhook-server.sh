#!/bin/bash
# .webhook-server.sh - 轻量 Webhook Server
# 监听 POST /webhook，验证 X-Webhook-Secret 后触发 git pull + rebuild

WEBHOOK_PORT=${1:-3001}
WEBHOOK_SECRET=${2:-change_me}
CHECK_INTERVAL=${3:-300}
COMPOSE_FILE=${4:-docker-compose.prod.yml}

echo "[webhook] 启动中，监听 :${WEBHOOK_PORT}/webhook"

while true; do
  # 使用 netcat接收数据，超时10秒
  DATA=$(echo -e "GET / HTTP/1.0\r\n\r\n" | nc -l -p ${WEBHOOK_PORT} 2>/dev/null | head -1 || echo "")
  
  if echo "$DATA" | grep -q "POST /webhook"; then
    SECRET_IN=$(echo "$DATA" | grep -i "x-webhook-secret:" | cut -d: -f2 | tr -d ' \r\n')
    if [ "$SECRET_IN" = "$WEBHOOK_SECRET" ]; then
      echo "[webhook] [$(date '+%H:%M:%S')] ✅ 验证通过，开始更新..."
      cd /app
      LOCAL=$(git rev-parse HEAD)
      git pull origin master
      REMOTE=$(git rev-parse origin/master)
      if [ "$LOCAL" != "$REMOTE" ]; then
        docker compose -f $COMPOSE_FILE build forum
        docker compose -f $COMPOSE_FILE up -d --no-deps forum
        echo "[webhook] [$(date '+%H:%M:%S')] ✅ 更新完成: $(git rev-parse --short HEAD)"
      else
        echo "[webhook] [$(date '+%H:%M:%S')] ℹ️  无新提交"
      fi
    else
      echo "[webhook] [$(date '+%H:%M:%S')] ❌ 密钥错误"
    fi
  fi
done
