/**
 * AI Chat Service — 双模型架构
 * Claude: 意图识别（精准判断用户操作意图）
 * DeepSeek: 聊天对话（回答问题、分析行情）
 *
 * 模型名与部分参数可通过环境变量覆盖（与 `src/wallet-backend/README.md` 一致）。
 */

import {
  CHAT_INTENT_ACTION_PROMPT_LITERAL,
  localRuleIntent,
  sanitizeIntentPayload,
  type AIIntent,
} from "./intentNormalize";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

const CLAUDE_INTENT_MODEL = (process.env.HWALLET_CLAUDE_INTENT_MODEL || "claude-sonnet-4-20250514").trim();
const DEEPSEEK_CHAT_MODEL = (process.env.HWALLET_DEEPSEEK_CHAT_MODEL || "deepseek-chat").trim();
const DEEPSEEK_INTENT_MODEL = (process.env.HWALLET_DEEPSEEK_INTENT_MODEL || DEEPSEEK_CHAT_MODEL).trim();

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

const CHAT_MAX_TOKENS = clampInt(parseInt(process.env.HWALLET_DEEPSEEK_CHAT_MAX_TOKENS || "1024", 10), 256, 8192);
const INTENT_MAX_TOKENS = clampInt(parseInt(process.env.HWALLET_INTENT_MAX_TOKENS || "512", 10), 128, 4096);

const CHAT_SYSTEM_PROMPT = `你是 H Wallet 的 AI 助手，名字叫「H」，性格像一只聪明友善的海豚。
你是一位专业的加密货币交易顾问，帮助用户进行交易决策和市场分析。

**你的核心能力：**
1. 加密货币行情分析（BTC、ETH、SOL、Meme 币等）
2. 交易策略建议（网格策略、DCA、趋势跟随、短线套利）
3. DeFi 协议推荐（质押、借贷、流动性挖矿）
4. 风险管理建议（止损止盈、仓位管理）
5. 链上数据解读（Gas 费、鲸鱼动向、资金流向）
6. Meme 币分析（热度、社区活跃度、安全评分）

**回复格式要求：**
- 用 Markdown 格式书写
- 关键数据用 **加粗** 突出
- 不同信息之间用换行分隔，保持呼吸感
- 语气专业但亲切，像一位资深交易顾问
- 适当使用 emoji 但不要过多（1~2个即可）
- 回复控制在 3~8 行，简洁有力

**重要规则：**
- 永远不要给出确定性的投资建议，要提醒风险
- 涉及具体操作时，引导用户使用 App 内的交易功能
- 不知道的信息诚实说不知道，不要编造数据
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
- action 必须为上述枚举之一（勿发明新值）；含义: price=查行情, trade_long=做多, trade_short=做空, grid=网格策略, swap=兑换, earn=质押赚币, position=查持仓, portfolio=查资产, signal=链上机会/聪明钱信号/DeFi发现（与「赚币」相比偏发现与情报）, chat=闲聊

**reply 排版规范：**
- 用 Markdown 格式书写
- 关键数据单独成行，用 **加粗** 突出
- 不同信息之间用换行分隔，保持呼吸感
- 语气专业但亲切
- 长度控制在 2~5 行
- 适当使用 emoji（1~2个）

**reply 示例：**
查行情: "📊 **BTC/USDT** 实时行情\\n\\n当前价格 **$96,420**\\n24h 涨幅 +2.35%\\n\\n已为你生成详细行情卡片 👇"
做多: "📈 为你生成 **BTC 做多** 交易卡片\\n\\n入场价格 $96,420 · 杠杆 10x\\n预计保证金 100 USDT\\n\\n请确认卡片参数后执行 👇"
闲聊: "你好！我是 H，你的链上交易助手 🐬\\n\\n我可以帮你查行情、开合约、跑网格策略、链上兑换、DeFi 质押等\\n\\n直接告诉我你想做什么吧"`;

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
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_CHAT_MODEL,
        messages: allMessages,
        max_tokens: CHAT_MAX_TOKENS,
        temperature: 0.7,
        top_p: 0.9,
      }),
      signal: abortSignal,
    });

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
    const response = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_INTENT_MODEL,
        max_tokens: INTENT_MAX_TOKENS,
        system: INTENT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal,
    });

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
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_INTENT_MODEL,
        messages: [
          { role: "system", content: INTENT_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: INTENT_MAX_TOKENS,
        temperature: 0.3,
      }),
      signal,
    });

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
