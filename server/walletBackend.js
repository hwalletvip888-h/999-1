#!/usr/bin/env node
/**
 * H Wallet Backend — 真实 OKX Agentic Wallet 接入
 *
 * 设计：每个用户邮箱在 /var/lib/h-wallet/users/<safe-email> 下有独立 HOME，
 *       onchainos CLI 的所有状态（登录态、加密 session）都隔离在这里。
 *
 * 部署：systemd 守护，监听 :3100，前面挂 Caddy 自动 HTTPS。
 *
 * 端点：
 *   GET  /health
 *   POST /api/auth/send-otp     { email }                   → onchainos wallet login
 *   POST /api/auth/verify-otp   { email, code }             → onchainos wallet verify
 *   GET  /api/wallet/addresses  Bearer <token>              → onchainos wallet addresses
 *   GET  /api/wallet/balance    Bearer <token>              → onchainos wallet balance
 *   GET  /api/wallet/balance?chain=ethereum  Bearer         → onchainos wallet balance --chain ...
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.WALLET_PORT || '3100', 10);
const ONCHAINOS = process.env.ONCHAINOS_BIN || path.join(process.env.HOME || '/home/ubuntu', '.local/bin/onchainos');
const DATA_ROOT = process.env.WALLET_DATA_DIR || '/var/lib/h-wallet/users';
const SESSION_SECRET = process.env.WALLET_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 邮箱 → 安全目录名（HOME 隔离）
function emailToDir(email) {
  const norm = String(email || '').trim().toLowerCase();
  const safe = norm.replace(/[^a-z0-9._@+-]/g, '_');
  if (!safe || safe.length > 128) throw new Error('invalid email');
  return path.join(DATA_ROOT, safe);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true, mode: 0o700 });
}

// ─── HMAC token: base64url({email, exp}).hmac ────────────────
function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function fromB64u(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}
function signToken(payload) {
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest();
  return body + '.' + b64u(sig);
}
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.indexOf('.');
  if (i < 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = b64u(crypto.createHmac('sha256', SESSION_SECRET).update(body).digest());
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  let payload;
  try { payload = JSON.parse(fromB64u(body).toString('utf8')); } catch { return null; }
  if (typeof payload.exp === 'number' && Date.now() > payload.exp) return null;
  return payload;
}

// ─── onchainos CLI runner ────────────────────────────────────
function runOnchainos(email, args, opts = {}) {
  return new Promise((resolve) => {
    let home;
    try { home = emailToDir(email); ensureDir(home); }
    catch (e) { return resolve({ code: -1, error: e.message }); }

    if (!fs.existsSync(ONCHAINOS)) {
      return resolve({ code: -1, error: `onchainos binary not found at ${ONCHAINOS}` });
    }

    const env = { ...process.env, HOME: home, NO_COLOR: '1' };
    const proc = spawn(ONCHAINOS, args, { env, timeout: opts.timeoutMs || 30000 });

    let out = '', err = '';
    proc.stdout.on('data', (d) => { out += d.toString('utf8'); });
    proc.stderr.on('data', (d) => { err += d.toString('utf8'); });
    proc.on('error', (e) => resolve({ code: -1, error: e.message, stdout: out, stderr: err }));
    proc.on('close', (code) => {
      let json = null;
      // CLI 默认输出大多为 JSON；尝试解析；不是 JSON 时保留原文。
      try {
        const trimmed = out.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) json = JSON.parse(trimmed);
      } catch { /* keep null */ }
      resolve({ code, stdout: out, stderr: err, json });
    });
  });
}

// 在 stdout/json 中尽力提取 accountId / addresses，兼容多种输出格式
function extractAccount(result) {
  const j = result.json || {};
  const data = j.data || j;
  const accountId =
    data.accountId || data.account_id || data.id ||
    (data.account && data.account.accountId) ||
    null;
  const addresses = data.addresses || data.addressList || data.address_list || null;
  return { accountId, addresses, isNew: !!(data.isNew || data.is_new) };
}

// ─── HTTP layer ──────────────────────────────────────────────
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 64 * 1024) { req.destroy(); reject(new Error('body too large')); }});
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

function getEmailFromAuth(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const payload = verifyToken(m[1]);
  return payload && payload.email ? payload.email : null;
}

async function handleSendOtp(req, res) {
  const body = await readJson(req);
  const email = String(body.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { ok: false, error: 'invalid email' });

  const locale = (body.locale || 'zh-CN').toString();
  const r = await runOnchainos(email, ['wallet', 'login', email, '--locale', locale]);
  if (r.code === 0) return send(res, 200, { ok: true });

  // 已经登录过的用户再 login 也算 OK：把状态当作可发 OTP（onchainos 会自动 re-issue）
  if ((r.stderr || '').match(/already.*log/i)) return send(res, 200, { ok: true });
  return send(res, 502, { ok: false, error: r.error || r.stderr || r.stdout || `exit ${r.code}` });
}

async function handleVerifyOtp(req, res) {
  const body = await readJson(req);
  const email = String(body.email || '').trim();
  const code = String(body.code || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { ok: false, error: 'invalid email' });
  if (!/^\d{4,8}$/.test(code)) return send(res, 400, { ok: false, error: 'invalid code' });

  const r = await runOnchainos(email, ['wallet', 'verify', code]);
  if (r.code !== 0) {
    return send(res, 401, { ok: false, error: r.error || r.stderr || r.stdout || `exit ${r.code}` });
  }

  const { accountId, addresses, isNew } = extractAccount(r);

  // 拿到地址（部分版本 verify 不直接返回地址，需要再查一次）
  let addrs = addresses;
  if (!addrs) {
    const a = await runOnchainos(email, ['wallet', 'addresses']);
    if (a.code === 0 && a.json) addrs = a.json.data?.addresses || a.json.addresses || a.json.data || a.json;
  }

  const token = signToken({ email, accountId, exp: Date.now() + TOKEN_TTL_MS });
  return send(res, 200, {
    ok: true,
    token,
    accountId,
    isNew,
    addresses: normalizeAddresses(addrs),
    raw: process.env.WALLET_DEBUG ? r : undefined,
  });
}

