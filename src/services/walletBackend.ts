/**
 * WalletBackend — H Wallet 后端服务（入口）
 *
 * 实现已拆至 `src/wallet-backend/`：
 *   - `config.ts` — 环境变量
 *   - `cli-home.ts` — per-user ONCHAINOS_HOME / session token
 *   - `onchainos-cli.ts` — CLI 调用与可用性探测
 *   - `okx-http.ts` — OKX 签名 REST（旧版余额 fallback）
 *   - `dex-tokens.ts` — 链映射与合约表、签名地址选取
 *   - `wallet-cli-handlers.ts` — OTP / 账户 / 余额 / swap / send
 *   - `admin-ops.ts` — 人类运营台 Admin API 数据
 *   - `http-server.ts` — HTTP 路由与 `/ops`（服务端组装运维 HTML）
 *
 * 启动：`npm run dev:wallet-backend`（`npx tsx src/services/walletBackend.ts`）
 */
import { startWalletBackendHttpServer } from "../wallet-backend/http-server";

process.on("unhandledRejection", (reason) => {
  console.error("[WalletBackend] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[WalletBackend] uncaughtException:", err);
});

startWalletBackendHttpServer();
