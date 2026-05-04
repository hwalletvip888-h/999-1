# H Wallet MVP Implementation Notes

## 本次代码范围

本次只实现第一阶段前端 MVP 骨架：

- App 壳层
- 顶部三入口
- 对话页
- Mock AI 回复
- 交易卡片
- 钱包页
- 社区页
- 个人中心页

## 明确没有做的内容

- 没有接 OKX 真实 API
- 没有接 OpenAI / Claude 真实模型
- 没有接 Supabase
- 没有真实钱包创建
- 没有真实交易下单
- 没有真实 DeFi 存入

## 关键类型

`src/types/index.ts` 中定义了第一阶段最重要的数据结构：

- `AppView`
- `ChatMessage`
- `TradeCard`
- `WalletAsset`
- `CommunityMessage`

## AI 输出协议雏形

当前 `TradeCard` 就是后续 AI Engine 需要输出给前端的结构化卡片数据。

后续真实 AI Engine 可以返回：

```ts
type AIResponse =
  | { type: "text"; message: string }
  | { type: "trade_card"; card: TradeCard };
```

## 安全提示

真实交易前必须新增：

1. 用户二次确认。
2. 风险等级展示。
3. 交易预览接口。
4. OKX / 链上交易模拟。
5. 滑点、Gas、杠杆、止损校验。
6. 失败回滚与错误状态。
7. 审计日志。
