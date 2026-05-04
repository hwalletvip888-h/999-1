/**
 * Chat Orchestrator — Claude AI 驱动版
 * 使用 Claude AI 进行意图识别，生成精美卡片
 */
import { askClaude, type AIIntent } from './claudeAI';
import { api } from '../../api/gateway';
import type { ApiResponse } from '../../types/api';
import type { HWalletCard } from '../../types/card';
import { makeId } from '../../utils/id';
import { buildPriceCard, buildPositionCard, buildPortfolioCard } from './cardApi';

export async function handleUserPrompt(input: string): Promise<ApiResponse<{ replyText: string; card?: HWalletCard; clarifyQuestion?: string }>> {
  const now = new Date().toISOString();

  // 使用 Claude AI 识别意图
  const intent: AIIntent = await askClaude(input);
  console.log('[Orchestrator] AI intent:', intent.action, intent.symbol, intent.amount);

  try {
    switch (intent.action) {
      // ─── 行情查询 ───
      case 'price': {
        const symbol = intent.symbol || 'BTC';
        const instId = `${symbol}-USDT`;
        const ticker = await api.market.getTicker(instId);
        const fundingRate = await api.market.getFundingRate(`${symbol}-USDT-SWAP`).catch(() => null);

        const changeIcon = ticker.changePercent24h >= 0 ? '📈' : '📉';
        const changeStr = ticker.changePercent24h >= 0
          ? `+${ticker.changePercent24h.toFixed(2)}%`
          : `${ticker.changePercent24h.toFixed(2)}%`;

        let replyText = intent.reply || `${changeIcon} ${symbol} 当前价格 $${ticker.last.toLocaleString()}，24h ${changeStr}`;
        if (fundingRate) {
          replyText += `，资金费率 ${(fundingRate.fundingRate * 100).toFixed(4)}%`;
        }

        const card = await buildPriceCard(symbol, input);
        return { ok: true, data: { replyText, card }, simulationMode: false };
      }

      // ─── 做多 ───
      case 'trade_long': {
        const symbol = intent.symbol || 'BTC';
        const amount = intent.amount || 100;
        const leverage = intent.leverage || 10;
        const instId = `${symbol}-USDT-SWAP`;
        const ticker = await api.market.getTicker(instId);

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
          aiSummary: intent.reply || `${symbol}/USDT 做多，${amount} USDT，${leverage}x 杠杆`,
          createdAt: now,
          pair: `${symbol}/USDT`,
          amount,
          currency: 'USDT',
          direction: '做多',
          leverage,
          entryPrice: ticker.last,
          lastPrice: ticker.last,
          primaryAction: '确认做多',
          secondaryAction: '调整参数',
          warning: leverage >= 10 ? '高杠杆交易风险极大，请谨慎操作。' : '合约交易存在爆仓风险，请控制仓位。',
        };

        return {
          ok: true,
          data: {
            replyText: intent.reply || `已为你生成 ${symbol} 做多卡片，${leverage}x 杠杆，当前价格 $${ticker.last.toLocaleString()}`,
            card
          },
          simulationMode: false
        };
      }

      // ─── 做空 ───
      case 'trade_short': {
        const symbol = intent.symbol || 'BTC';
        const amount = intent.amount || 100;
        const leverage = intent.leverage || 10;
        const instId = `${symbol}-USDT-SWAP`;
        const ticker = await api.market.getTicker(instId);

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
          aiSummary: intent.reply || `${symbol}/USDT 做空，${amount} USDT，${leverage}x 杠杆`,
          createdAt: now,
          pair: `${symbol}/USDT`,
          amount,
          currency: 'USDT',
          direction: '做空',
          leverage,
          entryPrice: ticker.last,
          lastPrice: ticker.last,
          primaryAction: '确认做空',
          secondaryAction: '调整参数',
          warning: leverage >= 10 ? '高杠杆交易风险极大，请谨慎操作。' : '合约交易存在爆仓风险，请控制仓位。',
        };

        return {
          ok: true,
          data: {
            replyText: intent.reply || `已为你生成 ${symbol} 做空卡片，${leverage}x 杠杆，当前价格 $${ticker.last.toLocaleString()}`,
            card
          },
          simulationMode: false
        };
      }

      // ─── 网格策略 ───
      case 'grid': {
        const symbol = intent.symbol || 'BTC';
        const amount = intent.amount || 100;
        const instId = `${symbol}-USDT-SWAP`;
        const ticker = await api.market.getTicker(instId);

        let gridParams: any = null;
        try {
          gridParams = await (api.grid as any).getAIParams?.(instId) ?? null;
        } catch { /* fallback */ }

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
          aiSummary: intent.reply || `${symbol}/USDT 网格策略，${amount} USDT，区间 $${priceLower.toFixed(0)}~$${priceUpper.toFixed(0)}`,
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
            replyText: intent.reply || `已为你生成 ${symbol} 网格策略，区间 $${priceLower.toFixed(0)}~$${priceUpper.toFixed(0)}`,
            card
          },
          simulationMode: false
        };
      }

      // ─── 兑换 ───
      case 'swap': {
        const toSymbol = intent.symbol || 'ETH';
        const amount = intent.amount || 100;
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
          aiSummary: intent.reply || `兑换 ${amount} USDT → ${estimatedAmount.toFixed(6)} ${toSymbol}`,
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
            replyText: intent.reply || `已为你生成兑换卡片：${amount} USDT → ~${estimatedAmount.toFixed(6)} ${toSymbol}`,
            card
          },
          simulationMode: false
        };
      }

      // ─── 赚币/质押 ───
      case 'earn': {
        const symbol = intent.symbol || 'USDT';
        const amount = intent.amount || 100;
        const isEth = symbol === 'ETH';
        const protocol = intent.protocol || (isEth ? 'Lido' : 'Aave');
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
          aiSummary: intent.reply || `${protocol} 质押 ${amount} ${symbol}，预估年化 ${apy}%`,
          createdAt: now,
          stakeProtocol: protocol,
          stakeChain: isEth ? 'Ethereum' : 'Polygon',
          stakeApy: apy,
          stakeAmount: `${amount} ${symbol}`,
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
            replyText: intent.reply || `已为你生成 ${protocol} 质押卡片，年化 ${apy}%`,
            card
          },
          simulationMode: false
        };
      }

      // ─── 持仓查询 ───
      case 'position': {
        const card = await buildPositionCard(input);
        return {
          ok: true,
          data: {
            replyText: card.positions && card.positions.length > 0
              ? intent.reply || `你当前共有 ${card.positions.length} 个持仓`
              : intent.reply || '你当前没有持仓。可以说"100U 做多 BTC"来开仓。',
            card
          },
          simulationMode: false
        };
      }

      // ─── 资产查询 ───
      case 'portfolio': {
        const card = await buildPortfolioCard(input);
        return {
          ok: true,
          data: {
            replyText: intent.reply || `你的总资产为 $${(card.totalEquity ?? 0).toLocaleString()}`,
            card
          },
          simulationMode: false
        };
      }

      // ─── 闲聊 ───
      case 'chat':
      default: {
        const replyText = intent.reply || `我可以帮你：\n\n📊 查行情（如"BTC 价格"）\n📈 开合约（如"100U 做多 BTC"）\n🔲 跑网格（如"ETH 网格策略"）\n🔄 链上兑换（如"100U 换 ETH"）\n💰 质押赚币（如"100U 质押到 Aave"）\n\n请告诉我你想做什么？`;
        return {
          ok: true,
          data: { replyText },
          simulationMode: false
        };
      }
    }
  } catch (err: any) {
    return {
      ok: true,
      data: { replyText: `⚠️ 操作失败：${err.message || '网络错误'}，请稍后重试。` },
      simulationMode: false
    };
  }
}
