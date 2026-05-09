/**
 * PM2 — 钱包后端（与 deploy/remote-deploy.sh 配套）
 * 使用 npm script，兼容 Linux 上 .bin/tsx 的封装方式。
 *
 * 常用环境变量（在 PM2 `env`、宿主 `.env` 或密钥管理中配置，勿提交真实密钥）：
 *   CLAUDE_API_KEY / DEEPSEEK_API_KEY — AI 意图与闲聊
 *   HWALLET_CORS_ORIGINS — 逗号分隔 Origin，默认 `*`
 *   HWALLET_MAX_JSON_BODY_BYTES — JSON 体上限，默认 262144
 *   HWALLET_AI_RATE_LIMIT_MAX / HWALLET_AI_RATE_LIMIT_WINDOW_MS — /api/ai/* POST 限流
 *   HWALLET_META_CAPABILITIES_TOKEN — 若设置，GET /api/meta/capabilities 需 X-Hwallet-Meta-Token
 *   HWALLET_CLAUDE_INTENT_MODEL / HWALLET_DEEPSEEK_CHAT_MODEL / HWALLET_DEEPSEEK_INTENT_MODEL / HWALLET_INTENT_MAX_TOKENS / HWALLET_DEEPSEEK_CHAT_MAX_TOKENS
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
        WALLET_PORT: "3100",
      },
    },
  ],
};
