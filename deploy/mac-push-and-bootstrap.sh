#!/usr/bin/env bash
# Mac 终端执行：
#   cd "/Users/h/Documents/GPT-manus/999-1" && chmod +x deploy/mac-push-and-bootstrap.sh && ./deploy/mac-push-and-bootstrap.sh
#
# 在 deploy/local-server.env 填写 DEPLOY_*；若配置了 DEPLOY_SSH_PASSWORD，
# 将使用 sshpass（需先 brew install sshpass），不再交互输入密码。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

load_deploy_env() {
  local f="$ROOT_DIR/deploy/local-server.env"
  [[ -f "$f" ]] || return 0
  local key val line
  for key in DEPLOY_HOST DEPLOY_USER DEPLOY_PORT DEPLOY_SSH_PASSWORD DEPLOY_PROJECT_DIR WALLET_PORT AGENT_WALLET_PROVIDER; do
    line=$(grep -E "^${key}=" "$f" 2>/dev/null | tail -1 || true)
    [[ -z "${line:-}" ]] && continue
    val="${line#${key}=}"
    val="${val//$'\r'/}"
    val="${val#\"}"
    val="${val%\"}"
    val="${val#\'}"
    val="${val%\'}"
    export "${key}"="${val}"
  done
}

load_deploy_env

SERVER="${DEPLOY_HOST:-64.90.1.102}"
USER="${DEPLOY_USER:-root}"
REMOTE_DIR="${DEPLOY_PROJECT_DIR:-/opt/h-wallet}"
SSH_PORT="${DEPLOY_PORT:-22}"

SSH_CMD=(ssh -p "${SSH_PORT}" -o StrictHostKeyChecking=accept-new)

pipe_remote_bootstrap() {
  if [[ -n "${DEPLOY_SSH_PASSWORD:-}" ]]; then
    export SSHPASS="${DEPLOY_SSH_PASSWORD}"
    sshpass -e "${SSH_CMD[@]}" "${USER}@${SERVER}" "PROJECT_DIR=$REMOTE_DIR bash -s" <"$ROOT_DIR/deploy/server-bootstrap.sh"
  else
    "${SSH_CMD[@]}" "${USER}@${SERVER}" "PROJECT_DIR=$REMOTE_DIR bash -s" <"$ROOT_DIR/deploy/server-bootstrap.sh"
  fi
}

if [[ -n "${DEPLOY_SSH_PASSWORD:-}" ]] && ! command -v sshpass >/dev/null; then
  echo "[!] 你在 local-server.env 里写了 DEPLOY_SSH_PASSWORD，但本机没有 sshpass。"
  echo "    请先执行: brew install esolitos/sshpass/sshpass"
  echo "    装好后重新运行本脚本。"
  exit 2
fi

if [[ -n "${DEPLOY_SSH_PASSWORD:-}" ]]; then
  echo "[mac] 使用 local-server.env 中的密码上传（不写屏）..."
else
  echo "[mac] 同步代码到 ${USER}@${SERVER}:${REMOTE_DIR}（光标在密码行时照常输入；输入时不会显示星号）"
fi

if [[ -n "${DEPLOY_SSH_PASSWORD:-}" ]]; then
  export SSHPASS="${DEPLOY_SSH_PASSWORD}"
  sshpass -e rsync -avz --delete \
    -e "ssh -p${SSH_PORT} -o StrictHostKeyChecking=accept-new" \
    --exclude node_modules \
    --exclude .git \
    --exclude .expo \
    --exclude web-build \
    --exclude dist \
    "$ROOT_DIR/" "${USER}@${SERVER}:${REMOTE_DIR}/"
else
  rsync -avz --delete \
    -e "ssh -p${SSH_PORT} -o StrictHostKeyChecking=accept-new" \
    --exclude node_modules \
    --exclude .git \
    --exclude .expo \
    --exclude web-build \
    --exclude dist \
    "$ROOT_DIR/" "${USER}@${SERVER}:${REMOTE_DIR}/"
fi
unset SSHPASS

echo "[mac] 远端执行 bootstrap …"
pipe_remote_bootstrap

echo "[mac] 完成。测健康: curl -sS \"http://${SERVER}:3100/health\""
