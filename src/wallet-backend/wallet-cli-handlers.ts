/**
 * CLI 侧钱包 / DEX / 转账 API 实现（原 walletBackend 内聚逻辑）
 */
import * as fs from "fs";
import * as nodePath from "path";
import { homeForEmail, homeFromToken, mintSessionToken } from "./cli-home";
import {
  getCurrentWalletAddress,
  mapClientChainToCli,
  NATIVE_EVM,
  pickSignerAddressForChain,
  symbolToContract,
} from "./dex-tokens";
import { isOnchainosCliAvailable, runOnchainosJson } from "./onchainos-cli";
import { okxSignedRequest } from "./okx-http";

export async function handleSendOtp(email: string): Promise<{ ok: boolean; error?: string }> {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "邮箱格式不正确" };
  if (!isOnchainosCliAvailable()) return { ok: false, error: "服务器尚未启用钱包通道（onchainos CLI 未就绪）" };
  try {
    const home = homeForEmail(e);
    const data = runOnchainosJson(["wallet", "login", e, "--locale", "zh-CN"], home, 30_000);
    if (data?.ok === false) return { ok: false, error: data?.error || "发送验证码失败" };
    return { ok: true };
  } catch (err: any) {
    console.error(`[WalletBackend] sendOtp 异常:`, err?.message || err);
    return { ok: false, error: err?.message || "发送验证码失败" };
  }
}

export async function handleVerifyOtp(
  email: string,
  code: string,
): Promise<{
  ok: boolean;
  token?: string;
  accountId?: string;
  isNew?: boolean;
  addresses?: any;
  error?: string;
}> {
  const e = String(email || "").trim().toLowerCase();
  const c = String(code || "").trim();
  if (!e || !c) return { ok: false, error: "邮箱或验证码缺失" };
  if (!isOnchainosCliAvailable()) return { ok: false, error: "服务器尚未启用钱包通道（onchainos CLI 未就绪）" };
  try {
    const home = homeForEmail(e);
    const verifyResp = runOnchainosJson(["wallet", "verify", c], home, 60_000);
    if (verifyResp?.ok === false) return { ok: false, error: verifyResp?.error || "验证码错误或已过期" };

    const accountId = String(verifyResp?.data?.accountId || "");
    const isNew = !!verifyResp?.data?.isNew;

    let addresses: any = { evm: [], solana: [], xlayer: [] };
    try {
      const addrResp = runOnchainosJson(["wallet", "addresses"], home, 30_000);
      if (addrResp?.ok && addrResp?.data) {
        addresses = {
          evm: Array.isArray(addrResp.data.evm) ? addrResp.data.evm : [],
          solana: Array.isArray(addrResp.data.solana) ? addrResp.data.solana : [],
          xlayer: Array.isArray(addrResp.data.xlayer) ? addrResp.data.xlayer : [],
        };
      }
    } catch (err) {
      console.warn(`[WalletBackend] verify 后取地址表失败：`, (err as any)?.message);
    }

    const token = mintSessionToken(e, accountId);

    return { ok: true, token, accountId, isNew, addresses };
  } catch (err: any) {
    console.error(`[WalletBackend] verifyOtp 异常:`, err?.message || err);
    return { ok: false, error: err?.message || "验证失败" };
  }
}

export async function handleListAccounts(token: string): Promise<{
  ok: boolean;
  currentAccountId?: string;
  accounts?: Array<{ accountId: string; accountName: string; evmAddress?: string; solAddress?: string }>;
  error?: string;
}> {
  try {
    const { home } = homeFromToken(token);
    const file = nodePath.join(home, "wallets.json");
    if (!fs.existsSync(file)) return { ok: false, error: "钱包状态未初始化" };
    const w = JSON.parse(fs.readFileSync(file, "utf-8"));
    const accountsMap = (w?.accountsMap || {}) as Record<string, any>;
    const list = Object.entries(accountsMap).map(([aid, acc]) => {
      const addrs: any[] = Array.isArray(acc?.addressList) ? acc.addressList : [];
      const evm = addrs.find((a) => a?.chainName === "eth")?.address;
      const sol = addrs.find((a) => a?.chainName === "sol")?.address;
      return {
        accountId: aid,
        accountName: String(acc?.accountName || `Account ${aid.slice(0, 4)}`),
        evmAddress: evm || undefined,
        solAddress: sol || undefined,
      };
    });
    return {
      ok: true,
      currentAccountId: String(w?.selectedAccountId || ""),
      accounts: list,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "读取账户列表失败" };
  }
}

