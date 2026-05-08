/**
 * WalletBackend — H Wallet 后端服务
 *
 * 通过 IAgentWalletProvider 抽象选择两种实现：
 *   - OnchainosCliAgentWalletProvider（默认，按用户决策）
 *     · 服务器装 `pip install onchainos`
 *     · shell-out 调 `onchainos wallet login/verify/addresses`
 *   - OkxHttpAgentWalletProvider（fallback）
 *     · 直接打 OKX priapi/v5/wallet/agentic/* HTTP 接口
 *     · CLI 不可用时自动启用
 *
 * 暴露端点：
 *   - POST /api/auth/send-otp           （旧端点，向后兼容）
 *   - POST /api/auth/verify-otp         （旧端点）
 *   - POST /api/agent-wallet/send-code  （onchainos-skills 推荐）
 *   - POST /api/agent-wallet/verify     （onchainos-skills 推荐）
 *   - GET  /api/wallet/addresses        （刷新地址表）
 *   - GET  /health
 *   - POST /api/ai/chat       /api/ai/intent
 */
import * as http from "http";
import { chatWithAI, recognizeIntent } from "./aiChat";
import * as crypto from 'crypto';
import { execFileSync } from "child_process";
import { OkxHttpAgentWalletProvider, getAgentWalletProvider } from "./agentWalletProviders";

/** 邮箱 OTP 会话 token 内含 accessToken 时：必须用 Agentic HTTP，不能用本机 CLI（与用户无关） */
function sessionTokenHasAccessToken(token: string): boolean {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString()) as { accessToken?: string };
    return !!decoded?.accessToken;
  } catch {
    return false;
  }
}

const PORT = parseInt(process.env.WALLET_PORT || '3100');
const OKX_API_KEY = process.env.OKX_API_KEY || '';
const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY || '';
const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE || '';
const OKX_PROJECT_ID = process.env.OKX_PROJECT_ID || '';
const OKX_BASE_URL = 'https://web3.okx.com';
const CLIENT_VERSION = '3.0.0';

// ─── OKX API 签名（用于 WaaS 接口） ─────────────────────────────────
function signRequest(timestamp: string, method: string, path: string, body: string): string {
  const signStr = `${timestamp}${method}${path}${body}`;
  return crypto.createHmac('sha256', OKX_SECRET_KEY).update(signStr).digest('base64');
}

async function okxRequest(method: string, path: string, body?: any): Promise<any> {
  const timestamp = new Date().toISOString().replace(/\d{3}Z$/, '000Z');
  const bodyStr = body ? JSON.stringify(body) : '';
  const sign = signRequest(timestamp, method, path, bodyStr);
  const url = `${OKX_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': OKX_API_KEY,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': OKX_PASSPHRASE,
    'OK-ACCESS-PROJECT': OKX_PROJECT_ID,
  };
  const response = await fetch(url, {
    method,
    headers,
    body: bodyStr || undefined,
  });
  return response.json();
}

// ─── OKX Agentic Wallet 公开接口（不需要 API Key 签名） ─────────────
async function okxAgenticPublic(path: string, body: any): Promise<any> {
  const url = `${OKX_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'ok-client-version': CLIENT_VERSION,
    'Ok-Access-Client-type': 'agent-cli',
  };
  console.log(`[WalletBackend] POST ${path}`, JSON.stringify(body));
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const result = await response.json();
  console.log(`[WalletBackend] Response:`, JSON.stringify(result));
  return result;
}

// ─── 临时密钥对生成 ─────────────────────────────────────────────
function generateTempKeyPair(): { privateKey: string; publicKey: string } {
  // 生成 32 字节随机密钥作为临时公钥
  // OKX 会用它来加密 session key（HPKE）
  const privateKeyBytes = crypto.randomBytes(32);
  const publicKeyBytes = crypto.randomBytes(32);
  return {
    privateKey: privateKeyBytes.toString('base64'),
    publicKey: publicKeyBytes.toString('base64'),
  };
}

