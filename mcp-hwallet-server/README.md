# `@hwallet/mcp-hwallet-server`

将 **H Wallet BFF** 以 **Model Context Protocol**（stdio）暴露给 Cursor、Claude Desktop 等客户端。工具名与 **`GET /api/meta/capabilities`** 一致（`H1.skill.*`），调用时由本进程 **HTTP 代理**到钱包后端。

## 依赖

- 已运行的钱包后端（默认 `npm run dev:wallet-backend`，端口见 `WALLET_PORT` / `3100`）
- Node.js ≥ 18

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `HWALLET_API_BASE` | 否 | 默认 `http://127.0.0.1:3100`（未设置时 stderr 会提示）；生产请显式配置 |
| `HWALLET_SESSION_TOKEN` | 否 | 默认 Bearer；也可在每个工具参数里传 `hwallet_session` |
| `HWALLET_META_CAPABILITIES_TOKEN` | 否 | 与 BFF 的 `HWALLET_META_CAPABILITIES_TOKEN` 一致时，拉能力表会带 `X-Hwallet-Meta-Token`（BFF 对该头开启校验时使用） |

写操作可选：`hwallet_idempotency_key`、`hwallet_request_id`（见各工具 Zod 说明）。

## 本地运行（调试）

```bash
cd /path/to/999-1
npm run dev:wallet-backend   # 另开终端
npm run mcp:hwallet          # 根目录脚本：安装子包依赖后启动 stdio MCP（默认连 3100）
# 或显式：export HWALLET_API_BASE=http://127.0.0.1:3100 && npm run dev --prefix mcp-hwallet-server
```

启动时会 **自动重试** 拉取 `/api/meta/capabilities`（便于 Cursor 先于 BFF 拉起 MCP 进程）。

进程使用 **stdio** 与宿主通信，**不要在终端里直接期待交互输出**；日志会打在 stderr。

## 构建与 `bin`

```bash
npm install --prefix mcp-hwallet-server
npm run build --prefix mcp-hwallet-server
# 全局或 PATH 中使用：
# node mcp-hwallet-server/dist/cli.js
```

## Cursor 中注册（示例）

在 Cursor MCP 配置中增加一项（路径换成你的仓库绝对路径）：

```json
{
  "mcpServers": {
    "h-wallet": {
      "command": "npx",
      "args": ["tsx", "/Users/you/999-1/mcp-hwallet-server/src/cli.ts"],
      "env": {
        "HWALLET_API_BASE": "http://127.0.0.1:3100"
      }
    }
  }
}
```

生产环境可将 `args` 改为 `["node", ".../mcp-hwallet-server/dist/cli.js"]` 并在部署机器上设置 `HWALLET_API_BASE`。

## 与 monorepo 的关系

- **能力表单一事实来源**：`src/wallet-backend/h1-capabilities.ts` → BFF `GET /api/meta/capabilities`
- 本包 **启动时拉取** 上述接口并动态 `registerTool`，无需手工复制路径列表
