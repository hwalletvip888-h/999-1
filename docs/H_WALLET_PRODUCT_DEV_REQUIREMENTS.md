# H Wallet 产品开发需求说明（讨论稿）

> 本文档把产品方向、模块划分与 **API 封装边界** 对齐，便于各模块独立演进、新能力以「接模块契约」方式扩展。  
> 执行真源：**OKX Agent Wallet / OnchainOS**；H Wallet 为 **中间编排与体验层**，对用户不显式暴露 OKX 品牌。

---

## 1. 产品定位与非目标

### 1.1 定位（一句话）

H Wallet 是 **AI 主导的 Web3 资金与执行中控台**：在合规与风控边界内，以 **对话 + 计划卡片 + 可核对结果** 完成充值、划转、兑换、订阅类策略等；底层 **全部由 OKX 执行**，我方负责 **意图解析、编排、展现、审计与合作方接入面**。

### 1.2 非目标（本期不宣称）

- 自研链节点、自研撮合、替代 OKX 作为资金与签名的真源。
- 对用户提供「投资建议/保本收益」等受监管表述（合规文案见运营与法务条款）。

### 1.3 交互宪章（与研发强相关）

| 宪章 | 说明 |
|------|------|
| 执行收口 | App 内 **可改变链上状态或下单** 的行为，**默认在对话闭环内完成**；按钮仅承载 **intent 深链**（带槽位跳转会话）。 |
| 默认可执行 | 槽位已满、绑定关系唯一且风险可判定时，**禁止为多填表而多轮追问**；以 **完成卡片** 收口。 |
| 对用户叙事 | 主对话 **不播报** `H1.skill.*`/CLI/内部接口名；内部过程走 **短时动效阶段 + 可选折叠时间轴**；**可核对证据**（订单号/hash）在完成卡与详情中提供。 |

---

## 2. 总体架构分层

```
┌─────────────────────────────────────────────────────────────┐
│ 体验层（Experience）   UI / 动效 / 文案 / 品牌 / 成就展示      │
├─────────────────────────────────────────────────────────────┤
│ 编排层（Orchestration）意图状态机、对话上下文、阶段事件、限额   │
├─────────────────────────────────────────────────────────────┤
│ 接入层（Integration）  OKX 官方能力封装（CLI/REST 统一出口）   │
└─────────────────────────────────────────────────────────────┘
                              │
                    OKX Agent Wallet / OnchainOS
```

**扩展方式**：新想法优先落在 **编排层策略 + 体验层组件**；只有在 OKX 出现新能力时扩展 **接入层**。合作商能力通过 **Partner 模块** 注入编排层，不污染接入层。

### 2.1 双层命名：HTTP 路径（给人与网关用）与 H1 域模型（给工程与 MCP 用）

二者**不可混为一谈**：URL 里用 **完整英文服务名 + `v1`/`v2`**；**`H1`** 表示 **本平台一代能力包**（模块 ID、Skill、错误码、事件），**不**用单字母缩写进路径。

#### A. 对外 REST 路径（curl 风格，行业通用）

**推荐形态：**

```text
/api/v{version}/{service}/{resource}[/{id}][?query]
```

- **`{service}`**：小写完整单词，一眼可知业务域：`user` | `wallet` | `market` | `trade` | `community` | `cards` | `strategy` | `points` ……  
- **版本**：按**资源域**独立演进（例：行情升级到 v2 时仅新增 `/api/v2/market/...`，`/api/v1/market/...` 保留做灰度）。

**可选网关项目前缀**（多产品共域名时避免撞车）：

```text
/api/{project}/v{version}/{service}/...
```

示例：`/api/community/v1/wallet/balance`（与 `模块名称示例.yaml` 一致）。**`{project}` 为产品/网关命名，仍为完整词，不用单字母。**

**示例对照表（REST 一眼识别模块 + 版本）：**

| 模块 | 版本 | 路径示例 |
|------|------|-----------|
| user | v1 | `/api/v1/user/profile` |
| wallet | v1 | `/api/v1/wallet/balance` |
| market | v2 | `/api/v2/market/price` |
| trade | v1 | `/api/v1/trade/swap` |
| community | v1 | `/api/v1/community/chat` |
| cards | v1 | `/api/v1/cards/list` |
| strategy | v1 | `/api/v1/strategy/signal` |
| points | v1 | `/api/v1/points/earn` |

**这样做的收益**