// ─── OTP 会话管理 ─────────────────────────────────────────────
interface OtpSession {
  email: string;
  flowId: string;
  tempPrivateKey: string;
  tempPublicKey: string;
  expiresAt: number;
  attempts: number;
}

const otpSessions = new Map<string, OtpSession>();

/** 当前服务器是否安装了 onchainos CLI；缓存结果避免每次重 spawn */
let _onchainosCliAvailable: boolean | null = null;
function isOnchainosCliAvailable(): boolean {
  if (_onchainosCliAvailable !== null) return _onchainosCliAvailable;
  try {
    execFileSync("onchainos", ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
    });
    _onchainosCliAvailable = true;
  } catch {
    _onchainosCliAvailable = false;
  }
  return _onchainosCliAvailable;
}

function runOnchainosJson(args: string[]): any {
  const out = execFileSync("onchainos", args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000
  });
  const trimmed = String(out || "").trim();
  const first = trimmed.indexOf("{");
  const json = first >= 0 ? trimmed.slice(first) : trimmed;
  return JSON.parse(json);
}

function mapClientChainToCli(chain: string): string {
  const v = String(chain || "").toLowerCase();
  if (v === "xlayer") return "xlayer";
  if (v === "solana") return "solana";
  if (v === "base") return "base";
  if (v === "arbitrum") return "arbitrum";
  if (v === "bsc") return "bsc";
  if (v === "polygon") return "polygon";
  return "ethereum";
}

function mapSymbolToSwapToken(symbol: string): string {
  const s = String(symbol || "").toLowerCase();
  if (!s) return s;
  if (["usdt", "usdc", "eth", "sol", "okb", "bnb", "matic", "avax", "dai", "weth", "wbtc"].includes(s)) return s;
  return s;
}

function pickWalletAddressByChain(addresses: any, chain: string): string {
  const cliChain = mapClientChainToCli(chain);
  if (cliChain === "solana") {
    const a = addresses?.solana?.[0]?.address;
    return a && a !== "N/A" ? String(a) : "";
  }
  if (cliChain === "xlayer") {
    const a = addresses?.xlayer?.[0]?.address || addresses?.evm?.[0]?.address;
    return a && a !== "N/A" ? String(a) : "";
  }
  const a = addresses?.evm?.[0]?.address;
  return a && a !== "N/A" ? String(a) : "";
}

// ─── API 处理函数 ─────────────────────────────────────────────

/**
 * 发送 OTP — 委托给 IAgentWalletProvider
 * 优先 onchainos CLI；不可用时回退到 OKX priapi HTTP 调用
 */
async function handleSendOtpViaProvider(email: string): Promise<{ ok: boolean; error?: string }> {
  const provider = await getAgentWalletProvider();
  return provider.sendOtp(email);
}

async function handleVerifyOtpViaProvider(email: string, code: string) {
  const provider = await getAgentWalletProvider();
  return provider.verifyOtp(email, code);
}

async function handleGetAddressesViaProvider(token: string) {
  if (sessionTokenHasAccessToken(token)) {
    return new OkxHttpAgentWalletProvider().getAddresses(token);
  }
  const provider = await getAgentWalletProvider();
  return provider.getAddresses(token);
}

