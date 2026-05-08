#!/usr/bin/env bash
# 初始化本机部署配置：从 example 复制 local-server.env（若不存在）、保证脚本可执行。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE="$ROOT/deploy/local-server.env.example"
TARGET="$ROOT/deploy/local-server.env"

if [[ ! -f "$TARGET" ]]; then
  cp "$EXAMPLE" "$TARGET"
  echo "[init] created $TARGET - edit GITHUB_REPOSITORY, DEPLOY_HOST, DEPLOY_SSH_PRIVATE_KEY_FILE"
else
  echo "[init] exists, skip: $TARGET"
fi

chmod +x "$ROOT/deploy/remote-deploy.sh" \
  "$ROOT/deploy/hooks/db-migrate.sh" \
  "$ROOT/deploy/gh-actions-bootstrap.sh" \
  "$ROOT/deploy/mac-push-and-bootstrap.sh" 2>/dev/null || true

echo "[init] Next: read $ROOT/deploy/START_HERE.md"
echo "[init] Or run: npm run deploy:readme"
