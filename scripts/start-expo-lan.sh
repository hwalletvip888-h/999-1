#!/usr/bin/env bash
# 避免因「单行粘贴」带入 bracketed-paste 噪声（如 ^[[200~）导致 zsh bad pattern；
# Metro 会使用本机的 LAN IP 指向钱包后端默认端口 3100。
set -euo pipefail
cd "$(dirname "$0")/.."
IP=""
for iface in en0 en1; do
  if IP=$(ipconfig getifaddr "$iface" 2>/dev/null) && [[ -n "$IP" ]]; then
    break
  fi
done
[[ -z "$IP" ]] && IP="127.0.0.1"
export EXPO_PUBLIC_HWALLET_API_BASE="http://${IP}:3100"
echo ""
echo "[start-expo-lan] EXPO_PUBLIC_HWALLET_API_BASE=${EXPO_PUBLIC_HWALLET_API_BASE}"
echo "[start-expo-lan] 请另开一个终端运行: npm run dev:wallet-backend"
echo ""

# 固定 Metro 端口，避免与其它项目抢 8081；若端口仍被占用则结束占用进程（不再需要按 Y）
METRO_PORT="${EXPO_METRO_PORT:-8082}"
PID=$(lsof -tiTCP:"$METRO_PORT" -sTCP:LISTEN 2>/dev/null || true)
if [[ -n "${PID:-}" ]]; then
  echo "[start-expo-lan] 释放端口 $METRO_PORT (PID=$PID)"
  kill "$PID" 2>/dev/null || true
  sleep 1
  PID=$(lsof -tiTCP:"$METRO_PORT" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "${PID:-}" ]]; then
    kill -9 "$PID" 2>/dev/null || true
    sleep 1
  fi
fi

exec npx expo start --lan --clear --port "$METRO_PORT"
