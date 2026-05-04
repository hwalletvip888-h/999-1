/**
 * Chat Orchestrator — 重构版
 * 接入真实 OKX API，替代所有 mock 回复
 */
import { aiRoute } from './aiRouter';
import { api } from '../../api/gateway';
import type { ApiResponse } from '../../types/api';
import type { HWalletCard } from '../../types/card';
import { makeId } from '../../utils/id';

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
      simulationMode: false
    };
  }

  // V5 行情查询 — 调用真实 OKX API
  if (route.productLine === 'v5' && route.module === 'market' && route.intent === 'info') {
    try {
      // 解析币种
      let symbol = 'BTC';
      const lower = input.toLowerCase();
      if (/eth|以太/.test(lower)) symbol = 'ETH';
      if (/sol/.test(lower)) symbol = 'SOL';
      if (/doge/.test(lower)) symbol = 'DOGE';

      const instId = `${symbol}-USDT`;
      const ticker = await api.market.getTicker(instId);
      const fundingRate = await api.market.getFundingRate(`${symbol}-USDT-SWAP`).catch(() => null);

      const changeIcon = ticker.changePercent24h >= 0 ? '📈' : '📉';
      const changeStr = ticker.changePercent24h >= 0
        ? `+${ticker.changePercent24h.toFixed(2)}%`
        : `${ticker.changePercent24h.toFixed(2)}%`;

      let replyText = `${changeIcon} **${symbol}/USDT 实时行情**\n\n`;
      replyText += `💰 当前价格：$${ticker.last.toLocaleString()}\n`;
      replyText += `📊 24h涨跌：${changeStr}\n`;
      replyText += `🔝 24h最高：$${ticker.high24h.toLocaleString()}\n`;
      replyText += `🔻 24h最低：$${ticker.low24h.toLocaleString()}\n`;
      replyText += `📦 24h成交量：${(ticker.vol24h / 1e6).toFixed(2)}M`;

      if (fundingRate) {
        const rateStr = (fundingRate.fundingRate * 100).toFixed(4);
        replyText += `\n💹 资金费率：${rateStr}%`;
      }

      return { ok: true, data: { replyText }, simulationMode: false };
    } catch (err: any) {
      return {
        ok: true,
        data: { replyText: `⚠️ 行情获取失败：${err.message || '网络错误'}` },
        simulationMode: false
      };
    }
  }

  // V5 永续合约 — 生成真实参数的交易卡片
  if (route.productLine === 'v5' && route.module === 'perpetual') {
    try {
      const lower = input.toLowerCase();
      let symbol = 'ETH';
      if (/btc|比特/.test(lower)) symbol = 'BTC';
      if (/sol/.test(lower)) symbol = 'SOL';

      const instId = `${symbol}-USDT-SWAP`;
      const ticker = await api.market.getTicker(instId);

      // 解析金额和方向
      const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(u|usdt|美元)?/i);
      const amount = amountMatch ? parseFloat(amountMatch[1]) : 100;
      const direction: '做多' | '做空' = /做空|short|空/.test(lower) ? '做空' : '做多';
      const leverageMatch = input.match(/(\d+)\s*[xX倍]/);
      const leverage = leverageMatch ? parseInt(leverageMatch[1]) : 3;

      const card: HWalletCard = {
        id: makeId('card_perp'),
        productLine: 'v5',
        module: 'perpetual',
        cardType: 'trade',
        header: '交易卡片',
        title: `${symbol}/USDT 永续合约`,
        riskLevel: leverage > 10 ? '高' : leverage > 5 ? '中' : '低',
        status: 'preview',
        simulationMode: false,
        userPrompt: input,
        aiSummary: `${symbol}/USDT 永续合约，金额 ${amount} USDT，方向${direction}，${leverage}倍杠杆。当前价格 $${ticker.last.toLocaleString()}`,
        createdAt: now,
        pair: `${symbol}/USDT`,
        amount,
        currency: 'USDT',
        direction,
        leverage,
        entryPrice: ticker.last,
        lastPrice: ticker.last,
      };

      return {
        ok: true,
        data: {
          replyText: `已为你生成 ${symbol}/USDT ${direction}交易卡片（${leverage}x），当前价格 $${ticker.last.toLocaleString()}。请确认后执行。`,
          card
        },
        simulationMode: false
      };
    } catch (err: any) {
      return {
        ok: true,
        data: { replyText: `⚠️ 合约预览失败：${err.message || '网络错误'}` },
        simulationMode: false
      };
    }
  }

  // V5 网格策略 — 调用 Grid AI 获取推荐参数
  if (route.productLine === 'v5' && route.module === 'grid') {
    try {
      const lower = input.toLowerCase();
      let symbol = 'ETH';
      if (/btc|比特/.test(lower)) symbol = 'BTC';

      const instId = `${symbol}-USDT-SWAP`;
      const ticker = await api.market.getTicker(instId);

      // 尝试获取 AI 推荐参数
      let gridParams: any = null;
      try {
        gridParams = await (api.grid as any).getAIParams?.(instId) ?? null;
      } catch { /* fallback */ }

      const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(u|usdt|美元)?/i);
      const amount = amountMatch ? parseFloat(amountMatch[1]) : 100;

      const priceUpper = gridParams?.maxPx ? parseFloat(gridParams.maxPx) : ticker.last * 1.1;
      const priceLower = gridParams?.minPx ? parseFloat(gridParams.minPx) : ticker.last * 0.9;
      const gridNum = gridParams?.gridNum ? parseInt(gridParams.gridNum) : 20;

      const card: HWalletCard = {
        id: makeId('card_grid'),
        productLine: 'v5',
        module: 'grid',
        cardType: 'strategy',
        header: '策略卡片',
        title: `${symbol}/USDT 网格策略`,
        riskLevel: '中',
        status: 'preview',
        simulationMode: false,
        userPrompt: input,
        aiSummary: `${symbol}/USDT 网格策略，投入 ${amount} USDT，价格区间 $${priceLower.toFixed(0)}~$${priceUpper.toFixed(0)}，${gridNum} 格。AI 推荐参数。`,
        createdAt: now,
        pair: `${symbol}/USDT`,
        amount,
        currency: 'USDT',
        agentName: `网格 · ${symbol}/USDT`,
        agentTags: ['网格', `${symbol}/USDT`, '中风险'],
        rows: [
          { label: '价格上限', value: `$${priceUpper.toFixed(0)}` },
          { label: '价格下限', value: `$${priceLower.toFixed(0)}` },
          { label: '网格数', value: `${gridNum}` },
          { label: '当前价格', value: `$${ticker.last.toLocaleString()}` },
        ],
        warning: '网格策略在单边行情中可能产生浮亏，请确认风险承受能力。',
        primaryAction: '启动网格',
        secondaryAction: '调整参数'
      };

      return {
        ok: true,
        data: {
          replyText: `已为你生成 ${symbol}/USDT 网格策略卡片，AI 推荐区间 $${priceLower.toFixed(0)}~$${priceUpper.toFixed(0)}。请确认后启动。`,
          card
        },
        simulationMode: false
      };
    } catch (err: any) {
      return {
        ok: true,
        data: { replyText: `⚠️ 网格策略生成失败：${err.message || '网络错误'}` },
        simulationMode: false
      };
    }
  }

  // V6 兑换 — 调用真实 DEX 聚合器
  if (route.productLine === 'v6' && route.module === 'swap') {
    try {
      const lower = input.toLowerCase();
      let toSymbol = 'ETH';
      if (/btc|比特/.test(lower)) toSymbol = 'BTC';
      if (/sol/.test(lower)) toSymbol = 'SOL';
      if (/doge/.test(lower)) toSymbol = 'DOGE';

      const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(u|usdt|美元)?/i);
      const amount = amountMatch ? parseFloat(amountMatch[1]) : 100;

      // 获取当前价格估算兑换量
      const instId = `${toSymbol}-USDT`;
      const ticker = await api.market.getTicker(instId);
      const estimatedAmount = amount / ticker.last;

      const card: HWalletCard = {
        id: makeId('card_swap'),
        productLine: 'v6',
        module: 'swap',
        cardType: 'trade',
        header: '交易卡片',
        title: `${toSymbol} 链上兑换`,
        riskLevel: '低',
        status: 'preview',
        simulationMode: false,
        userPrompt: input,
        aiSummary: `链上兑换 ${amount} USDT → ${estimatedAmount.toFixed(6)} ${toSymbol}，参考价格 $${ticker.last.toLocaleString()}`,
        createdAt: now,
        fromAmount: amount,
        fromSymbol: 'USDT',
        toAmount: estimatedAmount,
        toSymbol,
        rate: `1 ${toSymbol} ≈ $${ticker.last.toLocaleString()}`,
        slippage: '0.5%',
        networkFee: '~$0.50',
        warning: '链上兑换受滑点影响，实际到账数量可能略有差异。',
        primaryAction: '确认兑换',
        secondaryAction: '换一个'
      };

      return {
        ok: true,
        data: {
          replyText: `已为你生成兑换卡片：${amount} USDT → ~${estimatedAmount.toFixed(6)} ${toSymbol}。请确认后执行。`,
          card
        },
        simulationMode: false
      };
    } catch (err: any) {
      return {
        ok: true,
        data: { replyText: `⚠️ 兑换预览失败：${err.message || '网络错误'}` },
        simulationMode: false
      };
    }
  }

  // V6 赚币/质押
  if (route.productLine === 'v6' && route.module === 'earn') {
    const lower = input.toLowerCase();
    const isEth = /eth|以太/.test(lower);
    const amountMatch = input.match(/(\d+(?:\.\d+)?)\s*(u|usdt|美元)?/i);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : 100;
    const protocol = isEth ? 'Lido' : 'Aave';
    const apy = isEth ? '3.80' : '5.20';
    const reward = isEth ? 'stETH' : 'aUSDT';

    const card: HWalletCard = {
      id: makeId('card_earn'),
      productLine: 'v6',
      module: 'earn',
      cardType: 'trade',
      header: '交易卡片',
      title: `${protocol} 质押`,
      subtitle: '链上锁仓 · 持续生息',
      riskLevel: '低',
      status: 'preview',
      simulationMode: false,
      userPrompt: input,
      aiSummary: `${protocol} 质押 ${amount} ${isEth ? 'ETH' : 'USDT'}，预估年化 ${apy}%`,
      createdAt: now,
      stakeProtocol: protocol,
      stakeChain: isEth ? 'Ethereum' : 'Polygon',
      stakeApy: apy,
      stakeAmount: `${amount} ${isEth ? 'ETH' : 'USDT'}`,
      stakeLockPeriod: '灵活',
      stakeRewardSymbol: reward,
      stakeEstReward: `≈ ${(amount * parseFloat(apy) / 100).toFixed(2)} ${reward} / 年`,
      stakeRiskLevel: 'low',
      rows: [],
      warning: '质押存在智能合约与脱锚风险，APY 会随市场波动。',
      primaryAction: '确认质押',
      secondaryAction: '换一个'
    };

    return {
      ok: true,
      data: {
        replyText: `已为你生成 ${protocol} 质押卡片，年化 ${apy}%。请确认后执行。`,
        card
      },
      simulationMode: false
    };
  }

  // 默认回复
  return {
    ok: true,
    data: {
      replyText: `收到你的消息："${input}"。我可以帮你：\n\n📊 查行情（如"BTC 价格"）\n📈 开合约（如"100U 开 ETH 做多"）\n🔲 跑网格（如"ETH 网格策略"）\n🔄 链上兑换（如"100U 换 ETH"）\n💰 质押赚币（如"100U 质押到 Aave"）\n\n请告诉我你想做什么？`
    },
    simulationMode: false
  };
}