- **网关限流/熔断**：可按前缀精细配置，如 `/api/v1/wallet/*` 单独配额。  
- **OpenAPI**：按 `tags` 或路径前缀分组，文档自描述、客户端生成稳定。  
- **灰度发布**：新行情服务只用新版本段并联调，旧客户端继续打 v1。  
- **MCP 工具**：工具实现与 REST **正向映射**，减少硬编码、避免 `/getBtcPrice` 与 `/v1_price` 并存。

**明确不推荐**：用单字母「模块代号」塞进 URL（如 `/H/v1/price`）——对接手方不直观、易冲突（H 可能是 Home 也可能是行情）；若嫌路径长，用 **API Gateway 路径重写**，**对外 OpenAPI 仍保持语义化路径**。

#### B. OKX 官方能力的封装位置

**钱包 / 交易 / 行情等「对外 REST」**只暴露 **H Wallet 自己的路径**；在 **`wallet` 等服务内部** 再调用 OKX 官方 MCP/REST（如 `/api/v5`、`/api/v6`），**禁止**让 App 直连 OKX 分散鉴权；错误与字段在 **`H1.integration.okx`** 内归一成 `H1.OKX.*`。

#### C. H1 域模型（模块 / Skill / 事件 / 错误码，与 URL 服务名独立）

本期工程与 Agent 能力统一落在 **`H1`** **代际**命名空间；未来大版本为 **`H2`**，可与 REST 的 `v1`/`v2` **并行存在**（前者偏**产品契约代数**，后者偏 **HTTP 资源版本**）。

| 类型 | 规则 | 示例 |
|------|------|------|
| **模块 ID** | `H1.<域>.<名>` | `H1.integration.okx`、`H1.experience.chat` |
| **对内 RPC/SDK** | 与模块 ID 或 monorepo 包名对齐 | `@hwallet/h1-integration-okx` |
| **事件名** | `h1.<域>.<事件>` | `h1.orchestration.execution.completed` |
| **Skill（MCP/Agent）** | `H1.skill.<能力>` | `H1.skill.wallet.transfer` |
| **错误码** | `H1.<来源>.<CODE>` | `H1.OKX.TIMEOUT`、`H1.ORC.INTENT_AMBIGUOUS` |

**错误码来源缩写**：`OKX` 接入层，`ORC` 编排，`EXP` 体验，`ENG` 卡库，`PRT` 合作商，`PLT` 平台，`SEC` 安全/会话。

**用户可见文案**：不出现 `H1`、不出现内部路径；仅展示业务结果与人话原因。

#### D. MCP 工具与 REST 的正向映射（示例）

```text
MCP 工具: H1.skill.market.price  →  GET /api/v1/market/price?tokenSymbol=BTC
MCP 工具: H1.skill.wallet.balance → GET /api/v1/wallet/balance
```

工具定义里推荐 **引用 OpenAPI `operationId` 或稳定 path 模板**，由生成器减少手写 URL。

#### E. 与讨论材料、`API_MODULE_EXAMPLE.yaml` 的对照（全局一致性与注意点）

| 点 | 是否一致 | 说明 |
|----|-----------|------|
| 路径形如 `/api/v{n}/{service}/...`、按模块限流、OpenAPI 分组、行情可单独 v2 灰度 | **是** | 与「一眼看出 wallet / v1」及你附的表同一逻辑；§2.1 A、§6 已吸收。 |
| MCP：意图 → 工具 → **自家 REST** → 再调 OKX（不暴露 OKX 给 App） | **是** | §2.1 B、D；与「社区 MCP Server = 翻译层」一致；**工具名**用 `H1.skill.*`，**URL** 用语义化 `service` 名，不靠单字母。 |
| 不推荐 `/H/v1/...` 类单字符路径 | **是** | §2.1 A 末段；**不否定 H1**：`H1` 用在 **域模型/Skill/错误码**，**不替代** `market`/`wallet` 等 URL 段。 |
| 示例里 **`/api/v1/...` 简写** vs yaml 里 **`/api/community/v1/...`** | **需统一落地** | 二者**同一套资源**，差别仅在是否加 **`{project}`**；**同一套网关/OpenAPI 应选定一种默认前缀**，避免示例混用造成实现分叉。 |

> **当前 MVP 实现说明（与上表的关系）**：钱包 BFF 已落地的路径为 **`/api/...`**（如 `/api/v6/wallet/portfolio`、`/api/ai/chat`），**尚未**挂 `v1` 前缀；`GET /api/meta/capabilities` 与 **`H1.skill.*`** 能力表对齐 MCP。后续若引入网关级 **`/api/v1/{service}/...`**，应 **同步改 `h1-capabilities` 与 OpenAPI**，避免文档与代码长期两套。

