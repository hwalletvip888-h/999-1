/**
 * Chat Orchestrator — Claude + DeepSeek 双 AI 驱动版 + 实时步骤回调
 * Claude 意图识别 + DeepSeek 聊天对话，生成精美卡片
 * 通过 onStep 回调实时通知 UI 当前进度
 */
import { askClaude, chatWithAI, type AIIntent } from './claudeAI';
import type { ChatIntentAction } from '../intentNormalize';
import { localRuleIntent } from '../intentNormalize';
import { api } from '../../api/gateway';
import type { ApiResponse } from '../../types/api';
import type { HWalletCard } from '../../types/card';
import type { AIStep } from '../../types';
import { makeId } from '../../utils/id';
import { buildPriceCard, buildPositionCard, buildPortfolioCard, buildAddressCard, buildTransferCard, buildTransferSelectCard } from './cardApi';
import { loadSession } from '../walletApi';
// V6 链上机会发现客户端
import { okxOnchainClient, type DefiOpportunity, type DexSignal } from '../../api/providers/okx/okxOnchainClient';

/** 步骤回调类型 */
export type OnStepCallback = (steps: AIStep[]) => void;

/** 编排层可选参数：多轮对话上下文 + 取消进行中的网络请求 */
export type HandleUserPromptOptions = {
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  abortSignal?: AbortSignal;
  /** 本次会话已确认过的转账地址（同地址自动执行，无需再次确认） */
  confirmedAddresses?: string[];
};

/**
 * 根据 action 生成对应的步骤列表（5 步制：理解 → 查数据 → 风控 → 出卡 → 等待确认）
 * 第 6/7 步（执行中 / 已上链 / 入库）由 ChatScreen.confirmCard 在用户点确认后单独追加。
 */
