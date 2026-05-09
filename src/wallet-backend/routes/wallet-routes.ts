import * as http from "http";
import { parseBody } from "../http-utils";
import {
  handleAddAccount,
  handleGetAddressesViaProvider,
  handleGetBalance,
  handleListAccounts,
  handleSwitchAccount,
  handleWalletSendViaCli,
} from "../wallet-cli-handlers";

export async function tryWalletRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  const auth = (req.headers.authorization || "").replace("Bearer ", "");

  const isGetAddrs =
    (url === "/api/wallet/addresses" || url === "/api/agent-wallet/addresses") && method === "GET";
  const isGetBalance =
    (url === "/api/v6/wallet/portfolio" ||
      url === "/api/agent-wallet/balance" ||
      url === "/api/wallet/balance") &&
    method === "GET";
  const isWalletSend = url === "/api/v6/wallet/send" && method === "POST";
  const isListAccounts = url === "/api/wallet/accounts" && method === "GET";
  const isSwitchAccount = url === "/api/wallet/accounts/switch" && method === "POST";
  const isAddAccount = url === "/api/wallet/accounts/add" && method === "POST";

  if (isGetAddrs) {
    const result = await handleGetAddressesViaProvider(auth);
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return true;
  }
  if (isGetBalance) {
    const result = await handleGetBalance(auth);
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return true;
  }
  if (isWalletSend) {
    const body = await parseBody(req);
    const result = await handleWalletSendViaCli(auth, body);
    if (!result?.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: result?.error || "wallet send failed" }));
      return true;
    }
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return true;
  }
  if (isListAccounts) {
    const result = await handleListAccounts(auth);
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return true;
  }
  if (isSwitchAccount) {
    const body = await parseBody(req);
    const result = await handleSwitchAccount(auth, body?.accountId);
    res.writeHead(result.ok ? 200 : 400);
    res.end(JSON.stringify(result));
    return true;
  }
  if (isAddAccount) {
    const result = await handleAddAccount(auth);
    res.writeHead(result.ok ? 200 : 400);
    res.end(JSON.stringify(result));
    return true;
  }
  return false;
}
