# H Wallet MVP Frontend

这是 H Wallet 的第一版 Expo / React Native / TypeScript 前端骨架。

当前版本实现：

- 顶部三入口：钱包、对话 / 社区、我的
- AI 对话页：消息流、快捷提示、输入框、Mock AI 回复
- 交易确认卡片：永续合约卡片、链上赚币卡片、确认 / 取消状态
- 钱包页：总资产、充值 / 提现 / 转账、资产卡片、卡库 / 质押 / 链上赚币入口
- 社区页：全景群聊、AI 管家热点、战绩卡片分享
- 我的页：用户资料、会员等级、安全 / 通知 / 语言 / 帮助入口
- Mock API 层：为后续接入 AI Engine、Wallet API、Trade API 预留接口

> 注意：当前所有交易、钱包和 AI 数据均为 Mock 数据，不会真实下单，不会连接 OKX，不会触达真实资产。

## 运行方式

```bash
cd h-wallet-mvp
npm install
npm run start
```

启动后可以使用 Expo Go 或模拟器打开。

## 推荐开发顺序

1. 先跑通当前 Mock 前端。
2. 接入 Supabase Auth，完成邮箱注册 / 登录。
3. 新建 `cards` 表，把交易卡片确认结果写入卡库。
4. 把 `src/services/hWalletApi.ts` 中的 Mock 函数替换成真实后端 API。
5. 后端再封装 OKX / AI 模型，不要让前端直接调用 OKX。

## 目录结构

```text
h-wallet-mvp/
  App.tsx
  global.css
  tailwind.config.js
  metro.config.js
  babel.config.js
  src/
    components/     # 通用 UI 组件
    screens/        # 钱包、对话、社区、我的页面
    data/           # Mock 数据
    services/       # AI / 钱包 / 交易 API 占位层
    theme/          # 品牌色
    types/          # TypeScript 类型定义
    utils/          # 工具函数
```

## 后续真实 API 接入点

当前预留的接口位于：

```ts
src/services/hWalletApi.ts
```

推荐后端接口：

```text
POST /api/ai/chat
POST /api/ai/parse-intent
GET  /api/wallet/balance
POST /api/trade/preview
POST /api/trade/execute
GET  /api/cards
```
