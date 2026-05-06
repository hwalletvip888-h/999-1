/**
 * okxClient — OKX V5 CEX REST API HTTP 客户端
 *
 * ⚠️ 产品线归属：V5（AI 合约策略）
 *   - 本文件只服务 V5 产品线（永续 / 网格 / 现货 / Algo 等中心化交易所交易）
 *   - V6（链上赚币）请使用 ./okxOnchainClient
 *   - 两者命名锁定，不互相调用，参见 H_Wallet_V5_V6_Product_Skills.md
 *
 * 基于 okx-contract-monitor 技能模板改写，
 * 适配 React Native (Expo) 环境：使用 fetch 替代 Node https 模块。
 *
 * 签名方式：HMAC-SHA256 → Base64
 * 签名内容 = timestamp + method + requestPath + body
 */

// 传输层 + 签名 / 类型 → 都来自中性 core，V5/V6 共享同一份实现，不互相依赖
import { request as coreRequest, type OkxCredentials, type OkxResponse } from './okxHttpCore';

// re-export 给现有 V5 服务（H_PerpetualApi / H_GridApi / H_AlgoApi / H_BotApi 等）使用
export type { OkxCredentials, OkxResponse };
export const request = coreRequest;

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

