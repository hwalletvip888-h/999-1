import * as http from "http";
import { tryAdminRoutes } from "./admin-routes";
import { tryAiRoutes } from "./ai-routes";
import { tryAuthRoutes } from "./auth-routes";
import { tryDexRoutes } from "./dex-routes";
import { tryHealthRoute } from "./health-route";
import { tryMetaRoutes } from "./meta-routes";
import { tryWalletRoutes } from "./wallet-routes";

/**
 * 依次匹配 JSON API；已处理则返回 true（响应已写入）。
 * 顺序：Meta（能力发现）→ Admin → Auth → Wallet → DEX → AI → Health
 */
export async function dispatchJsonRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  if (tryMetaRoutes(req, res, url, method)) return true;
  if (await tryAdminRoutes(req, res, url, method)) return true;
  if (await tryAuthRoutes(req, res, url, method)) return true;
  if (await tryWalletRoutes(req, res, url, method)) return true;
  if (await tryDexRoutes(req, res, url, method)) return true;
  if (await tryAiRoutes(req, res, url, method)) return true;
  if (tryHealthRoute(req, res, url, method)) return true;
  return false;
}
