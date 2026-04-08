FROM node:18-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 升级 npm 到 npm@9（修复 "Exit handler never called" bug）
RUN npm install -g npm@9

COPY package*.json ./

RUN npm install && \
    node -e "require('better-sqlite3'); console.log('better-sqlite3 OK')"

COPY . .

RUN mkdir -p /app/i18n-data /app/data-wordfilter && \
    mkdir -p /app/data /app/uploads && \
    cp -r ./data/i18n/. /app/i18n-data/ && \
    cp ./data/word-filter.txt /app/data-wordfilter/ && \
    chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/sections || exit 1

ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["node", "index.js"]
