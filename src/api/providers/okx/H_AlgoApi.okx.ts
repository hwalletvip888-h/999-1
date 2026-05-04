/**
 * OKX Provider — H_AlgoApi 算法委托实现
 *
 * 对接 OKX V5 Algo Trading 接口：
 *   POST /api/v5/trade/order-algo
 *   POST /api/v5/trade/cancel-algos
 *   POST /api/v5/trade/amend-algos
 *   GET  /api/v5/trade/order-algo
 *   GET  /api/v5/trade/orders-algo-pending
 *   GET  /api/v5/trade/orders-algo-history
 */

import type {
  IH_AlgoApi,
  H_TrailingStopParams,
  H_ConditionalParams,
  H_TriggerOrderParams,
  H_ChaseOrderParams,
  H_TwapOrderParams,
  H_AmendAlgoParams,
  H_AlgoOrder,
  H_AlgoOrderType,
  H_AlgoStatus,
} from '../../contracts/H_AlgoApi';
import type { OkxCredentials } from './okxClient';
import { request } from './okxClient';

// ─── 映射工具 ──────────────────────────────────────────────────

/** OKX ordType → H_AlgoOrderType */
function mapAlgoType(ordType: string): H_AlgoOrderType {
  switch (ordType) {
    case 'move_order_stop':
      return 'trailing_stop';
    case 'conditional':
      return 'conditional';
    case 'trigger':
      return 'trigger';
    case 'chase':
      return 'chase';
    case 'twap':
      return 'twap';
    default:
      return 'trigger'; // 兜底
  }
}

/** H_AlgoOrderType → OKX ordType */
function toOkxOrdType(algoType: H_AlgoOrderType): string {
  switch (algoType) {
    case 'trailing_stop':
      return 'move_order_stop';
    case 'conditional':
      return 'conditional';
    case 'trigger':
      return 'trigger';
    case 'chase':
      return 'chase';
    case 'twap':
      return 'twap';
    default:
      return 'trigger';
  }
}

/** OKX state → H_AlgoStatus */
function mapAlgoStatus(state: string): H_AlgoStatus {
  switch (state) {
    case 'live':
      return 'live';
    case 'partially_effective':
      return 'partially_effective';
    case 'effective':
      return 'effective';
    case 'canceled':
      return 'canceled';
    case 'order_failed':
      return 'order_failed';
    default:
      return 'live';
  }
}

/** 解析 OKX 响应为 H_AlgoOrder */
function parseAlgoOrder(d: any): H_AlgoOrder {
  return {
    algoId: d.algoId || '',
    algoClOrdId: d.algoClOrdId || undefined,
    instId: d.instId || '',
    algoType: mapAlgoType(d.ordType),
    rawOrdType: d.ordType || '',
    side: d.side === 'buy' ? 'buy' : 'sell',
    posSide: d.posSide === 'long' ? 'long' : d.posSide === 'short' ? 'short' : 'net',
    sz: d.sz || '0',
    status: mapAlgoStatus(d.state),
    lever: d.lever || '1',
    // 追踪止损
    callbackRatio: d.callbackRatio || undefined,
    callbackSpread: d.callbackSpread || undefined,
    activePx: d.activePx || undefined,
    moveTriggerPx: d.moveTriggerPx || undefined,
    // 条件委托
    tpTriggerPx: d.tpTriggerPx || undefined,
    tpOrdPx: d.tpOrdPx || undefined,
    slTriggerPx: d.slTriggerPx || undefined,
    slOrdPx: d.slOrdPx || undefined,
    // 计划委托
    triggerPx: d.triggerPx || undefined,
    orderPx: d.ordPx || undefined,
    // TWAP
    szLimit: d.szLimit || undefined,
    pxLimit: d.pxLimit || undefined,
    timeInterval: d.timeInterval || undefined,
    // 时间
    createTime: Number(d.cTime) || 0,
    triggerTime: d.triggerTime ? Number(d.triggerTime) : undefined,
  };
}

// ─── OKX Provider 实现 ─────────────────────────────────────────

