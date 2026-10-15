#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Instale o Node.js 22.19 ou superior: https://nodejs.org/"
  exit 1
fi
if [ ! -x node_modules/ffmpeg-static/ffmpeg ]; then
  NODE_OPTIONS=--use-system-ca npm ci --no-audit --no-fund --cache .ixpotifai/npm-cache || exit 1
fi
export IXPOTIFAI_OPEN=1
exec node --use-system-ca scripts/run.mjs
