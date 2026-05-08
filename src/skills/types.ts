// H Skills · 核心类型定义
// 跟随 Anthropic Agent Skills 标准 (per ADR-0005), 跟 OKX OnchainOS 同构.

/**
 * Skill manifest - 跟 SKILL.md frontmatter 一一对应.
 */
export interface SkillManifest {
  name: string;
  description: string;
  license: string;
  metadata: {
    author: string;
    version: string;
    homepage?: string;
    agent: {
      requires?: {
        hSkills?: string[];
        bins?: string[];
      };
      backed_by?: string[];
      impl: string;
      schemas?: {
        input?: string;
        output?: string;
      };
      mvpType?: 1 | 2 | 3 | 4 | 5;
    };
  };
}

/**
 * Skill 执行上下文 (调用 impl 时传入).
 * Phase 3 落实业务时按需扩展.
 */
export interface SkillCtx {
  userId: string;
  sessionId: string;
  /** 运行时模式 (per ADR-0001/02/03 三态切换) */
  runtimeMode: "mock" | "okx-demo" | "okx-live";
  /** UI 推送通道 (后端→App SSE) */
  ui: {
    showCard: (kind: string, data: unknown) => Promise<void>;
    awaitConfirm: (timeoutMs?: number) => Promise<boolean>;
    pushEvent: (kind: string, data: unknown) => void;
  };
  /** 后端 BFF 客户端 (App 端) 或 OKX adapter 客户端 (后端) */
  okx: unknown;
  /** 风险层 hook (per ADR-0009 挑战 1) */
  risk: {
    preCompileCheck: (intent: unknown) => Promise<{ ok: boolean; reason?: string }>;
  };
  /** 日志 / 审计 */
  log: {
    info: (msg: string, data?: unknown) => void;
    warn: (msg: string, data?: unknown) => void;
    error: (msg: string, data?: unknown) => void;
  };
}

/**
 * Skill 执行结果.
 */
export type SkillResult =
  | { code: "OK"; data: unknown }
  | { code: "USER_CANCELED"; reason?: string }
  | { code: "RISK_REJECTED"; reason: string }
  | { code: "INSUFFICIENT_BALANCE"; need: string; have: string }
  | { code: "NOT_IMPLEMENTED"; reason: string }
  | { code: "OKX_SKILL_ERROR"; skill: string; raw: unknown }
  | { code: "ERROR"; message: string; cause?: unknown };

/**
 * Skill 实现函数签名.
 */
export type SkillImpl = (input: unknown, ctx: SkillCtx) => Promise<SkillResult>;

/**
 * Registry 内部存的条目.
 */
export interface SkillEntry {
  manifest: SkillManifest;
  impl?: SkillImpl;
  /** 来源: H 自家 / OKX 适配器代理过来 */
  source: "h-v1" | "h-v2" | "okx";
}

/**
 * Anthropic Messages API tools[] 数组的元素 (我们用 SkillManifest 转过去).
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: object;
}

/**
 * Skill 错误.
 */
export class SkillError extends Error {
  constructor(public code: string, message: string, public cause?: unknown) {
    super(`[${code}] ${message}`);
    this.name = "SkillError";
  }
}

/**
 * Skill 名命名规则 (per ADR-0005): h.<v1|v2>.<domain>.<action>
 * 强制 snake_case 各段.
 */
export const H_SKILL_NAME_REGEX = /^h\.(v1|v2)\.[a-z][a-z_]*\.[a-z][a-z_]*$/;
