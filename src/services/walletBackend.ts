/**
 * WalletBackend — H Wallet 后端服务
 *
 * 架构（多用户 CLI per-user 隔离）：
 *   - 服务器装 onchainos CLI（v3.1.3+）
 *   - 每个登录的 App 用户分配独立的 CLI 状态目录：
 *     ONCHAINOS_HOME=$HWALLET_CLI_HOME_ROOT/<sha256(email)[:16]>
 *   - 登录态、TEE session key、wallets.json 全部存在该目录里，互相隔离
 *   - 后端把 App 的 session token 解码出 email → 派生该用户的 ONCHAINOS_HOME → spawn CLI
 *   - 所有钱包操作（OTP 发码 / 验码 / 余额 / 地址 / 转账 / 兑换）都走 CLI，
 *     OKX 官方 CLI 负责 HPKE / EdDSA / TEE session 全套加密细节
 *
 * 端点：
 *   - POST /api/auth/send-otp           { email } → 发码到邮箱
 *   - POST /api/auth/verify-otp         { email, code } → 返回 session token + 地址
 *   - POST /api/agent-wallet/send-code  （旧端点别名）
 *   - POST /api/agent-wallet/verify     （旧端点别名）
 *   - GET  /api/wallet/addresses        Authorization: Bearer <token>
 *   - GET  /api/v6/wallet/portfolio     Authorization: Bearer <token>
 *   - POST /api/v6/wallet/send          { token, chain, symbol, toAddress, amount, tokenAddress? }
 *   - POST /api/v6/dex/swap-quote       { token, fromChain, fromSymbol, fromAmount, toChain, toSymbol, slippageBps? }
 *   - POST /api/v6/dex/swap-execute     { token, fromChain, fromSymbol, fromAmount, toChain, toSymbol, slippageBps? }
 *   - POST /api/ai/chat | /api/ai/intent
 *   - GET  /health
 */
import * as http from "http";
import * as fs from "fs";
import * as nodePath from "path";
import { chatWithAI, recognizeIntent } from "./aiChat";
import * as crypto from 'crypto';
import { execFileSync } from "child_process";

// ─── per-user CLI 隔离 ───────────────────────────────────────────────
const CLI_HOME_ROOT = process.env.HWALLET_CLI_HOME_ROOT || "/var/lib/h-wallet/cli";

function ensureCliHomeRoot(): void {
  try { fs.mkdirSync(CLI_HOME_ROOT, { recursive: true, mode: 0o700 }); } catch { /* ignore */ }
}

function emailToHash(email: string): string {
  return crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex").slice(0, 16);
}

