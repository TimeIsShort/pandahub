#!/bin/sh
set -e

# Sync i18n files and word-filter.txt from image to data volume
# The volume mounts over /app/data, hiding the image's static content,
# so we restore it on every container start.
if [ -d "/app/i18n-data" ] && [ ! -f "/app/data/i18n/zh.json" ]; then
  mkdir -p /app/data/i18n
  cp /app/i18n-data/* /app/data/i18n/
  echo "[init] i18n files synced to volume"
fi

if [ -f "/app/data-wordfilter" ] && [ ! -f "/app/data/word-filter.txt" ]; then
  cp /app/data-wordfilter /app/data/word-filter.txt
  echo "[init] word-filter.txt synced to volume"
fi

exec node /app/index.js "$@"
