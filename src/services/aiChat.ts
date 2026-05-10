/**
 * AI Chat Service — 双模型架构
 * Claude: 意图识别（精准判断用户操作意图）
 * DeepSeek: 聊天对话（回答问题、分析行情）
 *
 * 模型名与 max_tokens 可由环境变量设置，并由钱包后端 **`runtime-settings.json`** 在进程内热覆盖（见 `getEffective*`）。
 */

import {
  CHAT_INTENT_ACTION_PROMPT_LITERAL,
  localRuleIntent,
  sanitizeIntentPayload,
  type AIIntent,
} from "./intentNormalize";
import { fetchWithDeadline } from "./fetchWithDeadline";
import {
  getEffectiveClaudeIntentModel,
  getEffectiveDeepseekChatMaxTokens,
  getEffectiveDeepseekChatModel,
  getEffectiveDeepseekIntentModel,
  getEffectiveExternalLlmFetchTimeoutMs,
  getEffectiveIntentMaxTokens,
} from "../wallet-backend/runtime-settings";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

const CHAT_SYSTEM_PROMPT = `你是 H Wallet 的 AI 助手，名字叫「H」，性格像一只聪明友善的海豚。
你是用户的链上资产管家，帮助用户管理链上钱包、查行情、做交易。

**你能做的事：**
1. 查充值地址（EVM / Solana），帮用户充值收款
2. 查链上资产总览（持有哪些币、总价值）
3. 查加密货币行情（BTC、ETH、SOL、Meme 币等实时价格）
4. 链上兑换（USDT 换 ETH 等）
5. 链上赚币（质押、DeFi 理财）
6. 发现链上机会（聪明钱信号、DeFi 高收益）
7. 交易策略建议（网格、DCA、趋势跟随）
8. 风险管理建议（止损止盈、仓位管理）

**上下文推理规则（重要）：**
- 对话中已经展示过地址 / 资产 / 行情，用户追问时**直接用上下文里的数据回答**，不要重新查
- 用户说「从欧易转」「从币安提」→ 推荐 EVM 地址，直接回答，不要让用户自己去找
- 用户说「够买多少 X」→ 用上下文资产数据直接算
- 用户说「值得买吗」→ 结合上下文行情数据给分析

**回复格式：**
- Markdown 格式，关键数据 **加粗**
- 简洁有力，3~6 行
- 语气亲切专业，适当 emoji（1~2个）
- 不知道的事直说不知道，不编造数据
- 中文回复为主`;

const INTENT_SYSTEM_PROMPT = `你是 H Wallet 的意图识别引擎。分析用户输入，返回 JSON 格式：
{
  "action": "${CHAT_INTENT_ACTION_PROMPT_LITERAL}",
  "symbol": "BTC",
  "amount": 100,
  "leverage": 10,
  "protocol": "Lido",
  "reply": "结构化的中文回复（Markdown格式，关键数据加粗，适当emoji，3~5行）"
}

**字段规则：**
- symbol: BTC/ETH/SOL/DOGE 等（英文大写）
- amount: USDT 数量，默认 100
- leverage: 杠杆倍数，默认 10
- action 必须为上述枚举之一（勿发明新值）；含义:
  price=查行情,
  trade_long=做多,
  trade_short=做空,
  grid=网格策略,
  swap=兑换,
  earn=质押赚币,
  position=查持仓,
  portfolio=查链上资产/余额,
  address=查充值地址/收款地址/我的地址/转入/充值/recharge/deposit,
  signal=链上机会/聪明钱信号,
  chat=闲聊/追问/其他

**重要：** 用户说「充值」「收款地址」「我的地址」「转入」「存入」→ action 必须是 address

**reply 排版规范：**
- Markdown 格式，关键数据 **加粗**
- 语气专业亲切，2~5 行
- 适当 emoji（1~2个）`;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * DeepSeek 聊天对话 — 用于通用 AI 聊天
 */