function homeForEmail(email: string): string {
  ensureCliHomeRoot();
  const dir = nodePath.join(CLI_HOME_ROOT, emailToHash(email));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

interface DecodedToken { email: string; accountId: string; createdAt: number }

function decodeSessionToken(token: string): DecodedToken {
  if (!token) throw new Error("缺少 token");
  let raw: string;
  try { raw = Buffer.from(token, "base64").toString(); } catch { throw new Error("无效 token"); }
  let obj: any;
  try { obj = JSON.parse(raw); } catch { throw new Error("无效 token"); }
  const email = String(obj?.email || "").trim().toLowerCase();
  if (!email) throw new Error("token 缺少 email");
  return { email, accountId: String(obj?.accountId || ""), createdAt: Number(obj?.createdAt || 0) };
}

function homeFromToken(token: string): { home: string; email: string; accountId: string } {
  const t = decodeSessionToken(token);
  return { home: homeForEmail(t.email), email: t.email, accountId: t.accountId };
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

/**
 * 调用 onchainos CLI 并解析输出 JSON。CLI 默认就是 JSON 输出。
 * - home: 当传入时设置 ONCHAINOS_HOME，让 CLI 在该用户专属的 sandbox 里读写状态
 * - 即使 CLI 退出码非 0，也尝试解析 stdout 中的错误 JSON（CLI 失败时仍会输出 {ok:false,error}）
 */
function runOnchainosJson(args: string[], home?: string, timeoutMs = 60_000): any {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (home) env.ONCHAINOS_HOME = home;
  let stdout = "";
  let stderr = "";
  try {
    stdout = execFileSync("onchainos", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      env,
    });
  } catch (err: any) {
    stdout = err?.stdout?.toString() || "";
    stderr = err?.stderr?.toString() || "";
  }
  const trimmed = String(stdout || "").trim();
  const first = trimmed.indexOf("{");
  const jsonStr = first >= 0 ? trimmed.slice(first) : trimmed;
  if (!jsonStr) {
    throw new Error(stderr.trim() || "onchainos CLI 无输出");
  }
  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error(stderr.trim() || trimmed || "onchainos CLI 输出解析失败");
  }
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

// ─── API 处理函数（CLI per-user） ──────────────────────────────────

/** 发送邮箱 OTP — 调用 `onchainos wallet login <email>`，CLI 走 priapi/auth/init */
async function handleSendOtp(email: string): Promise<{ ok: boolean; error?: string }> {
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

/** 校验邮箱 OTP — 调用 `onchainos wallet verify <code>`，成功后取地址表，构造 session token */
async function handleVerifyOtp(email: string, code: string): Promise<{
  ok: boolean; token?: string; accountId?: string; isNew?: boolean; addresses?: any; error?: string;
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

    const token = Buffer.from(JSON.stringify({
      email: e, accountId, createdAt: Date.now(),
    })).toString("base64");

    return { ok: true, token, accountId, isNew, addresses };
  } catch (err: any) {
    console.error(`[WalletBackend] verifyOtp 异常:`, err?.message || err);
    return { ok: false, error: err?.message || "验证失败" };
  }
}

/** 列出该邮箱下所有子账户（直接读 CLI 的 wallets.json 状态文件，最快） */
async function handleListAccounts(token: string): Promise<{
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

/** 切换激活子账户 */
async function handleSwitchAccount(token: string, accountId: string): Promise<{
  ok: boolean; currentAccountId?: string; error?: string;
}> {
  try {
    const { home } = homeFromToken(token);
    const aid = String(accountId || "").trim();
    if (!aid) return { ok: false, error: "缺少 accountId" };
    const data = runOnchainosJson(["wallet", "switch", aid], home, 20_000);
    if (data?.ok === false) return { ok: false, error: data?.error || "切换失败" };
    // 切换后可能 wallets.json 已更新，再校验一次
    const status = runOnchainosJson(["wallet", "status"], home, 10_000);
    return { ok: true, currentAccountId: String(status?.data?.currentAccountId || aid) };
  } catch (err: any) {
    return { ok: false, error: err?.message || "切换失败" };
  }
}

/** 新增子账户 — 调用 `wallet add`，CLI 内部生成新的 accountId + 地址表 */
async function handleAddAccount(token: string): Promise<{
  ok: boolean; accountId?: string; accountName?: string; error?: string;
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

/** 取该用户的多链地址表（直接读 CLI 状态，不发网络请求） */
async function handleGetAddresses(token: string): Promise<{ ok: boolean; addresses?: any; accountId?: string; error?: string }> {
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

/** 把 CLI 返回的任意 balance shape 拍平为 tokenAssets 数组 */
function flattenCliBalance(d: any): any[] {
  if (!d) return [];
  // shape A — `wallet balance --all`: details 是按 accountId 索引的对象
  //   { details: { "<accId>": { data: [{ tokenAssets: [...] }] } } }
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
  // shape B — 单账户 `wallet balance`: details 是数组
  //   { details: [{ tokenAssets: [...] }] }
  if (Array.isArray(d.details)) {
    const out: any[] = [];
    for (const entry of d.details) {
      const list = Array.isArray(entry?.tokenAssets) ? entry.tokenAssets : [];
      out.push(...list);
    }
    return out;
  }
  // shape C — 直接有 tokenAssets
  if (Array.isArray(d.tokenAssets)) return d.tokenAssets;
  // shape D — 旧字段名兜底
  for (const k of ["tokens", "tokenList", "assetsList"]) {
    if (Array.isArray((d as any)[k])) return (d as any)[k] as any[];
  }
  return [];
}

/** 该用户的资产汇总 — 调 `onchainos wallet balance --all`，CLI 内部走签名 WaaS 接口 */
async function handleGetBalance(token: string): Promise<any> {
  try {
    const { home } = homeFromToken(token);
    // --all 拍平所有子账户，避免「active account 是空账户」时漏报有钱的账户
    const data = runOnchainosJson(["wallet", "balance", "--all"], home, 30_000);
    if (data?.ok === false) return { ok: false, error: data?.error || "获取资产失败" };
    const d = data?.data ?? {};

    const rawTokens = flattenCliBalance(d);
    let computedUsd = 0;
    const tokens = rawTokens
      .map((t: any) => {
        const usd = Number(t?.usdValue ?? t?.value ?? 0);
        if (Number.isFinite(usd)) computedUsd += usd;
        // 优先用 customSymbol（OKX 已清洗的「USDT」），symbol 字段经常带 ₮ 等品牌字符（"USD₮0"）
        // 客户端老版本对 SVG textAnchor 的多字节字符渲染不稳，统一在后端 strip 成纯 ASCII
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

    // CLI 偶尔自带 totalValueUsd；没有时用我们累加结果
    const cliTotal = d?.totalValueUsd ?? d?.totalUsd ?? d?.totalAssets ?? "";
    const totalUsd = String(cliTotal !== "" && cliTotal != null ? cliTotal : computedUsd.toFixed(2));

    return { ok: true, totalUsd, tokens, lastUpdatedAt: new Date().toISOString() };
  } catch (err: any) {
    console.error(`[WalletBackend] getBalance 异常:`, err?.message || err);
    return { ok: false, error: err?.message || "获取资产失败" };
  }
}

// ─── 兼容旧调用名 ─────────────────────────────────────────────
async function handleSendOtpViaProvider(email: string) { return handleSendOtp(email); }
async function handleVerifyOtpViaProvider(email: string, code: string) { return handleVerifyOtp(email, code); }
async function handleGetAddressesViaProvider(token: string) { return handleGetAddresses(token); }

// ─── 旧版聚合余额（保留作为低优先 fallback；当前路由直接走 handleGetBalance） ──
async function handleGetBalanceViaProvider_legacy(token: string) {
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
  let home: string;
  try { home = homeFromToken(token).home; } catch (err: any) { return { ok: false, error: err?.message || "无效 token" }; }
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
  ], home);
  if (data?.ok === false) return { ok: false, error: data?.error || "兑换报价失败" };
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
  if (!token) return { ok: false, error: "缺少 token" };
  if (!isOnchainosCliAvailable()) {
    return { ok: false, error: "服务器尚未启用兑换通道（onchainos CLI 未就绪），请稍后再试" };
  }
  let home: string;
  try { home = homeFromToken(token).home; } catch (err: any) { return { ok: false, error: err?.message || "无效 token" }; }
  const chain = mapClientChainToCli(body.fromChain || body.toChain);
  const fromToken = mapSymbolToSwapToken(body.fromSymbol);
  const toToken = mapSymbolToSwapToken(body.toSymbol);
  const amount = String(body.fromAmount || "").trim();
  if (!fromToken || !toToken || !amount) return { ok: false, error: "参数不完整" };
  const args = [
    "swap", "execute",
    "--from", fromToken,
    "--to", toToken,
    "--readable-amount", amount,
    "--chain", chain,
  ];
  if (typeof body.slippageBps === "number" && body.slippageBps > 0) {
    args.push("--slippage", String(body.slippageBps / 100));
  }
  const data = runOnchainosJson(args, home, 90_000);
  if (data?.ok === false) return { ok: false, error: data?.error || "兑换提交失败" };
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
  let home: string;
  try { home = homeFromToken(token).home; } catch (err: any) { return { ok: false, error: err?.message || "无效 token" }; }
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
  const data = runOnchainosJson(args, home, 90_000);
  if (data?.ok === false) return { ok: false, error: data?.error || "转账失败" };
  const d = data?.data ?? data ?? {};
  const txHash = String(d?.txHash || "");
  if (!txHash) return { ok: false, error: d?.error || "未返回交易哈希" };
  return { ok: true, txHash, status: "submitted" };
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

  // 请求日志（method + path + 客户端 IP），便于线上排查 App 实际调用
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  if (req.method !== 'OPTIONS' && url.startsWith('/api/')) {
    console.log(`[req] ${req.method} ${url} from ${clientIp}`);
  }

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
    const isListAccounts = url === '/api/wallet/accounts' && req.method === 'GET';
    const isSwitchAccount = url === '/api/wallet/accounts/switch' && req.method === 'POST';
    const isAddAccount = url === '/api/wallet/accounts/add' && req.method === 'POST';

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
      const result = await handleGetBalance(token);
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

    } else if (isListAccounts) {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const result = await handleListAccounts(token);
      res.writeHead(200);
      res.end(JSON.stringify(result));

    } else if (isSwitchAccount) {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const body = await parseBody(req);
      const result = await handleSwitchAccount(token, body?.accountId);
      res.writeHead(result.ok ? 200 : 400);
      res.end(JSON.stringify(result));

    } else if (isAddAccount) {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const result = await handleAddAccount(token);
      res.writeHead(result.ok ? 200 : 400);
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
      res.writeHead(200);
      res.end(JSON.stringify({
        ok: true,
        service: 'h-wallet-backend',
        agentWallet: isOnchainosCliAvailable() ? 'cli-per-user' : 'unavailable',
        cliHomeRoot: CLI_HOME_ROOT,
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[WalletBackend] 🚀 服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`[WalletBackend] AI Chat: /api/ai/chat | Intent: /api/ai/intent`);
  console.log(`[WalletBackend] 健康检查: http://localhost:${PORT}/health`);
  ensureCliHomeRoot();
  if (isOnchainosCliAvailable()) {
    console.log(`[WalletBackend] 📡 Agent Wallet 模式 = cli-per-user，CLI 状态根目录 = ${CLI_HOME_ROOT}`);
  } else {
    console.error(`[WalletBackend] ⚠️ onchainos CLI 不可用，钱包功能将无法工作。请在服务器执行: curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh`);
  }
});
