/**
 * PM2 进程描述 — 服务器上跑 walletBackend（与 deploy/remote-deploy.sh 配套）
 * 环境变量请在服务器 /opt/h-wallet/.env 或 pm2 ecosystem 的 env_production 中配置。
 */
const path = require("path");
const root = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: "wallet-backend",
      cwd: root,
      script: path.join(root, "node_modules", ".bin", "tsx"),
      args: "src/services/walletBackend.ts",
      interpreter: "none",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        AGENT_WALLET_PROVIDER: "http",
        WALLET_PORT: "3100"
      }
    }
  ]
};
