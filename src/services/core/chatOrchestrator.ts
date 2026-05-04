

import { aiRoute } from './aiRouter';
import { createCard } from './cardsApi';
import { perpetualPreview } from '../products/v5/v5PerpetualApi';
import { gridPreview } from '../products/v5/v5GridApi';
import { swapPreview } from '../products/v6/v6SwapApi';
import { earnPreview } from '../products/v6/v6EarnApi';
import type { ApiResponse } from '../../types/api';
import type { HWalletCard } from '../../types/card';

export async function handleUserPrompt(input: string): Promise<ApiResponse<{ replyText: string; card?: HWalletCard; clarifyQuestion?: string }>> {
  const now = new Date().toISOString();
  const route = aiRoute(input);

  // clarify 只做澄清，不生成卡片
  if ((route as any).productLine === 'clarify') {
    return {
      ok: true,
      data: {
        replyText: '你想通过哪种方式操作？',
        clarifyQuestion: '你想通过哪种方式操作？\n\n1. 使用智能交易账户买入\n2. 使用智能钱包在链上兑换'
      },
      simulationMode: true
    };
  }

  // V5 行情查询，返回模拟行情摘要文本
  if (route.productLine === 'v5' && route.module === 'market' && route.intent === 'info') {
    // 仅当输入含价格/行情/今日/查询等关键词时才返回行情摘要
    if (/(价格|行情|今日|查询)/.test(input)) {
      let symbol = 'BTC';
      if (/eth/i.test(input)) symbol = 'ETH';
      return {
        ok: true,
        data: {
          replyText: `这是 ${symbol} 当前的模拟行情摘要：当前价格 68,240 USDT，24小时涨跌幅 +2.4%。当前为模拟行情数据。`
        },
        simulationMode: true
      };
    }
  }

  if (route.productLine !== 'v5' && route.productLine !== 'v6') {
    return {
      ok: false,
      errorCode: 'INVALID_PRODUCT_LINE',
      errorMsg: '暂时无法识别该产品能力。',
      simulationMode: true
    };
  }

  let card: HWalletCard | undefined;
  let replyText = '';
  if (route.productLine === 'v5' && route.module === 'perpetual') {
    perpetualPreview({ instId: "ETH-USDT-SWAP", side: "buy", ordType: "market", sz: "100" });
    card = {
      id: `card_${Date.now()}`,
      productLine: 'v5',
      module: 'perpetual',
      cardType: 'trade',
      header: '交易卡片',
      title: 'ETH/USDT 永续合约',
      riskLevel: '中',
      status: 'preview',
      simulationMode: true,
      userPrompt: input,
      aiSummary: 'ETH/USDT 永续合约，金额 100 USDT，方向做多，3倍杠杆',
      createdAt: now,
      pair: 'ETH/USDT',
      amount: 100,
      currency: 'USDT',
      direction: '做多',
      leverage: 3
    };
    replyText = '已为你生成交易卡片，请确认后再模拟执行。';
  } else if (route.productLine === 'v5' && route.module === 'grid') {
    gridPreview({ instId: "ETH-USDT-SWAP" });
    card = {
      id: `card_${Date.now()}`,
      productLine: 'v5',
      module: 'grid',
      cardType: 'strategy',
      header: '策略卡片',
      title: 'ETH/USDT 网格策略',
      riskLevel: '中',
      status: 'preview',
      simulationMode: true,
      userPrompt: input,
      aiSummary: 'ETH/USDT 网格策略，金额 100 USDT',
      createdAt: now,
      pair: 'ETH/USDT',
      amount: 100,
      currency: 'USDT'
    };
    replyText = '已为你生成策略卡片，请确认后再模拟执行。';
  } else if (route.productLine === 'v6' && route.module === 'swap') {
    swapPreview({ chainIndex: "1", fromToken: "", toToken: "", amount: "100000000" });
    card = {
      id: `card_${Date.now()}`,
      productLine: 'v6',
      module: 'swap',
      cardType: 'trade',
      header: '交易卡片',
      title: 'ETH 链上兑换',
      riskLevel: '中',
      status: 'preview',
      simulationMode: true,
      userPrompt: input,
      aiSummary: 'ETH 链上兑换，金额 100 USDT，买入',
      createdAt: now
    };
    replyText = '已为你生成交易卡片，请确认后再模拟执行。';
  }

  // 其他情况，普通回复
  return {
    ok: true,
    data: {
      replyText: '这是一个普通回复，未识别为具体操作。'
    },
    simulationMode: true
  };
}
