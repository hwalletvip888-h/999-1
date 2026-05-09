/**
 * H1 侧 per-user CLI 沙箱：ONCHAINOS_HOME = CLI_HOME_ROOT / sha256(email)[:16]
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as nodePath from "path";
import { CLI_HOME_ROOT } from "./config";

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

export function decodeSessionToken(token: string): DecodedToken {
  if (!token) throw new Error("缺少 token");
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
