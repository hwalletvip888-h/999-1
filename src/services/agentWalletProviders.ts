/**
 * agentWalletProviders — Agent Wallet 后端提供方抽象
 *
 * 设计目标：
 *   - 让 walletBackend.ts 不再硬编码 HTTP 调用
 *   - 支持用户已选择的 onchainos CLI 路径（PRD 设计 + onchainos-skills 官方）
 *   - HTTP 实现作为 fallback（CLI 未安装时不阻塞）
 *
 * 路径选择规则（启动时一次性决定）：
 *   1. env AGENT_WALLET_PROVIDER=cli  → 强制 CLI（找不到 onchainos 二进制会抛错）
 *   2. env AGENT_WALLET_PROVIDER=http → 强制 HTTP（直接打 OKX priapi）
 *   3. 不设 → 自动探测：能跑 `onchainos --version` 就用 CLI，否则用 HTTP
 *
 * 输出统一形如：{ ok, token, accountId, isNew, addresses: { evm[], solana[], xlayer[] } }
 */
import { execFileSync, execSync } from "child_process";
import * as crypto from "crypto";
import { fetchWithDeadline } from "./fetchWithDeadline";
import { OKX_AGENTIC_FETCH_TIMEOUT_MS } from "./hwalletHttpConstants";

// ─── 公共类型 ─────────────────────────────────────────────────────

export type ChainAddress = {
  chainIndex: string;
  chainName: string;
  address: string;
};

export type AgentWalletAddresses = {
  evm: ChainAddress[];
  solana: ChainAddress[];
  xlayer: ChainAddress[];
};

export type SendOtpResult = { ok: boolean; error?: string };

export type VerifyOtpResult = {
  ok: boolean;
  token?: string;
  accountId?: string;
  isNew?: boolean;
  addresses?: AgentWalletAddresses;
  error?: string;
};

export type GetAddressesResult = {
  ok: boolean;
  accountId?: string;
  addresses?: AgentWalletAddresses;
  error?: string;
};

export type WalletBalanceToken = {
  symbol: string;
  chain: string;
  balance: string;
  usdValue: string;
};

export type GetBalanceResult = {
  ok: boolean;
  totalUsd?: string;
  tokens?: WalletBalanceToken[];
  error?: string;
};

export interface IAgentWalletProvider {
  readonly id: "cli" | "http";
  sendOtp(email: string): Promise<SendOtpResult>;
  verifyOtp(email: string, code: string): Promise<VerifyOtpResult>;
  getAddresses(token: string): Promise<GetAddressesResult>;
  getBalance(token: string): Promise<GetBalanceResult>;
}

// ─── 工具：把 OKX 返回的 addressList 拆为 evm/solana/xlayer ───────────

const SOLANA_CHAIN_INDEX = "501";
const XLAYER_CHAIN_INDEX = "196";

export function classifyAddresses(addressList: any[]): AgentWalletAddresses {
  // 已是目标结构时直接返回
  if (
    addressList &&
    !Array.isArray(addressList) &&
    Array.isArray((addressList as any).evm) &&
    Array.isArray((addressList as any).solana) &&
    Array.isArray((addressList as any).xlayer)
  ) {
    return addressList as AgentWalletAddresses;
  }

  const source: any[] = Array.isArray(addressList)
    ? addressList
    : Array.isArray((addressList as any)?.addressList)
      ? (addressList as any).addressList
      : Array.isArray((addressList as any)?.data)
        ? (addressList as any).data
        : [];

  const evm: ChainAddress[] = [];
  const solana: ChainAddress[] = [];
  const xlayer: ChainAddress[] = [];
  for (const raw of source) {
    const item: ChainAddress = {
      chainIndex: String(raw.chainIndex ?? raw.chain_index ?? ""),
      chainName: String(raw.chainName ?? raw.chain_name ?? "Unknown"),
      address: String(raw.address ?? "")
    };
    if (item.chainIndex === SOLANA_CHAIN_INDEX) {
      solana.push(item);
    } else if (item.chainIndex === XLAYER_CHAIN_INDEX) {
      xlayer.push(item);
      evm.push(item);
    } else {
      evm.push(item);
    }
  }
  return {
    evm: evm.length ? evm : [{ chainIndex: "1", chainName: "Ethereum", address: "" }],
    solana: solana.length ? solana : [{ chainIndex: "501", chainName: "Solana", address: "" }],
    xlayer: xlayer.length ? xlayer : [{ chainIndex: "196", chainName: "X Layer", address: "" }]
  };
}

// ─── HTTP 实现：直接调 OKX priapi ──────────────────────────────────

