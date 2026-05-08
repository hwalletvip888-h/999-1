#!/usr/bin/env bash
# 在「你的 Mac」终端运行（不是我们聊天里替你 SSH）：
#
#   cd "/Users/h/Documents/GPT-manus/999-1" && chmod +x deploy/server-bootstrap.sh && ./deploy/mac-push-and-bootstrap.sh
#
# mac-push-and-bootstrap.sh 会把代码 rsync 上去并远端执行本脚本。
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/h-wallet}"
APT_TIMEOUT=120

if [[ "$(id -u)" != "0" ]]; then
  echo "[!] 请在服务器上以 root 执行"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export APT_LISTCHANGES_FRONTEND=none

echo "[bootstrap] apt 更新..."
apt-get update -o Acquire::Retries=3

echo "[bootstrap] 安装基础依赖..."
timeout "$APT_TIMEOUT" apt-get install -y \
  curl ca-certificates git ufw build-essential rsync openssl

echo "[bootstrap] Node.js 20 ..."
if ! command -v node >/dev/null || [[ "$(node -v 2>/dev/null || true)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo "[bootstrap] pm2 ..."
npm install -g pm2

if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  echo "[!] 服务器上找不到 $PROJECT_DIR/package.json"
  echo "    请先在你 Mac 上运行 deploy/mac-push-and-bootstrap.sh，或手动 rsync 项目到 root@SERVER:$PROJECT_DIR/"
  exit 2
fi

cd "$PROJECT_DIR"
echo "[bootstrap] npm install ..."
npm ci 2>/dev/null || npm install

echo "[bootstrap] firewall (22 + 3100) ..."
ufw allow OpenSSH >/dev/null
ufw allow 3100/tcp >/dev/null
ufw --force enable >/dev/null || true
ufw status || true

echo "[bootstrap] pm2 启动钱包后端 ..."
AGENT_WALLET_PROVIDER=http WALLET_PORT=3100 pm2 delete wallet-backend 2>/dev/null || true
AGENT_WALLET_PROVIDER=http WALLET_PORT=3100 pm2 start npm --name wallet-backend --cwd "$PROJECT_DIR" -- run dev:wallet-backend

pm2 save
echo "[bootstrap] 若从未配置过常驻，可能会提示执行一行 env PATH=… 的命令，把那行整条复制再在服务器跑一次即可。"

sleep 2
echo "[bootstrap] 本机健康检查:"
curl -sS "http://127.0.0.1:3100/health" | head -c 800 || echo "(health 暂不可达，检查云安全组是否放行 3100)"
echo ""
echo "[bootstrap] 完成。手机/Expo 请设: EXPO_PUBLIC_HWALLET_API_BASE=http://$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'):3100"
echo "         （若 ifconfig.me 不对，到云面板看公网 IP 手动改）"
echo "[bootstrap] 可选：将代码推到 GitHub 后，用 Actions 部署（见仓库 .github/workflows/ci-and-deploy.yml 顶部说明）。"
