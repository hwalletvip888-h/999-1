// H Skill Registry
// per [ADR-0005](../../docs/decisions/ADR-0005-h-skill-naming-convention.md) +
//     [03 §5.7](../../docs/research/03-onchainos-deep-dive.md) +
//     [架构总图 §1](../../docs/architecture/01-system-overview.md)
//
// 职责:
//   1. 启动时加载所有 H Skill manifest (`ALL_H_SKILL_MANIFESTS` from manifests.ts)
//   2. 校验命名规范 (`H_SKILL_NAME_REGEX`), 不合规拒启动
//   3. 把 manifest 转成 Anthropic Messages API 的 `tools[]` 数组
//   4. LLM 返回 `tool_use` 时, 路由到对应 impl 函数
//   5. 未实现的 skill (impl 还没写) 返回 `NOT_IMPLEMENTED` 而不是崩溃
//
// **本文件是 skeleton**, Phase 3 后续 commit 会:
//   - 注入真实 impl (h-v2/strategy/<type>/index.ts)
//   - 注入 input/output JSON Schema (用于 LLM tool_use 校验)
//   - 桥接 OKX skill (`.agents/skills/`) 给到同一个 registry

import {
  ALL_H_SKILL_MANIFESTS,
} from "./manifests";
import {
  H_SKILL_NAME_REGEX,
  SkillError,
  type AnthropicTool,
  type SkillCtx,
  type SkillEntry,
  type SkillImpl,
  type SkillManifest,
  type SkillResult,
} from "./types";

/** 默认 input_schema (V1.0 placeholder). Phase 3 替换为每个 skill 的真实 JSON Schema. */
const PLACEHOLDER_INPUT_SCHEMA: object = {
  type: "object",
  properties: {
    raw: {
      type: "string",
      description:
        "用户原始中文意图(等 Phase 3 写真实 schema 后, 这个字段会被结构化字段替代)",
    },
  },
  required: ["raw"],
};

export class SkillRegistry {
  private skills = new Map<string, SkillEntry>();

  /** 启动时调用, 装载全部 manifest. */
  loadManifests(manifests: SkillManifest[] = ALL_H_SKILL_MANIFESTS): void {
    for (const m of manifests) {
      if (!H_SKILL_NAME_REGEX.test(m.name) && !this.isOkxSkillName(m.name)) {
        throw new SkillError(
          "INVALID_SKILL_NAME",
          `Skill name "${m.name}" does not match h.<v1|v2>.<domain>.<action> regex (per ADR-0005). 仅 OKX skill (okx-* 前缀) 可豁免.`,
        );
      }
      this.skills.set(m.name, {
        manifest: m,
        impl: undefined,
        source: this.detectSource(m.name),
      });
    }
  }

  /** 注册一个 skill 的实现. Phase 3 各 skill 的 index.ts 启动时调一次. */
  registerImpl(name: string, impl: SkillImpl): void {
    const entry = this.skills.get(name);
    if (!entry) {
      throw new SkillError(
        "UNKNOWN_SKILL",
        `Cannot register impl for "${name}" - manifest not loaded.`,
      );
    }
    if (entry.impl) {
      throw new SkillError(
        "DUPLICATE_IMPL",
        `Skill "${name}" already has an impl registered.`,
      );
    }
    entry.impl = impl;
  }

  /** 把 manifest 转成 Anthropic Messages API 的 tools[]. */
  toAnthropicTools(): AnthropicTool[] {
    return [...this.skills.values()].map((e) => ({
      name: e.manifest.name,
      description: e.manifest.description,
      input_schema: PLACEHOLDER_INPUT_SCHEMA,
    }));
  }

  /** LLM 返回 tool_use 后, 这里执行. */
  async dispatch(name: string, input: unknown, ctx: SkillCtx): Promise<SkillResult> {
    const entry = this.skills.get(name);
    if (!entry) {
      return {
        code: "ERROR",
        message: `Unknown skill: ${name}`,
      };
    }
    if (!entry.impl) {
      return {
        code: "NOT_IMPLEMENTED",
        reason: `Skill "${name}" manifest loaded but impl not yet written (Phase 3 后续 commit 落地).`,
      };
    }
    try {
      ctx.log.info("skill.dispatch.start", { name, mvpType: entry.manifest.metadata.agent.mvpType });
      const result = await entry.impl(input, ctx);
      ctx.log.info("skill.dispatch.done", { name, code: result.code });
      return result;
    } catch (e) {
      ctx.log.error("skill.dispatch.error", { name, error: String(e) });
      return {
        code: "ERROR",
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      };
    }
  }

  /** 调试: 列出已注册的 skill (manifest 已装但 impl 不一定在). */
  list(): { name: string; mvpType?: number; hasImpl: boolean }[] {
    return [...this.skills.values()].map((e) => ({
      name: e.manifest.name,
      mvpType: e.manifest.metadata.agent.mvpType,
      hasImpl: !!e.impl,
    }));
  }

  /** 调试: 取单个 skill 的 manifest. */
  getManifest(name: string): SkillManifest | undefined {
    return this.skills.get(name)?.manifest;
  }

  // ─── 内部工具 ───────────────────────────────────────────────────────────

  private detectSource(name: string): SkillEntry["source"] {
    if (name.startsWith("h.v1.")) return "h-v1";
    if (name.startsWith("h.v2.")) return "h-v2";
    return "okx";
  }

  private isOkxSkillName(name: string): boolean {
    return name.startsWith("okx-") || name.startsWith("okx_");
  }
}

/** 全局单例 (App 端 / 后端启动时各自实例化一次). */
let _instance: SkillRegistry | null = null;

export function getSkillRegistry(): SkillRegistry {
  if (!_instance) {
    _instance = new SkillRegistry();
    _instance.loadManifests();
  }
  return _instance;
}

/** 测试用: 重置单例. */
export function _resetSkillRegistryForTests(): void {
  _instance = null;
}
