/**
 * PM2 — 钱包后端（与 deploy/remote-deploy.sh 配套）
 *
 * 密钥/敏感配置：写在服务器上的 `/etc/h-wallet.env`（或 HWALLET_ENV_FILE 指定的路径），
 * 文件格式 KEY=VALUE 每行一个；本配置启动时会读取并合并到进程环境，文件本身不入 Git。
 *
 * 常用 KEY（不全则缺省值见 src/wallet-backend/config.ts）：
 *   OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE / OKX_PROJECT_ID
 *   CLAUDE_API_KEY / DEEPSEEK_API_KEY
 *   HWALLET_OPS_ADMIN_TOKEN
 *   HWALLET_CORS_ORIGINS / HWALLET_MAX_JSON_BODY_BYTES
 *   HWALLET_AI_RATE_LIMIT_MAX / HWALLET_AI_RATE_LIMIT_WINDOW_MS
 *   HWALLET_META_CAPABILITIES_TOKEN
 *   HWALLET_CLAUDE_INTENT_MODEL / HWALLET_DEEPSEEK_CHAT_MODEL / HWALLET_DEEPSEEK_INTENT_MODEL
 *   HWALLET_INTENT_MAX_TOKENS / HWALLET_DEEPSEEK_CHAT_MAX_TOKENS
 */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname);

function loadEnvFile(p) {
  const out = {};
  let txt;
  try {
    txt = fs.readFileSync(p, "utf8");
  } catch {
    return out;
  }
  for (const line of txt.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq <= 0) continue;
    const k = s.slice(0, eq).trim();
    let v = s.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k) out[k] = v;
  }
  return out;
}

const ENV_FILE = process.env.HWALLET_ENV_FILE || "/etc/h-wallet.env";
const fileEnv = loadEnvFile(ENV_FILE);

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
        ...fileEnv,
      },
    },
  ],
};
