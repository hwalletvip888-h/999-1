#!/usr/bin/env bash
# 在服务器上执行：拉代码 → 安装依赖 → 数据库迁移（若已配置）→ PM2 重启 wallet-backend
# GitHub Actions 通过 SSH 调用；也可在服务器手动：DEPLOY_REF=main bash deploy/remote-deploy.sh
set -euo pipefail

ROOT="${DEPLOY_PROJECT_DIR:-}"
if [[ -z "$ROOT" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
cd "$ROOT"

REF="${DEPLOY_REF:-main}"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[!] $ROOT 不是 git 仓库。请先在服务器执行: git clone <你的新仓库 URL> $ROOT"
  exit 1
fi

echo "[remote-deploy] fetch origin/$REF ..."
git fetch origin "$REF"
git reset --hard "origin/$REF"

echo "[remote-deploy] npm install (ci 与 lock 不一致时自动回退 npm install)"
if ! npm ci 2>/dev/null; then
  npm install
fi

echo "[remote-deploy] db hooks ..."
bash deploy/hooks/db-migrate.sh

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[!] 未找到 pm2。请先: npm install -g pm2"
  exit 1
fi

echo "[remote-deploy] pm2 (re)start wallet-backend ..."
# 用 restart 而非 reload：tsx 启动较慢，reload 的 0-downtime 切换会在新进程就绪前结束，
# 导致新代码的端点 404 / 端口 connection refused，旧进程还在监听。
if pm2 describe wallet-backend >/dev/null 2>&1; then
  pm2 restart ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo "[remote-deploy] 等待新进程就绪 ..."
HEALTH_URL="http://127.0.0.1:${WALLET_PORT:-3100}/health"
HEALTH_OK=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  if curl -sS -m 3 "$HEALTH_URL" 2>/dev/null | grep -q '"ok":true'; then
    HEALTH_OK="1"
    echo "[remote-deploy] health OK on try #$i"
    curl -sS "$HEALTH_URL" | head -c 500 || true
    echo ""
    break
  fi
done
if [[ -z "$HEALTH_OK" ]]; then
  echo "[remote-deploy] !! health check timed out after 20s — dump pm2 logs:"
  pm2 logs wallet-backend --lines 40 --nostream || true
  exit 3
fi
echo "[remote-deploy] 完成"
