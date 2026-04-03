FROM node:20-alpine

WORKDIR /app

# 安装依赖（利用缓存）
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 复制源码
COPY . .

# 创建数据目录（SQLite 和上传文件）
RUN mkdir -p data uploads && \
    chown -R node:node /app

USER node

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/sections || exit 1

CMD ["node", "index.js"]
