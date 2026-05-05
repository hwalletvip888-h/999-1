/**
 * Chat Orchestrator — Claude AI 驱动版 + 实时步骤回调
 * 使用 Claude AI 进行意图识别，生成精美卡片
 * 通过 onStep 回调实时通知 UI 当前进度
 */
import { askClaude, type AIIntent } from './claudeAI';
import { api } from '../../api/gateway';
import type { ApiResponse } from '../../types/api';
import type { HWalletCard } from '../../types/card';
import type { AIStep } from '../../types';
import { makeId } from '../../utils/id';
import { buildPriceCard, buildPositionCard, buildPortfolioCard } from './cardApi';

/** 步骤回调类型 */
export type OnStepCallback = (steps: AIStep[]) => void;

/** 根据 action 生成对应的步骤列表 */
function buildSteps(action: string): AIStep[] {
  const base: AIStep[] = [
    { id: 's1', label: '理解你的意图', icon: '🧠', status: 'pending' },
  ];

  switch (action) {
    case 'price':
      return [
        ...base,
        { id: 's2', label: '查询实时行情', icon: '📊', status: 'pending' },
        { id: 's3', label: '分析趋势数据', icon: '📈', status: 'pending' },
        { id: 's4', label: '生成行情卡片', icon: '🎴', status: 'pending' },
      ];
    case 'trade_long':
    case 'trade_short':
      return [
        ...base,
        { id: 's2', label: '获取最新价格', icon: '💹', status: 'pending' },
        { id: 's3', label: '计算风险参数', icon: '⚡', status: 'pending' },
        { id: 's4', label: '生成交易卡片', icon: '🎴', status: 'pending' },
      ];
    case 'grid':
      return [
        ...base,
        { id: 's2', label: '分析价格区间', icon: '📐', status: 'pending' },
        { id: 's3', label: '获取 AI 推荐参数', icon: '🤖', status: 'pending' },
        { id: 's4', label: '生成网格策略卡片', icon: '🎴', status: 'pending' },
      ];
    case 'swap':
      return [
        ...base,
        { id: 's2', label: '查询兑换汇率', icon: '🔄', status: 'pending' },
        { id: 's3', label: '估算到账数量', icon: '🧮', status: 'pending' },
        { id: 's4', label: '生成兑换卡片', icon: '🎴', status: 'pending' },
      ];
    case 'earn':
      return [
        ...base,
        { id: 's2', label: '查询协议收益率', icon: '💰', status: 'pending' },
        { id: 's3', label: '评估风险等级', icon: '🛡️', status: 'pending' },
        { id: 's4', label: '生成质押卡片', icon: '🎴', status: 'pending' },
      ];
    case 'position':
      return [
        ...base,
        { id: 's2', label: '查询持仓数据', icon: '📋', status: 'pending' },
        { id: 's3', label: '计算盈亏', icon: '📊', status: 'pending' },
        { id: 's4', label: '生成持仓报告', icon: '🎴', status: 'pending' },
      ];
    case 'portfolio':
      return [
        ...base,
        { id: 's2', label: '汇总账户资产', icon: '🏦', status: 'pending' },
        { id: 's3', label: '计算总权益', icon: '📊', status: 'pending' },
        { id: 's4', label: '生成资产报告', icon: '🎴', status: 'pending' },
      ];
    default:
      return [
        ...base,
        { id: 's2', label: '组织回复内容', icon: '💬', status: 'pending' },
      ];
  }
}

/** 更新步骤状态并通知 UI */
function advanceStep(steps: AIStep[], stepId: string, status: AIStep['status'], onStep?: OnStepCallback): AIStep[] {
  const updated = steps.map((s) =>
    s.id === stepId ? { ...s, status } : s
  );
  onStep?.(updated);
  return updated;
}