export async function chatWithAI(
  messages: ChatMessage[],
  userMessage: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (!DEEPSEEK_API_KEY.trim()) {
    console.warn("[AIChat] DEEPSEEK_API_KEY 未配置（应在钱包后端进程环境中设置，勿写入 App）");
    return "⚠️ 服务端尚未配置对话模型密钥。请在运行 **钱包后端** 的环境中设置 `DEEPSEEK_API_KEY` 后重启进程（密钥不要放进 Expo 前端）。";
  }

  const allMessages: ChatMessage[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    ...messages.slice(-10),
    { role: "user", content: userMessage },
  ];

  try {
    const response = await fetchWithDeadline(
      DEEPSEEK_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: getEffectiveDeepseekChatModel(),
          messages: allMessages,
          max_tokens: getEffectiveDeepseekChatMaxTokens(),
          temperature: 0.7,
          top_p: 0.9,
        }),
        signal: abortSignal,
      },
        getEffectiveExternalLlmFetchTimeoutMs(),
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("[AIChat] DeepSeek API error:", response.status, errText);
      return "⚠️ AI 服务暂时不可用，请稍后再试。";
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "";
    return reply || "🤔 我没有想到合适的回复，请换个方式问我吧。";
  } catch (err: any) {
    if (isAbortError(err)) {
      return "（已取消本次回复）";
    }
    console.error("[AIChat] DeepSeek Error:", err.message);
    return "⚠️ 网络连接失败，请检查网络后重试。";
  }
}

/** 从模型输出中提取 JSON 对象（支持 ```json 围栏、前后废话） */
function parseIntentJsonFromLlmText(text: string): unknown {
  let t = text.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)```/im.exec(t);
  if (fenced) {
    t = fenced[1].trim();
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(t.slice(first, last + 1));
  }
  return JSON.parse(t);
}

/**
 * Claude / DeepSeek 意图识别；`signal` 可选（如客户端取消）。
 */
export async function recognizeIntent(userMessage: string, signal?: AbortSignal): Promise<AIIntent> {
  if (!CLAUDE_API_KEY.trim() && !DEEPSEEK_API_KEY.trim()) {
    console.warn("[AIChat] CLAUDE_API_KEY / DEEPSEEK_API_KEY 均未配置，使用本地规则识别意图");
    return localRuleIntent(userMessage);
  }

  if (!CLAUDE_API_KEY.trim()) {
    return recognizeIntentFallback(userMessage, signal);
  }

  try {
    const response = await fetchWithDeadline(
      CLAUDE_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: getEffectiveClaudeIntentModel(),
          max_tokens: getEffectiveIntentMaxTokens(),
          system: INTENT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
        signal,
      },
        getEffectiveExternalLlmFetchTimeoutMs(),
    );

    if (!response.ok) {
      console.error("[AIChat] Claude API error:", response.status);
      return recognizeIntentFallback(userMessage, signal);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    try {
      const parsed = parseIntentJsonFromLlmText(text);
      return sanitizeIntentPayload(parsed);
    } catch {
      return recognizeIntentFallback(userMessage, signal);
    }
  } catch (err: any) {
    if (isAbortError(err)) {
      return localRuleIntent(userMessage);
    }
    console.error("[AIChat] Claude Intent error:", err.message);
    return recognizeIntentFallback(userMessage, signal);
  }
}

async function recognizeIntentFallback(userMessage: string, signal?: AbortSignal): Promise<AIIntent> {
  if (!DEEPSEEK_API_KEY.trim()) {
    return localRuleIntent(userMessage);
  }
  try {
    const response = await fetchWithDeadline(
      DEEPSEEK_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: getEffectiveDeepseekIntentModel(),
          messages: [
            { role: "system", content: INTENT_SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          max_tokens: getEffectiveIntentMaxTokens(),
          temperature: 0.3,
        }),
        signal,
      },
        getEffectiveExternalLlmFetchTimeoutMs(),
    );

    if (!response.ok) {
      console.error("[AIChat] DeepSeek Intent fallback error:", response.status);
      return localRuleIntent(userMessage);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    try {
      const parsed = parseIntentJsonFromLlmText(text);
      return sanitizeIntentPayload(parsed);
    } catch {
      return localRuleIntent(userMessage);
    }
  } catch (err: any) {
    if (isAbortError(err)) {
      return localRuleIntent(userMessage);
    }
    console.error("[AIChat] DeepSeek Intent fallback error:", err.message);
    return localRuleIntent(userMessage);
  }
}
