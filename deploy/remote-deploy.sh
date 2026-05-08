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

echo "[remote-deploy] npm ci ..."
npm ci

echo "[remote-deploy] db hooks ..."
bash deploy/hooks/db-migrate.sh

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[!] 未找到 pm2。请先: npm install -g pm2"
  exit 1
fi

echo "[remote-deploy] pm2 reload wallet-backend ..."
if pm2 describe wallet-backend >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo "[remote-deploy] 健康检查 ..."
curl -sS "http://127.0.0.1:${WALLET_PORT:-3100}/health" | head -c 500 || true
echo ""
echo "[remote-deploy] 完成"