async function handleGetBalanceViaProvider(token: string) {
  if (!token) {
    return { ok: false, error: "缺少 token" };
  }
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
      const resp = await okxRequest("GET", path);
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

async function handleSwapQuoteViaCli(
  token: string,
  body: { fromChain: string; fromSymbol: string; fromAmount: string; toChain: string; toSymbol: string; slippageBps?: number }
) {
  if (!token) return { ok: false, error: "缺少 token" };
  if (!isOnchainosCliAvailable()) {
    return { ok: false, error: "服务器尚未启用兑换通道（onchainos CLI 未就绪），请稍后再试" };
  }
  const chain = mapClientChainToCli(body.fromChain || body.toChain);
  const fromToken = mapSymbolToSwapToken(body.fromSymbol);
  const toToken = mapSymbolToSwapToken(body.toSymbol);
  const amount = String(body.fromAmount || "").trim();
  if (!fromToken || !toToken || !amount) return { ok: false, error: "参数不完整" };
  const data = runOnchainosJson([
    "swap", "quote",
    "--from", fromToken,
    "--to", toToken,
    "--readable-amount", amount,
    "--chain", chain
  ]);
  const d = data?.data ?? data ?? {};
  const toAmt = Number(d?.toAmount ?? d?.toTokenAmount ?? 0);
  const fromAmt = Number(d?.fromAmount ?? d?.fromTokenAmount ?? amount);
  const impactPct = Number(d?.priceImpact ?? d?.priceImpactPercent ?? d?.priceImpactPercentage ?? 0);
  return {
    ok: true,
    fromChain: body.fromChain,
    fromSymbol: String(body.fromSymbol || "").toUpperCase(),
    fromAmount: String(Number.isFinite(fromAmt) && fromAmt > 0 ? fromAmt : Number(amount)),
    toChain: body.toChain,
    toSymbol: String(body.toSymbol || "").toUpperCase(),
    toAmount: String(Number.isFinite(toAmt) && toAmt > 0 ? toAmt : 0),
    rate: fromAmt > 0 && toAmt > 0 ? String(toAmt / fromAmt) : "0",
    routerLabel: Array.isArray(d?.dexRouterList) && d.dexRouterList.length
      ? d.dexRouterList.map((x: any) => x?.dexName).filter(Boolean).join(" / ")
      : "OKX DEX Aggregator",
    estimatedGasUsd: String(d?.tradeFee ?? d?.estimateGasFee ?? "0"),
    slippageBps: Number(body.slippageBps ?? 50),
    priceImpactBps: Math.round((Number.isFinite(impactPct) ? impactPct : 0) * 100)
  };
}

async function handleSwapExecuteViaCli(
  token: string,
  body: { fromChain: string; fromSymbol: string; fromAmount: string; toChain: string; toSymbol: string; slippageBps?: number }
) {
  if (!isOnchainosCliAvailable()) {
    return { ok: false, error: "服务器尚未启用兑换通道（onchainos CLI 未就绪），请稍后再试" };
  }
  const addressesResp = await handleGetAddressesViaProvider(token);
  if (!addressesResp?.ok || !addressesResp?.addresses) return { ok: false, error: "获取钱包地址失败" };
  const chain = mapClientChainToCli(body.fromChain || body.toChain);
  const wallet = pickWalletAddressByChain(addressesResp.addresses, chain);
  if (!wallet) return { ok: false, error: "未找到可用钱包地址" };
  const fromToken = mapSymbolToSwapToken(body.fromSymbol);
  const toToken = mapSymbolToSwapToken(body.toSymbol);
  const amount = String(body.fromAmount || "").trim();
  const args = [
    "swap", "execute",
    "--from", fromToken,
    "--to", toToken,
    "--readable-amount", amount,
    "--chain", chain,
    "--wallet", wallet
  ];
  if (typeof body.slippageBps === "number" && body.slippageBps > 0) {
    args.push("--slippage", String(body.slippageBps / 100));
  }
  const data = runOnchainosJson(args);
  const d = data?.data ?? data ?? {};
  const txHash = String(d?.swapTxHash ?? d?.txHash ?? "");
  if (!txHash) return { ok: false, error: "未返回交易哈希" };
  return { ok: true, txHash, status: "submitted" };
}

async function handleWalletSendViaCli(
  token: string,
  body: { chain: string; symbol: string; toAddress: string; amount: string; tokenAddress?: string }
) {
  if (!token) return { ok: false, error: "缺少 token" };
  if (!isOnchainosCliAvailable()) {
    return { ok: false, error: "服务器尚未启用转账通道（onchainos CLI 未就绪），请稍后再试" };
  }
  const chain = mapClientChainToCli(body.chain);
  const amount = String(body.amount || "").trim();
  const toAddress = String(body.toAddress || "").trim();
  if (!amount || !toAddress) return { ok: false, error: "参数不完整" };
  const args = [
    "wallet", "send",
    "--readable-amount", amount,
    "--recipient", toAddress,
    "--chain", chain
  ];
  const symbol = String(body.symbol || "").toUpperCase();
  const tokenAddress = String(body.tokenAddress || "").trim();
  const isNative = ["ETH", "OKB", "BNB", "MATIC", "SOL"].includes(symbol);
  if (!isNative) {
    if (tokenAddress) {
      args.push("--contract-token", tokenAddress);
    } else if (symbol === "USDT") {
      const usdtByChain: Record<string, string> = {
        ethereum: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        bsc: "0x55d398326f99059ff775485246999027b3197955",
        polygon: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
        arbitrum: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
        base: "0xf55bec9cafdbe8730f096aa55dad6d22d44099df",
        xlayer: "0x779ded0c9e1022225f8e0630b35a9b54be713736"
      };
      if (usdtByChain[chain]) args.push("--contract-token", usdtByChain[chain]);
    } else if (symbol === "USDC") {
      const usdcByChain: Record<string, string> = {
        ethereum: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        bsc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
        polygon: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
        arbitrum: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        base: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        xlayer: "0x74b7f16337b8972027f6196a17a631ac6de26d22"
      };
      if (usdcByChain[chain]) args.push("--contract-token", usdcByChain[chain]);
    }
  }
  const data = runOnchainosJson(args);
  const d = data?.data ?? data ?? {};
  const txHash = String(d?.txHash || "");
  if (!txHash) return { ok: false, error: d?.error || "未返回交易哈希" };
  return { ok: true, txHash, status: "submitted" };
}

// ─── 旧实现（已被 provider 替代，保留作为 HTTP 实现的 in-line 参考） ──
// （下面的 handleSendOtp / handleVerifyOtp / handleGetAddresses 已被路由 不再调用）

/**
 * 发送 OTP — 调用 OKX Agentic Wallet 真实 API
 * OKX 会发送验证码到用户邮箱
 */
async function handleSendOtp(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!email || !email.includes('@')) {
    return { ok: false, error: '请输入有效的邮箱地址' };
  }

  try {
    // 调用 OKX Agentic Wallet auth/init 接口
    const result = await okxAgenticPublic('/priapi/v5/wallet/agentic/auth/init', {
      email,
      locale: 'zh-CN',
    });

    if (result.code === '0' && result.data?.[0]?.flowId) {
      const flowId = result.data[0].flowId;
      const keyPair = generateTempKeyPair();

      otpSessions.set(email, {
        email,
        flowId,
        tempPrivateKey: keyPair.privateKey,
        tempPublicKey: keyPair.publicKey,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
      });

      console.log(`[WalletBackend] ✅ OTP 已发送到 ${email}, flowId: ${flowId}`);
      return { ok: true };
    } else {
      const errMsg = result.msg || result.error || '发送验证码失败';
      console.error(`[WalletBackend] ❌ OTP 发送失败:`, result);
      return { ok: false, error: errMsg };
    }
  } catch (err: any) {
    console.error(`[WalletBackend] ❌ OTP 请求异常:`, err);
    return { ok: false, error: err.message || '网络请求失败' };
  }
}

