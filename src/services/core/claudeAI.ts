/**
 * Claude AI Service
 * Uses Claude API for natural language understanding and intent recognition
 * 回复格式：专业、结构化、Markdown 排版
 */

// API key from environment variable - never hardcode secrets
const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY || '';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

export interface AIIntent {
  action: 'price' | 'trade_long' | 'trade_short' | 'grid' | 'swap' | 'earn' | 'position' | 'portfolio' | 'chat';
  symbol?: string;
  amount?: number;
  leverage?: number;
  protocol?: string;
  reply: string;
}

const SYSTEM_PROMPT = `你是 H Wallet 的 AI 助手，名字叫「H」，性格像一只聪明友善的海豚。

你帮助用户进行加密货币交易操作。

**回复格式要求：**
返回 JSON 格式：
{
  "action": "price|trade_long|trade_short|grid|swap|earn|position|portfolio|chat",
  "symbol": "BTC",
  "amount": 100,
  "leverage": 10,
  "protocol": "Lido",
  "reply": "结构化的中文回复"
}

**reply 字段的排版规范：**
- 用 Markdown 格式书写
- 关键数据单独成行，用 **加粗** 突出
- 不同信息之间用换行分隔，保持呼吸感
- 语气专业但亲切，像一位资深交易顾问
- 长度控制在 2~5 行，不要挤在一行里
- 适当使用 emoji 但不要过多（1~2个即可）

**reply 示例：**

查行情时：
"📊 **BTC/USDT** 实时行情\\n\\n当前价格 **$96,420**\\n24h 涨幅 +2.35%\\n\\n已为你生成详细行情卡片 👇"

做多时：
"📈 为你生成 **BTC 做多** 交易卡片\\n\\n入场价格 $96,420 · 杠杆 10x\\n预计保证金 100 USDT\\n\\n请确认卡片参数后执行 👇"

闲聊时：
"你好！我是 H，你的链上交易助手 🐬\\n\\n我可以帮你：\\n\\n• 查询实时行情\\n• 开永续合约（做多/做空）\\n• 运行网格策略\\n• 链上代币兑换\\n• DeFi 质押赚币\\n\\n直接告诉我你想做什么吧"

**字段规则：**
- symbol: BTC/ETH/SOL/DOGE 等（英文大写）
- amount: USDT 数量，默认 100
- leverage: 杠杆倍数，默认 10
- action 含义: price=查行情, trade_long=做多, trade_short=做空, grid=网格策略, swap=兑换, earn=质押赚币, position=查持仓, portfolio=查资产, chat=闲聊`;

export async function askClaude(userMessage: string): Promise<AIIntent> {
  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.warn('[ClaudeAI] API error:', response.status);
      return fallbackIntent(userMessage);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        action: parsed.action || 'chat',
        symbol: parsed.symbol?.toUpperCase(),
        amount: parsed.amount ? Number(parsed.amount) : undefined,
        leverage: parsed.leverage ? Number(parsed.leverage) : undefined,
        protocol: parsed.protocol,
        reply: parsed.reply || '',
      };
    }
    return { action: 'chat', reply: text };
  } catch (err: any) {
    console.warn('[ClaudeAI] Error:', err.message);
    return fallbackIntent(userMessage);
  }
}

function fallbackIntent(input: string): AIIntent {
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
  if (/合约|永续|开仓/.test(lower)) {
    return { action: 'trade_long', symbol, amount, leverage, reply: '' };
  }
  if (/网格|grid|策略/.test(lower)) {
    return { action: 'grid', symbol, amount, reply: '' };
  }
  if (/兑换|swap|换成|买入/.test(lower)) {
    return { action: 'swap', symbol, amount, reply: '' };
  }
  if (/赚币|earn|质押|stake|理财|apy/.test(lower)) {
    const isEth = /eth|以太/.test(lower);
    return { action: 'earn', symbol: isEth ? 'ETH' : 'USDT', amount, protocol: isEth ? 'Lido' : 'Aave', reply: '' };
  }
  if (/持仓|仓位|position/.test(lower)) {
    return { action: 'position', reply: '' };
  }
  if (/资产|余额|balance|总资产/.test(lower)) {
    return { action: 'portfolio', reply: '' };
  }
  return {
    action: 'chat',
    reply: ''
  };
}
