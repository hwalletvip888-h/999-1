/** WalletBackend 进程级配置（环境变量） */

export const CLI_HOME_ROOT = process.env.HWALLET_CLI_HOME_ROOT || "/var/lib/h-wallet/cli";

export const WALLET_PORT = parseInt(process.env.WALLET_PORT || "3100", 10);

/** 人类运营台 Admin API；未设置则 Admin 不可用 */
export const OPS_ADMIN_TOKEN = (process.env.HWALLET_OPS_ADMIN_TOKEN || "").trim();

export const OKX_API_KEY = process.env.OKX_API_KEY || "";
export const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY || "";
export const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE || "";
export const OKX_PROJECT_ID = process.env.OKX_PROJECT_ID || "";

export const OKX_BASE_URL = "https://web3.okx.com";

/** Agent CLI 与部分 HTTP 头使用 */
export const OKX_CLIENT_VERSION = "3.0.0";

/** JSON 请求体上限（字节），防超大 payload */
export const MAX_JSON_BODY_BYTES = parseInt(
  process.env.HWALLET_MAX_JSON_BODY_BYTES || String(256 * 1024),
  10,
);

/**
 * CORS：`*` 或逗号分隔的 Origin 白名单（须含协议，如 `https://app.example.com`）。
 * 未设置时等价 `*`（开发友好；生产建议显式白名单）。
 */
export const CORS_ALLOWED_ORIGINS = (process.env.HWALLET_CORS_ORIGINS || "*").trim();

/** 若设置，则 GET /api/meta/capabilities 须带 `X-Hwallet-Meta-Token` 且值一致 */
export const META_CAPABILITIES_TOKEN = (process.env.HWALLET_META_CAPABILITIES_TOKEN || "").trim();

/** /api/ai/* POST 每 IP 每窗口最大次数（窗口秒数见下方） */
export const AI_RATE_LIMIT_MAX = parseInt(process.env.HWALLET_AI_RATE_LIMIT_MAX || "120", 10);
export const AI_RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.HWALLET_AI_RATE_LIMIT_WINDOW_MS || String(60_000),
  10,
);
