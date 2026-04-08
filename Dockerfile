FROM node:18-slim

# 安装 wget（健康检查用）和编译工具（better-sqlite3 需要）
RUN apt-get update && apt-get install -y --no-install-recommends wget python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 启用 corepack 并使用 pnpm
COPY package*.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10 --activate && \
  pnpm install && \
  test -d node_modules/dotenv && echo "OK" || (echo "FATAL: dotenv missing" && exit 1)

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
