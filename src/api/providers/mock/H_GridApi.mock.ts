/**
 * H_GridApi Mock 实现
 */

import type {
  IH_GridApi,
  H_CreateGridParams,
  H_GridInstance,
  H_GridStatus,
} from '../../contracts/H_GridApi';

let mockGrids: H_GridInstance[] = [];
let gridCounter = 1;

export class MockH_GridApi implements IH_GridApi {
  async createGrid(params: H_CreateGridParams): Promise<H_GridInstance> {
    const grid: H_GridInstance = {
      gridId: `mock_grid_${gridCounter++}`,
      instId: params.instId,
      direction: params.direction,
      status: 'running',
      investment: params.investment,
      leverage: params.leverage,
      upperPrice: params.upperPrice,
      lowerPrice: params.lowerPrice,
      gridCount: params.gridCount,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalReturn: 0,
      filledGrids: 0,
      createTime: Date.now(),
      runningDuration: 0,
    };
    mockGrids.push(grid);
    return grid;
  }

  async stopGrid(gridId: string): Promise<boolean> {
    const grid = mockGrids.find((g) => g.gridId === gridId);
    if (grid) {
      grid.status = 'stopped';
      return true;
    }
    return false;
  }

  async getGrids(status?: H_GridStatus): Promise<H_GridInstance[]> {
    if (status) {
      return mockGrids.filter((g) => g.status === status);
    }
    return mockGrids;
  }

  async getGridDetail(gridId: string): Promise<H_GridInstance> {
    const grid = mockGrids.find((g) => g.gridId === gridId);
    if (!grid) throw new Error(`Grid ${gridId} not found`);
    // 模拟运行数据
    return {
      ...grid,
      realizedPnl: Math.random() * grid.investment * 0.05,
      unrealizedPnl: (Math.random() - 0.5) * grid.investment * 0.02,
      filledGrids: Math.floor(Math.random() * grid.gridCount),
      runningDuration: (Date.now() - grid.createTime) / 1000,
    };
  }

  async adjustGrid(_gridId: string, _tp?: number, _sl?: number): Promise<boolean> {
    return true;
  }
}
