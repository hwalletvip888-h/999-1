/**
 * WalletBackend — H Wallet 后端服务
 * 
 * 实现方式：
 * 1. 邮箱 OTP 登录：调用 OKX Agentic Wallet 真实 API
 *    - /priapi/v5/wallet/agentic/auth/init → OKX 发送验证码到用户邮箱
 *    - /priapi/v5/wallet/agentic/auth/verify → 验证 OTP，自动创建钱包
 * 2. 地址查询：通过 JWT token 调用 OKX wallet API
 * 
 * 不依赖 onchainos CLI，纯 HTTP 实现
 */
import * as http from 'http';
import * as crypto from 'crypto';

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

  const url = req.url || '';
  res.setHeader('Content-Type', 'application/json');

  try {
    if (url === '/api/auth/send-otp' && req.method === 'POST') {
      const body = await parseBody(req);
      const result = await handleSendOtp(body.email);
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } else if (url === '/api/auth/verify-otp' && req.method === 'POST') {
      const body = await parseBody(req);
      const result = await handleVerifyOtp(body.email, body.code);
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } else if (url === '/api/wallet/addresses' && req.method === 'GET') {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const result = await handleGetAddresses(token);
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } else if (url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, service: 'h-wallet-backend', mode: 'okx-agentic-real' }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err: any) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message || 'Internal error' }));
  }
});

if (require.main === module || process.argv[1]?.includes('walletBackend')) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[WalletBackend] 🚀 服务已启动: http://0.0.0.0:${PORT}`);
    console.log(`[WalletBackend] 模式: OKX Agentic Wallet (真实 OTP)`);
    console.log(`[WalletBackend] OKX API: ${OKX_BASE_URL}`);
    console.log(`[WalletBackend] 健康检查: http://localhost:${PORT}/health`);
  });
}

export { handleSendOtp, handleVerifyOtp, handleGetAddresses };
