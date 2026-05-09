#!/usr/bin/env node
/**
 * H Wallet MCP Server — stdio 传输，工具列表来自 BFF GET /api/meta/capabilities
 *
 * 环境变量：
 *   HWALLET_API_BASE — 必填，如 http://127.0.0.1:3100
 *   HWALLET_SESSION_TOKEN — 可选，默认 Bearer（与各工具参数 hwallet_session 二选一）
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fetchCapabilities } from "./capabilities.js";
import { proxyToBff } from "./proxy.js";

function logErr(...parts: unknown[]) {
  console.error("[mcp-hwallet]", ...parts);
}

const ToolInputSchema = z
  .object({
    hwallet_session: z
      .string()
      .optional()
      .describe("钱包会话 token；不传则使用环境变量 HWALLET_SESSION_TOKEN"),
    hwallet_idempotency_key: z
      .string()
      .optional()
      .describe("写操作可选，对应 HTTP Idempotency-Key"),
    hwallet_request_id: z
      .string()
      .optional()
      .describe("可选，对应 X-Request-Id 链路追踪"),
  })
  .passthrough();

async function main() {
  const fromEnv = process.env.HWALLET_API_BASE?.trim();
  const apiBase = fromEnv || "http://127.0.0.1:3100";
  if (!fromEnv) {
    logErr(`HWALLET_API_BASE 未设置，使用默认 ${apiBase}（生产环境请务必显式配置）`);
  }

  let tools;
  try {
    tools = await fetchCapabilities(apiBase, { retries: 5, delayMs: 1000 });
  } catch (e) {
    logErr(
      "无法加载能力表（已重试）。请先启动钱包后端: npm run dev:wallet-backend —",
      e instanceof Error ? e.message : e,
    );
    process.exit(1);
  }

  logErr(`已加载 ${tools.length} 个工具 ← ${apiBase}/api/meta/capabilities`);

  const server = new McpServer(
    { name: "h-wallet-bff", version: "0.1.0" },
    {
      instructions: [
        "这些工具代理到 H Wallet 自有 BFF（非直连 OKX）。",
        "请先设置 HWALLET_API_BASE。需要登录态的工具请传 hwallet_session 或设置 HWALLET_SESSION_TOKEN。",
        "写操作可传 hwallet_idempotency_key 避免重复提交。",
      ].join(" "),
    },
  );

  for (const tool of tools) {
    const meta = tool._meta;
    const hints = [
      tool.description,
      `HTTP: ${meta.method} ${meta.path}`,
      meta.requiresSession ? "需要会话（hwallet_session 或 HWALLET_SESSION_TOKEN）。" : "",
    ]
      .filter(Boolean)
      .join("\n");

    server.registerTool(
      tool.name,
      {
        description: hints,
        inputSchema: ToolInputSchema,
        annotations: {
          readOnlyHint: !meta.write,
          destructiveHint: Boolean(meta.write),
        },
      },
      async (args) => {
        const raw = args as Record<string, unknown>;
        const result = await proxyToBff(apiBase, meta, raw);
        if (!result.ok) {
          return {
            content: [{ type: "text" as const, text: result.message }],
            isError: true,
          };
        }
        const summary = `[${result.status}] ${meta.method} ${meta.path}`;
        let bodyOut = result.body;
        if (result.contentType.includes("application/json") && result.body.length < 120_000) {
          try {
            bodyOut = JSON.stringify(JSON.parse(result.body), null, 2);
          } catch {
            /* 非严格 JSON 时原样输出 */
          }
        }
        const text = `${summary}\n${bodyOut}`;
        return {
          content: [{ type: "text" as const, text }],
          isError: result.status >= 400,
        };
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  logErr(e);
  process.exit(1);
});
