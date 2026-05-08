# 部署：重新开始（仓库里能做的都已放好）

## 一、仓库里已经有的（不用你写代码）

| 路径 | 作用 |
|------|------|
| `.github/workflows/ci-and-deploy.yml` | push 到 `main`/`master`：先跑 typecheck；若 GitHub 里开了开关再 SSH 部署 / EAS OTA |
| `deploy/remote-deploy.sh` | 服务器上：`git pull` → `npm ci` → 数据库迁移钩子 → `pm2` 重启 `wallet-backend` |
| `deploy/hooks/db-migrate.sh` | 有 Prisma 或 `database/migrations/*.sql` 才执行，否则跳过 |
| `deploy/gh-actions-bootstrap.sh` | **本机**用 `gh` 把 SSH 部署需要的 Secrets/Variables 推到 GitHub |
| `deploy/mac-push-and-bootstrap.sh` | **本机** rsync + 远端执行 bootstrap（不依赖 GitHub Actions） |
| `ecosystem.config.cjs` | PM2 跑 `wallet-backend` |
| `eas.json` + `app.json` | 已接 `expo-updates`、production channel（OTA 需再打一次原生包） |

初始化本机配置文件（只做一次）：

```bash
npm run deploy:init
```

---

## 二、必须你本人上场时（按顺序，做到哪停哪）

### 步骤 A — 本机终端（不能代劳）

1. **`brew install gh`**，然后 **`gh auth login`**  
   - **passphrase**：给本机 SSH 钥匙用的，**可直接回车跳过**；**不要填 `ghp_` token**。  
   - **GitHub 登录**：在 **浏览器** 里点授权。  
2. **生成「给 GitHub Actions 连服务器用」的密钥**（建议和 `gh` 那把分开）：  
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/github_actions_deploy -N ""
   ssh-copy-id -i ~/.ssh/github_actions_deploy.pub root@你的服务器IP
   ```  
   这里若问密码，是 **服务器 SSH 密码**，在 **终端** 输入。  
3. 编辑 **`deploy/local-server.env`**（`npm run deploy:init` 会从 example 复制）：填好 `GITHUB_REPOSITORY`、`DEPLOY_HOST`、`DEPLOY_USER`，并加一行：  
   `DEPLOY_SSH_PRIVATE_KEY_FILE=$HOME/.ssh/github_actions_deploy`  
4. 在项目根目录执行：**`npm run github:bootstrap`**  
   - 若提示未登录，回到步骤 A.1。

### 步骤 B — 服务器（SSH 登录后）

5. 在服务器上 **`git clone`** 你的仓库到 **`DEPLOY_PROJECT_DIR`**（默认 `/opt/h-wallet`），保证该目录是 **git 仓库**（`remote-deploy.sh` 依赖 `git pull`）。  
6. 首次装好 **Node 20、pm2**，需要时在服务器配置 **OKX 等环境变量**（不要提交到 Git）。

### 步骤 C — 浏览器

7. 把代码 **push 到 `main`**，打开 GitHub → **Actions**，看 **「CI and deploy」** 是否通过。

---

## 三、你不想用 GitHub Actions 时

只用 **`./deploy/mac-push-and-bootstrap.sh`**（配合 `local-server.env` 里的 `DEPLOY_*`）即可同步代码到服务器；Actions 相关步骤可全部不做。

---

## 四、密码会在哪儿出现（对照用）

| 场景 | 在哪儿输入 | 是什么 |
|------|------------|--------|
| `gh auth login` 里 passphrase | 本机 **终端** | 锁本机 SSH 私钥的口令，**可回车跳过** |
| `gh auth login` 授权 | **浏览器** | GitHub 登录 / 点 Authorize |
| `ssh` / `ssh-copy-id` / rsync | 本机 **终端** | **服务器用户**的 SSH 密码（未配密钥时） |
| GitHub → Actions → Secrets | **浏览器** | 粘贴 **私钥全文**、**EXPO_TOKEN** 等（不是 GitHub「登录密码」） |

做到 **步骤 A.4** 成功之后，若 Actions 报错，把 **日志里最后 30 行** 发出来再继续即可。
