/**
 * AI Chat Service — 双模型架构
 * Claude: 意图识别（精准判断用户操作意图）
 * DeepSeek: 聊天对话（回答问题、分析行情）
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

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
  "action": "price|trade_long|trade_short|grid|swap|earn|position|portfolio|chat",
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
- action 含义: price=查行情, trade_long=做多, trade_short=做空, grid=网格策略, swap=兑换, earn=质押赚币, position=查持仓, portfolio=查资产, chat=闲聊

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

/**
 * DeepSeek 聊天对话 — 用于通用 AI 聊天
 */
export async function chatWithAI(
  messages: ChatMessage[],
  userMessage: string
): Promise<string> {
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
        model: "deepseek-chat",
        messages: allMessages,
        max_tokens: 1024,
        temperature: 0.7,
        top_p: 0.9,
      }),
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
    console.error("[AIChat] DeepSeek Error:", err.message);
    return "⚠️ 网络连接失败，请检查网络后重试。";
  }
}

/**
 * Claude 意图识别 — 精准判断用户操作意图
 */
export async function recognizeIntent(userMessage: string): Promise<any> {
  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: INTENT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error("[AIChat] Claude API error:", response.status);
      // Fallback to DeepSeek for intent
      return recognizeIntentFallback(userMessage);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(text);
    } catch {
      return recognizeIntentFallback(userMessage);
    }
  } catch (err: any) {
    console.error("[AIChat] Claude Intent error:", err.message);
    return recognizeIntentFallback(userMessage);
  }
}

/**
 * DeepSeek fallback for intent recognition (if Claude fails)
 */
async function recognizeIntentFallback(userMessage: string): Promise<any> {
  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: INTENT_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 512,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error("[AIChat] DeepSeek Intent fallback error:", response.status);
      return localFallbackIntent(userMessage);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(text);
    } catch {
      return localFallbackIntent(userMessage);
    }
  } catch (err: any) {
    console.error("[AIChat] DeepSeek Intent fallback error:", err.message);
    return localFallbackIntent(userMessage);
  }
}

/**
 * Local regex fallback — 最后兜底
 */
function localFallbackIntent(input: string): any {
  const lower = input.toLowerCase().replace(/\s+/g, '');
  let symbol = 'BTC';
  if (/eth|以太/.test(lower)) symbol = 'ETH';
  if (/sol/.test(lower)) symbol = 'SOL';
  if (/doge/.test(lower)) symbol = 'DOGE';
  const amtMatch = input.match(/(\d+(?:\.\d+)?)\s*(u|usdt)?/i);
  const amount = amtMatch ? parseFloat(amtMatch[1]) : 100;
  const levMatch = input.match(/(\d+)\s*[xX]/);
  const leverage = levMatch ? parseInt(levMatch[1]) : 10;

  if (/价格|行情|多少钱|今日|查一下/.test(lower)) {
    return { action: 'price', symbol, reply: '' };
  }
  if (/做多|long|开多/.test(lower)) {
    return { action: 'trade_long', symbol, amount, leverage, reply: '' };
  }
  if (/做空|short|开空/.test(lower)) {
    return { action: 'trade_short', symbol, amount, leverage, reply: '' };
  }
  if (/网格|grid|策略/.test(lower)) {
    return { action: 'grid', symbol, amount, reply: '' };
  }
  if (/兑换|swap|换成|买入/.test(lower)) {
    return { action: 'swap', symbol, amount, reply: '' };
  }
  if (/赚币|earn|质押|stake|理财/.test(lower)) {
    return { action: 'earn', symbol: /eth/.test(lower) ? 'ETH' : 'USDT', amount, reply: '' };
  }
  if (/持仓|仓位|position/.test(lower)) {
    return { action: 'position', reply: '' };
  }
  if (/资产|余额|balance/.test(lower)) {
    return { action: 'portfolio', reply: '' };
  }
  return { action: 'chat', reply: '' };
}
