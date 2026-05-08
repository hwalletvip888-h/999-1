/**
 * PM2 — 钱包后端（与 deploy/remote-deploy.sh 配套）
 * 使用 npm script，兼容 Linux 上 .bin/tsx 的封装方式。
 */
const path = require("path");
const root = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: "wallet-backend",
      cwd: root,
      script: "npm",
      args: "run dev:wallet-backend",
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