const OKX_BASE_URL = process.env.OKX_BASE_URL || "https://web3.okx.com";
const CLIENT_VERSION = "3.0.0";

interface HttpOtpSession {
  email: string;
  flowId: string;
  tempPrivateKey: string;
  tempPublicKey: string;
  expiresAt: number;
  attempts: number;
}

function generateTempKeyPair(): { privateKey: string; publicKey: string } {
  const priv = crypto.randomBytes(32);
  const pub = crypto.randomBytes(32);
  return { privateKey: priv.toString("base64"), publicKey: pub.toString("base64") };
}

/** OKX Agentic 公网请求：与 `fetchWithDeadline` 一致（合并超时 + 可选 AbortSignal） */
async function okxFetch(url: string, init: RequestInit): Promise<Response> {
  return fetchWithDeadline(url, init, OKX_AGENTIC_FETCH_TIMEOUT_MS);
}

async function okxAgenticPublic(path: string, body: any): Promise<any> {
  const url = `${OKX_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ok-client-version": CLIENT_VERSION,
    "Ok-Access-Client-type": "agent-cli"
  };
  const response = await okxFetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  return response.json();
}

export class OkxHttpAgentWalletProvider implements IAgentWalletProvider {
  readonly id = "http" as const;
  private sessions = new Map<string, HttpOtpSession>();

  async sendOtp(email: string): Promise<SendOtpResult> {
    if (!email || !email.includes("@")) return { ok: false, error: "请输入有效的邮箱地址" };
    try {
      const result = await okxAgenticPublic("/priapi/v5/wallet/agentic/auth/init", { email, locale: "zh-CN" });
      if (result.code === "0" && result.data?.[0]?.flowId) {
        const flowId = result.data[0].flowId;
        const kp = generateTempKeyPair();
        this.sessions.set(email, {
          email, flowId,
          tempPrivateKey: kp.privateKey, tempPublicKey: kp.publicKey,
          expiresAt: Date.now() + 10 * 60 * 1000,
          attempts: 0
        });
        return { ok: true };
      }
      return { ok: false, error: result.msg || result.error || "发送验证码失败" };
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "AbortError") return { ok: false, error: "OKX 接口超时，请稍后重试或检查服务器出网" };
      return { ok: false, error: err.message || "网络请求失败" };
    }
  }

  async verifyOtp(email: string, code: string): Promise<VerifyOtpResult> {
    const session = this.sessions.get(email);
    if (!session) return { ok: false, error: "请先发送验证码" };
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(email);
      return { ok: false, error: "验证码已过期，请重新发送" };
    }
    session.attempts++;
    if (session.attempts > 5) {
      this.sessions.delete(email);
      return { ok: false, error: "验证次数过多，请重新发送" };
    }
    try {
      const result = await okxAgenticPublic("/priapi/v5/wallet/agentic/auth/verify", {
        email, flowId: session.flowId, otp: code, tempPubKey: session.tempPublicKey
      });
      if (result.code !== "0" || !result.data?.[0]) {
        return { ok: false, error: result.msg || result.error || "验证码错误" };
      }
      const verifyData = result.data[0];
      const accountId = verifyData.accountId || "";
      const accessToken = verifyData.accessToken || "";
      this.sessions.delete(email);

      // ⚠️ 关键修复：verify 返回的 addressList 经常为空 / 不全
      // → 用 accessToken 主动调 /account/addresses 拿完整多链地址，否则 UI 上"登录了没地址"
      let addresses = classifyAddresses(verifyData.addressList || []);
      const evmEmpty = !addresses.evm[0]?.address;
      if (accessToken && evmEmpty) {
        const refreshed = await this.fetchAddressesByToken(accessToken);
        if (refreshed) addresses = classifyAddresses(refreshed);
      }

      const token = Buffer.from(JSON.stringify({
        email, accountId, accessToken,
        teeId: verifyData.teeId || "", projectId: verifyData.projectId || "",
        createdAt: Date.now()
      })).toString("base64");

      return { ok: true, token, accountId, isNew: verifyData.isNew !== false, addresses };
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "AbortError") return { ok: false, error: "OKX 接口超时" };
      return { ok: false, error: err.message || "验证请求失败" };
    }
  }

  async getAddresses(token: string): Promise<GetAddressesResult> {
    if (!token) return { ok: false, error: "缺少 token" };
    try {
      const decoded = JSON.parse(Buffer.from(token, "base64").toString());
      const { accountId, accessToken } = decoded;
      if (!accountId || !accessToken) return { ok: false, error: "token 失效" };
      const list = await this.fetchAddressesByToken(accessToken);
      if (list) return { ok: true, accountId, addresses: classifyAddresses(list) };
      return { ok: true, accountId, addresses: classifyAddresses([]) };
    } catch (err: any) {
      return { ok: false, error: err.message || "解析 token 失败" };
    }
  }

  async getBalance(token: string): Promise<GetBalanceResult> {
    if (!token) return { ok: false, error: "缺少 token" };
    try {
      const decoded = JSON.parse(Buffer.from(token, "base64").toString());
      const accessToken = decoded?.accessToken;
      if (!accessToken) return { ok: false, error: "token 失效" };

      const candidatePaths = [
        "/priapi/v5/wallet/agentic/account/portfolio",
        "/priapi/v5/wallet/agentic/account/assets",
        "/priapi/v5/wallet/agentic/account/balances",
        "/priapi/v5/wallet/agentic/account/token-balances",
        "/priapi/v5/wallet/agentic/account/asset-balance",
        "/priapi/v5/wallet/agentic/account/asset-list"
      ];
      for (const p of candidatePaths) {
        const resp = await this.fetchAgenticByToken(accessToken, p);
        const normalized = normalizeBalancePayload(resp);
        if (normalized) return { ok: true, ...normalized };
      }
      return { ok: false, error: "未找到可用的余额接口" };
    } catch (err: any) {
      return { ok: false, error: err.message || "余额查询失败" };
    }
  }

  private async fetchAddressesByToken(accessToken: string): Promise<any[] | null> {
    try {
      const url = `${OKX_BASE_URL}/priapi/v5/wallet/agentic/account/addresses`;
      const response = await okxFetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "ok-client-version": CLIENT_VERSION,
          "Ok-Access-Client-type": "agent-cli",
          "Authorization": `Bearer ${accessToken}`
        }
      });
      const result = await response.json();
      if (result.code === "0" && Array.isArray(result.data)) return result.data;
      return null;
    } catch {
      return null;
    }
  }

  private async fetchAgenticByToken(accessToken: string, path: string): Promise<any | null> {
    try {
      const url = `${OKX_BASE_URL}${path}`;
      const response = await okxFetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "ok-client-version": CLIENT_VERSION,
          "Ok-Access-Client-type": "agent-cli",
          "Authorization": `Bearer ${accessToken}`
        }
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}

// ─── CLI 实现：shell-out 调用 onchainos ─────────────────────────────

/**
 * onchainos CLI 装在 server 上的方式：
 *   pip install onchainos
 *   onchainos --version
 *
 * 与 walletBackend 的协议：
 *   - 用户发邮件验证码：onchainos wallet login --email <email> --json
 *     → 返回 { flowId, sessionFile }（缓存）
 *   - 用户输入验证码：onchainos wallet verify --code <code> --json
 *     → 返回 { token, accountId, addresses }
 *   - 拉地址：onchainos wallet addresses --json
 *
 * 注：当前 onchainos CLI 的具体 JSON 输出 schema 以官方版本为准；
 *     本类做了基本兼容（包了 try/catch + classifyAddresses 归一化）。
 */
export class OnchainosCliAgentWalletProvider implements IAgentWalletProvider {
  readonly id = "cli" as const;

  /** 启动时探测 CLI 是否可用 */
  static async detect(): Promise<boolean> {
    try {
      execSync("onchainos --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  /** 跑命令并解析 JSON 输出（容错处理：可能混有 log） */
  private runJson(args: string[]): any {
    try {
      const out = execFileSync("onchainos", args, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000
      });
      // CLI 输出可能含日志行，从最后一个 { 开始截取
      const trimmed = out.trim();
      const lastJsonStart = trimmed.lastIndexOf("{\n") >= 0 ? trimmed.lastIndexOf("{") : trimmed.indexOf("{");
      const json = lastJsonStart >= 0 ? trimmed.slice(lastJsonStart) : trimmed;
      return JSON.parse(json);
    } catch (err: any) {
      const stderr = err?.stderr?.toString() ?? "";
      throw new Error(`onchainos CLI 调用失败：${err.message}${stderr ? "\n" + stderr : ""}`);
    }
  }

  async sendOtp(email: string): Promise<SendOtpResult> {
    if (!email || !email.includes("@")) return { ok: false, error: "请输入有效的邮箱地址" };
    try {
      // onchainos wallet login 会异步发送验证码，命令本身阻塞到验证码送出
      this.runJson(["wallet", "login", "--email", email, "--json"]);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  async verifyOtp(email: string, code: string): Promise<VerifyOtpResult> {
    try {
      const result = this.runJson(["wallet", "verify", "--code", code, "--json"]);
      if (!result || result.error) {
        return { ok: false, error: result?.error || "CLI 校验失败" };
      }
      // 拉一次完整地址表
      let addrList: any[] = result.addresses ?? result.data?.addresses ?? [];
      if (!addrList.length) {
        try {
          const addrResp = this.runJson(["wallet", "addresses", "--json"]);
          addrList = addrResp.addresses ?? addrResp.data ?? [];
        } catch { /* ignore */ }
      }
      const accountId = result.accountId || result.data?.accountId || "";
      const accessToken = result.accessToken || result.data?.accessToken || result.token || "";
      const tokenPayload = Buffer.from(JSON.stringify({
        email, accountId, accessToken,
        provider: "cli",
        createdAt: Date.now()
      })).toString("base64");
      return {
        ok: true,
        token: tokenPayload,
        accountId,
        isNew: result.isNew !== false,
        addresses: classifyAddresses(addrList)
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  async getAddresses(token: string): Promise<GetAddressesResult> {
    if (!token) return { ok: false, error: "缺少 token" };
    try {
      const decoded = JSON.parse(Buffer.from(token, "base64").toString());
      const { accountId } = decoded;
      const result = this.runJson(["wallet", "addresses", "--json"]);
      const list = result.addresses ?? result.data ?? [];
      return { ok: true, accountId, addresses: classifyAddresses(list) };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  async getBalance(token: string): Promise<GetBalanceResult> {
    if (!token) return { ok: false, error: "缺少 token" };
    try {
      const result = this.runJson(["wallet", "balance", "--json"]);
      const normalized = normalizeBalancePayload(result);
      if (!normalized) return { ok: false, error: "余额返回为空" };
      return { ok: true, ...normalized };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}

function normalizeBalancePayload(payload: any): { totalUsd: string; tokens: WalletBalanceToken[] } | null {
  if (!payload) return null;

  const codeFail = payload.code !== undefined && String(payload.code) !== "0";

  let listSource: unknown = payload?.data ?? payload;

  const tryExtractList = (x: unknown): any[] => {
    if (!x) return [];
    if (Array.isArray(x)) return x;
    if (typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (Array.isArray(o.tokens)) return o.tokens as any[];
      if (Array.isArray(o.balances)) return o.balances as any[];
      if (Array.isArray(o.assets)) return o.assets as any[];
      if (Array.isArray(o.tokenList)) return o.tokenList as any[];
      if (Array.isArray(o.records)) return o.records as any[];
      if (Array.isArray(o.list)) return o.list as any[];
    }
    return [];
  };

  const list = tryExtractList(listSource);
  if (!list.length && codeFail) return null;

  const tokens: WalletBalanceToken[] = list
    .map((t: any) => ({
      symbol: String(t.symbol ?? t.tokenSymbol ?? t.currency ?? t.symbolName ?? "").toUpperCase(),
      chain: String(t.chain ?? t.chainName ?? t.chainIndex ?? "unknown"),
      balance: String(t.balance ?? t.amount ?? t.total ?? t.holding ?? "0"),
      usdValue: String(t.usdValue ?? t.valueUsd ?? t.usdtValue ?? t.usdAmount ?? "0")
    }))
    .filter((t: WalletBalanceToken) => !!t.symbol);

  const inner = typeof listSource === "object" && listSource !== null && !Array.isArray(listSource)
    ? (listSource as Record<string, unknown>)
    : {};

  const totalUsd =
    inner.totalUsd !== undefined || inner.totalValueUsd !== undefined
      ? String(inner.totalUsd ?? inner.totalValueUsd ?? "0")
      : tokens.reduce((sum, t) => sum + Number(t.usdValue || 0), 0).toFixed(2);

  if (!tokens.length && inner.totalUsd === undefined && payload.totalUsd === undefined) {
    return codeFail ? null : { totalUsd: "0.00", tokens: [] };
  }

  return { totalUsd: String(inner.totalUsd ?? payload.totalUsd ?? totalUsd ?? "0.00"), tokens };
}

// ─── 工厂：根据环境自动选 ─────────────────────────────────────────

let cached: IAgentWalletProvider | null = null;

export async function getAgentWalletProvider(): Promise<IAgentWalletProvider> {
  if (cached) return cached;
  const forced = (process.env.AGENT_WALLET_PROVIDER || "").toLowerCase();
  if (forced === "http") {
    cached = new OkxHttpAgentWalletProvider();
  } else if (forced === "cli") {
    cached = new OnchainosCliAgentWalletProvider();
  } else {
    // 自动探测
    const cliAvailable = await OnchainosCliAgentWalletProvider.detect();
    cached = cliAvailable ? new OnchainosCliAgentWalletProvider() : new OkxHttpAgentWalletProvider();
  }
  console.log(`[agentWalletProvider] active = ${cached.id}`);
  return cached;
}
