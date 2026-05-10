/**
 * H Wallet 出站 HTTP 超时常量（无 RN / Expo 依赖，供 `walletApiHttp`、单测、`okxHttpCore` 等共用）。
 *
 * 谁用哪一项（对接层索引，避免各处再写魔数）：
 *
 * | 常量 | 典型调用方 | 对接对象 |
 * |------|------------|----------|
 * | `FETCH_TIMEOUT_MS` | `walletApiHttp.fetchWithTimeout` / `getWithTimeout`；`okxHttpCore.request` | RN → 自家 BFF；**OKX V5 REST**（`www.okx.com`，官方签名） |
 * | （同上） | `wallet-backend/server-fetch` 默认参数 | Node → `okx-http.ts` 等出站（`web3.okx.com`，官方签名） |
 * | `OTP_POST_DEADLINE_MS` | `walletApiHttp.raceOtpPost` | 同上 BFF，OTP 相关 POST 与 UI 层竞态上限 |
 * | `OKX_AGENTIC_FETCH_TIMEOUT_MS` | `agentWalletProviders` → `fetchWithDeadline` | **OKX Web3 Agentic priapi**（`web3.okx.com`，官方路径与头；仍非自研栈） |
 * | `EXTERNAL_LLM_FETCH_TIMEOUT_MS` | `aiChat` → `fetchWithDeadline`；`HWALLET_EXTERNAL_LLM_FETCH_TIMEOUT_MS` 可调 | Claude / DeepSeek 等**第三方 LLM HTTP**（与 OKX 无关） |
 *
 * **MCP 子包**（`mcp-hwallet-server/src/fetch-timeout.ts`）默认 28s，由 `HWALLET_MCP_FETCH_TIMEOUT_MS` 覆盖（10s–120s clamp），**不 import 本文件**，数值上刻意与 `FETCH_TIMEOUT_MS` 对齐；改 BFF 默认超时时请顺手核对 MCP 文档或该 env。
 */

export const FETCH_TIMEOUT_MS = 28_000;
export const OTP_POST_DEADLINE_MS = 32_000;

/** OKX web3 priapi Agentic（OTP / 地址 / 余额）；略短于通用 BFF 超时以便快速失败 */
export const OKX_AGENTIC_FETCH_TIMEOUT_MS = 25_000;

const _ext = parseInt(process.env.HWALLET_EXTERNAL_LLM_FETCH_TIMEOUT_MS || "120000", 10);
/** 钱包后端调用外部 LLM（Claude / DeepSeek）的 fetch 超时；可用环境变量覆盖， clamp 30s–300s */
export const EXTERNAL_LLM_FETCH_TIMEOUT_MS = Math.min(
  300_000,
  Math.max(30_000, Number.isFinite(_ext) ? _ext : 120_000),
);
