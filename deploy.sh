#!/usr/bin/env bash
# Production process entrypoint; Render calls this after build.sh.
set -euo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/final/server"
if [[ ! -f "$SERVER_DIR/public/index.html" ]]; then
  echo "Built frontend missing. Run bash build.sh first." >&2
  exit 1
fi
if [[ ! -x "$SERVER_DIR/node_modules/.bin/tsx" ]]; then
  echo "Server dependencies missing. Run bash build.sh first." >&2
  exit 1
fi
export NODE_ENV=production
# Production must remain externally reachable even if local env values were copied.
export FINAL_HOST=0.0.0.0
# Render's assigned PORT takes precedence over a local FINAL_PORT.
export FINAL_PORT="${PORT:-${FINAL_PORT:-8900}}"
export FINAL_API_ONLY=false
export FINAL_STATIC_DIR="$SERVER_DIR/public"
cd "$SERVER_DIR"
exec ./node_modules/.bin/tsx index.ts
