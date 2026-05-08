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
  if (sessionTokenHasAccessToken(token)) {
    return new OkxHttpAgentWalletProvider().getBalance(token);
  }
  const provider = await getAgentWalletProvider();
  return provider.getBalance(token);
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
