/**
 * H_GridApi OKX 实盘实现
 * 对接 OKX V5 合约网格交易接口（实盘）
 *
 * 默认使用中性网格以降低用户使用门槛。
 * 如果市场趋势明显，可以启动做多或做空策略。
 */

import type {
  IH_GridApi,
  H_CreateGridParams,
  H_GridInstance,
  H_GridDirection,
  H_GridStatus,
} from '../../contracts/H_GridApi';
import type { OkxCredentials } from './okxClient';
import * as okxClient from './okxClient';

/** OKX 网格方向映射 */
function mapDirection(dir: H_GridDirection): string {
  switch (dir) {
    case 'long': return 'long';
    case 'short': return 'short';
    case 'neutral':
    default: return 'neutral';
  }
}

/** OKX 网格状态映射 */
function mapStatus(okxStatus: string): H_GridStatus {
  switch (okxStatus) {
    case 'running': return 'running';
    case 'stopping':
    case 'stopped': return 'stopped';
    case 'no_close':
    case 'closed': return 'completed';
    default: return 'error';
  }
}

export class OkxH_GridApi implements IH_GridApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  async createGrid(params: H_CreateGridParams): Promise<H_GridInstance> {
    const {
      instId, direction, investment, leverage,
      upperPrice, lowerPrice, gridCount,
      takeProfitPrice, stopLossPrice,
    } = params;

    const orderParams: Record<string, any> = {
      instId,
      algoOrdType: 'contract_grid',
      maxPx: String(upperPrice),
      minPx: String(lowerPrice),
      gridNum: String(gridCount),
      runType: '1', // 1=自动创建
      sz: String(investment),
      direction: mapDirection(direction),
      lever: String(leverage),
    };

    if (takeProfitPrice) {
      orderParams.tpTriggerPx = String(takeProfitPrice);
    }
    if (stopLossPrice) {
      orderParams.slTriggerPx = String(stopLossPrice);
    }

    const res = await okxClient.placeGridOrder(this.creds, orderParams);
    if (res.code !== '0') {
      throw new Error(`[H_GridApi] createGrid 失败: ${res.msg}`);
    }

    const algoId = res.data?.[0]?.algoId || '';
    return {
      gridId: algoId,
      instId,
      direction,
      status: 'running',
      investment,
      leverage,
      upperPrice,
      lowerPrice,
      gridCount,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalReturn: 0,
      filledGrids: 0,
      createTime: Date.now(),
      runningDuration: 0,
    };
  }

  async stopGrid(gridId: string): Promise<boolean> {
    // 需要 instId，先从运行中的网格列表获取
    const grids = await this.getGrids('running');
    const target = grids.find((g) => g.gridId === gridId);
    if (!target) throw new Error(`[H_GridApi] 未找到运行中的网格: ${gridId}`);

    const res = await okxClient.stopGridOrder(this.creds, gridId, target.instId);
    if (res.code !== '0') {
      throw new Error(`[H_GridApi] stopGrid 失败: ${res.msg}`);
    }
    return true;
  }

  async getGrids(status?: H_GridStatus): Promise<H_GridInstance[]> {
    // 获取运行中的网格
    const runningRes = await okxClient.getGridOrders(this.creds, 'contract_grid');
    const runningGrids = (runningRes.data || []).map((g: any) => this.parseGridData(g));

    if (status === 'running') return runningGrids;

    // 获取历史网格
    const historyRes = await okxClient.getGridOrdersHistory(this.creds, 'contract_grid');
    const historyGrids = (historyRes.data || []).map((g: any) => this.parseGridData(g));

    const all = [...runningGrids, ...historyGrids];

    if (status) {
      return all.filter((g) => g.status === status);
    }
    return all;
  }

  async getGridDetail(gridId: string): Promise<H_GridInstance> {
    const grids = await this.getGrids();
    const found = grids.find((g) => g.gridId === gridId);
    if (!found) throw new Error(`[H_GridApi] 未找到网格: ${gridId}`);
    return found;
  }

  async adjustGrid(gridId: string, tp?: number, sl?: number): Promise<boolean> {
    // OKX 合约网格不支持运行中修改止盈止损
    // 需要停止后重建，这里返回 false 提示不支持
    console.warn('[H_GridApi] OKX 合约网格不支持运行中修改止盈止损，需停止后重建');
    return false;
  }

  /** 解析 OKX 网格数据为 H_GridInstance */
  private parseGridData(g: any): H_GridInstance {
    const direction = (g.direction || 'neutral') as H_GridDirection;
    const createTime = parseInt(g.cTime || '0');
    const now = Date.now();

    return {
      gridId: g.algoId || '',
      instId: g.instId || '',
      direction,
      status: mapStatus(g.state || g.algoOrdType || 'unknown'),
      investment: parseFloat(g.sz || g.totalEq || '0'),
      leverage: parseFloat(g.lever || '1'),
      upperPrice: parseFloat(g.maxPx || '0'),
      lowerPrice: parseFloat(g.minPx || '0'),
      gridCount: parseInt(g.gridNum || '0'),
      realizedPnl: parseFloat(g.gridProfit || g.profit || '0'),
      unrealizedPnl: parseFloat(g.floatProfit || '0'),
      totalReturn: parseFloat(g.annualizedRate || g.totalPnlRatio || '0'),
      filledGrids: parseInt(g.filledCnt || g.matchCnt || '0'),
      createTime,
      runningDuration: Math.floor((now - createTime) / 1000),
    };
  }
}
