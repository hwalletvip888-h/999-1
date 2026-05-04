/**
 * OKX Provider — H_BotApi 策略 Bot 管理实现
 *
 * 对接 OKX V5 Trading Bot 接口：
 *   /api/v5/tradingBot/signal/*   — Signal Bot
 *   /api/v5/tradingBot/dca/*      — DCA Bot
 */

import type {
  IH_BotApi,
  H_CreateSignalParams,
  H_SignalSubOrderParams,
  H_SignalCloseParams,
  H_CreateDcaParams,
  H_SignalBot,
  H_DcaBot,
  H_BotPerformance,
  H_BotType,
  H_BotStatus,
} from '../../contracts/H_BotApi';
import type { OkxCredentials } from './okxClient';
import { request } from './okxClient';

// ─── 映射工具 ──────────────────────────────────────────────────

/** OKX Bot 状态 → H_BotStatus */
function mapBotStatus(state: string): H_BotStatus {
  switch (state) {
    case 'running':
    case 'active':
      return 'running';
    case 'stopping':
      return 'stopping';
    case 'stopped':
    case 'closed':
      return 'stopped';
    default:
      return 'error';
  }
}

/** 解析 Signal Bot 响应 */
function parseSignalBot(d: any): H_SignalBot {
  return {
    signalId: d.signalChanId || d.algoId || '',
    signalName: d.signalChanName || '',
    status: mapBotStatus(d.state || d.status || ''),
    instIds: d.instIds ? (typeof d.instIds === 'string' ? d.instIds.split(',') : d.instIds) : [],
    lever: d.lever || '1',
    investAmt: d.investAmt || '0',
    realizedPnl: d.realizedPnl || '0',
    unrealizedPnl: d.unrealizedPnl || '0',
    totalReturn: d.totalPnlRatio || '0',
    createTime: Number(d.cTime) || 0,
  };
}

/** 解析 DCA Bot 响应 */
function parseDcaBot(d: any): H_DcaBot {
  return {
    algoId: d.algoId || '',
    instId: d.instId || '',
    status: mapBotStatus(d.state || d.status || ''),
    side: d.side === 'sell' ? 'sell' : 'buy',
    lever: d.lever || '1',
    investAmt: d.investAmt || '0',
    firstOrderAmt: d.firstOrdAmt || d.firstOrderAmt || '0',
    addPosInterval: d.addPosInterval || '0',
    addPosCount: Number(d.addPosCount) || 0,
    realizedPnl: d.realizedPnl || '0',
    unrealizedPnl: d.unrealizedPnl || '0',
    totalReturn: d.totalPnlRatio || '0',
    createTime: Number(d.cTime) || 0,
  };
}

// ─── OKX Provider 实现 ─────────────────────────────────────────