export async function handleSwitchAccount(
  token: string,
  accountId: string,
): Promise<{ ok: boolean; currentAccountId?: string; error?: string }> {
  try {
    const { home } = homeFromToken(token);
    const aid = String(accountId || "").trim();
    if (!aid) return { ok: false, error: "缺少 accountId" };
    const data = runOnchainosJson(["wallet", "switch", aid], home, 20_000);
    if (data?.ok === false) return { ok: false, error: data?.error || "切换失败" };
    const status = runOnchainosJson(["wallet", "status"], home, 10_000);
    return { ok: true, currentAccountId: String(status?.data?.currentAccountId || aid) };
  } catch (err: any) {
    return { ok: false, error: err?.message || "切换失败" };
  }
}

export async function handleAddAccount(token: string): Promise<{
  ok: boolean;
  accountId?: string;
  accountName?: string;
  error?: string;
}> {
  try {
    const { home } = homeFromToken(token);
    const data = runOnchainosJson(["wallet", "add"], home, 30_000);
    if (data?.ok === false) return { ok: false, error: data?.error || "新建账户失败" };
    return {
      ok: true,
      accountId: String(data?.data?.accountId || ""),
      accountName: String(data?.data?.accountName || ""),
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "新建账户失败" };
  }
}

export async function handleGetAddresses(token: string): Promise<{
  ok: boolean;
  addresses?: any;
  accountId?: string;
  error?: string;
}> {
  try {
    const { home, accountId } = homeFromToken(token);
    const data = runOnchainosJson(["wallet", "addresses"], home, 15_000);
    if (data?.ok === false) return { ok: false, error: data?.error || "获取地址失败" };
    const addresses = {
      evm: Array.isArray(data?.data?.evm) ? data.data.evm : [],
      solana: Array.isArray(data?.data?.solana) ? data.data.solana : [],
      xlayer: Array.isArray(data?.data?.xlayer) ? data.data.xlayer : [],
    };
    return { ok: true, addresses, accountId };
  } catch (err: any) {
    return { ok: false, error: err?.message || "获取地址失败" };
  }
}

function flattenCliBalance(d: any): any[] {
  if (!d) return [];
  if (d.details && typeof d.details === "object" && !Array.isArray(d.details)) {
    const out: any[] = [];
    for (const accId of Object.keys(d.details)) {
      const sub = d.details[accId];
      const subData = Array.isArray(sub?.data) ? sub.data : Array.isArray(sub) ? sub : [];
      for (const entry of subData) {
        const list = Array.isArray(entry?.tokenAssets) ? entry.tokenAssets : [];
        out.push(...list);
      }
    }
    return out;
  }
  if (Array.isArray(d.details)) {
    const out: any[] = [];
    for (const entry of d.details) {
      const list = Array.isArray(entry?.tokenAssets) ? entry.tokenAssets : [];
      out.push(...list);
    }
    return out;
  }
  if (Array.isArray(d.tokenAssets)) return d.tokenAssets;
  for (const k of ["tokens", "tokenList", "assetsList"]) {
    if (Array.isArray((d as any)[k])) return (d as any)[k] as any[];
  }
  return [];
}

