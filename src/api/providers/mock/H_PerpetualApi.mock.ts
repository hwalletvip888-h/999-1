/**
 * H_PerpetualApi Mock 实现
 */

import type {
  IH_PerpetualApi,
  H_OpenPositionParams,
  H_ClosePositionParams,
  H_Position,
  H_Order,
  H_PositionSide,
} from '../../contracts/H_PerpetualApi';

let mockPositions: H_Position[] = [];
let mockOrders: H_Order[] = [];
let orderCounter = 1;

export class MockH_PerpetualApi implements IH_PerpetualApi {
  async openPosition(params: H_OpenPositionParams): Promise<H_Order> {
    const orderId = `mock_order_${orderCounter++}`;
    const price = params.price || (params.instId.includes('BTC') ? 67500 : params.instId.includes('ETH') ? 3450 : 178);
    const size = (params.amount * params.leverage) / price;

    const order: H_Order = {
      orderId,
      instId: params.instId,
      side: params.side,
      orderType: params.orderType,
      status: 'filled',
      size,
      price,
      filledSize: size,
      filledPrice: price,
      pnl: 0,
      fee: params.amount * 0.0005,
      createTime: Date.now(),
      updateTime: Date.now(),
    };
    mockOrders.unshift(order);

    const position: H_Position = {
      instId: params.instId,
      side: params.side,
      size,
      avgPrice: price,
      markPrice: price,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      leverage: params.leverage,
      liquidationPrice: params.side === 'long' ? price * (1 - 1 / params.leverage * 0.9) : price * (1 + 1 / params.leverage * 0.9),
      margin: params.amount,
      openTime: Date.now(),
    };
    mockPositions.push(position);

    return order;
  }

  async closePosition(params: H_ClosePositionParams): Promise<H_Order> {
    const orderId = `mock_order_${orderCounter++}`;
    const posIndex = mockPositions.findIndex((p) => p.instId === params.instId && p.side === params.side);
    const pos = posIndex >= 0 ? mockPositions[posIndex] : null;
    const closeSize = pos ? pos.size * params.ratio : 0;
    const price = params.price || (pos?.markPrice || 67500);
    const pnl = pos ? (price - pos.avgPrice) * closeSize * (params.side === 'long' ? 1 : -1) : 0;

    const order: H_Order = {
      orderId,
      instId: params.instId,
      side: params.side,
      orderType: params.orderType,
      status: 'filled',
      size: closeSize,
      price,
      filledSize: closeSize,
      filledPrice: price,
      pnl,
      fee: closeSize * price * 0.0005,
      createTime: Date.now(),
      updateTime: Date.now(),
    };
    mockOrders.unshift(order);

    if (params.ratio >= 1 && posIndex >= 0) {
      mockPositions.splice(posIndex, 1);
    }

    return order;
  }

  async setTpSl(_instId: string, _side: H_PositionSide, _tp?: number, _sl?: number): Promise<boolean> {
    return true;
  }

  async getPositions(): Promise<H_Position[]> {
    // 模拟价格波动
    return mockPositions.map((p) => {
      const change = (Math.random() - 0.5) * p.avgPrice * 0.01;
      const markPrice = p.avgPrice + change;
      const pnl = (markPrice - p.avgPrice) * p.size * (p.side === 'long' ? 1 : -1);
      return {
        ...p,
        markPrice,
        unrealizedPnl: pnl,
        unrealizedPnlPercent: (pnl / p.margin) * 100,
      };
    });
  }

  async getOrders(_instId?: string, limit = 20): Promise<H_Order[]> {
    return mockOrders.slice(0, limit);
  }

  async setLeverage(_instId: string, _leverage: number): Promise<boolean> {
    return true;
  }
}