// 把不同形态的 addresses 输出统一成 { evm: [...], solana: [...], xlayer: [...] }
function normalizeAddresses(raw) {
  if (!raw) return { evm: [], solana: [], xlayer: [] };

  const list = Array.isArray(raw) ? raw : raw.addressList || raw.list || raw.addresses || [];
  const out = { evm: [], solana: [], xlayer: [] };

  for (const a of list) {
    if (!a) continue;
    const addr = a.address || a.addr;
    const chainName = a.chainName || a.chain_name || a.chain || a.name || '';
    const chainIndex = String(a.chainIndex || a.chain_index || a.chainId || a.chain_id || '');
    if (!addr) continue;
    const item = { address: addr, chainName, chainIndex };
    const cn = String(chainName).toLowerCase();
    if (cn.includes('solana') || chainIndex === '501') out.solana.push(item);
    else if (cn.includes('x layer') || cn.includes('xlayer') || chainIndex === '196') {
      out.xlayer.push(item); out.evm.push(item);
    }
    else out.evm.push(item);
  }

  // 已经是分组对象（evm / solana / xlayer）
  if ((!list || list.length === 0) && typeof raw === 'object') {
    if (raw.evm) out.evm = raw.evm;
    if (raw.solana) out.solana = raw.solana;
    if (raw.xlayer) out.xlayer = raw.xlayer;
  }
  return out;
}

async function handleAddresses(req, res) {
  const email = getEmailFromAuth(req);
  if (!email) return send(res, 401, { ok: false, error: 'unauthorized' });
  const url = new URL(req.url, 'http://x');
  const args = ['wallet', 'addresses'];
  const chain = url.searchParams.get('chain');
  if (chain) args.push('--chain', chain);
  const r = await runOnchainos(email, args);
  if (r.code !== 0) return send(res, 502, { ok: false, error: r.stderr || r.stdout || `exit ${r.code}` });
  return send(res, 200, { ok: true, addresses: normalizeAddresses(r.json?.data || r.json) });
}

async function handleBalance(req, res) {
  const email = getEmailFromAuth(req);
  if (!email) return send(res, 401, { ok: false, error: 'unauthorized' });
  const url = new URL(req.url, 'http://x');
  const args = ['wallet', 'balance'];
  const chain = url.searchParams.get('chain');
  if (chain) args.push('--chain', chain);
  const tokenAddr = url.searchParams.get('tokenAddress');
  if (tokenAddr) args.push('--token-address', tokenAddr);
  if (url.searchParams.get('all') === '1') args.push('--all');
  if (url.searchParams.get('force') === '1') args.push('--force');

  const r = await runOnchainos(email, args, { timeoutMs: 60000 });
  if (r.code !== 0) return send(res, 502, { ok: false, error: r.stderr || r.stdout || `exit ${r.code}` });
  return send(res, 200, { ok: true, data: r.json?.data ?? r.json ?? r.stdout });
}

async function handleHistory(req, res) {
  const email = getEmailFromAuth(req);
  if (!email) return send(res, 401, { ok: false, error: 'unauthorized' });
  const url = new URL(req.url, 'http://x');
  const args = ['wallet', 'history'];
  const chain = url.searchParams.get('chain');
  if (chain) args.push('--chain', chain);
  const limit = url.searchParams.get('limit');
  if (limit) args.push('--limit', limit);
  const r = await runOnchainos(email, args, { timeoutMs: 30000 });
  if (r.code !== 0) return send(res, 502, { ok: false, error: r.stderr || r.stdout || `exit ${r.code}` });
  return send(res, 200, { ok: true, data: r.json?.data ?? r.json ?? r.stdout });
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    const { pathname } = new URL(req.url, 'http://x');

    if (req.method === 'GET' && pathname === '/health') {
      const onchainosOk = fs.existsSync(ONCHAINOS);
      return send(res, 200, { ok: true, service: 'h-wallet-backend', onchainos: onchainosOk, time: new Date().toISOString() });
    }
    if (req.method === 'POST' && pathname === '/api/auth/send-otp')   return handleSendOtp(req, res);
    if (req.method === 'POST' && pathname === '/api/auth/verify-otp') return handleVerifyOtp(req, res);
    if (req.method === 'GET'  && pathname === '/api/wallet/addresses') return handleAddresses(req, res);
    if (req.method === 'GET'  && pathname === '/api/wallet/balance')   return handleBalance(req, res);
    if (req.method === 'GET'  && pathname === '/api/wallet/history')   return handleHistory(req, res);

    return send(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    return send(res, 500, { ok: false, error: e.message || 'internal error' });
  }
});

ensureDir(DATA_ROOT);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[h-wallet-backend] listening on :${PORT}`);
  console.log(`[h-wallet-backend] onchainos = ${ONCHAINOS} (exists=${fs.existsSync(ONCHAINOS)})`);
  console.log(`[h-wallet-backend] data dir  = ${DATA_ROOT}`);
});
