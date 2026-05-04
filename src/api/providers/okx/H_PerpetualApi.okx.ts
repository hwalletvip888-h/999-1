/**
 * H_PerpetualApi OKX 实盘实现
 * 对接 OKX V5 永续合约交易接口（实盘）
 *
 * 风控要点：
 * - 所有订单必须带止损
 * - 杠杆上限由调用方控制
 * - 合约面值参考 SUPPORTED_COINS
 */

import type {
  IH_PerpetualApi,
  H_OpenPositionParams,
  H_ClosePositionParams,
  H_Position,
  H_Order,
  H_PositionSide,
} from '../../contracts/H_PerpetualApi';
import type { OkxCredentials } from './okxClient';
import * as okxClient from './okxClient';

// 支持的合约面值（每张代表多少币）
const CONTRACT_VALUES: Record<string, number> = {
  'BTC-USDT-SWAP': 0.01,
  'ETH-USDT-SWAP': 0.1,
  'SOL-USDT-SWAP': 1,
};

function getCtVal(instId: string): number {
  return CONTRACT_VALUES[instId] || 0.01;
}

export class OkxH_PerpetualApi implements IH_PerpetualApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  async setLeverage(instId: string, leverage: number): Promise<boolean> {
    const res = await okxClient.setLeverage(this.creds, instId, leverage, 'isolated');
    if (res.code !== '0') {
      throw new Error(`[H_PerpetualApi] setLeverage 失败: ${res.msg}`);
    }
    return true;
  }

  async openPosition(params: H_OpenPositionParams): Promise<H_Order> {
    const { instId, side, orderType, amount, leverage, price, takeProfitPrice, stopLossPrice } = params;

    // 1. 设置杠杆
    await this.setLeverage(instId, leverage);

    // 2. 获取当前价格计算张数
    const tickerRes = await okxClient.getTicker(instId);
    const currentPrice = parseFloat(tickerRes.data?.[0]?.last || '0');
    if (currentPrice <= 0) throw new Error('[H_PerpetualApi] 无法获取当前价格');

    const ctVal = getCtVal(instId);
    // 张数 = (投入金额 × 杠杆) / (合约面值 × 当前价格)
    const contracts = Math.max(1, Math.floor((amount * leverage) / (ctVal * currentPrice)));

    // 3. 构建订单参数
    const orderParams: Record<string, any> = {
      instId,
      tdMode: 'isolated',
      side: side === 'long' ? 'buy' : 'sell',
      posSide: 'net',
      ordType: orderType === 'market' ? 'market' : 'limit',
      sz: String(contracts),
    };

    if (orderType === 'limit' && price) {
      orderParams.px = String(price);
    }

    // 附带止盈止损
    if (takeProfitPrice) {
      orderParams.tpTriggerPx = String(takeProfitPrice);
      orderParams.tpOrdPx = '-1'; // 市价止盈
    }
    if (stopLossPrice) {
      orderParams.slTriggerPx = String(stopLossPrice);
      orderParams.slOrdPx = '-1'; // 市价止损
    }

    // 4. 下单
    const res = await okxClient.placeOrder(this.creds, orderParams);
    if (res.code !== '0') {
      throw new Error(`[H_PerpetualApi] openPosition 失败: ${res.msg}`);
    }

    const ordData = res.data?.[0];
    return {
      orderId: ordData?.ordId || '',
      instId,
      side,
      orderType,
      status: 'filled',
      size: contracts,
      price: orderType === 'limit' && price ? price : currentPrice,
      filledSize: contracts,
      filledPrice: currentPrice,
      pnl: 0,
      fee: 0,
      createTime: Date.now(),
      updateTime: Date.now(),
    };
  }

  async closePosition(params: H_ClosePositionParams): Promise<H_Order> {
    const { instId, side, ratio, orderType, price } = params;

    if (ratio >= 1) {
      // 全部平仓
      const res = await okxClient.closePosition(this.creds, instId, 'isolated');
      if (res.code !== '0') {
        throw new Error(`[H_PerpetualApi] closePosition 失败: ${res.msg}`);
      }
      return {
        orderId: 'close-' + Date.now(),
        instId,
        side,
        orderType,
        status: 'filled',
        size: 0,
        price: 0,
        filledSize: 0,
        filledPrice: 0,
        pnl: 0,
        fee: 0,
        createTime: Date.now(),
        updateTime: Date.now(),
      };
    }

    // 部分平仓：需要查询当前持仓量然后按比例平
    const positions = await this.getPositions();
    const pos = positions.find((p) => p.instId === instId);
    if (!pos) throw new Error(`[H_PerpetualApi] 未找到 ${instId} 的持仓`);

    const closeSize = Math.max(1, Math.floor(pos.size * ratio));
    const closeSide = side === 'long' ? 'sell' : 'buy';

    const orderParams: Record<string, any> = {
      instId,
      tdMode: 'isolated',
      side: closeSide,
      posSide: 'net',
      ordType: orderType === 'market' ? 'market' : 'limit',
      sz: String(closeSize),
      reduceOnly: true,
    };

    if (orderType === 'limit' && price) {
      orderParams.px = String(price);
    }

    const res = await okxClient.placeOrder(this.creds, orderParams);
    if (res.code !== '0') {
      throw new Error(`[H_PerpetualApi] closePosition(部分) 失败: ${res.msg}`);
    }

    return {
      orderId: res.data?.[0]?.ordId || '',
      instId,
      side,
      orderType,
      status: 'filled',
      size: closeSize,
      price: price || 0,
      filledSize: closeSize,
      filledPrice: 0,
      pnl: 0,
      fee: 0,
      createTime: Date.now(),
      updateTime: Date.now(),
    };
  }

  async setTpSl(
    instId: string,
    side: H_PositionSide,
    tp?: number,
    sl?: number
  ): Promise<boolean> {
    if (!tp && !sl) return false;

    const params: Record<string, any> = {
      instId,
      tdMode: 'isolated',
      side: side === 'long' ? 'buy' : 'sell',
      posSide: 'net',
      ordType: 'conditional',
    };

    if (tp) {
      params.tpTriggerPx = String(tp);
      params.tpOrdPx = '-1';
    }
    if (sl) {
      params.slTriggerPx = String(sl);
      params.slOrdPx = '-1';
    }

    const res = await okxClient.placeAlgoOrder(this.creds, params);
    if (res.code !== '0') {
      throw new Error(`[H_PerpetualApi] setTpSl 失败: ${res.msg}`);
    }
    return true;
  }

  async getPositions(): Promise<H_Position[]> {
    const res = await okxClient.getAllPositions(this.creds);
    if (res.code !== '0') {
      throw new Error(`[H_PerpetualApi] getPositions 失败: ${res.msg}`);
    }

    return (res.data || []).map((p: any) => {
      const posAmt = parseFloat(p.pos || '0');
      return {
        instId: p.instId,
        side: (posAmt >= 0 ? 'long' : 'short') as H_PositionSide,
        size: Math.abs(parseInt(p.pos || '0')),
        avgPrice: parseFloat(p.avgPx || '0'),
        markPrice: parseFloat(p.markPx || '0'),
        unrealizedPnl: parseFloat(p.upl || '0'),
        unrealizedPnlPercent: parseFloat(p.uplRatio || '0') * 100,
        leverage: parseFloat(p.lever || '1'),
        liquidationPrice: parseFloat(p.liqPx || '0'),
        margin: parseFloat(p.margin || '0'),
        openTime: parseInt(p.cTime || '0'),
      };
    });
  }

  async getOrders(instId?: string, limit = 20): Promise<H_Order[]> {
    const res = await okxClient.getFills(this.creds, instId || 'BTC-USDT-SWAP');
    if (res.code !== '0') {
      throw new Error(`[H_PerpetualApi] getOrders 失败: ${res.msg}`);
    }

    return (res.data || []).slice(0, limit).map((f: any) => ({
      orderId: f.ordId || f.tradeId || '',
      instId: f.instId,
      side: f.side === 'buy' ? 'long' : 'short',
      orderType: 'market' as const,
      status: 'filled' as const,
      size: parseInt(f.fillSz || '0'),
      price: parseFloat(f.fillPx || '0'),
      filledSize: parseInt(f.fillSz || '0'),
      filledPrice: parseFloat(f.fillPx || '0'),
      pnl: parseFloat(f.pnl || '0'),
      fee: parseFloat(f.fee || '0'),
      createTime: parseInt(f.ts || '0'),
      updateTime: parseInt(f.ts || '0'),
    }));
  }
}
