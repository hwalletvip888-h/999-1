/**
 * walletApi — Agent Wallet / 后端鉴权与地址
 *
 * POST /api/auth/send-otp     { email }
 * POST /api/auth/verify-otp   { email, code }
 * GET  /api/wallet/addresses  Authorization: Bearer <token>
 *
 * **实测交付：** 必须由构建注入 `EXPO_PUBLIC_HWALLET_API_BASE`（或 `HWALLET_API_BASE`），不设默认域名。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

/** H Wallet 后端根 URL，去掉末尾 `/` */
export function getHwalletApiBase(): string {
  const a = String(process.env.EXPO_PUBLIC_HWALLET_API_BASE ?? "").trim();
  const b = String(process.env.HWALLET_API_BASE ?? "").trim();
  return (a || b).replace(/\/+$/, "");
}

function hwalletAbsoluteUrl(path: string): string | null {
  const base = getHwalletApiBase();
  if (!base) return null;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

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

const STORAGE_KEY = "h_wallet.session.v1";

function normalizeAddresses(input: any): WalletAddresses | null {
  if (!input) return null;

  if (input.evm && input.solana && input.xlayer) {
    return {
      evm: Array.isArray(input.evm) ? input.evm : [],
      solana: Array.isArray(input.solana) ? input.solana : [],
      xlayer: Array.isArray(input.xlayer) ? input.xlayer : []
    };
  }

  const list: any[] = Array.isArray(input)
    ? input
    : Array.isArray(input.addressList)
      ? input.addressList
      : Array.isArray(input.data)
        ? input.data
        : [];
  if (!list.length) return null;

  const evm: ChainAddress[] = [];
  const solana: ChainAddress[] = [];
  const xlayer: ChainAddress[] = [];
  for (const raw of list) {
    const chainIndex = String(raw.chainIndex ?? raw.chain_index ?? "");
    const chainName = String(raw.chainName ?? raw.chain_name ?? "Unknown");
    const address = String(raw.address ?? "");
    const item = { chainIndex, chainName, address };
    if (chainIndex === "501") {
      solana.push(item);
    } else if (chainIndex === "196") {
      xlayer.push(item);
      evm.push(item);
    } else {
      evm.push(item);
    }
  }

  return { evm, solana, xlayer };
}

function hasRealAddress(addrs: WalletAddresses | null | undefined): boolean {
  if (!addrs) return false;
  const all = [...(addrs.evm ?? []), ...(addrs.solana ?? []), ...(addrs.xlayer ?? [])];
  return all.some((a) => !!a.address && a.address !== "N/A");
}

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
  await AsyncStorage.removeItem("h_wallet.mock.pending_otp");
}

export function getCachedSession(): Session | null {
  return cachedSession;
}

const OTP_POST_DEADLINE_MS = 32_000;

function raceOtpPost<T extends { ok: boolean; error?: string }>(p: Promise<T>): Promise<T> {
  const timeout: Promise<T> = new Promise((resolve) =>
    setTimeout(
      () => resolve({ ok: false, error: "请求超时，请检查网络后重试" } as T),
      OTP_POST_DEADLINE_MS
    )
  );
  return Promise.race([p, timeout]);
}

export async function sendOtp(email: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "邮箱格式不正确" };
  }
  return raceOtpPost(postJson("/api/auth/send-otp", { email: trimmed }));
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
  const result = await raceOtpPost(
    postJson<{
      ok: boolean;
      token?: string;
      accountId?: string;
      isNew?: boolean;
      addresses?: any;
      error?: string;
    }>("/api/auth/verify-otp", { email: trimmed, code: codeTrim })
  );

  if (!result.ok || !result.token || !result.accountId) {
    return { ok: false, error: result.error ?? "验证失败" };
  }

  let addresses = normalizeAddresses(result.addresses);
  if (!hasRealAddress(addresses)) {
    const addrUrl = hwalletAbsoluteUrl("/api/wallet/addresses");
    if (addrUrl) {
      try {
        const res = await fetchWithTimeout(addrUrl, {
          headers: { Authorization: `Bearer ${result.token}` }
        });
        const raw = await res.text();
        let data: Record<string, unknown> = {};
        try {
          data = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
        } catch {
          data = {};
        }
        if (data?.ok) {
          const normalized = normalizeAddresses(data.addresses);
          if (normalized) addresses = normalized;
        }
      } catch {
        /* 保持下方兜底 */
      }
    }
  }
  if (!addresses) {
    addresses = { evm: [], solana: [], xlayer: [] };
  }

  const session: Session = {
    token: result.token,
    email: trimmed,
    accountId: result.accountId,
    addresses,
    isNew: result.isNew ?? false
  };
  await saveSession(session);
  return { ok: true, session };
}

export async function refreshAddresses(): Promise<WalletAddresses | null> {
  const s = await loadSession();
  if (!s) return null;
  const addrUrl = hwalletAbsoluteUrl("/api/wallet/addresses");
  if (!addrUrl) return s.addresses;
  try {
    const res = await fetchWithTimeout(addrUrl, {
      headers: { Authorization: `Bearer ${s.token}` }
    });
    const raw = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    } catch {
      return s.addresses;
    }
    const normalized = normalizeAddresses(data.addresses);
    if (data?.ok && normalized) {
      const next: Session = { ...s, addresses: normalized };
      await saveSession(next);
      return normalized;
    }
  } catch {
    /* 网络失败回落到缓存 */
  }
  return s.addresses;
}

export async function logout(): Promise<void> {
  await clearSession();
}

/** 移动端弱网 / 服务端不可达时，无超时会导致界面一直卡在「发送中」 */
const FETCH_TIMEOUT_MS = 28_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function postJson<T = any>(path: string, body: unknown): Promise<T> {
  const url = hwalletAbsoluteUrl(path);
  if (!url) {
    return { ok: false, error: "未配置 EXPO_PUBLIC_HWALLET_API_BASE" } as T;
  }
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const raw = await res.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return {
        ok: false,
        error: res.ok ? "服务器响应格式异常" : `HTTP ${res.status}`
      } as T;
    }
    return data as T;
  } catch (e: unknown) {
    const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
    if (name === "AbortError") {
      return { ok: false, error: "连接超时，请检查网络或服务是否可达" } as T;
    }
    return { ok: false, error: "网络异常，请稍后重试" } as T;
  }
}

export async function pingHwalletBackend(): Promise<{ ok: boolean; ms?: number; error?: string }> {
  const url = hwalletAbsoluteUrl("/health");
  if (!url) return { ok: false, error: "未配置 EXPO_PUBLIC_HWALLET_API_BASE" };
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(url, { method: "GET" });
    const ok = res.ok;
    return { ok, ms: Date.now() - started, error: ok ? undefined : `HTTP ${res.status}` };
  } catch (e: unknown) {
    const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
    if (name === "AbortError") return { ok: false, error: "连接超时", ms: Date.now() - started };
    return { ok: false, error: "网络异常", ms: Date.now() - started };
  }
}
