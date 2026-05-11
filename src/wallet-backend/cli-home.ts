/**
 * H1 侧 per-user CLI 沙箱：ONCHAINOS_HOME = CLI_HOME_ROOT / sha256(email)[:16]
 * Session token = base64(payload) + "." + HMAC-SHA256(payload, TOKEN_SECRET)
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as nodePath from "path";
import { CLI_HOME_ROOT, TOKEN_SECRET, TOKEN_TTL_MS } from "./config";

export function ensureCliHomeRoot(): void {
  try {
    fs.mkdirSync(CLI_HOME_ROOT, { recursive: true, mode: 0o700 });
  } catch {
    /* ignore */
  }
}

export function emailToHash(email: string): string {
  return crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex").slice(0, 16);
}

export function homeForEmail(email: string): string {
  ensureCliHomeRoot();
  const dir = nodePath.join(CLI_HOME_ROOT, emailToHash(email));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export interface DecodedToken {
  email: string;
  accountId: string;
  createdAt: number;
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
}

/** 生成带签名的 session token */
export function mintSessionToken(email: string, accountId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email, accountId, createdAt: Date.now() })
  ).toString("base64url");
  const sig = hmac(payload);
  return `${payload}.${sig}`;
}

export function decodeSessionToken(token: string): DecodedToken {
  if (!token) throw new Error("缺少 token");

  // 新格式：payload.sig
  if (token.includes(".")) {
    const dotIdx = token.lastIndexOf(".");
    const payload = token.slice(0, dotIdx);
    const sig     = token.slice(dotIdx + 1);
    const expected = hmac(payload);
    if (sig !== expected) throw new Error("token 签名无效");
    let obj: any;
    try {
      obj = JSON.parse(Buffer.from(payload, "base64url").toString());
    } catch {
      throw new Error("无效 token");
    }
    const email = String(obj?.email || "").trim().toLowerCase();
    if (!email) throw new Error("token 缺少 email");
    const createdAt = Number(obj?.createdAt || 0);
    if (Date.now() - createdAt > TOKEN_TTL_MS) throw new Error("登录已过期，请重新登录");
    return { email, accountId: String(obj?.accountId || ""), createdAt };
  }

  // 兼容旧格式（纯 base64）
  let raw: string;
  try {
    raw = Buffer.from(token, "base64").toString();
  } catch {
    throw new Error("无效 token");
  }
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("无效 token");
  }
  const email = String(obj?.email || "").trim().toLowerCase();
  if (!email) throw new Error("token 缺少 email");
  return { email, accountId: String(obj?.accountId || ""), createdAt: Number(obj?.createdAt || 0) };
}

export function homeFromToken(token: string): { home: string; email: string; accountId: string } {
  const t = decodeSessionToken(token);
  return { home: homeForEmail(t.email), email: t.email, accountId: t.accountId };
}
