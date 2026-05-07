/**
 * Chat Orchestrator — Claude + DeepSeek 双 AI 驱动版 + 实时步骤回调
 * Claude 意图识别 + DeepSeek 聊天对话，生成精美卡片
 * 通过 onStep 回调实时通知 UI 当前进度
 */
import { askClaude, chatWithAI, type AIIntent } from './claudeAI';
import { api } from '../../api/gateway';
import type { ApiResponse } from '../../types/api';
import type { HWalletCard } from '../../types/card';
import type { AIStep } from '../../types';
import { makeId } from '../../utils/id';
import { buildPriceCard, buildPositionCard, buildPortfolioCard } from './cardApi';
// V6 链上机会发现客户端
import { okxOnchainClient, type DefiOpportunity, type DexSignal } from '../../api/providers/okx/okxOnchainClient';

/** 步骤回调类型 */
export type OnStepCallback = (steps: AIStep[]) => void;

/**
 * 根据 action 生成对应的步骤列表（5 步制：理解 → 查数据 → 风控 → 出卡 → 等待确认）
 * 第 6/7 步（执行中 / 已上链 / 入库）由 ChatScreen.confirmCard 在用户点确认后单独追加。
 */
function buildSteps(action: string): AIStep[] {
  const base: AIStep[] = [
    { id: 's1', label: '理解你的意图', icon: '🧠', status: 'pending' },
  ];
  // 风控预检：体现 AI 在为用户负责（PRD 五道安全锁的视觉钩子）
  const safety: AIStep = { id: 's_safety', label: '风控预检（五道安全锁）', icon: '🛡️', status: 'pending' };

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
        safety,
        { id: 's4', label: '生成交易卡片', icon: '🎴', status: 'pending' },
      ];
    case 'grid':
      return [
        ...base,
        { id: 's2', label: '分析价格区间', icon: '📐', status: 'pending' },
        { id: 's3', label: '获取 AI 推荐参数', icon: '🤖', status: 'pending' },
        safety,
        { id: 's4', label: '生成网格策略卡片', icon: '🎴', status: 'pending' },
      ];
    case 'swap':
      return [
        ...base,
        { id: 's2', label: '查询兑换汇率', icon: '🔄', status: 'pending' },
        { id: 's3', label: '估算到账数量', icon: '🧮', status: 'pending' },
        safety,
        { id: 's4', label: '生成兑换卡片', icon: '🎴', status: 'pending' },
      ];
    case 'earn':
      return [
        ...base,
        { id: 's2', label: '查询协议收益率', icon: '💰', status: 'pending' },
        { id: 's3', label: '评估风险等级', icon: '🛡️', status: 'pending' },
        safety,
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
    case 'signal':
      return [
        ...base,
        { id: 's2', label: '扫描链上聪明钱', icon: '🐋', status: 'pending' },
        { id: 's3', label: '过滤新币 / Meme 安全', icon: '🛡️', status: 'pending' },
        { id: 's4', label: '生成机会卡片', icon: '🎴', status: 'pending' },
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

/** 推进风控预检步骤（仅当步骤列表里包含 s_safety 时生效） */
async function advanceSafety(steps: AIStep[], onStep?: OnStepCallback): Promise<AIStep[]> {
  const hasSafety = steps.some((s) => s.id === 's_safety');
  if (!hasSafety) return steps;
  let next = advanceStep(steps, 's_safety', 'active', onStep);
  await delay(280);
  next = advanceStep(next, 's_safety', 'done', onStep);
  await delay(140);
  return next;
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
        const fundingStr = fundingRate
          ? `\n资金费率 **${(fundingRate.fundingRate * 100).toFixed(4)}%**`
          : '';
        let replyText = intent.reply || `${changeIcon} **${symbol}/USDT** 实时行情\n\n当前价格 **$${ticker.last.toLocaleString()}**\n24h 变动 ${changeStr}${fundingStr}\n\n已为你生成详细行情卡片 👇`;
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

        steps = await advanceSafety(steps, onStep);

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
            replyText: intent.reply || `📈 为你生成 **${symbol} 做多** 交易卡片\n\n入场价格 **$${ticker.last.toLocaleString()}**\n杠杆 ${leverage}x · 保证金 ${amount} USDT\n风险等级：${leverage >= 10 ? '⚠️ 高' : leverage > 5 ? '中' : '低'}\n\n请确认卡片参数后执行 👇`,
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

        steps = await advanceSafety(steps, onStep);

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
            replyText: intent.reply || `📉 为你生成 **${symbol} 做空** 交易卡片\n\n入场价格 **$${ticker.last.toLocaleString()}**\n杠杆 ${leverage}x · 保证金 ${amount} USDT\n风险等级：${leverage >= 10 ? '⚠️ 高' : leverage > 5 ? '中' : '低'}\n\n请确认卡片参数后执行 👇`,
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

        steps = await advanceSafety(steps, onStep);

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
            replyText: intent.reply || `🔲 为你生成 **${symbol}/USDT 网格策略**\n\n价格区间 **$${priceLower.toFixed(0)} ~ $${priceUpper.toFixed(0)}**\n网格数 ${gridNum} · 投入 ${amount} USDT\n\n请确认参数后启动 👇`,
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

        steps = await advanceSafety(steps, onStep);

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
            replyText: intent.reply || `🔄 为你生成 **链上兑换** 卡片\n\n${amount} USDT → **~${estimatedAmount.toFixed(6)} ${toSymbol}**\n参考汇率 1 ${toSymbol} ≈ $${ticker.last.toLocaleString()}\n滑点 0.5% · 预估 Gas ~$0.50\n\n确认后将发起链上交易 👇`,
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

        steps = await advanceSafety(steps, onStep);

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
            replyText: intent.reply || `💰 为你生成 **${protocol} 质押** 卡片\n\n质押 ${amount} ${symbol} · 预估年化 **${apy}%**\n收益代币 ${reward} · 锁仓期 灵活\n\n确认后将发起链上质押 👇`,
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

        steps = await advanceSafety(steps, onStep);

        steps = advanceStep(steps, 's4', 'active', onStep);
        const card = await buildPositionCard(input);
        steps = advanceStep(steps, 's4', 'done', onStep);

        return {
          ok: true,
          data: {
            replyText: card.positions && card.positions.length > 0
              ? intent.reply || `📋 **持仓报告**\n\n当前共有 **${card.positions.length}** 个活跃持仓\n\n详情请查看下方卡片 👇`
              : intent.reply || `📋 **持仓报告**\n\n当前暂无活跃持仓\n\n可以试试说 "100U 做多 BTC" 来开仓`,
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

        steps = await advanceSafety(steps, onStep);

        steps = advanceStep(steps, 's4', 'active', onStep);
        const card = await buildPortfolioCard(input);
        steps = advanceStep(steps, 's4', 'done', onStep);

        return {
          ok: true,
          data: {
            replyText: intent.reply || `🏦 **资产总览**\n\n账户总权益 **$${(card.totalEquity ?? 0).toLocaleString()}**\n\n详细资产分布请查看下方卡片 👇`,
            card
          },
          simulationMode: false
        };
      }

      // ─── 链上机会 / 信号发现（V6 链上赚币） ───
      case 'signal': {
        // s2 扫描链上聪明钱
        steps = advanceStep(steps, 's2', 'active', onStep);
        const [oppRes, sigRes] = await Promise.all([
          okxOnchainClient.discoverOpportunities({ minApr: 3 }),
          okxOnchainClient.fetchSignals({})
        ]);
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        // s3 过滤 + 安全分级
        steps = advanceStep(steps, 's3', 'active', onStep);
        const opps: DefiOpportunity[] = (oppRes.data || []).filter((o) => o.securityScore >= 70).slice(0, 5);
        const signals: DexSignal[] = (sigRes.data || []).slice(0, 5);
        const isMock = oppRes.simulationMode || sigRes.simulationMode;
        await delay(220);
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        // s4 出卡（取最优一条 → 主信号卡；其余写到 rows 里给用户横向参考）
        steps = advanceStep(steps, 's4', 'active', onStep);

        // 决策优先级：先看高安全 + 高 APR 的 DeFi 机会，没有再退到 dex 信号
        let card: HWalletCard;
        if (opps.length > 0) {
          const best = [...opps].sort((a, b) => parseFloat(b.apr) - parseFloat(a.apr))[0];
          card = {
            id: makeId('card_signal'),
            productLine: 'v6',
            module: 'earn',
            cardType: 'signal',
            header: '机会卡片',
            title: `${best.protocol} · ${best.asset} 链上机会`,
            subtitle: `${best.chain.toUpperCase()} · 来源 ${best.source === 'smart_money' ? '聪明钱' : best.source === 'trenches' ? '战壕' : '趋势引擎'}`,
            riskLevel: best.riskTag === 'low' ? '低' : best.riskTag === 'medium' ? '中' : '高',
            status: 'preview',
            simulationMode: isMock,
            userPrompt: input,
            aiSummary: best.description,
            createdAt: now,
            signalSource: best.source === 'trend' ? 'trend_engine' : best.source,
            protocolApr: best.apr,
            protocolTvl: best.tvlUsd,
            securityScore: best.securityScore,
            expectedReturn: `年化 ${best.apr}%`,
            rows: opps.slice(0, 4).map((o) => ({
              label: o.protocol,
              value: `${o.apr}% · ${o.chain}`
            })),
            warning: isMock ? '当前为演示数据，正式数据需服务器装好 onchainos CLI。' : '链上机会受合约风险与市场波动影响，建议小额试水。',
            primaryAction: '一键进入',
            secondaryAction: '换一个'
          };
        } else if (signals.length > 0) {
          const top = signals[0];
          card = {
            id: makeId('card_signal'),
            productLine: 'v6',
            module: 'wallet',
            cardType: 'signal',
            header: '机会卡片',
            title: `${top.symbol} · ${top.chain.toUpperCase()} 链上信号`,
            subtitle: `${top.signalType === 'smart_money_buy' ? '聪明钱买入' : top.signalType === 'kol_call' ? 'KOL 喊单' : '战壕新币'}`,
            riskLevel: '中',
            status: 'preview',
            simulationMode: isMock,
            userPrompt: input,
            aiSummary: top.description,
            createdAt: now,
            signalSource: top.signalType === 'smart_money_buy' ? 'smart_money'
              : top.signalType === 'kol_call' ? 'kol'
              : 'trenches',
            rows: [
              { label: '价格', value: `$${top.priceUsd}` },
              { label: '24h', value: top.changePct24h },
              { label: '市值', value: top.marketCapUsd },
              { label: '来源', value: top.source }
            ],
            warning: '新币 / Meme 风险极大，请确认合约安全后再小额买入。',
            primaryAction: '查看详情',
            secondaryAction: '换一个'
          };
        } else {
          // 完全没机会：返回提示（不出卡）
          steps = advanceStep(steps, 's4', 'done', onStep);
          return {
            ok: true,
            data: {
              replyText: intent.reply || '🌑 暂未发现符合条件的链上机会，可能需要等链上信号引擎暖启动。',
            },
            simulationMode: isMock
          };
        }

        steps = advanceStep(steps, 's4', 'done', onStep);

        return {
          ok: true,
          data: {
            replyText: intent.reply || (
              opps.length > 0
                ? `🛰️ 已为你扫描 **${opps.length}** 个链上赚币机会\n\n最佳：**${opps[0].protocol}** 年化 **${opps[0].apr}%** · 安全分 ${opps[0].securityScore}/100\n\n点开卡片查看详情 👇`
                : `📡 链上信号已就绪：${signals[0]?.symbol}\n\n点击卡片查看详情 👇`
            ),
            card
          },
          simulationMode: isMock
        };
      }

      // ─── 闲聊 ───
      case 'chat':
      default: {
        steps = advanceStep(steps, 's2', 'active', onStep);
        await delay(300);
        steps = advanceStep(steps, 's2', 'done', onStep);

        const replyText = intent.reply || await chatWithAI([], input);
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
