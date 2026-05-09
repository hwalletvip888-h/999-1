# `onchain/` — V6 链上客户端拆分

| 文件 | 职责 |
|------|------|
| `types.ts` | `ChainId`、`WalletPortfolio*`、`Dex*`、`Defi*` 等 DTO |
| `hwalletBackendFetch.ts` | `callBackend`（经 `walletApiCore.getHwalletApiBase`） |
| `portfolioNormalize.ts` | `toChainId`、`normalizePortfolioPayload` |
| `client.ts` | `okxOnchainClient` 方法聚合 |

对外仍通过 **`../okxOnchainClient.ts`** barrel 引用，避免全仓改 import。
