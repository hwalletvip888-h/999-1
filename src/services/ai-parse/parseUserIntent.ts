import { localRuleIntent, type AIIntent } from "../intentNormalize";
import { normalizeUserUtterance } from "./normalizeUtterance";
import type { IntentParseResult, IntentParseStage, ParseUserIntentOptions } from "./types";

/**
 * AI 解析层唯一入口 — 编排器只依赖本函数，不直接拼 local + askClaude。
 */
export async function parseUserIntent(
  rawInput: string,
  options?: ParseUserIntentOptions,
): Promise<IntentParseResult> {
  const startedAt = Date.now();
  const stages: IntentParseStage[] = ["normalize"];
  const utterance = normalizeUserUtterance(rawInput);

  stages.push("local_rule");
  const localIntent = localRuleIntent(utterance);

  const useLocal = !options?.forceLlm && localIntent.action !== "chat";
  if (useLocal) {
    return {
      intent: localIntent,
      source: "local_rule",
      utterance,
      stages,
      startedAt,
      durationMs: Date.now() - startedAt,
    };
  }

  stages.push("llm_remote");
  const history = options?.history ?? [];
  const { askClaude } = await import("../core/claudeAI");
  const intent: AIIntent = await askClaude(utterance, options?.abortSignal, history);

  return {
    intent,
    source: "remote_llm",
    utterance,
    stages,
    startedAt,
    durationMs: Date.now() - startedAt,
  };
}

/** 供调试或埋点：是否走了远程 */
export function intentParseUsedRemote(result: IntentParseResult): boolean {
  return result.source === "remote_llm";
}