**易混点（刻意写清）**

- **`H1.xxx` 模块 ID** 与 **REST 的 `wallet` / `trade` / `market`** **不必一一对应**：通常 **`H1.integration.okx`** 在服务内部同时支撑多条 REST 路由（余额、swap、行情）；编排 **`H1.orchestration.*`** 可**仅进程内 / 内网**调用，**未必**有公网 `/api/v1/orchestration/*`——避免「每个 H1 模块都要占一段 URL」的误解。  
- **§1.3「执行收口在对话」**：指 **用户触点与授权叙事**在会话；后台仍可 **`POST /api/.../trade/confirm`**（会话服务或 BFF 发起），二者不冲突。  
- **`API_MODULE_EXAMPLE.yaml` 中 strategy/signal、auto-invest**：与 §1.2 非目标不矛盾——**能力可以有**，**对用户的表述**须合规、禁用「保本/投资建议」话术；产品与法务审定展示模板。  

**可选工程约定（建议后续写入 OpenAPI 规范）**

- 写操作携带 **`Idempotency-Key`**；全链路 **`X-Request-Id`**（或 trace）自 MCP→REST→OKX 接入层，与 `trace_id` 对齐。

---

## 3. 端内版块（用户可见）

| 版块 | 职责 | 备注 |
|------|------|------|
| **资金中控台** | 总资产、分链/分币视图、地址与会话信息、充提转入口（跳转会话） | 强调 **可操作余额 + 签名主体**，与聚合视角区分 |
| **交易/执行** | 兑换、划转等 **intent 入口** | 无独立「绕过对话」的完整表单主路径（安全类例外另表） |
| **生长/情报** | 活动、简讯、任务入口（不含敏感签名） | 与卡库运营活动协同 |
| **智能会话** | 对话、计划卡片、执行动效、完成卡片、折叠详情 | **唯一主执行界面** |
| **卡库（成就墙）** | 收录交易成功确认卡、等级头像、积分、支线成就 | 与交易完成事件订阅 |

---

## 4. 模块清单与 API 封装要求

以下每个模块在工程中应对应 **独立目录或服务边界**，**模块 ID 须符合 §2.1 `H1.*` 规范**，对外只暴露 **稳定契约**（类型 + 事件名 + 错误码）；内部实现可替换。

### 4.1 `H1.integration.okx` — OKX 接入层

**职责**：封装所有与 OnchainOS / Agent Wallet / Web3 API 的调用；隐藏 CLI/REST 差异；统一错误归一。

**对外契约（摘要）**

| 能力域 | 封装输出（示例名） | 说明 |
|--------|-------------------|------|
| 会话/账户 | `ensureSession`, `getWalletAddresses`, `getPortfolio` | 与用户租户沙箱一致 |
| 划转/支付 | `buildTransfer`, `submitTransfer`, `getOrderStatus` | 参数需含链、token、from/to、金额 |
| 兑换 | `quoteSwap`, `executeSwap` | 与现有 swap 流程对齐 |
| 行情/资产（只读） | `getMarketSlice`, `getAssetBreakdown` | 供分析与中控台展示 |

**约束**：本模块 **不包含** 对话文案、动效、积分；只返回 **结构化结果 + trace_id**。

---

### 4.2 `H1.orchestration.intent` — 意图与槽位

**职责**：自然语言或按钮 intent → 结构化 `Intent`（类型、必填槽、默认值、歧义列表）。

**对外契约**

| API | 说明 |
|-----|------|
| `parseIntent(input, context)` | 返回 `Intent \| ClarificationQuestions` |
| `fillSlotsFromProfile(intent, userProfile)` | 绑定地址、默认链、默认稳定币等 |
| `validateRisk(intent, limits)` | 返回是否可直通执行 |

**事件**：`h1.orchestration.intent.parsed`, `h1.orchestration.intent.ready`, `h1.orchestration.intent.blocked`。

---

### 4.3 `H1.orchestration.execution` — 执行状态机

**职责**：将已确认意图转为 **阶段列表**（供动效映射）与 **对接 `H1.integration.okx` 的调用序列**；产出 **用户态摘要 vs 内部 trace**。

**对外契约**

| API | 说明 |
|-----|------|
| `planExecution(intent)` | 返回 `ExecutionPlan { publicPhases[], internalSteps[], idempotencyKey }` |
| `runExecution(planId, userConsentToken)` | 推进状态机；向事件总线发阶段事件 |
| `getExecution(planId)` | 当前阶段、最终结果、错误 |