export class OkxH_AlgoApi implements IH_AlgoApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  /** 下追踪止损单 */
  async placeTrailingStop(params: H_TrailingStopParams): Promise<H_AlgoOrder> {
    const body: Record<string, any> = {
      instId: params.instId,
      // 算法委托统一使用全仓模式，与 PerpetualApi 的逐仓模式独立；
      // 算法单在全仓下更灵活，可跨仓位生效
      tdMode: 'cross',
      side: params.side,
      ordType: 'move_order_stop',
      sz: params.sz,
    };
    if (params.posSide) body.posSide = params.posSide;
    if (params.callbackRatio) body.callbackRatio = params.callbackRatio;
    if (params.callbackSpread) body.callbackSpread = params.callbackSpread;
    if (params.activePx) body.activePx = params.activePx;
    if (params.reduceOnly) body.reduceOnly = 'true';

    const res = await request('POST', '/api/v5/trade/order-algo', this.creds, body);
    if (res.code !== '0') {
      throw new Error(`[H_AlgoApi] placeTrailingStop failed: ${res.msg} (code: ${res.code})`);
    }
    const algoId = res.data?.[0]?.algoId || '';
    // 查询完整订单信息返回
    return this.getAlgoOrder(algoId);
  }

  /** 下条件委托（止盈止损）单 */
  async placeConditional(params: H_ConditionalParams): Promise<H_AlgoOrder> {
    const body: Record<string, any> = {
      instId: params.instId,
      tdMode: 'cross',
      side: params.side,
      ordType: 'conditional',
      sz: params.sz,
    };
    if (params.posSide) body.posSide = params.posSide;
    if (params.tpTriggerPx) body.tpTriggerPx = params.tpTriggerPx;
    if (params.tpTriggerPxType) body.tpTriggerPxType = params.tpTriggerPxType;
    if (params.tpOrdPx) body.tpOrdPx = params.tpOrdPx;
    if (params.slTriggerPx) body.slTriggerPx = params.slTriggerPx;
    if (params.slTriggerPxType) body.slTriggerPxType = params.slTriggerPxType;
    if (params.slOrdPx) body.slOrdPx = params.slOrdPx;
    if (params.cxlOnClosePos) body.cxlOnClosePos = 'true';
    if (params.reduceOnly) body.reduceOnly = 'true';

    const res = await request('POST', '/api/v5/trade/order-algo', this.creds, body);
    if (res.code !== '0') {
      throw new Error(`[H_AlgoApi] placeConditional failed: ${res.msg} (code: ${res.code})`);
    }
    const algoId = res.data?.[0]?.algoId || '';
    return this.getAlgoOrder(algoId);
  }

  /** 下计划委托单 */
  async placeTriggerOrder(params: H_TriggerOrderParams): Promise<H_AlgoOrder> {
    const body: Record<string, any> = {
      instId: params.instId,
      tdMode: 'cross',
      side: params.side,
      ordType: 'trigger',
      sz: params.sz,
      triggerPx: params.triggerPx,
      orderPx: params.orderPx,
    };
    if (params.posSide) body.posSide = params.posSide;
    if (params.triggerPxType) body.triggerPxType = params.triggerPxType;
    if (params.reduceOnly) body.reduceOnly = 'true';

    const res = await request('POST', '/api/v5/trade/order-algo', this.creds, body);
    if (res.code !== '0') {
      throw new Error(`[H_AlgoApi] placeTriggerOrder failed: ${res.msg} (code: ${res.code})`);
    }
    const algoId = res.data?.[0]?.algoId || '';
    return this.getAlgoOrder(algoId);
  }

  /** 下追踪委托单（仅 FUTURES/SWAP） */
  async placeChaseOrder(params: H_ChaseOrderParams): Promise<H_AlgoOrder> {
    const body: Record<string, any> = {
      instId: params.instId,
      tdMode: 'cross',
      side: params.side,
      ordType: 'chase',
      sz: params.sz,
    };
    if (params.posSide) body.posSide = params.posSide;
    if (params.reduceOnly) body.reduceOnly = 'true';

    const res = await request('POST', '/api/v5/trade/order-algo', this.creds, body);
    if (res.code !== '0') {
      throw new Error(`[H_AlgoApi] placeChaseOrder failed: ${res.msg} (code: ${res.code})`);
    }
    const algoId = res.data?.[0]?.algoId || '';
    return this.getAlgoOrder(algoId);
  }

  /** 下 TWAP 时间加权单 */
  async placeTwapOrder(params: H_TwapOrderParams): Promise<H_AlgoOrder> {
    const body: Record<string, any> = {
      instId: params.instId,
      tdMode: 'cross',
      side: params.side,
      ordType: 'twap',
      sz: params.sz,
      szLimit: params.szLimit,
      pxLimit: params.pxLimit,
      timeInterval: params.timeInterval,
    };
    if (params.posSide) body.posSide = params.posSide;
    if (params.pxSpread) body.pxSpread = params.pxSpread;

    const res = await request('POST', '/api/v5/trade/order-algo', this.creds, body);
    if (res.code !== '0') {
      throw new Error(`[H_AlgoApi] placeTwapOrder failed: ${res.msg} (code: ${res.code})`);
    }
    const algoId = res.data?.[0]?.algoId || '';
    return this.getAlgoOrder(algoId);
  }

  /** 修改算法委托（仅 trigger / conditional） */
  async amendAlgoOrder(params: H_AmendAlgoParams): Promise<boolean> {
    const body: Record<string, any> = {
      instId: params.instId,
      algoId: params.algoId,
    };
    if (params.newTpTriggerPx) body.newTpTriggerPx = params.newTpTriggerPx;
    if (params.newTpOrdPx) body.newTpOrdPx = params.newTpOrdPx;
    if (params.newSlTriggerPx) body.newSlTriggerPx = params.newSlTriggerPx;
    if (params.newSlOrdPx) body.newSlOrdPx = params.newSlOrdPx;
    if (params.newTriggerPx) body.newTriggerPx = params.newTriggerPx;
    if (params.newOrderPx) body.newOrdPx = params.newOrderPx;
    if (params.newSz) body.newSz = params.newSz;

    const res = await request('POST', '/api/v5/trade/amend-algos', this.creds, body);
    return res.code === '0';
  }

  /** 撤销算法委托 */
  async cancelAlgoOrder(algoId: string, instId: string): Promise<boolean> {
    const res = await request('POST', '/api/v5/trade/cancel-algos', this.creds, [
      { algoId, instId },
    ]);
    return res.code === '0';
  }

  /** 批量撤销算法委托 */
  async cancelAlgoOrders(orders: Array<{ algoId: string; instId: string }>): Promise<boolean> {
    const res = await request('POST', '/api/v5/trade/cancel-algos', this.creds, orders);
    return res.code === '0';
  }

  /** 获取单个算法委托详情 */
  async getAlgoOrder(algoId: string): Promise<H_AlgoOrder> {
    const res = await request(
      'GET',
      `/api/v5/trade/order-algo?algoId=${algoId}`,
      this.creds
    );
    if (res.code !== '0' || !res.data?.[0]) {
      throw new Error(`[H_AlgoApi] getAlgoOrder failed: ${res.msg} (code: ${res.code})`);
    }
    return parseAlgoOrder(res.data[0]);
  }

  /** 获取待触发算法委托列表 */
  async getAlgoPendingOrders(
    ordType?: H_AlgoOrderType,
    instId?: string
  ): Promise<H_AlgoOrder[]> {
    let path = '/api/v5/trade/orders-algo-pending?instType=SWAP';
    if (ordType) path += `&ordType=${toOkxOrdType(ordType)}`;
    if (instId) path += `&instId=${instId}`;

    const res = await request('GET', path, this.creds);
    if (res.code !== '0') {
      throw new Error(`[H_AlgoApi] getAlgoPendingOrders failed: ${res.msg}`);
    }
    return (res.data || []).map(parseAlgoOrder);
  }

  /** 获取算法委托历史 */
  async getAlgoHistory(
    ordType?: H_AlgoOrderType,
    instId?: string,
    limit?: number
  ): Promise<H_AlgoOrder[]> {
    // OKX 要求 ordType 必填，未传时默认查询 conditional（止盈止损）历史
    const effectiveOrdType = ordType ? toOkxOrdType(ordType) : 'conditional';
    let path = `/api/v5/trade/orders-algo-history?instType=SWAP&ordType=${effectiveOrdType}`;
    if (instId) path += `&instId=${instId}`;
    if (limit) path += `&limit=${limit}`;

    const res = await request('GET', path, this.creds);
    if (res.code !== '0') {
      throw new Error(`[H_AlgoApi] getAlgoHistory failed: ${res.msg}`);
    }
    return (res.data || []).map(parseAlgoOrder);
  }
}
