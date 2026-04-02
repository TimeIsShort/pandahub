#!/bin/bash
#
# pandahub PM2 部署脚本
# 用法: bash deploy.sh [start|stop|restart|status]
#

set -e

APP_DIR="/root/forum"
APP_NAME="forum"
NODE_BIN="/root/.nvm/versions/node/v22.22.1/bin/node"
PM2_BIN="/root/.nvm/versions/node/v22.22.1/bin/pm2"

cd "$APP_DIR"

case "${1:-start}" in
  start)
    echo "启动 $APP_NAME..."
    # 使用 pm2 start 直接管理进程，而不是 pkill 方式
    $PM2_BIN startOrRestart $APP_DIR/ecosystem.config.js
    ;;
  stop)
    echo "停止 $APP_NAME..."
    $PM2_BIN stop $APP_NAME 2>/dev/null || true
    ;;
  restart)
    echo "重启 $APP_NAME..."
    # 使用 pm2 restart 而不是 pkill + node 手动启动
    $PM2_BIN restart $APP_NAME
    ;;
  status)
    $PM2_BIN list
    ;;
  logs)
    $PM2_BIN logs $APP_NAME --lines 50
    ;;
  *)
    echo "用法: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac

exit 0
