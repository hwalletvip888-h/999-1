/**
 * OKX REST API v5 HTTP 客户端
 *
 * 基于 okx-contract-monitor 技能模板改写，
 * 适配 React Native (Expo) 环境：使用 fetch 替代 Node https 模块。
 *
 * 签名方式：HMAC-SHA256 → Base64
 * 签名内容 = timestamp + method + requestPath + body
 */

import CryptoJS from 'crypto-js';

// ─── 类型定义 ──────────────────────────────────────────────────

export interface OkxCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

export interface OkxResponse<T = any> {
  code: string;
  msg: string;
  data: T;
}

// ─── 配置 ──────────────────────────────────────────────────────

const BASE_URL = 'https://www.okx.com';
const TIMEOUT_MS = 15000;

// ─── 签名 ──────────────────────────────────────────────────────

function sign(
  timestamp: string,
  method: string,
  path: string,
  body: string,
  secretKey: string
): string {
  const msg = timestamp + method + path + body;
  const hash = CryptoJS.HmacSHA256(msg, secretKey);
  return CryptoJS.enc.Base64.stringify(hash);
}

// ─── 请求封装 ──────────────────────────────────────────────────

export async function request<T = any>(
  method: 'GET' | 'POST',
  path: string,
  creds?: OkxCredentials | null,
  body?: Record<string, any>
): Promise<OkxResponse<T>> {
  const ts = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (creds) {
    headers['OK-ACCESS-KEY'] = creds.apiKey;
    headers['OK-ACCESS-SIGN'] = sign(ts, method, path, bodyStr, creds.secretKey);
    headers['OK-ACCESS-TIMESTAMP'] = ts;
    headers['OK-ACCESS-PASSPHRASE'] = creds.passphrase;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: method === 'POST' && bodyStr ? bodyStr : undefined,
      signal: controller.signal,
    });
    const json = await res.json();
    return json as OkxResponse<T>;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`[OKX] 请求超时: ${method} ${path}`);
    }
    throw new Error(`[OKX] 请求失败: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

// ─── 公开接口（无需签名） ──────────────────────────────────────

/** 获取单个交易对 Ticker */
export const getTicker = (instId: string) =>
  request('GET', `/api/v5/market/ticker?instId=${instId}`);

/** 获取 K 线数据 */
export const getCandles = (instId: string, bar = '1H', limit = 100) =>
  request('GET', `/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`);

/** 获取资金费率 */
export const getFundingRate = (instId: string) =>
  request('GET', `/api/v5/public/funding-rate?instId=${instId}`);

/** 获取持仓量 */
export const getOpenInterest = (instId: string) =>
  request('GET', `/api/v5/public/open-interest?instId=${instId}&instType=SWAP`);

/** 获取标记价格 */
export const getMarkPrice = (instId: string) =>
  request('GET', `/api/v5/public/mark-price?instId=${instId}&instType=SWAP`);

/** 获取所有 Ticker（SWAP） */
export const getAllTickers = () =>
  request('GET', '/api/v5/market/tickers?instType=SWAP');

/** 获取深度数据 */
export const getOrderBook = (instId: string, sz = '20') =>
  request('GET', `/api/v5/market/books?instId=${instId}&sz=${sz}`);

// ─── 私有接口（需要签名） ──────────────────────────────────────

/** 获取账户余额 */
export const getBalance = (creds: OkxCredentials) =>
  request('GET', '/api/v5/account/balance', creds);

/** 获取指定合约持仓 */
export const getPositions = (creds: OkxCredentials, instId: string) =>
  request('GET', `/api/v5/account/positions?instId=${instId}&instType=SWAP`, creds);

/** 获取所有 SWAP 持仓 */
export const getAllPositions = (creds: OkxCredentials) =>
  request('GET', '/api/v5/account/positions?instType=SWAP', creds);

/** 获取算法委托订单 */
export const getAlgoOrders = (creds: OkxCredentials, instId: string) =>
  request('GET', `/api/v5/trade/orders-algo-pending?instType=SWAP&instId=${instId}`, creds);

/** 获取成交记录 */
export const getFills = (creds: OkxCredentials, instId: string) =>
  request('GET', `/api/v5/trade/fills?instType=SWAP&instId=${instId}&limit=20`, creds);

/** 获取账单流水 */
export const getBills = (creds: OkxCredentials) =>
  request('GET', '/api/v5/account/bills?limit=20', creds);

/** 获取当前挂单 */
export const getPendingOrders = (creds: OkxCredentials, instId?: string) =>
  request('GET', `/api/v5/trade/orders-pending${instId ? `?instId=${instId}&instType=SWAP` : '?instType=SWAP'}`, creds);

// ─── 交易接口 ──────────────────────────────────────────────────

/** 设置杠杆 */
export const setLeverage = (
  creds: OkxCredentials,
  instId: string,
  lever: number,
  mgnMode: 'isolated' | 'cross' = 'isolated'
) =>
  request('POST', '/api/v5/account/set-leverage', creds, {
    instId,
    lever: String(lever),
    mgnMode,
  });

/** 下单 */
export const placeOrder = (creds: OkxCredentials, params: Record<string, any>) =>
  request('POST', '/api/v5/trade/order', creds, params);

/** 平仓 */
export const closePosition = (
  creds: OkxCredentials,
  instId: string,
  mgnMode: 'isolated' | 'cross' = 'isolated'
) =>
  request('POST', '/api/v5/trade/close-position', creds, { instId, mgnMode });

/** 撤销算法委托 */
export const cancelAlgoOrder = (creds: OkxCredentials, orders: any[]) =>
  request('POST', '/api/v5/trade/cancel-algos', creds, orders);

/** 下算法委托单（止盈止损） */
export const placeAlgoOrder = (creds: OkxCredentials, params: Record<string, any>) =>
  request('POST', '/api/v5/trade/order-algo', creds, params);

/** 撤单 */
export const cancelOrder = (creds: OkxCredentials, instId: string, ordId: string) =>
  request('POST', '/api/v5/trade/cancel-order', creds, { instId, ordId });

// ─── 网格交易接口 ──────────────────────────────────────────────

/** 下网格策略单 */
export const placeGridOrder = (creds: OkxCredentials, params: Record<string, any>) =>
  request('POST', '/api/v5/tradingBot/grid/order-algo', creds, params);

/** 停止网格策略 */
export const stopGridOrder = (creds: OkxCredentials, algoId: string, instId: string) =>
  request('POST', '/api/v5/tradingBot/grid/stop-order-algo', creds, [{
    algoId,
    instId,
    instType: 'SWAP',
    stopType: '1', // 1=停止并平仓
  }]);

/** 获取运行中的网格策略 */
export const getGridOrders = (creds: OkxCredentials, algoOrdType: 'contract_grid' | 'grid' = 'contract_grid') =>
  request('GET', `/api/v5/tradingBot/grid/orders-algo-pending?algoOrdType=${algoOrdType}`, creds);

/** 获取网格策略历史 */
export const getGridOrdersHistory = (creds: OkxCredentials, algoOrdType: 'contract_grid' | 'grid' = 'contract_grid') =>
  request('GET', `/api/v5/tradingBot/grid/orders-algo-history?algoOrdType=${algoOrdType}`, creds);

/** 获取网格子订单 */
export const getGridSubOrders = (creds: OkxCredentials, algoId: string, type: 'live' | 'filled' = 'filled') =>
  request('GET', `/api/v5/tradingBot/grid/sub-orders?algoId=${algoId}&type=${type}`, creds);

// ─── 资金划转接口 ──────────────────────────────────────────────
/** 资金划转（交易账户 ↔ 资金账户） */
export const transfer = (
  creds: OkxCredentials,
  ccy: string,
  amt: string,
  from: '6' | '18',
  to: '6' | '18'
) =>
  request('POST', '/api/v5/asset/transfer', creds, { ccy, amt, from, to, type: '0' });