**事件（供前端动效）**：`h1.orchestration.execution.phase_start` / `h1.orchestration.execution.phase_end` / `h1.orchestration.execution.tx_submitted` / `h1.orchestration.execution.completed` / `h1.orchestration.execution.failed`  
字段分层：**`user_label`**（无内部术语）与 **`internal_code`**（排障）。

---

### 4.4 `H1.experience.chat` — 会话 UI 适配层

**职责**：消息模型、完成卡片 schema、动效阶段绑定、深链打开会话。

**对外契约**

| API | 说明 |
|-----|------|
| `openConversation(deeplink: IntentDeeplink)` | 从按钮进会话并预填 |
| `renderCompletionCard(result: ExecutionResult)` | 统一完成卡数据结构 |
| `renderPhaseAnimation(phases: PublicPhase[])` | 绑定 3～5 段抽象阶段 |

**约束**：组件只依赖 `ExecutionResult` / `PublicPhase`，不依赖 CLI 字符串。

---

### 4.5 `H1.experience.controlCenter` — 资金中控台

**职责**：资产分布、聚合 vs 单链切换、与当前登录会话中的签名地址展示一致。若会话单独拆模块，模块 ID 为 `H1.platform.session`（可分期落地）。

**对外契约**

| API | 说明 |
|-----|------|
| `getDashboardModel()` | 聚合视图 + 分链明细 + 可操作提示 |
| `navigateToIntent(type, preset)` | 跳转智能会话 |

---

### 4.6 `H1.engagement.cardVault` — 卡库与成就

**职责**：交易成功 → 确认卡收录、积分、头像等级、支线任务进度。

**对外契约**

| API | 说明 |
|-----|------|
| `onTradeConfirmed(event: TradeConfirmedEvent)` | 幂等；发卡/加分 |
| `getCardCollection()` | 用户卡列表 |
| `getAvatarTier()` | 当前等级与进度 |
| `claimQuest(questId)` / `getQuestProgress(questId)` | 支线如「集齐 5 张策略卡」 |
| `getRules()` | 积分与等级规则（可配置） |

**输入事件**（由编排层或 `H1.integration.okx` 发出）：`TradeConfirmedEvent` 需含 `trace_id`、`intent_type`、`sku_id?`、`timestamp`、`sanitized_meta`。

**风控**：防刷策略在 **服务端** 实现（频控、延迟确认、异常模式），本模块消费清洗后事件。

---

### 4.7 `H1.partner.directory` — 合作商对接面（可分期）

**职责**：合作商 SKU 目录、计费与回调签名、租户隔离策略；对编排层暴露 **统一 `H1.partner.StrategyAdapter` 接口**。

**对外契约（第一期可 stub）**

| API | 说明 |
|-----|------|
| `listSkus(partnerId?)` | 上架策略/服务 |
| `bindPartnerWebhook(config)` | 异步状态对齐 |
| `createPartnerSession(partnerId, skuId)` | 返回策略会话上下文 |

---

### 4.8 `H1.platform.audit` — 审计与可观测

**职责**：结构化日志、trace 贯穿、供用户折叠时间轴与内部排障。

**对外契约**：`log(event)`，`queryTrace(trace_id)`（权限控制）；**不与用户主气泡混流**。

---

## 5. 关键业务流程（需求级）

### 5.1 单笔转账（示例）

1. 用户自然语言或按钮带 intent。  
2. `H1.orchestration.intent` 解析 → 槽位由绑定 OKX 地址等补齐 → 必要时 **单一澄清**（非逐项表单）。  
3. `H1.orchestration.execution` 生成计划 → 前端播放 **短时阶段动效**（无语义内部术语）→ 调用 `H1.integration.okx`。  
4. 成功 → `H1.experience.chat` 出 **完成卡片** → `H1.engagement.cardVault.onTradeConfirmed`。  
5. 失败 → **一条人话原因** + 重试/修改入口（仍在会话内）；错误码归属 `H1.*`。

### 5.2 卡库与等级

- 五级头像：**白 H → … → 金**，规则可配置（积分阈值 + 稀有成就条件）。  
- 支线示例：**集齐 5 张策略系列卡** 解锁「策略大师」卡 —— 需运营配置「策略卡」判定条件与 SKU 绑定。

---

## 6. 错误码与版本