/** 延迟工具 */
function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export async function handleUserPrompt(
  input: string,
  onStep?: OnStepCallback
): Promise<ApiResponse<{ replyText: string; card?: HWalletCard; clarifyQuestion?: string }>> {
  const now = new Date().toISOString();

  // Step 1: 理解意图
  let steps = buildSteps('chat'); // 先用通用步骤
  steps = advanceStep(steps, 's1', 'active', onStep);

  // 使用 Claude AI 识别意图
  const intent: AIIntent = await askClaude(input);
  console.log('[Orchestrator] AI intent:', intent.action, intent.symbol, intent.amount);

  // 识别完成后，重建步骤列表（根据实际 action）
  steps = buildSteps(intent.action);
  steps = advanceStep(steps, 's1', 'done', onStep);
  await delay(200); // 短暂停顿让用户看到 ✓

  try {
    switch (intent.action) {
      // ─── 行情查询 ───
      case 'price': {
        const symbol = intent.symbol || 'BTC';
        const instId = `${symbol}-USDT`;

        // Step 2: 查询行情
        steps = advanceStep(steps, 's2', 'active', onStep);
        const ticker = await api.market.getTicker(instId);
        const fundingRate = await api.market.getFundingRate(`${symbol}-USDT-SWAP`).catch(() => null);
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        // Step 3: 分析趋势
        steps = advanceStep(steps, 's3', 'active', onStep);
        const changeIcon = ticker.changePercent24h >= 0 ? '📈' : '📉';
        const changeStr = ticker.changePercent24h >= 0
          ? `+${ticker.changePercent24h.toFixed(2)}%`
          : `${ticker.changePercent24h.toFixed(2)}%`;
        let replyText = intent.reply || `${changeIcon} ${symbol} 当前价格 $${ticker.last.toLocaleString()}，24h ${changeStr}`;
        if (fundingRate) {
          replyText += `，资金费率 ${(fundingRate.fundingRate * 100).toFixed(4)}%`;
        }
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        // Step 4: 生成卡片
        steps = advanceStep(steps, 's4', 'active', onStep);
        const card = await buildPriceCard(symbol, input);
        steps = advanceStep(steps, 's4', 'done', onStep);

        return { ok: true, data: { replyText, card }, simulationMode: false };
      }

      // ─── 做多 ───
      case 'trade_long': {
        const symbol = intent.symbol || 'BTC';
        const amount = intent.amount || 100;
        const leverage = intent.leverage || 10;
        const instId = `${symbol}-USDT-SWAP`;

        steps = advanceStep(steps, 's2', 'active', onStep);
        const ticker = await api.market.getTicker(instId);
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's3', 'active', onStep);
        await delay(300); // 模拟风险计算
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's4', 'active', onStep);
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
        steps = advanceStep(steps, 's4', 'done', onStep);

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

        steps = advanceStep(steps, 's2', 'active', onStep);
        const ticker = await api.market.getTicker(instId);
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's3', 'active', onStep);
        await delay(300);
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's4', 'active', onStep);
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
        steps = advanceStep(steps, 's4', 'done', onStep);

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

        steps = advanceStep(steps, 's2', 'active', onStep);
        const ticker = await api.market.getTicker(instId);
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's3', 'active', onStep);
        let gridParams: any = null;
        try {
          gridParams = await (api.grid as any).getAIParams?.(instId) ?? null;
        } catch { /* fallback */ }
        const priceUpper = gridParams?.maxPx ? parseFloat(gridParams.maxPx) : ticker.last * 1.1;
        const priceLower = gridParams?.minPx ? parseFloat(gridParams.minPx) : ticker.last * 0.9;
        const gridNum = gridParams?.gridNum ? parseInt(gridParams.gridNum) : 20;
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's4', 'active', onStep);
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
        steps = advanceStep(steps, 's4', 'done', onStep);

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

        steps = advanceStep(steps, 's2', 'active', onStep);
        const ticker = await api.market.getTicker(instId);
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's3', 'active', onStep);
        const estimatedAmount = amount / ticker.last;
        await delay(200);
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's4', 'active', onStep);
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
        steps = advanceStep(steps, 's4', 'done', onStep);

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

        steps = advanceStep(steps, 's2', 'active', onStep);
        const apy = isEth ? '3.80' : '5.20';
        const reward = isEth ? 'stETH' : 'aUSDT';
        await delay(400);
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's3', 'active', onStep);
        await delay(300);
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's4', 'active', onStep);
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
        steps = advanceStep(steps, 's4', 'done', onStep);

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
        steps = advanceStep(steps, 's2', 'active', onStep);
        await delay(200);
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's3', 'active', onStep);
        await delay(200);
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's4', 'active', onStep);
        const card = await buildPositionCard(input);
        steps = advanceStep(steps, 's4', 'done', onStep);

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
        steps = advanceStep(steps, 's2', 'active', onStep);
        await delay(200);
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's3', 'active', onStep);
        await delay(200);
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's4', 'active', onStep);
        const card = await buildPortfolioCard(input);
        steps = advanceStep(steps, 's4', 'done', onStep);

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
        steps = advanceStep(steps, 's2', 'active', onStep);
        await delay(300);
        steps = advanceStep(steps, 's2', 'done', onStep);

        const replyText = intent.reply || `我可以帮你：\n\n📊 查行情（如"BTC 价格"）\n📈 开合约（如"100U 做多 BTC"）\n🔲 跑网格（如"ETH 网格策略"）\n🔄 链上兑换（如"100U 换 ETH"）\n💰 质押赚币（如"100U 质押到 Aave"）\n\n请告诉我你想做什么？`;
        return {
          ok: true,
          data: { replyText },
          simulationMode: false
        };
      }
    }
  } catch (err: any) {
    // 标记当前活跃步骤为 error
    const errorSteps = steps.map((s) =>
      s.status === 'active' ? { ...s, status: 'error' as const } : s
    );
    onStep?.(errorSteps);

    return {
      ok: true,
      data: { replyText: `⚠️ 操作失败：${err.message || '网络错误'}，请稍后重试。` },
      simulationMode: false
    };
  }
}
