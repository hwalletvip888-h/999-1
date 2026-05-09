/**
 * H1.skill.* ↔ BFF HTTP 单一映射表（MCP / OpenAPI / 编排共用）
 *
 * - `path`：首选路径（新客户端与代码生成默认使用）
 * - `pathAliases`：仍由路由接受的兼容路径，避免破坏旧 App
 * - `inputSchema`：JSON Schema draft-07 子集，可直接填入 MCP tools/list
 */

export type HttpMethod = "GET" | "POST";

export interface H1CapabilityRecord {
  /** MCP / Agent 工具名，须以 H1.skill. 开头 */
  skillId: string;
  description: string;
  http: { method: HttpMethod; path: string };
  /** 与路由实现一致的备用路径 */
  pathAliases?: string[];
  /** 请求体 JSON Schema；GET 可为空对象 */
  inputSchema: Record<string, unknown>;
  /** 需 Authorization: Bearer <session> */
  requiresSession: boolean;
  /** 写操作建议带 Idempotency-Key（见产品文档 §2.1） */
  write?: boolean;
}

export const H1_CAPABILITY_SCHEMA_VERSION = "1" as const;

export const H1_CAPABILITY_REGISTRY: readonly H1CapabilityRecord[] = [
  {
    skillId: "H1.skill.auth.otp_send",
    description: "向用户邮箱发送登录/验证 OTP",
    http: { method: "POST", path: "/api/auth/send-otp" },
    pathAliases: ["/api/agent-wallet/send-code"],
    inputSchema: {
      type: "object",
      required: ["email"],
      properties: {
        email: { type: "string", format: "email", description: "用户邮箱" },
      },
    },
    requiresSession: false,
    write: true,
  },
  {
    skillId: "H1.skill.auth.otp_verify",
    description: "校验 OTP 并建立会话（返回后续请求用的 token）",
    http: { method: "POST", path: "/api/auth/verify-otp" },
    pathAliases: ["/api/agent-wallet/verify"],
    inputSchema: {
      type: "object",
      required: ["email", "code"],
      properties: {
        email: { type: "string", format: "email" },
        code: { type: "string", description: "验证码" },
      },
    },
    requiresSession: false,
    write: true,
  },
  {
    skillId: "H1.skill.wallet.portfolio",
    description: "查询当前会话钱包组合/余额（与 v6 portfolio 对齐）",
    http: { method: "GET", path: "/api/v6/wallet/portfolio" },
    pathAliases: ["/api/wallet/balance", "/api/agent-wallet/balance"],
    inputSchema: { type: "object", properties: {} },
    requiresSession: true,
  },
  {
    skillId: "H1.skill.wallet.addresses",
    description: "列出当前账户链上收款地址",
    http: { method: "GET", path: "/api/wallet/addresses" },
    pathAliases: ["/api/agent-wallet/addresses"],
    inputSchema: { type: "object", properties: {} },
    requiresSession: true,
  },
  {
    skillId: "H1.skill.wallet.accounts_list",
    description: "列出已绑定账户",
    http: { method: "GET", path: "/api/wallet/accounts" },
    inputSchema: { type: "object", properties: {} },
    requiresSession: true,
  },
  {
    skillId: "H1.skill.wallet.accounts_switch",
    description: "切换到指定账户",
    http: { method: "POST", path: "/api/wallet/accounts/switch" },
    inputSchema: {
      type: "object",
      required: ["accountId"],
      properties: { accountId: { type: "string" } },
    },
    requiresSession: true,
    write: true,
  },
  {
    skillId: "H1.skill.wallet.accounts_add",
    description: "添加新账户绑定",
    http: { method: "POST", path: "/api/wallet/accounts/add" },
    inputSchema: { type: "object", properties: {} },
    requiresSession: true,
    write: true,
  },
  {
    skillId: "H1.skill.wallet.transfer",
    description: "链上转账（原生币或代币）",
    http: { method: "POST", path: "/api/v6/wallet/send" },
    inputSchema: {
      type: "object",
      required: ["chain", "symbol", "toAddress", "amount"],
      properties: {
        chain: { type: "string", description: "链标识（与 App mapClientChain 一致）" },
        symbol: { type: "string", description: "代币符号，如 ETH、USDC" },
        toAddress: { type: "string", description: "收款地址" },
        amount: { type: "string", description: "人类可读数量" },
        tokenAddress: { type: "string", description: "可选 ERC-20 合约地址" },
      },
    },
    requiresSession: true,
    write: true,
  },
  {
    skillId: "H1.skill.dex.swap_quote",
    description: "获取跨链/聚合兑换报价",
    http: { method: "POST", path: "/api/v6/dex/swap-quote" },
    inputSchema: {
      type: "object",
      required: ["fromChain", "fromSymbol", "fromAmount", "toChain", "toSymbol"],
      properties: {
        fromChain: { type: "string" },
        fromSymbol: { type: "string" },
        fromAmount: { type: "string" },
        toChain: { type: "string" },
        toSymbol: { type: "string" },
        slippageBps: { type: "number", description: "滑点，基点" },
      },
    },
    requiresSession: true,
    write: false,
  },
  {
    skillId: "H1.skill.dex.swap_execute",
    description: "执行兑换（基于报价）",
    http: { method: "POST", path: "/api/v6/dex/swap-execute" },
    inputSchema: {
      type: "object",
      description: "与 swap-quote 返回结构衔接；字段以服务端校验为准",
      properties: {},
    },
    requiresSession: true,
    write: true,
  },
  {
    skillId: "H1.skill.ai.chat",
    description: "通用对话（DeepSeek 等，经 BFF）",
    http: { method: "POST", path: "/api/ai/chat" },
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
    },
    requiresSession: false,
  },
  {
    skillId: "H1.skill.ai.parse_intent",
    description: "自然语言 → 结构化意图（Claude + fallback，供编排层使用）",
    http: { method: "POST", path: "/api/ai/intent" },
    inputSchema: {
      type: "object",
      required: ["message"],
      properties: { message: { type: "string" } },
    },
    requiresSession: false,
  },
] as const;

/** MCP tools/list 友好投影（name + description + inputSchema） */
export function toMcpToolShapes(
  registry: readonly H1CapabilityRecord[] = H1_CAPABILITY_REGISTRY,
): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  _meta: { method: HttpMethod; path: string; pathAliases?: string[]; requiresSession: boolean; write?: boolean };
}> {
  return registry.map((r) => ({
    name: r.skillId,
    description: r.description,
    inputSchema: r.inputSchema,
    _meta: {
      method: r.http.method,
      path: r.http.path,
      pathAliases: r.pathAliases,
      requiresSession: r.requiresSession,
      write: r.write,
    },
  }));
}