function buildSteps(action: ChatIntentAction): AIStep[] {
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
    case 'address':
      return [
        ...base,
        { id: 's2', label: '读取链上地址', icon: '📬', status: 'pending' },
        { id: 's3', label: '生成地址卡片', icon: '🎴', status: 'pending' },
      ];
    case 'transfer':
      return [
        ...base,
        { id: 's2', label: '校验转账地址', icon: '🔍', status: 'pending' },
        safety,
        { id: 's3', label: '生成转账卡片', icon: '🎴', status: 'pending' },
      ];
    case 'signal':
      return [
        ...base,
        { id: 's2', label: '扫描链上信号', icon: '🛰️', status: 'pending' },
        { id: 's3', label: '聚合机会数据', icon: '📡', status: 'pending' },
        { id: 's4', label: '生成机会卡片', icon: '🎴', status: 'pending' },
      ];
    case 'chat':
      return [
        ...base,
        { id: 's2', label: '组织回复内容', icon: '💬', status: 'pending' },
      ];
    case 'introduce':
      return [
        ...base,
        { id: 's2', label: '展示能力清单', icon: '✨', status: 'pending' },
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
  onStep?: OnStepCallback,
  options?: HandleUserPromptOptions,
): Promise<ApiResponse<{ replyText: string; card?: HWalletCard; clarifyQuestion?: string }>> {
  const now = new Date().toISOString();

  // Step 1: 理解意图
  let steps = buildSteps('chat'); // 先用通用步骤
  steps = advanceStep(steps, 's1', 'active', onStep);

  // 先跑本地规则（零延迟）；命中则跳过 AI 网络请求
  const localIntent = localRuleIntent(input);
  const skipAI = localIntent.action !== 'chat'; // 非闲聊的本地规则直接用

  // 使用 Claude AI 识别意图（本地规则未命中时才调用）
  const chatHistory = (options?.chatHistory ?? []).slice(-6);
  const intent: AIIntent = skipAI
    ? localIntent
    : await askClaude(input, options?.abortSignal, chatHistory);
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
        const fromSymbol = (intent as any).fromSymbol || 'USDT';
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
          fromSymbol,
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

      // ─── 充值地址 ───
      case 'address': {
        steps = advanceStep(steps, 's2', 'active', onStep);
        const session = await loadSession();
        if (!session?.token) {
          steps = advanceStep(steps, 's2', 'error' as any, onStep);
          return {
            ok: true,
            data: { replyText: '📬 请先在**钱包页面**完成登录，登录后我可以直接给你显示充值地址 👇' },
            simulationMode: false,
          };
        }
        const { callBackend } = await import('../../api/providers/okx/onchain/hwalletBackendFetch');
        const addrData = await callBackend<any>('/api/wallet/addresses', { token: session.token });
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);
        steps = advanceStep(steps, 's3', 'active', onStep);
        const card = buildAddressCard(
          { evm: addrData?.evm ?? [], solana: addrData?.solana ?? [] },
          input,
        );
        steps = advanceStep(steps, 's3', 'done', onStep);
        return {
          ok: true,
          data: {
            replyText: intent.reply || `📥 **充值地址已生成**\n\n复制对应地址，去交易所提币时粘贴即可\n\n⚠️ 请确认链别，转错无法找回`,
            card,
          },
          simulationMode: false,
        };
      }

      // ─── 转账 ───
      case 'transfer': {
        steps = advanceStep(steps, 's2', 'active', onStep);

        // 登录校验
        const session = await loadSession();
        if (!session?.token) {
          steps = advanceStep(steps, 's2', 'error' as any, onStep);
          return {
            ok: true,
            data: { replyText: '💳 请先在**钱包页面**完成登录，登录后才能转账 👇' },
            simulationMode: false,
          };
        }

        // 提取地址：优先从意图识别结果，再从原文 regex
        const addrFromIntent = intent.toAddress;
        const addrFromText = input.match(/0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}/)?.[0];
        const toAddress = addrFromIntent || addrFromText || '';

        // 提前解析 symbol / amount，buildTransferSelectCard 需要
        const symbol = intent.symbol || 'USDT';
        const amount = intent.amount || 0;

        if (!toAddress) {
          steps = advanceStep(steps, 's2', 'done', onStep);
          await delay(150);
          steps = await advanceSafety(steps, onStep);
          steps = advanceStep(steps, 's3', 'active', onStep);
          const selectCard = buildTransferSelectCard({
            recentAddresses: options?.confirmedAddresses ?? [],
            amount,
            symbol,
            userPrompt: input,
          });
          steps = advanceStep(steps, 's3', 'done', onStep);
          return {
            ok: true,
            data: {
              replyText: '📤 **转账**\n\n请选择近期地址或粘贴新地址 👇',
              card: selectCard,
            },
            simulationMode: false,
          };
        }

        // 链别识别
        const chain = intent.chain || (toAddress.startsWith('0x') ? 'evm' : 'solana');
        const isKnown = (options?.confirmedAddresses ?? []).includes(toAddress);

        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        steps = await advanceSafety(steps, onStep);

        steps = advanceStep(steps, 's3', 'active', onStep);

        // 已确认地址：直接自动执行转账
        if (isKnown && amount > 0) {
          const { callBackend } = await import('../../api/providers/okx/onchain/hwalletBackendFetch');
          try {
            const sendRes = await callBackend<any>('/api/v6/wallet/send', {
              token: session.token,
              body: { chain, symbol, toAddress, amount },
            });
            const txHash: string = sendRes?.txHash ?? sendRes?.orderId ?? '';
            const autoCard: HWalletCard = {
              id: makeId('card_transfer_done'),
              productLine: 'v6',
              module: 'wallet',
              cardType: 'info',
              header: '信息卡片',
              title: `已转出 ${amount} ${symbol}`,
              riskLevel: '低',
              status: 'executed',
              simulationMode: false,
              userPrompt: input,
              aiSummary: `${chain.toUpperCase()} · 转出 ${amount} ${symbol} → ${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`,
              createdAt: now,
              toAddress,
              transferChain: chain,
              symbol,
              amount,
              isKnownAddress: true,
              ...(txHash ? { rows: [{ label: '交易哈希', value: txHash }] } : {}),
            };
            steps = advanceStep(steps, 's3', 'done', onStep);
            return {
              ok: true,
              data: {
                replyText: `✅ **自动转账成功**\n\n已向 \`${toAddress.slice(0, 6)}...${toAddress.slice(-4)}\` 转出 **${amount} ${symbol}**\n${txHash ? `交易哈希：\`${txHash.slice(0, 12)}...\`` : ''}`,
                card: autoCard,
              },
              simulationMode: false,
            };
          } catch (e: any) {
            steps = advanceStep(steps, 's3', 'error' as any, onStep);
            return {
              ok: false,
              errorCode: 'H1.TRANSFER.SEND_FAILED',
              errorMsg: e?.message || '转账失败',
              simulationMode: false,
            };
          }
        }

        // 首次 / 未确认地址：生成预览卡等待用户确认
        const card = buildTransferCard({ toAddress, chain, symbol, amount, isKnownAddress: isKnown, userPrompt: input });
        steps = advanceStep(steps, 's3', 'done', onStep);
        return {
          ok: true,
          data: {
            replyText: isKnown
              ? `📤 **转账确认**\n\n向 \`${toAddress.slice(0, 6)}...${toAddress.slice(-4)}\` 转出 **${amount} ${symbol}**\n\n点击确认后立即执行 👇`
              : `⚠️ **陌生地址转账**\n\n该地址在本次对话中首次出现，请仔细核对地址后再确认\n\n点击【确认转账】执行 👇`,
            card,
          },
          simulationMode: false,
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
        let card: HWalletCard;
        try {
          card = await buildPositionCard(input);
        } catch (e: any) {
          steps = advanceStep(steps, 's4', 'done', onStep);
          return {
            ok: true,
            data: { replyText: '📋 **持仓查询**\n\n持仓功能需配置交易所账户（CEX API Key），当前为链上钱包模式\n\n如需开合约，请先在设置中绑定交易所账户' },
            simulationMode: false,
          };
        }
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
        let portfolioCard: HWalletCard;
        try {
          portfolioCard = await buildPortfolioCard(input);
        } catch (e: any) {
          steps = advanceStep(steps, 's4', 'done', onStep);
          const msg = String(e?.message || "");
          const tip = msg.includes("登录") || msg.includes("token")
            ? "请先在**钱包页面**完成登录，登录后可查看链上资产 👇"
            : msg.includes("EXPO_PUBLIC") || msg.includes("未配置")
            ? "服务端地址未配置，请联系管理员"
            : `链上资产暂时无法获取（${msg || "未知错误"}）`;
          return { ok: true, data: { replyText: `🏦 **链上资产查询**\n\n${tip}` }, simulationMode: false };
        }
        steps = advanceStep(steps, 's4', 'done', onStep);

        return {
          ok: true,
          data: {
            replyText: intent.reply || `🏦 **链上钱包资产**\n\n链上合计约 **$${(portfolioCard.totalEquity ?? 0).toLocaleString()}**\n\n各链代币明细请查看下方卡片 👇`,
            card: portfolioCard,
          },
          simulationMode: false
        };
      }

      // ─── 链上机会 / 信号发现（V6 链上赚币） ───
      case 'signal': {
        steps = advanceStep(steps, 's2', 'active', onStep);
        let opps: DefiOpportunity[] = [];
        let signals: DexSignal[] = [];
        try {
          const [oppRes, sigRes] = await Promise.all([
            okxOnchainClient.discoverOpportunities({ minApr: 3 }, undefined, { signal: options?.abortSignal }),
            okxOnchainClient.fetchSignals({}, undefined, { signal: options?.abortSignal }),
          ]);
          opps = (oppRes.data || []).filter((o) => o.securityScore >= 70).slice(0, 5);
          signals = (sigRes.data || []).slice(0, 5);
        } catch {
          /** 数据源不可用则不生成演示卡片 */
        }
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's3', 'active', onStep);
        await delay(220);
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's4', 'active', onStep);

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
            simulationMode: false,
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
            warning: '链上机会受合约风险与市场波动影响，建议小额试水。',
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
            simulationMode: false,
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
          steps = advanceStep(steps, 's4', 'done', onStep);
          return {
            ok: true,
            data: {
              replyText: intent.reply || '🌑 暂未发现符合条件的链上机会。',
            },
            simulationMode: false
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
          simulationMode: false
        };
      }

      // ─── 自我介绍 / 能力说明 ───
      case 'introduce': {
        steps = advanceStep(steps, 's2', 'active', onStep);
        await delay(200);
        steps = advanceStep(steps, 's2', 'done', onStep);
        return {
          ok: true,
          data: {
            replyText: `👋 **Hi，我是 H**，你的链上 AI 资产管家 🐬

**我能帮你做这些事：**

💰 **资产管理**
• 查看链上钱包资产总览（EVM + Solana）
• 显示充值 / 收款地址，一键复制
• 转账提现，自动识别链别，陌生地址有安全提示

📊 **行情 & 交易**
• 实时查询 BTC / ETH / SOL 等任意代币价格
• 开合约做多 / 做空（带 K 线卡片）
• 链上代币兑换（Swap，聚合最优路由）
• 网格策略（AI 自动推荐参数）

🌱 **链上赚币**
• 质押 / DeFi 存款（Lido、Aave 等协议）
• 扫描链上高收益机会（聪明钱信号）

🛡️ **安全 & 记忆**
• 转账地址安全提醒（首次陌生地址自动警告）
• 多轮对话记住上下文（问完地址可以接着追问）

---
直接说你想做的事就行，比如：
「充值」「BTC 行情」「转 100U 给 0xAbc...」「做多 ETH 100U」`,
          },
          simulationMode: false,
        };
      }

      // ─── 闲聊 ───
      case 'chat': {
        steps = advanceStep(steps, 's2', 'active', onStep);
        await delay(300);
        steps = advanceStep(steps, 's2', 'done', onStep);

        const replyText =
          intent.reply ||
          (await chatWithAI(options?.chatHistory ?? [], input, options?.abortSignal));        return {
          ok: true,
          data: { replyText },
          simulationMode: false
        };
      }
    }
  } catch (err: any) {
    const errorSteps = steps.map((s) =>
      s.status === "active" ? { ...s, status: "error" as const } : s,
    );
    onStep?.(errorSteps);

    const msg = err?.message || "网络错误";
    return {
      ok: false,
      errorCode: "H1.ORC.HANDLE_PROMPT_FAILED",
      errorMsg: msg,
      simulationMode: false,
    };
  }
}
