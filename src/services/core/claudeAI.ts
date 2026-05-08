/**
 * AI Service — 通过后端 API 调用 (Claude + DeepSeek)
 * 意图识别: 后端 Claude API
 * 聊天对话: 后端 DeepSeek API
 * 
 * 不再在前端直接调用 AI API，统一走后端（同源 `EXPO_PUBLIC_HWALLET_API_BASE`）。
 */
import { getHwalletApiBase } from "../walletApi";

export interface AIIntent {
  action:
    | 'price'
    | 'trade_long'
    | 'trade_short'
    | 'grid'
    | 'swap'
    | 'earn'
    | 'position'
    | 'portfolio'
    | 'signal'   // V6 链上机会发现（聪明钱信号 / DeFi 推荐）
    | 'chat';
  symbol?: string;
  amount?: number;
  leverage?: number;
  protocol?: string;
  reply: string;
}

/**
 * 意图识别 — 调用后端 /api/ai/intent (Claude)
 */
export async function askClaude(userMessage: string): Promise<AIIntent> {
  const base = getHwalletApiBase();
  if (!base) {
    console.warn("[AI] EXPO_PUBLIC_HWALLET_API_BASE 未配置，使用本地意图规则");
    return fallbackIntent(userMessage);
  }

  try {
    const response = await fetch(`${base}/api/ai/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage }),
    });

    if (!response.ok) {
      console.warn('[AI] Intent API error:', response.status);
      return fallbackIntent(userMessage);
    }

    const data = await response.json();
    if (data.ok && data.intent) {
      return {
        action: data.intent.action || 'chat',
        symbol: data.intent.symbol?.toUpperCase(),
        amount: data.intent.amount ? Number(data.intent.amount) : undefined,
        leverage: data.intent.leverage ? Number(data.intent.leverage) : undefined,
        protocol: data.intent.protocol,
        reply: data.intent.reply || '',
      };
    }
    return fallbackIntent(userMessage);
  } catch (err: any) {
    console.warn('[AI] Intent error:', err.message);
    return fallbackIntent(userMessage);
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * AI 聊天 — 调用后端 /api/ai/chat (DeepSeek)
 */
export async function chatWithAI(messages: ChatMessage[], userMessage: string): Promise<string> {
  const base = getHwalletApiBase();
  if (!base) {
    return "⚠️ 未配置服务端地址（EXPO_PUBLIC_HWALLET_API_BASE），无法在客户端连接 AI 网关。";
  }

  try {
    const response = await fetch(`${base}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, message: userMessage }),
    });

    if (!response.ok) {
      console.warn('[AI] Chat API error:', response.status);
      return '⚠️ AI 服务暂时不可用，请稍后再试。';
    }

    const data = await response.json();
    if (data.ok && data.reply) {
      return data.reply;
    }
    return '🤔 我没有想到合适的回复，请换个方式问我吧。';
  } catch (err: any) {
    console.warn('[AI] Chat error:', err.message);
    return '⚠️ 网络连接失败，请检查网络后重试。';
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
  // 信号 / 机会发现要在 earn 之前判断（关键词重叠时 signal 优先）
  if (/机会|信号|聪明钱|smart\s*money|链上(赚|赚币)|发现|推荐|找(币|机会|项目)|kol|战壕|trenches/.test(lower)) {
    return { action: 'signal', reply: '' };
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
  return { action: 'chat', reply: '' };
}
