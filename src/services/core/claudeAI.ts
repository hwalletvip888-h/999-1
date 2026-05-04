/**
 * Claude AI Service
 * Uses Claude API for natural language understanding and intent recognition
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

const SYSTEM_PROMPT = `You are H Wallet AI assistant named H. You help users trade crypto.

RESPOND IN JSON ONLY:
{
  "action": "price|trade_long|trade_short|grid|swap|earn|position|portfolio|chat",
  "symbol": "BTC",
  "amount": 100,
  "leverage": 10,
  "protocol": "Lido",
  "reply": "Chinese reply text"
}

Rules:
- reply field MUST be in Chinese, friendly tone
- symbol: BTC/ETH/SOL/DOGE etc (English)
- amount: number in USDT, default 100
- leverage: default 10
- action meanings: price=query price, trade_long=go long, trade_short=go short, grid=grid strategy, swap=token swap, earn=staking/earn, position=check positions, portfolio=check assets, chat=general chat
- Keep reply under 80 chars, be concise
- Use dolphin personality, friendly tone`;

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
        max_tokens: 256,
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
  if (/eth/.test(lower)) symbol = 'ETH';
  if (/sol/.test(lower)) symbol = 'SOL';
  if (/doge/.test(lower)) symbol = 'DOGE';
  const amtMatch = input.match(/(\d+(?:\.\d+)?)\s*(u|usdt)?/i);
  const amount = amtMatch ? parseFloat(amtMatch[1]) : 100;
  const levMatch = input.match(/(\d+)\s*[xX]/);
  const leverage = levMatch ? parseInt(levMatch[1]) : 10;

  if (/价格|行情|多少钱|今日|查一下/.test(lower)) {
    return { action: 'price', symbol, reply: `正在查询 ${symbol} 实时行情...` };
  }
  if (/做多|long|开多/.test(lower)) {
    return { action: 'trade_long', symbol, amount, leverage, reply: `为你准备 ${symbol} 做多卡片...` };
  }
  if (/做空|short|开空/.test(lower)) {
    return { action: 'trade_short', symbol, amount, leverage, reply: `为你准备 ${symbol} 做空卡片...` };
  }
  if (/合约|永续|开仓/.test(lower)) {
    return { action: 'trade_long', symbol, amount, leverage, reply: `为你准备 ${symbol} 合约卡片...` };
  }
  if (/网格|grid|策略/.test(lower)) {
    return { action: 'grid', symbol, amount, reply: `为你准备 ${symbol} 网格策略...` };
  }
  if (/兑换|swap|换成|买入/.test(lower)) {
    return { action: 'swap', symbol, amount, reply: `为你准备兑换卡片...` };
  }
  if (/赚币|earn|质押|stake|理财|apy/.test(lower)) {
    const isEth = /eth|以太/.test(lower);
    return { action: 'earn', symbol: isEth ? 'ETH' : 'USDT', amount, protocol: isEth ? 'Lido' : 'Aave', reply: `为你准备质押赚币卡片...` };
  }
  if (/持仓|仓位|position/.test(lower)) {
    return { action: 'position', reply: '正在查询你的持仓...' };
  }
  if (/资产|余额|balance|总资产/.test(lower)) {
    return { action: 'portfolio', reply: '正在查询你的资产...' };
  }
  return {
    action: 'chat',
    reply: `我可以帮你查行情、开合约、跑网格、兑换代币、质押赚币。请告诉我你想做什么？`
  };
}