export class OkxH_BotApi implements IH_BotApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  // ── Signal Bot ──────────────────────────────────────────────

  /** 创建 Signal Bot */
  async createSignalBot(params: H_CreateSignalParams): Promise<H_SignalBot> {
    const body: Record<string, any> = {
      signalChanName: params.signalName,
      instIds: params.instIds,
      lever: params.lever,
      investAmt: params.investAmt,
    };
    if (params.mgnMode) body.mgnMode = params.mgnMode;

    const res = await request(
      'POST',
      '/api/v5/tradingBot/signal/create-signal',
      this.creds,
      body
    );
    if (res.code !== '0') {
      throw new Error(`[H_BotApi] createSignalBot failed: ${res.msg} (code: ${res.code})`);
    }
    const signalId = res.data?.[0]?.signalChanId || '';
    // 返回构造的 Signal Bot 实例
    return {
      signalId,
      signalName: params.signalName,
      status: 'running',
      instIds: params.instIds,
      lever: params.lever,
      investAmt: params.investAmt,
      realizedPnl: '0',
      unrealizedPnl: '0',
      totalReturn: '0',
      createTime: Date.now(),
    };
  }

  /** 下 Signal Bot 子订单 */
  async placeSignalSubOrder(params: H_SignalSubOrderParams): Promise<boolean> {
    const body: Record<string, any> = {
      signalChanId: params.signalId,
      instId: params.instId,
      side: params.side,
      ordType: params.orderType === 'limit' ? 'limit' : 'market',
      sz: params.sz,
    };
    if (params.price) body.px = params.price;

    const res = await request(
      'POST',
      '/api/v5/tradingBot/signal/sub-order',
      this.creds,
      body
    );
    return res.code === '0';
  }

  /** 撤销 Signal Bot 子订单 */
  async cancelSignalSubOrder(signalId: string, instId: string): Promise<boolean> {
    const res = await request(
      'POST',
      '/api/v5/tradingBot/signal/cancel-sub-order',
      this.creds,
      { signalChanId: signalId, instId }
    );
    return res.code === '0';
  }

  /** Signal Bot 平仓 */
  async closeSignalPosition(params: H_SignalCloseParams): Promise<boolean> {
    const res = await request(
      'POST',
      '/api/v5/tradingBot/signal/close-position',
      this.creds,
      { signalChanId: params.signalId, instId: params.instId }
    );
    return res.code === '0';
  }

  /** 停止 Signal Bot */
  async stopSignalBot(signalId: string): Promise<boolean> {
    const res = await request(
      'POST',
      '/api/v5/tradingBot/signal/stop-signal',
      this.creds,
      { signalChanId: signalId }
    );
    return res.code === '0';
  }

  /** 获取 Signal Bot 列表 */
  async getSignalBots(status?: H_BotStatus): Promise<H_SignalBot[]> {
    const path = '/api/v5/tradingBot/signal/signals';
    const res = await request('GET', path, this.creds);
    if (res.code !== '0') {
      throw new Error(`[H_BotApi] getSignalBots failed: ${res.msg}`);
    }
    let bots = (res.data || []).map(parseSignalBot);
    if (status) {
      bots = bots.filter((b: H_SignalBot) => b.status === status);
    }
    return bots;
  }

  // ── DCA Bot ─────────────────────────────────────────────────

  /** 创建 DCA Bot */
  async createDcaBot(params: H_CreateDcaParams): Promise<H_DcaBot> {
    const body: Record<string, any> = {
      instId: params.instId,
      investAmt: params.investAmt,
      lever: params.lever,
      side: params.side,
      firstOrdAmt: params.firstOrderAmt,
      addPosInterval: params.addPosInterval,
      addPosMul: params.addPosMul,
    };
    if (params.tpRatio) body.tpRatio = params.tpRatio;
    if (params.slRatio) body.slRatio = params.slRatio;
    if (params.maxAddPos) body.maxAddPos = params.maxAddPos;

    const res = await request(
      'POST',
      '/api/v5/tradingBot/dca/order-algo',
      this.creds,
      body
    );
    if (res.code !== '0') {
      throw new Error(`[H_BotApi] createDcaBot failed: ${res.msg} (code: ${res.code})`);
    }
    const algoId = res.data?.[0]?.algoId || '';
    return {
      algoId,
      instId: params.instId,
      status: 'running',
      side: params.side,
      lever: params.lever,
      investAmt: params.investAmt,
      firstOrderAmt: params.firstOrderAmt,
      addPosInterval: params.addPosInterval,
      addPosCount: 0,
      realizedPnl: '0',
      unrealizedPnl: '0',
      totalReturn: '0',
      createTime: Date.now(),
    };
  }

  /** 停止 DCA Bot */
  async stopDcaBot(algoId: string): Promise<boolean> {
    const res = await request(
      'POST',
      '/api/v5/tradingBot/dca/stop-order-algo',
      this.creds,
      [{ algoId }]
    );
    return res.code === '0';
  }

  /** 获取 DCA Bot 列表 */
  async getDcaBots(status?: H_BotStatus): Promise<H_DcaBot[]> {
    const path = '/api/v5/tradingBot/dca/orders-algo-pending';
    const res = await request('GET', path, this.creds);
    if (res.code !== '0') {
      throw new Error(`[H_BotApi] getDcaBots failed: ${res.msg}`);
    }
    let bots = (res.data || []).map(parseDcaBot);
    if (status) {
      bots = bots.filter((b: H_DcaBot) => b.status === status);
    }
    return bots;
  }

  // ── 通用监控 ────────────────────────────────────────────────

  /** 获取 Bot 收益统计 */
  async getBotPerformance(botId: string, botType: H_BotType): Promise<H_BotPerformance> {
    // Signal Bot 和 DCA Bot 使用不同的查询接口
    if (botType === 'signal') {
      const res = await request(
        'GET',
        `/api/v5/tradingBot/signal/orders-algo-details?signalChanId=${botId}`,
        this.creds
      );
      if (res.code !== '0') {
        throw new Error(`[H_BotApi] getBotPerformance(signal) failed: ${res.msg}`);
      }
      const d = res.data?.[0] || {};
      return {
        botId,
        botType: 'signal',
        totalPnl: d.totalPnl || '0',
        totalReturn: d.totalPnlRatio || '0',
        winRate: d.winRate || '0',
        totalTrades: Number(d.totalTrades) || 0,
        winTrades: Number(d.winTrades) || 0,
        lossTrades: Number(d.lossTrades) || 0,
        maxDrawdown: d.maxDrawdown || '0',
        runningDuration: Number(d.runningDuration) || 0,
      };
    }

    // DCA Bot
    const res = await request(
      'GET',
      `/api/v5/tradingBot/dca/orders-algo-details?algoId=${botId}`,
      this.creds
    );
    if (res.code !== '0') {
      throw new Error(`[H_BotApi] getBotPerformance(dca) failed: ${res.msg}`);
    }
    const d = res.data?.[0] || {};
    return {
      botId,
      botType: 'dca',
      totalPnl: d.totalPnl || d.realizedPnl || '0',
      totalReturn: d.totalPnlRatio || '0',
      winRate: d.winRate || '0',
      totalTrades: Number(d.totalTrades) || 0,
      winTrades: Number(d.winTrades) || 0,
      lossTrades: Number(d.lossTrades) || 0,
      maxDrawdown: d.maxDrawdown || '0',
      runningDuration: Number(d.runningDuration) || 0,
    };
  }
}