- **统一归属 `H1`（响应体/日志，非 URL）**：**接入层** `H1.OKX.*`；**编排层** `H1.ORC.*`；**体验层** `H1.EXP.*`；**卡库** `H1.ENG.*`；**合作商** `H1.PRT.*`；**平台审计** `H1.PLT.*`；**安全/会话** `H1.SEC.*`。  
- **用户可见文案**：由 `user_message_key` 映射，**不暴露** `H1` 代号（见 §2.1 C）。  
- **HTTP/OpenAPI**：路径遵循 §2.1 A（`/api/v{version}/{service}/...`）；`info.version` 可用语义化 **`1.0.0`**；在文档 **`x-hwallet-api-generation: H1`** 标明与 H1 域模型及 Skill 契约配套。**REST 的 `v1`/`v2` 与 H1/H2 代际独立演进**——例如仅 `market` 升 `/api/v2/market/*` 做灰度，不必整体升 H2。  
- **合作商 OpenAPI**：同样采用语义化路径 + 版本段；**breaking change** 用新 **`/api/v{n}`** 并联调；域模型大换代同步文档 **H2**。

---

## 7. 交付分期建议

| 阶段 | 目标 |
|------|------|
| **P0** | `H1.integration.okx` + `H1.orchestration.execution` + `H1.experience.chat` 完成卡 + `H1.experience.controlCenter` 只读增强 |
| **P1** | 动效阶段与 `H1.platform.audit` 折叠时间轴；`H1.engagement.cardVault` 基础发卡与积分 |
| **P2** | `H1.partner.directory` 首批 SKU；支线任务配置化；补齐 `H1.skill.*` 与编排映射 |

---

## 8. 附录：术语

| 术语 | 含义 |
|------|------|
| Intent | 用户要做的任务类型及槽位（金额、资产、目标地址等） |
| 完成卡片 | 交易成功后的结构化 UI 卡，含可核对摘要与证据 |
| 卡库 | 成就墙；收录确认卡与支线成就 |
| Partner Plane | 合作商统一目录、签约与回调面（独立于 OKX 接入实现）；实现模块 ID：`H1.partner.directory` |
| H1 | 本平台 **一代域模型**：模块 ID / Skill / 事件 / 错误码 的代际前缀；**不等同于** URL 中的服务名单元（REST 见 §2.1 A） |

---

## 9. Skill 与模块映射（H1）

在 Agent / MCP 中注册的工具名须以 **`H1.skill.`** 开头，并与调用模块及 **REST 路径**对应，避免「无前缀 Skill」与随意路径：

| Skill 名（示例） | 主要调用模块 | REST 映射示例（§2.1） |
|------------------|--------------|------------------------|
| `H1.skill.wallet.transfer` | `H1.integration.okx` + `H1.orchestration.execution` | `POST /api/v1/trade/...` 或编排内聚后的 `wallet`/`trade` 资源（以 OpenAPI 为准） |
| `H1.skill.swap.quote` / `H1.skill.swap.execute` | `H1.integration.okx` | `POST /api/v1/trade/swap`、`POST /api/v1/trade/confirm` |
| `H1.skill.market.price` | `H1.integration.okx` | `GET /api/v1/market/price` |
| `H1.skill.portfolio.snapshot` | `H1.integration.okx` / `H1.experience.controlCenter` | `GET /api/v1/wallet/balance` |
| `H1.skill.cardVault.eligible` | `H1.engagement.cardVault` | `GET /api/v1/cards/list` |

新增能力时：**先定模块 ID `H1.*` 与 REST 资源**，再增 `H1.skill.*`，错误码落在 §6 对应来源。

---

*文档版本：讨论稿 v1.3（§2.1.E 与讨论材料/yaml 对照）｜OpenAPI 示例见仓库 [`docs/API_MODULE_EXAMPLE.yaml`](API_MODULE_EXAMPLE.yaml)。*

---

## 10. 实现占位（代码）

域逻辑与 **H1 分层** 的首版 TypeScript 封装见 **[`h1-platform/`](../h1-platform/)**（与 Expo App 解耦）；运行测试：`npm run test:h1`。

**生产后端（walletBackend）** 已拆为 **`src/wallet-backend/`**（含 **`routes/`** 按域分发）；入口 **`src/services/walletBackend.ts`**。App 侧 **`walletApiCore` / `walletApiHttp` / `walletApi`** 与 **`src/api/providers/okx/onchain/`** 见各目录 `README.md` 或文件头注释。**仓库级目录与 MCP 数据流**见 **`docs/H_WALLET_REPO_STRUCTURE.md`**。
