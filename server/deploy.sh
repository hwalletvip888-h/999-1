#!/usr/bin/env bash
# H Wallet 真实接入 OKX Agentic Wallet —— 一键部署脚本
#
# 用法（在 VPS 的 Web 终端 / SSH 里贴这一行）：
#   curl -fsSL https://raw.githubusercontent.com/hwalletvip888-h/999-1/main/server/deploy.sh | bash
# 或者：先 git clone 项目，cd server && bash deploy.sh
#
# 跑完后访问：
#   https://34-21-193-21.sslip.io/health
# 应当返回 { "ok": true, "onchainos": true, ... }

set -euo pipefail

SERVER_IP="${SERVER_IP:-34.21.193.21}"
DOMAIN="${DOMAIN:-${SERVER_IP//./-}.sslip.io}"
APP_USER="${APP_USER:-ubuntu}"
APP_HOME="/home/${APP_USER}"
DATA_DIR="/var/lib/h-wallet/users"
NODE_MAJOR="${NODE_MAJOR:-20}"

green() { printf "\033[1;32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[1;33m%s\033[0m\n" "$*"; }
red() { printf "\033[1;31m%s\033[0m\n" "$*"; }

green "==> 1/7  apt 更新 + 基础包"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  curl wget jq build-essential ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

green "==> 2/7  安装 Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v${NODE_MAJOR}* ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

green "==> 3/7  安装 onchainos CLI（用户态）"
mkdir -p "$APP_HOME/.local/bin"
if [ ! -x "$APP_HOME/.local/bin/onchainos" ]; then
  curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh
fi
# 加入 PATH
if ! grep -q 'local/bin' "$APP_HOME/.bashrc" 2>/dev/null; then
  echo 'export PATH=$HOME/.local/bin:$PATH' >> "$APP_HOME/.bashrc"
fi
export PATH="$APP_HOME/.local/bin:$PATH"
"$APP_HOME/.local/bin/onchainos" --version || { red "onchainos 安装失败"; exit 1; }

green "==> 4/7  写入 walletBackend.js"
sudo mkdir -p "$DATA_DIR"
sudo chown -R "$APP_USER:$APP_USER" "$(dirname "$DATA_DIR")"

WBJS="$APP_HOME/walletBackend.js"
# 如果当前目录已经有这个文件（git clone 路径），优先用本地版；否则从仓库拉
if [ -f "./walletBackend.js" ]; then
  cp ./walletBackend.js "$WBJS"
else
  curl -fsSL https://raw.githubusercontent.com/hwalletvip888-h/999-1/main/server/walletBackend.js -o "$WBJS"
fi
chmod 644 "$WBJS"
ls -l "$WBJS"

green "==> 5/7  systemd 服务"
SECRET=$(openssl rand -hex 32)
sudo tee /etc/systemd/system/h-wallet.service >/dev/null <<UNIT
[Unit]
Description=H Wallet Backend (onchainos wrapper)
After=network-online.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_HOME}
Environment=HOME=${APP_HOME}
Environment=PATH=${APP_HOME}/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=ONCHAINOS_BIN=${APP_HOME}/.local/bin/onchainos
Environment=WALLET_DATA_DIR=${DATA_DIR}
Environment=WALLET_PORT=3100
Environment=WALLET_SESSION_SECRET=${SECRET}
ExecStart=/usr/bin/node ${WBJS}
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now h-wallet
sleep 2
sudo systemctl status h-wallet --no-pager | head -20

green "==> 6/7  Caddy 反代 + HTTPS（Let's Encrypt）"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
${DOMAIN} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3100
}
CADDY
sudo systemctl restart caddy
sleep 2
sudo systemctl status caddy --no-pager | head -10

green "==> 7/7  开放 80/443（如有 ufw）"
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q active; then
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
fi

green "==> 健康检查"
echo "本机:"
curl -fsS http://127.0.0.1:3100/health | jq . || true
echo "公网（首次签证可能要 30-60s）:"
for i in 1 2 3 4 5 6; do
  if curl -fsS "https://${DOMAIN}/health" | jq . ; then
    green "✅ 部署完成"
    echo "  Public URL : https://${DOMAIN}"
    echo "  /health     https://${DOMAIN}/health"
    echo "  service     sudo systemctl status h-wallet"
    echo "  logs        sudo journalctl -u h-wallet -f"
    exit 0
  fi
  yellow "  等 Caddy 申请证书 ($i/6)..."
  sleep 10
done
red "公网 HTTPS 访问失败，请检查："
echo "  1. 安全组是否开放 80/443"
echo "  2. sudo journalctl -u caddy -n 50"
echo "  3. dig ${DOMAIN}  应该解析到 ${SERVER_IP}"
exit 1
