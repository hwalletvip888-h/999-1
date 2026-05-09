import * as http from "http";
import { CLI_HOME_ROOT } from "../config";
import { isOnchainosCliAvailable } from "../onchainos-cli";

export function tryHealthRoute(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): boolean {
  if (url !== "/health" || method !== "GET") return false;
  res.writeHead(200);
  res.end(
    JSON.stringify({
      ok: true,
      service: "h-wallet-backend",
      agentWallet: isOnchainosCliAvailable() ? "cli-per-user" : "unavailable",
      cliHomeRoot: CLI_HOME_ROOT,
      mode: "okx-agentic-real",
      ai: "deepseek+claude",
    }),
  );
  return true;
}
