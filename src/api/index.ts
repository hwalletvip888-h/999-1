/**
 * H_ API 模块统一入口
 *
 * 使用方式：
 *   import { api } from '../api';
 *   const ticker = await api.market.getTicker('BTC-USDT-SWAP');
 */

export { api, getProviderMode } from './gateway';
export type { H_ApiGateway, ProviderMode } from './gateway';

// 重新导出所有契约类型，方便前端使用
export * from './contracts';
