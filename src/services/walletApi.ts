/**
 * walletApi — 封装我们后端的 3 个鉴权 / 钱包接口
 *
 * 后端职责（暂未实现，先用 mock 跑通前端流程）：
 *   POST /api/auth/send-otp     { email }                        → { ok }
 *   POST /api/auth/verify-otp   { email, code }                  → { ok, token, accountId, isNew, addresses }
 *   GET  /api/wallet/addresses  Authorization: Bearer <token>    → { ok, accountId, addresses }
 *
 * 后端实际是把 OKX 的 onchainos CLI（`pip install onchainos`）包成 REST：
 *   wallet login <email>   → 触发邮件 OTP
 *   wallet verify <code>   → 完成登录 / 自动建钱包
 *   wallet addresses       → 拿 EVM/Solana/X Layer 地址
 *
 * 设置 WALLET_API_BASE 环境变量（或 app.json extra）即可切到真实后端。
 * 没设置时自动走 USE_MOCK 流程，方便前端独立联调。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ChainAddress = {
  chainIndex: string;
  chainName: string;
  address: string;
};

export type WalletAddresses = {
  evm: ChainAddress[];
  solana: ChainAddress[];
  xlayer: ChainAddress[];
};

export type Session = {
  token: string;
  email: string;
  accountId: string;
  addresses: WalletAddresses;
  isNew: boolean;
};

const WALLET_API_BASE: string | null = 'http://localhost:3100'; // 真实后端
const USE_MOCK = !WALLET_API_BASE;

const STORAGE_KEY = "h_wallet.session.v1";
const PENDING_OTP_KEY = "h_wallet.mock.pending_otp"; // mock-only

/* ==================== 持久化 session ==================== */

let cachedSession: Session | null = null;

export async function loadSession(): Promise<Session | null> {
  if (cachedSession) return cachedSession;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    cachedSession = JSON.parse(raw);
    return cachedSession;
  } catch {
    return null;
  }
}

export async function saveSession(s: Session): Promise<void> {
  cachedSession = s;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export async function clearSession(): Promise<void> {
  cachedSession = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function getCachedSession(): Session | null {
  return cachedSession;
}

/* ==================== 公开 API ==================== */

export async function sendOtp(email: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "邮箱格式不正确" };
  }
  if (USE_MOCK) return mockSendOtp(trimmed);
  return postJson("/api/auth/send-otp", { email: trimmed });
}

export async function verifyOtp(
  email: string,
  code: string
): Promise<{ ok: boolean; session?: Session; error?: string }> {
  const trimmed = email.trim().toLowerCase();
  const codeTrim = code.trim();
  if (!/^\d{6}$/.test(codeTrim)) {
    return { ok: false, error: "验证码应为 6 位数字" };
  }
  const result = USE_MOCK
    ? await mockVerifyOtp(trimmed, codeTrim)
    : await postJson<{
        ok: boolean;
        token?: string;
        accountId?: string;
        isNew?: boolean;
        addresses?: WalletAddresses;
        error?: string;
      }>("/api/auth/verify-otp", { email: trimmed, code: codeTrim });

  if (!result.ok || !result.token || !result.accountId || !result.addresses) {
    return { ok: false, error: result.error ?? "验证失败" };
  }
  const session: Session = {
    token: result.token,
    email: trimmed,
    accountId: result.accountId,
    addresses: result.addresses,
    isNew: result.isNew ?? false
  };
  await saveSession(session);
  return { ok: true, session };
}

export async function refreshAddresses(): Promise<WalletAddresses | null> {
  const s = await loadSession();
  if (!s) return null;
  if (USE_MOCK) return s.addresses;
  try {
    const res = await fetch(`${WALLET_API_BASE}/api/wallet/addresses`, {
      headers: { Authorization: `Bearer ${s.token}` }
    });
    const data = await res.json();
    if (data?.ok && data.addresses) {
      const next: Session = { ...s, addresses: data.addresses };
      await saveSession(next);
      return data.addresses;
    }
  } catch {
    /* 网络失败回落到缓存 */
  }
  return s.addresses;
}

export async function logout(): Promise<void> {
  await clearSession();
}

/* ==================== HTTP 助手 ==================== */

async function postJson<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${WALLET_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return (await res.json()) as T;
}

/* ==================== Mock 实现（前端独立跑） ==================== */
/* 真实接通后端后，下列函数不再被调用。 */

async function mockSendOtp(email: string): Promise<{ ok: boolean }> {
  const code = "123456"; // 演示固定验证码
  await AsyncStorage.setItem(
    PENDING_OTP_KEY,
    JSON.stringify({ email, code, ts: Date.now() })
  );
  // 控制台打印，方便开发期肉眼看到
  if (__DEV__) console.log(`[mock OTP] ${email} → ${code}`);
  await delay(600);
  return { ok: true };
}

async function mockVerifyOtp(email: string, code: string) {
  await delay(800);
  const raw = await AsyncStorage.getItem(PENDING_OTP_KEY);
  if (!raw) return { ok: false, error: "请先发送验证码" };
  const pending = JSON.parse(raw) as { email: string; code: string; ts: number };
  if (pending.email !== email) return { ok: false, error: "邮箱与验证码不匹配" };
  if (Date.now() - pending.ts > 5 * 60 * 1000) return { ok: false, error: "验证码已过期" };
  if (pending.code !== code) return { ok: false, error: "验证码错误" };
  await AsyncStorage.removeItem(PENDING_OTP_KEY);

  const accountId = "0x" + hashEmail(email).slice(0, 40);
  const addresses: WalletAddresses = {
    evm: [
      { chainIndex: "1", chainName: "Ethereum", address: accountId },
      { chainIndex: "56", chainName: "BNB Chain", address: accountId },
      { chainIndex: "196", chainName: "X Layer", address: accountId }
    ],
    solana: [
      { chainIndex: "501", chainName: "Solana", address: solanaLike(email) }
    ],
    xlayer: [{ chainIndex: "196", chainName: "X Layer", address: accountId }]
  };
  return {
    ok: true,
    token: "mock_" + hashEmail(email).slice(0, 24),
    accountId,
    isNew: true,
    addresses
  };
}

function hashEmail(s: string): string {
  // 不是密码学，仅用于在演示数据里造一个稳定的伪地址
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  let hex = "";
  for (let i = 0; i < 10; i++) {
    h = Math.imul(h ^ (h >>> 13), 16777619);
    hex += ((h >>> 0).toString(16) + "00000000").slice(0, 8);
  }
  return hex;
}

function solanaLike(email: string): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const h = hashEmail(email);
  let out = "";
  for (let i = 0; i < 44; i++) out += alphabet[parseInt(h[i % h.length], 16) * 3 + (i % 3)];
  return out;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
