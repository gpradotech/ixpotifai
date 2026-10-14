#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Instale o Node.js 22.19 ou superior: https://nodejs.org/"
  exit 1
fi
if [ ! -d node_modules/ffmpeg-static ]; then
  NODE_OPTIONS=--use-system-ca npm install --no-audit --no-fund --cache .skeeter/npm-cache || exit 1
fi
export SKEETER_OPEN=1
exec node --use-system-ca server.mjs
