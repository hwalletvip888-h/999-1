#!/usr/bin/env bash
# 用本机 gh CLI 把 SSH 部署所需的 Secrets / Variables 写入 GitHub（不提交任何 token 到 git）。
#
# 前置：
#   1) brew install gh
#   2) 填写 deploy/local-server.env（已 gitignore），至少含 GITHUB_REPOSITORY=owner/repo 与 DEPLOY_HOST 等
#   3) 登录：gh auth login   或仅本次：export GITHUB_TOKEN=新 PAT（勿写入文件；旧 PAT 若泄露请先在 GitHub 撤销）
#   4) 本机 SSH 私钥已配置，且公钥已在服务器 root 的 authorized_keys（或与 DEPLOY_USER 一致）
#
# 用法：在仓库根目录执行
#   bash deploy/gh-actions-bootstrap.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/deploy/local-server.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[!] 缺少 $ENV_FILE，请复制 deploy/local-server.env.example 后编辑"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${GITHUB_REPOSITORY:?请在 $ENV_FILE 中设置 GITHUB_REPOSITORY=owner/repo}"

if ! command -v gh >/dev/null 2>&1; then
  echo "[!] 未安装 gh。执行: brew install gh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    echo "[!] gh 未登录。请: gh auth login   或: export GITHUB_TOKEN=... 后再运行本脚本"
    exit 1
  fi
  echo "$GITHUB_TOKEN" | gh auth login --with-token
fi

REPO="$GITHUB_REPOSITORY"
PROJ="${DEPLOY_PROJECT_DIR:-/opt/h-wallet}"
PORT="${DEPLOY_PORT:-22}"

echo "[gh-bootstrap] repo=$REPO  ENABLE_SSH_DEPLOY=true  DEPLOY_PROJECT_DIR=$PROJ  DEPLOY_SSH_PORT=$PORT"

gh variable set ENABLE_SSH_DEPLOY --body "true" --repo "$REPO"
gh variable set ENABLE_EAS_OTA --body "${ENABLE_EAS_OTA:-false}" --repo "$REPO"
gh variable set DEPLOY_PROJECT_DIR --body "$PROJ" --repo "$REPO"
gh variable set DEPLOY_SSH_PORT --body "$PORT" --repo "$REPO"

: "${DEPLOY_HOST:?请在 $ENV_FILE 中设置 DEPLOY_HOST}"
: "${DEPLOY_USER:?请在 $ENV_FILE 中设置 DEPLOY_USER}"

gh secret set DEPLOY_SSH_HOST --body "$DEPLOY_HOST" --repo "$REPO"
gh secret set DEPLOY_SSH_USER --body "$DEPLOY_USER" --repo "$REPO"

KEY_FILE="${DEPLOY_SSH_PRIVATE_KEY_FILE:-$HOME/.ssh/id_ed25519}"
if [[ ! -f "$KEY_FILE" ]]; then
  echo "[!] 找不到 SSH 私钥: $KEY_FILE"
  echo "    生成: ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_github_actions -N \"\""
  echo "    把对应 .pub 内容追加到服务器 ${DEPLOY_USER}@${DEPLOY_HOST}:~/.ssh/authorized_keys"
  echo "    再在 $ENV_FILE 写: DEPLOY_SSH_PRIVATE_KEY_FILE=/path/to/private_key"
  exit 1
fi

gh secret set DEPLOY_SSH_KEY <"$KEY_FILE" --repo "$REPO"

if [[ -n "${EXPO_TOKEN:-}" ]]; then
  gh secret set EXPO_TOKEN --body "$EXPO_TOKEN" --repo "$REPO"
  gh variable set ENABLE_EAS_OTA --body "true" --repo "$REPO"
  echo "[gh-bootstrap] 已写入 EXPO_TOKEN 并开启 ENABLE_EAS_OTA"
else
  echo "[gh-bootstrap] 未设置 EXPO_TOKEN，跳过 OTA。需要时在终端: export EXPO_TOKEN=... 后重新运行本脚本"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  接下来须你本人（脚本无法代劳）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  1) 服务器上目录须已是 git 仓库，例如:"
echo "       git clone https://github.com/$REPO.git $PROJ"
echo "  2) push 代码到 main，打开 GitHub → Actions 看「CI and deploy」"
echo "  3) 说明全文: deploy/START_HERE.md   终端查看: npm run deploy:readme"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
