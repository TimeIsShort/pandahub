FROM node:18-slim

# 安装 wget（健康检查用）
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 升级 npm 到最新版修复 Exit handler bug
RUN npm install -g npm@11 --prefer-offline 2>/dev/null || npm install -g npm@11 || true

# 安装依赖
COPY package*.json ./
RUN npm ci --no-update-notifier && test -d node_modules/dotenv && echo "OK" || (echo "FATAL: dotenv missing" && exit 1)

# 复制源码
COPY . .

# i18n 翻译文件和词过滤独立打包（不受 data volume 挂载影响）
# 先确保目录存在再用 COPY（避免 BuildKit cache key 误判）
RUN mkdir -p /app/i18n-data /app/data-wordfilter
COPY ./data/i18n/ /app/i18n-data/
COPY ./data/word-filter.txt /app/data-wordfilter/

# 创建数据目录（SQLite 和上传文件）
RUN mkdir -p data uploads && \
    chown -R node:node /app

USER node

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/sections || exit 1

ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["node", "index.js"]
