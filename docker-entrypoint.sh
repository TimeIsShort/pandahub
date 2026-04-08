#!/bin/sh
set -e

if [ -d "/app/i18n-data" ] && [ ! -f "/app/data/i18n/zh.json" ]; then
  mkdir -p /app/data/i18n
  cp /app/i18n-data/* /app/data/i18n/
  echo "[init] i18n files synced to volume"
fi

if [ -f "/app/data-wordfilter" ] && [ ! -f "/app/data/word-filter.txt" ]; then
  cp /app/data-wordfilter /app/data/word-filter.txt
  echo "[init] word-filter.txt synced to volume"
fi

exec "$@"
