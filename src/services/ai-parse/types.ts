import type { AIIntent } from "../intentNormalize";

/**
 * 解析层：用户自然语言 → 结构化意图（与编排 / 卡片解耦）
 *
 * 阶段顺序固定为：
 * 1. normalize — 文本归一化
 * 2. local_rule — 关键词 / 正则白名单（与 BFF `localRuleIntent` 同源）
 * 3. llm_remote — 可选，调用 `/api/ai/intent`（后端 Claude/DeepSeek）
 *
 * 策略：本地命中非 `chat` 则短路，避免多余网络与费用；否则走远程。
 */
export type IntentParseStage = "normalize" | "local_rule" | "llm_remote";

/** 最终意图来自哪条路径 */
export type IntentParseSource = "local_rule" | "remote_llm";

export type IntentParseResult = {
  intent: AIIntent;
  source: IntentParseSource;
  /** 归一化后的用户句（供日志与多轮对齐） */
  utterance: string;
  stages: IntentParseStage[];
  /** 解析开始时间戳 ms */
  startedAt: number;
  durationMs: number;
};

export type ParseUserIntentOptions = {
  abortSignal?: AbortSignal;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** 调试：跳过本地短路，始终请求远程意图 */
  forceLlm?: boolean;
};