/**
 * 验证 OTP — 调用 OKX Agentic Wallet 真实 API
 * 验证成功后自动创建钱包（如果是新用户）
 */
async function handleVerifyOtp(email: string, code: string): Promise<{
  ok: boolean;
  token?: string;
  accountId?: string;
  isNew?: boolean;
  addresses?: any;
  error?: string;
}> {
  const session = otpSessions.get(email);
  if (!session) {
    return { ok: false, error: '请先发送验证码' };
  }

  if (Date.now() > session.expiresAt) {
    otpSessions.delete(email);
    return { ok: false, error: '验证码已过期，请重新发送' };
  }

  session.attempts++;
  if (session.attempts > 5) {
    otpSessions.delete(email);
    return { ok: false, error: '验证次数过多，请重新发送' };
  }

  try {
    // 调用 OKX Agentic Wallet auth/verify 接口
    const result = await okxAgenticPublic('/priapi/v5/wallet/agentic/auth/verify', {
      email,
      flowId: session.flowId,
      otp: code,
      tempPubKey: session.tempPublicKey,
    });

    if (result.code === '0' && result.data?.[0]) {
      const verifyData = result.data[0];
      const accountId = verifyData.accountId || '';
      const accessToken = verifyData.accessToken || '';

      otpSessions.delete(email);

      // 解析 OKX 返回的 addressesList
      const rawAddresses = verifyData.addressList || [];
      const evmAddresses: any[] = [];
      const solanaAddresses: any[] = [];
      const xlayerAddresses: any[] = [];
      for (const addr of rawAddresses) {
        const item = { chainIndex: String(addr.chainIndex), chainName: addr.chainName, address: addr.address };
        if (addr.chainIndex === 501) { solanaAddresses.push(item); }
        else if (addr.chainIndex === 196) { xlayerAddresses.push(item); evmAddresses.push(item); }
        else { evmAddresses.push(item); }
      }
      const addresses = {
        evm: evmAddresses.length > 0 ? evmAddresses : [{ chainIndex: "1", chainName: "Ethereum", address: "N/A" }],
        solana: solanaAddresses.length > 0 ? solanaAddresses : [{ chainIndex: "501", chainName: "Solana", address: "N/A" }],
        xlayer: xlayerAddresses.length > 0 ? xlayerAddresses : [{ chainIndex: "196", chainName: "X Layer", address: "N/A" }],
      };

      const token = Buffer.from(JSON.stringify({
        email, accountId, accessToken,
        teeId: verifyData.teeId || "", projectId: verifyData.projectId || "",
        createdAt: Date.now(),
      })).toString("base64");

      return { ok: true, token, accountId, isNew: verifyData.isNew !== false, addresses };
    } else {
      const errMsg = result.msg || result.error || '验证码错误';
      console.error(`[WalletBackend] ❌ OTP 验证失败:`, result);
      return { ok: false, error: errMsg };
    }
  } catch (err: any) {
    console.error(`[WalletBackend] ❌ OTP 验证异常:`, err);
    return { ok: false, error: err.message || '验证请求失败' };
  }
}