export async function handleGetBalance(token: string): Promise<any> {
  try {
    const { home } = homeFromToken(token);
    const data = runOnchainosJson(["wallet", "balance", "--all"], home, 30_000);
    if (data?.ok === false) return { ok: false, error: data?.error || "获取资产失败" };
    const d = data?.data ?? {};

    const rawTokens = flattenCliBalance(d);
    let computedUsd = 0;
    const tokens = rawTokens
      .map((t: any) => {
        const usd = Number(t?.usdValue ?? t?.value ?? 0);
        if (Number.isFinite(usd)) computedUsd += usd;
        const rawSym = String(t?.customSymbol || t?.symbol || t?.tokenSymbol || "").trim();
        const cleanSym = rawSym.replace(/[^\x20-\x7E]/g, "").toUpperCase() || rawSym.toUpperCase();
        return {
          chainIndex: String(t?.chainIndex ?? t?.chainId ?? ""),
          symbol: cleanSym,
          amount: String(t?.balance ?? t?.amount ?? t?.coinAmount ?? "0"),
          usdValue: String(t?.usdValue ?? t?.value ?? t?.assetValue ?? "0"),
          contract: t?.tokenAddress ?? t?.tokenContractAddress ?? undefined,
        };
      })
      .filter((t: any) => Number(t.amount) > 0 || Number(t.usdValue) > 0);

    const cliTotal = d?.totalValueUsd ?? d?.totalUsd ?? d?.totalAssets ?? "";
    const totalUsd = String(cliTotal !== "" && cliTotal != null ? cliTotal : computedUsd.toFixed(2));

    return { ok: true, totalUsd, tokens, lastUpdatedAt: new Date().toISOString() };
  } catch (err: any) {
    console.error(`[WalletBackend] getBalance 异常:`, err?.message || err);
    return { ok: false, error: err?.message || "获取资产失败" };
  }
}

export async function handleSendOtpViaProvider(email: string) {
  return handleSendOtp(email);
}
export async function handleVerifyOtpViaProvider(email: string, code: string) {
  return handleVerifyOtp(email, code);
}
export async function handleGetAddressesViaProvider(token: string) {
  return handleGetAddresses(token);
}

