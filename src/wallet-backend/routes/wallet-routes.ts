import * as http from "http";
import { parseBody } from "../http-utils";
import {
  handleAddAccount,
  handleCexV5AccountBalance,
  handleGetAddressesViaProvider,
  handleGetBalance,
  handleListAccounts,
  handleSwitchAccount,
  handleWalletSendViaCli,
} from "../wallet-cli-handlers";
import { parseSwitchAccountBody, parseWalletSendBody } from "../schemas/walletDex";

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
  const isCexV5Balance = url === "/api/cex/v5/account/balance" && method === "GET";

  if (isGetAddrs) {
    const result = await handleGetAddressesViaProvider(auth);
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return true;
  }
  if (isCexV5Balance) {
    if (!auth) {
      res.writeHead(401);
      res.end(JSON.stringify({ ok: false, error: "缺少 Authorization Bearer token" }));
      return true;
    }
    const result = await handleCexV5AccountBalance(auth);
    if (!result.ok) {
      const err = String(result.error || "");
      const status = err.includes("token") || err.includes("缺少") ? 401 : err.includes("未配置") ? 503 : 400;
      res.writeHead(status);
      res.end(JSON.stringify(result));
      return true;
    }
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
    const raw = await parseBody(req);
    const parsed = parseWalletSendBody(raw);
    if (!parsed.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: parsed.error }));
      return true;
    }
    const result = await handleWalletSendViaCli(auth, parsed.data);
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
    const raw = await parseBody(req);
    const parsed = parseSwitchAccountBody(raw);
    if (!parsed.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: parsed.error }));
      return true;
    }
    const result = await handleSwitchAccount(auth, parsed.data.accountId);
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