/**
 * 获取钱包地址
 */
async function handleGetAddresses(token: string): Promise<{ ok: boolean; addresses?: any; accountId?: string }> {
  if (!token) {
    return { ok: false };
  }
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const { accountId, accessToken } = decoded;

    if (accountId && accessToken) {
      try {
        const url = `${OKX_BASE_URL}/priapi/v5/wallet/agentic/account/addresses`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'ok-client-version': CLIENT_VERSION,
            'Ok-Access-Client-type': 'agent-cli',
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        const result = await response.json();
        if (result.code === '0' && result.data) {
          return { ok: true, addresses: result.data, accountId };
        }
      } catch (err) {
        console.warn('[WalletBackend] 获取地址失败:', err);
      }
    }

    return { ok: true, accountId: accountId || '', addresses: null };
  } catch {
    return { ok: false };
  }
}
// ─── HTTP 服务器 ─────────────────────────────────────────────
function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const rawUrl = req.url || "";
  const url = rawUrl.split("?")[0] || rawUrl;
  res.setHeader('Content-Type', 'application/json');

  try {
    // 旧端点：/api/auth/* | 新端点（onchainos-skills 推荐）：/api/agent-wallet/*
    const isSendOtp =
      (url === '/api/auth/send-otp' || url === '/api/agent-wallet/send-code') && req.method === 'POST';
    const isVerifyOtp =
      (url === '/api/auth/verify-otp' || url === '/api/agent-wallet/verify') && req.method === 'POST';
    const isGetAddrs =
      (url === '/api/wallet/addresses' || url === '/api/agent-wallet/addresses') && req.method === 'GET';
    const isGetBalance =
      (url === '/api/v6/wallet/portfolio' || url === '/api/agent-wallet/balance' || url === '/api/wallet/balance') && req.method === 'GET';
    const isSwapQuote = url === '/api/v6/dex/swap-quote' && req.method === 'POST';
    const isSwapExecute = url === '/api/v6/dex/swap-execute' && req.method === 'POST';
    const isWalletSend = url === '/api/v6/wallet/send' && req.method === 'POST';

    if (isSendOtp) {
      const body = await parseBody(req);
      const result = await handleSendOtpViaProvider(body.email);
      res.writeHead(200);
      res.end(JSON.stringify(result));

    } else if (isVerifyOtp) {
      const body = await parseBody(req);
      const result = await handleVerifyOtpViaProvider(body.email, body.code);
      res.writeHead(200);
      res.end(JSON.stringify(result));

    } else if (isGetAddrs) {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const result = await handleGetAddressesViaProvider(token);
      res.writeHead(200);
      res.end(JSON.stringify(result));

    } else if (isGetBalance) {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const result = await handleGetBalanceViaProvider(token);
      res.writeHead(200);
      res.end(JSON.stringify(result));

    } else if (isSwapQuote) {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const body = await parseBody(req);
      const result = await handleSwapQuoteViaCli(token, body);
      if (!result?.ok) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: result?.error || 'swap quote failed' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(result));

    } else if (isSwapExecute) {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const body = await parseBody(req);
      const result = await handleSwapExecuteViaCli(token, body);
      if (!result?.ok) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: result?.error || 'swap execute failed' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(result));

    } else if (isWalletSend) {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const body = await parseBody(req);
      const result = await handleWalletSendViaCli(token, body);
      if (!result?.ok) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: result?.error || 'wallet send failed' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(result));

    } else if (url === '/api/ai/chat' && req.method === 'POST') {
      const body = await parseBody(req);
      const { messages = [], message } = body;
      if (!message) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'message is required' }));
        return;
      }
      const reply = await chatWithAI(messages, message);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, reply }));

    } else if (url === '/api/ai/intent' && req.method === 'POST') {
      const body = await parseBody(req);
      const { message } = body;
      if (!message) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'message is required' }));
        return;
      }
      const intent = await recognizeIntent(message);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, intent }));

    } else if (url === '/health') {
      const provider = await getAgentWalletProvider();
      res.writeHead(200);
      res.end(JSON.stringify({
        ok: true,
        service: 'h-wallet-backend',
        agentWallet: provider.id, // 'cli' | 'http'
        mode: 'okx-agentic-real',
        ai: 'deepseek+claude'
      }));

    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message || 'Internal error' }));
  }
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`[WalletBackend] 🚀 服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`[WalletBackend] AI Chat: /api/ai/chat | Intent: /api/ai/intent`);
  console.log(`[WalletBackend] 健康检查: http://localhost:${PORT}/health`);
  // 启动时探测 Agent Wallet provider，将选择结果写到日志
  try {
    const provider = await getAgentWalletProvider();
    console.log(`[WalletBackend] 📡 Agent Wallet 提供方 = ${provider.id} ${provider.id === 'cli' ? '(onchainos CLI)' : '(OKX priapi HTTP fallback)'}`);
  } catch (err: any) {
    console.error(`[WalletBackend] ⚠️ Agent Wallet provider 初始化失败：${err.message}`);
  }
});