async function handleGetBalanceViaProviderLegacy(token: string) {
  if (!token) return { ok: false, error: "缺少 token" };
  const addressesResp = await handleGetAddressesViaProvider(token);
  if (!addressesResp?.ok || !addressesResp.addresses) {
    return { ok: false, error: "获取钱包地址失败" };
  }

  const allAddresses = [
    ...(addressesResp.addresses.evm || []),
    ...(addressesResp.addresses.solana || []),
    ...(addressesResp.addresses.xlayer || []),
  ];

  const seenAddr = new Set<string>();
  const validRows = allAddresses.filter((it: any) => {
    const address = String(it?.address || "").trim();
    const chainIndex = String(it?.chainIndex || "").trim();
    if (!address || address === "N/A") return false;
    const key = `${chainIndex}:${address.toLowerCase()}`;
    if (seenAddr.has(key)) return false;
    seenAddr.add(key);
    return true;
  });
  if (!validRows.length) {
    return {
      ok: true,
      totalUsd: "0.00",
      tokens: [],
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  const chains = Array.from(
    new Set(
      validRows
        .map((it: any) => String(it?.chainIndex || "").trim())
        .filter((x: string) => !!x),
    ),
  );
  if (!chains.length) {
    return {
      ok: true,
      totalUsd: "0.00",
      tokens: [],
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  const tokens: Array<{
    chainIndex: string;
    symbol: string;
    amount: string;
    usdValue: string;
    contract?: string;
  }> = [];

  for (const row of validRows) {
    const address = String(row.address).trim();
    const path =
      `/api/v5/wallet/asset/all-token-balances-by-address?address=${encodeURIComponent(address)}` +
      `&chains=${encodeURIComponent(chains.join(","))}&filter=1`;
    try {
      const resp = await okxSignedRequest("GET", path);
      if (String(resp?.code) !== "0" || !Array.isArray(resp?.data)) continue;
      for (const group of resp.data) {
        const list = Array.isArray(group?.tokenAssets) ? group.tokenAssets : [];
        for (const t of list) {
          const balance = Number(t?.balance || 0);
          const price = Number(t?.tokenPrice || 0);
          const usd = balance * price;
          if (!Number.isFinite(balance) || balance <= 0) continue;
          tokens.push({
            chainIndex: String(t?.chainIndex ?? row.chainIndex ?? ""),
            symbol: String(t?.symbol || "").toUpperCase(),
            amount: String(t?.balance ?? "0"),
            usdValue: Number.isFinite(usd) ? usd.toFixed(2) : "0.00",
            contract: t?.tokenAddress ? String(t.tokenAddress) : undefined,
          });
        }
      }
    } catch (err) {
      console.warn(`[WalletBackend] 拉取地址余额失败: ${address}`, err);
    }
  }

  const totalUsd = tokens.reduce((sum, t) => sum + Number(t.usdValue || 0), 0);
  return {
    ok: true,
    totalUsd: totalUsd.toFixed(2),
    tokens,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export { handleGetBalanceViaProviderLegacy };

export async function handleSwapQuoteViaCli(
  token: string,
  body: {
    fromChain: string;
    fromSymbol: string;
    fromAmount: string;
    toChain: string;
    toSymbol: string;
    slippageBps?: number;
  },
) {
  if (!token) return { ok: false, error: "缺少 token" };
  if (!isOnchainosCliAvailable()) {
    return { ok: false, error: "服务器尚未启用兑换通道（onchainos CLI 未就绪），请稍后再试" };
  }
  let home: string;
  try {
    home = homeFromToken(token).home;
  } catch (err: any) {
    return { ok: false, error: err?.message || "无效 token" };
  }
  const chain = mapClientChainToCli(body.fromChain || body.toChain);
  const fromContract = symbolToContract(body.fromSymbol, body.fromChain || body.toChain);
  const toContract = symbolToContract(body.toSymbol, body.toChain || body.fromChain);
  const amount = String(body.fromAmount || "").trim();
  if (!fromContract) return { ok: false, error: `不支持的源代币 ${body.fromSymbol}（${chain}）` };
  if (!toContract) return { ok: false, error: `不支持的目标代币 ${body.toSymbol}（${chain}）` };
  if (!amount) return { ok: false, error: "金额不能为空" };
  const data = runOnchainosJson(
    ["swap", "quote", "--from", fromContract, "--to", toContract, "--readable-amount", amount, "--chain", chain],
    home,
  );
  if (data?.ok === false) return { ok: false, error: data?.error || data?.msg || "兑换报价失败" };
  const list = Array.isArray(data?.data) ? data.data : [data?.data];
  const d: any = list[0] ?? {};
  const fromTokenAmt = String(d?.fromTokenAmount ?? "");
  const toTokenAmt = String(d?.toTokenAmount ?? "");
  const fromDec = Number(d?.dexRouterList?.[0]?.fromToken?.decimal ?? 18);
  const toDec = Number(d?.dexRouterList?.[0]?.toToken?.decimal ?? 18);
  const fromAmt = fromTokenAmt ? Number(fromTokenAmt) / Math.pow(10, fromDec) : Number(amount);
  const toAmt = toTokenAmt ? Number(toTokenAmt) / Math.pow(10, toDec) : 0;
  const impactPct = Number(d?.priceImpactPercentage ?? d?.priceImpact ?? 0);
  return {
    ok: true,
    fromChain: body.fromChain,
    fromSymbol: String(body.fromSymbol || "").toUpperCase(),
    fromAmount: String(Number.isFinite(fromAmt) && fromAmt > 0 ? fromAmt : Number(amount)),
    toChain: body.toChain,
    toSymbol: String(body.toSymbol || "").toUpperCase(),
    toAmount: String(Number.isFinite(toAmt) && toAmt > 0 ? toAmt : 0),
    rate: fromAmt > 0 && toAmt > 0 ? String(toAmt / fromAmt) : "0",
    routerLabel:
      Array.isArray(d?.dexRouterList) && d.dexRouterList.length
        ? d.dexRouterList.map((x: any) => x?.dexProtocol?.dexName ?? x?.dexName).filter(Boolean).join(" / ")
        : "OKX DEX Aggregator",
    estimatedGasUsd: String(d?.tradeFee ?? d?.estimateGasFee ?? "0"),
    slippageBps: Number(body.slippageBps ?? 50),
    priceImpactBps: Math.round((Number.isFinite(impactPct) ? impactPct : 0) * 100),
  };
}

export async function handleSwapExecuteViaCli(
  token: string,
  body: {
    fromChain: string;
    fromSymbol: string;
    fromAmount: string;
    toChain: string;
    toSymbol: string;
    slippageBps?: number;
  },
) {
  if (!token) return { ok: false, error: "缺少 token" };
  if (!isOnchainosCliAvailable()) {
    return { ok: false, error: "服务器尚未启用兑换通道（onchainos CLI 未就绪），请稍后再试" };
  }
  let home: string;
  try {
    home = homeFromToken(token).home;
  } catch (err: any) {
    return { ok: false, error: err?.message || "无效 token" };
  }
  const chain = mapClientChainToCli(body.fromChain || body.toChain);
  const fromContract = symbolToContract(body.fromSymbol, body.fromChain || body.toChain);
  const toContract = symbolToContract(body.toSymbol, body.toChain || body.fromChain);
  const amount = String(body.fromAmount || "").trim();
  if (!fromContract) return { ok: false, error: `不支持的源代币 ${body.fromSymbol}（${chain}）` };
  if (!toContract) return { ok: false, error: `不支持的目标代币 ${body.toSymbol}（${chain}）` };
  if (!amount) return { ok: false, error: "金额不能为空" };

  const walletAddr = getCurrentWalletAddress(home, body.fromChain || body.toChain);
  if (!walletAddr) return { ok: false, error: "无法获取当前钱包地址，请重新登录" };

  const args = [
    "swap",
    "execute",
    "--from",
    fromContract,
    "--to",
    toContract,
    "--readable-amount",
    amount,
    "--chain",
    chain,
    "--wallet",
    walletAddr,
    "--force",
  ];
  if (typeof body.slippageBps === "number" && body.slippageBps > 0) {
    args.push("--slippage", String(body.slippageBps / 100));
  }
  const data = runOnchainosJson(args, home, 120_000);
  if (data?.ok === false) return { ok: false, error: data?.error || data?.msg || "兑换提交失败" };
  const d = data?.data ?? data ?? {};
  const txHash = String(d?.swapTxHash ?? d?.txHash ?? "");
  if (!txHash) return { ok: false, error: "未返回交易哈希" };
  return { ok: true, txHash, status: "submitted" };
}

export async function handleWalletSendViaCli(
  token: string,
  body: { chain: string; symbol: string; toAddress: string; amount: string; tokenAddress?: string },
) {
  if (!token) return { ok: false, error: "缺少 token" };
  if (!isOnchainosCliAvailable()) {
    return { ok: false, error: "服务器尚未启用转账通道（onchainos CLI 未就绪），请稍后再试" };
  }
  let home: string;
  try {
    home = homeFromToken(token).home;
  } catch (err: any) {
    return { ok: false, error: err?.message || "无效 token" };
  }
  const chain = mapClientChainToCli(body.chain);
  const amount = String(body.amount || "").trim();
  const toAddress = String(body.toAddress || "").trim();
  if (!amount || !toAddress) return { ok: false, error: "参数不完整" };
  const args = ["wallet", "send", "--readable-amount", amount, "--recipient", toAddress, "--chain", chain, "--force"];
  const symbol = String(body.symbol || "").toUpperCase();
  const tokenAddrIn = String(body.tokenAddress || "").trim();
  const isNative = ["ETH", "OKB", "BNB", "MATIC", "SOL"].includes(symbol);
  if (!isNative) {
    const fromBody = tokenAddrIn && tokenAddrIn !== NATIVE_EVM ? tokenAddrIn : "";
    const fromMap = symbolToContract(symbol, body.chain);
    const contract = fromBody || (fromMap && fromMap !== NATIVE_EVM ? fromMap : "");
    if (!contract) {
      return {
        ok: false,
        error: `无法在 ${chain} 上解析 ${symbol} 的合约地址（请先从 App 选择该币再转，或在请求里带上 tokenAddress）`,
      };
    }
    args.push("--contract-token", contract);
  }
  const fromAddr = pickSignerAddressForChain(home, body.chain);
  if (!fromAddr) {
    return { ok: false, error: "无法获取发送地址：钱包地址列表异常，请在 App 中刷新后再试或重新登录" };
  }
  args.push("--from", fromAddr);

  const data = runOnchainosJson(args, home, 90_000);
  if (data?.ok === false) {
    const msg = String(data?.error || data?.message || data?.msg || "").trim() || "转账失败";
    console.error("[wallet/send] CLI error", {
      chain: body.chain,
      symbol: body.symbol,
      amount: body.amount,
      recipient: String(body.toAddress || "").slice(0, 10) + "…",
      tokenAddress: body.tokenAddress,
      fromPreview: `${fromAddr.slice(0, 8)}…`,
      detail: msg,
    });
    return { ok: false, error: msg };
  }
  const d = data?.data ?? data ?? {};
  const txHash = String(d?.txHash || "");
  if (!txHash) return { ok: false, error: d?.error || "未返回交易哈希" };
  return { ok: true, txHash, status: "submitted" };
}
