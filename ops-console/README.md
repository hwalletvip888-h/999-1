# H Wallet 运营台（人类操作）

由 **`walletBackend`** 托管，与 App API 同进程、同端口。

## 访问方式

1. 启动后端：`npm run dev:wallet-backend`（默认 `http://localhost:3100`）
2. 浏览器打开：**`http://localhost:3100/ops`**
3. 在服务器上设置环境变量 **`HWALLET_OPS_ADMIN_TOKEN`**（强随机字符串），重启后端。
4. 在运营页输入该密钥 → **保存到浏览器** → **加载数据**。

## 请求超时

页面向同源 `/api/admin/*` 的 `fetch` 使用 **28s** 超时（与仓库 `src/services/hwalletHttpConstants.ts` 中 `FETCH_TIMEOUT_MS` 对齐）；超时将提示检查后端是否可达。

## API（需 `X-Ops-Key: <token>`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/ping` | 校验密钥是否有效 |
| GET | `/api/admin/overview` | 健康检查、CLI 沙箱列表、脱敏配置快照 |

未设置 `HWALLET_OPS_ADMIN_TOKEN` 时，Admin API 返回 **503**；`/ops` 页面仍可打开，但无法拉取数据。

## 安全建议

- 生产环境仅 **内网或 VPN** 暴露 `/ops` 与 `/api/admin/*`，或由网关加 **IP 白名单 / mTLS**。
- 定期轮换 `HWALLET_OPS_ADMIN_TOKEN`。
- 沙箱目录名已是 **email 哈希前缀**，仍请勿对不可信人员开放运营台。
