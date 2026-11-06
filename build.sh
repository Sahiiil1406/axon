#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
command -v node >/dev/null || { echo "Node.js 24 is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required." >&2; exit 1; }
# Include build tools even when the hosting platform sets NODE_ENV=production.
for package in codegen sdk final/server final/frontend; do
  npm ci --prefix "$package" --include=dev --no-audit --no-fund
done
npm run typecheck --prefix sdk
npm run build --prefix final/server
npm run test:static --prefix final/server
# Production requests share the API origin. Never embed a local dev API URL.
VITE_AXON_API_URL="" npm run build --prefix final/frontend
PUBLIC_DIR="$ROOT_DIR/final/server/public"
rm -rf -- "$PUBLIC_DIR"
mkdir -p "$PUBLIC_DIR"
cp -a "$ROOT_DIR/final/frontend/dist/." "$PUBLIC_DIR/"
if [[ "${BUILD_ZK:-false}" == "true" ]]; then
  npm ci --prefix zk --include=dev --no-audit --no-fund
  if [[ ! -f zk/build/scoped.zkey ]]; then bash zk/scripts/setup.sh; fi
  node zk/scripts/test.mjs --json
fi
printf 'Production frontend copied to %s\n' "$PUBLIC_DIR"
printf 'Start the combined server with: bash deploy.sh\n'
