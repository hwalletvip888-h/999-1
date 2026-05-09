import * as http from "http";
import { CLI_HOME_ROOT, OPS_ADMIN_TOKEN, WALLET_PORT } from "./config";
import { ensureCliHomeRoot } from "./cli-home";
import { isOnchainosCliAvailable } from "./onchainos-cli";
import { resolveCorsAllowOrigin } from "./cors";
import { isAiRouteRateLimited } from "./ai-rate-limit";
import { dispatchJsonRoutes } from "./routes/index";
import { tryServeOpsConsole } from "./routes/ops-console-route";

export { parseBody } from "./http-utils";

export function startWalletBackendHttpServer(): void {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin as string | undefined;
    const allowOrigin = resolveCorsAllowOrigin(origin);
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    if (allowOrigin !== "*") {
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Ops-Key, X-Request-Id, X-Hwallet-Meta-Token, Idempotency-Key",
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const rawUrl = req.url || "";
    const url = rawUrl.split("?")[0] || rawUrl;

    if (tryServeOpsConsole(req, res, url)) {
      return;
    }

    res.setHeader("Content-Type", "application/json");

    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";
    const reqId = (req.headers["x-request-id"] as string | undefined)?.trim() || "";
    const idPart = reqId ? ` id=${reqId}` : "";
    if (req.method !== "OPTIONS" && url.startsWith("/api/")) {
      console.log(`[req]${idPart} ${req.method} ${url} from ${clientIp}`);
    }

    if (url.startsWith("/api/ai/") && req.method === "POST") {
      if (isAiRouteRateLimited(clientIp)) {
        res.writeHead(429);
        res.end(JSON.stringify({ ok: false, error: "Too many AI requests, try again later" }));
        return;
      }
    }

    try {
      const handled = await dispatchJsonRoutes(req, res, url, req.method || "GET");
      if (!handled) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));
      }
    } catch (err: any) {
      if (err?.message === "PAYLOAD_TOO_LARGE") {
        res.writeHead(413);
        res.end(JSON.stringify({ ok: false, error: "Request body too large" }));
        return;
      }
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message || "Internal error" }));
    }
  });

  server.listen(WALLET_PORT, "0.0.0.0", () => {
    console.log(`[WalletBackend] 🚀 服务已启动: http://0.0.0.0:${WALLET_PORT}`);
    console.log(`[WalletBackend] 运营台: http://localhost:${WALLET_PORT}/ops`);
    console.log(`[WalletBackend] AI Chat: /api/ai/chat | Intent: /api/ai/intent`);
    console.log(`[WalletBackend] 能力发现(MCP 对齐): GET http://localhost:${WALLET_PORT}/api/meta/capabilities`);
    console.log(`[WalletBackend] 健康检查: http://localhost:${WALLET_PORT}/health`);
    ensureCliHomeRoot();
    if (!OPS_ADMIN_TOKEN) {
      console.warn(
        "[WalletBackend] 运维台 Admin API 未启用：未设置 HWALLET_OPS_ADMIN_TOKEN（/ops 页面仍可打开，但「加载数据」会失败）",
      );
    }
    if (isOnchainosCliAvailable()) {
      console.log(`[WalletBackend] 📡 Agent Wallet 模式 = cli-per-user，CLI 状态根目录 = ${CLI_HOME_ROOT}`);
    } else {
      console.error(
        `[WalletBackend] ⚠️ onchainos CLI 不可用，钱包功能将无法工作。请在服务器执行: curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh`,
      );
    }
  });
}
