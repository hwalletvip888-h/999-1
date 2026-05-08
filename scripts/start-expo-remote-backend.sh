#!/usr/bin/env bash
# 使用云上的 walletBackend（不配本机 3100）。
# 用法: npm run dev:expo-remote
set -euo pipefail
cd "$(dirname "$0")/.."

# 可改：export REMOTE_HWALLET_API_BASE=https://你的域名 再运行
REMOTE_API="${REMOTE_HWALLET_API_BASE:-http://64.90.1.102:3100}"
export EXPO_PUBLIC_HWALLET_API_BASE="$REMOTE_API"

IP=""
for iface in en0 en1; do
  if IP=$(ipconfig getifaddr "$iface" 2>/dev/null) && [[ -n "$IP" ]]; then
    break
  fi
done
[[ -z "$IP" ]] && IP="127.0.0.1"

echo ""
echo "[start-expo-remote] 钱包 API（云端）: ${EXPO_PUBLIC_HWALLET_API_BASE}"
echo "[start-expo-remote] Metro 手机请连: exp://${IP}:<下面打印的端口>"
echo "[start-expo-remote] 无需本机 npm run dev:wallet-backend"
echo ""

METRO_PORT="${EXPO_METRO_PORT:-8082}"
PID=$(lsof -tiTCP:"$METRO_PORT" -sTCP:LISTEN 2>/dev/null || true)
if [[ -n "${PID:-}" ]]; then
  echo "[start-expo-remote] 释放端口 $METRO_PORT (PID=$PID)"
  kill "$PID" 2>/dev/null || true
  sleep 1
  PID=$(lsof -tiTCP:"$METRO_PORT" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "${PID:-}" ]]; then
    kill -9 "$PID" 2>/dev/null || true
    sleep 1
  fi
fi

exec npx expo start --lan --clear --port "$METRO_PORT"
