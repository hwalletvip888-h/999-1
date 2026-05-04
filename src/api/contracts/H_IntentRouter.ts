/**
 * H_IntentRouter — 意图路由接口契约
 * 职责：将 AI 识别的 Intent 分发到 V5 或 V6 执行层
 */

import type { H_Intent } from './H_AIEngine';

/** 执行计划 */
export interface H_ExecutionPlan {
  /** 目标 API 模块名 */
  targetApi: string;
  /** 目标方法名 */
  method: string;
  /** 传递给目标方法的参数 */
  params: Record<string, unknown>;
  /** 执行前是否需要风控检查 */
  requiresRiskCheck: boolean;
  /** 执行前是否需要用户二次确认 */
  requiresConfirmation: boolean;
}

/** H_IntentRouter 接口定义 */
export interface IH_IntentRouter {
  /** 根据意图生成执行计划 */
  route(intent: H_Intent): Promise<H_ExecutionPlan>;
  /** 检查意图是否可被当前已注册的 Provider 处理 */
  canHandle(intent: H_Intent): boolean;
}
