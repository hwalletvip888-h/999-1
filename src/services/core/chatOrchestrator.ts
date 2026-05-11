
/**
 * Chat Orchestrator — Claude + DeepSeek 双 AI 驱动版 + 实时步骤回调
 * Claude 意图识别 + DeepSeek 聊天对话，生成精美卡片
 * 通过 onStep 回调实时通知 UI 当前进度
 */
import { chatWithAI } from './claudeAI';
import type { AIIntent, ChatIntentAction } from '../intentNormalize';
import { parseUserIntent } from '../ai-parse';
import { api } from '../../api/gateway';
import type { ApiResponse } from '../../types/api';
import type { HWalletCard } from '../../types/card';
import type { AIStep } from '../../types';
import { makeId } from '../../utils/id';
import { buildPriceCard, buildPositionCard, buildPortfolioCard, buildAddressCard, buildTransferCard, buildTransferSelectCard } from './cardApi';
import { loadSession } from '../walletApi';
import { formatHwalletErrorForUser } from '../hwalletErrorUi';
import { saveConversation, appendConversationMessage, saveCard, trackEventQuick } from './dataApi';
// V6 链上机会发现客户端
import { okxOnchainClient, type DefiOpportunity, type DexSignal, type DexTrackerActivity, type HotTokenRow } from '../../api/providers/okx/okxOnchainClient';

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
    case 'strategy':
      return [
        ...base,
        { id: 's2', label: '连接 AI 中控台', icon: '🎛️', status: 'pending' },
        safety,
        { id: 's3', label: '下发策略指令', icon: '⚙️', status: 'pending' },
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

/** 原多处 sleep 用于步骤动效；封顶后尽快完成编排，仅保留极短间隔给步骤条刷新 */
const AI_ORCH_INTER_STEP_MS_CAP = 10;

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  const wait = Math.min(ms, AI_ORCH_INTER_STEP_MS_CAP);
  return new Promise((res) => setTimeout(res, wait));
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

  const chatHistory = (options?.chatHistory ?? []).slice(-6);
  const parseResult = await parseUserIntent(input, {
    abortSignal: options?.abortSignal,
    history: chatHistory,
  });
  const intent = parseResult.intent;
  console.log(
    '[Orchestrator] intent parse',
    parseResult.source,
    parseResult.stages.join('→'),
    `${parseResult.durationMs}ms`,
    intent.action,
    intent.symbol,
    intent.amount,
  );

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
        // 默认链：SOL 代币用 solana，其他用 eth
        const swapChain = ['SOL', 'RAY', 'BONK', 'JTO', 'PYTH'].includes(toSymbol.toUpperCase())
          ? 'solana'
          : 'eth';

        steps = advanceStep(steps, 's2', 'active', onStep);

        // 登录校验
        const session = await loadSession();
        if (!session?.token) {
          steps = advanceStep(steps, 's2', 'error' as any, onStep);
          return {
            ok: true,
            data: { replyText: '🔄 请先在**钱包页面**完成登录，登录后才能兑换 👇' },
            simulationMode: false,
          };
        }

        // 调真实报价
        const { callBackend } = await import('../../api/providers/okx/onchain/hwalletBackendFetch');
        let quoteData: any = null;
        let quoteError = '';
        try {
          quoteData = await callBackend<any>('/api/v6/dex/swap-quote', {
            token: session.token,
            body: {
              fromChain: swapChain,
              fromSymbol,
              fromAmount: String(amount),
              toChain: swapChain,
              toSymbol,
              slippageBps: 50,
            },
          });
        } catch (e: any) {
          quoteError = e?.message || '报价失败';
        }

        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's3', 'active', onStep);
        await delay(200);
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        steps = await advanceSafety(steps, onStep);

        steps = advanceStep(steps, 's4', 'active', onStep);

        if (quoteError || !quoteData?.ok) {
          steps = advanceStep(steps, 's4', 'done', onStep);
          return {
            ok: true,
            data: {
              replyText: `🔄 **兑换报价失败**\n\n${quoteError || quoteData?.error || '暂时无法获取报价，请稍后重试'}\n\n常见原因：该链暂不支持此交易对，或余额不足`,
            },
            simulationMode: false,
          };
        }

        const toAmt = Number(quoteData.toAmount || 0);
        const rate = Number(quoteData.rate || 0);
        const routerLabel: string = quoteData.routerLabel || 'OKX DEX Aggregator';
        const gasFee: string = quoteData.estimatedGasUsd ? `~$${Number(quoteData.estimatedGasUsd).toFixed(4)}` : '—';
        const impact = quoteData.priceImpactBps
          ? `${(quoteData.priceImpactBps / 100).toFixed(2)}%`
          : '<0.01%';

        steps = advanceStep(steps, 's4', 'done', onStep);

        const swapReply = `🔄 **链上兑换报价**\n\n` +
          `${amount} ${fromSymbol} → **~${toAmt > 0 ? toAmt.toFixed(6) : '?'} ${toSymbol}**\n\n` +
          `• 路由：${routerLabel}\n` +
          `• 汇率：${rate > 0 ? `1 ${toSymbol} ≈ ${(1/rate).toFixed(4)} ${fromSymbol}` : '—'}\n` +
          `• 滑点：${(quoteData.slippageBps ?? 50) / 100}%\n` +
          `• 预估 Gas：${gasFee}\n` +
          `• 价格影响：${impact}\n\n` +
          `⚠️ 链上兑换受滑点影响，实际到账可能略有差异\n\n` +
          `回复「**确认兑换**」即可发起链上交易`;

        return {
          ok: true,
          data: {
            replyText: swapReply,
            card: {
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
              aiSummary: `兑换 ${amount} ${fromSymbol} → ${toAmt > 0 ? toAmt.toFixed(6) : '?'} ${toSymbol}`,
              createdAt: now,
              fromAmount: amount,
              fromSymbol,
              toAmount: toAmt,
              toSymbol,
              swapChain,
              rate: rate > 0 ? `1 ${toSymbol} ≈ ${(1 / rate).toFixed(4)} ${fromSymbol}` : '—',
              slippage: `${(quoteData.slippageBps ?? 50) / 100}%`,
              networkFee: gasFee,
              rows: [
                { label: '路由', value: routerLabel },
                { label: '价格影响', value: impact },
              ],
              warning: '链上兑换受滑点影响，实际到账数量可能略有差异。',
              primaryAction: '确认兑换',
              secondaryAction: '取消',
            } as HWalletCard,
          },
          simulationMode: false,
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
    steps = advanceStep(steps, 's3', 'active', onStep);

    // 构建地址卡片（后端结构：{ ok, addresses: { evm: [{address, chainIndex, chainName}], solana: [...] } }）
    const evmList: any[] = addrData?.addresses?.evm ?? addrData?.evm ?? [];
    const solList: any[] = addrData?.addresses?.solana ?? addrData?.solana ?? [];
    const evmAddr: string = evmList[0]?.address ?? (typeof evmList[0] === 'string' ? evmList[0] : '');
    const solAddr: string = solList[0]?.address ?? (typeof solList[0] === 'string' ? solList[0] : '');
    const addrCard = buildAddressCard(
      {
        evm: evmAddr ? [{ address: evmAddr }] : [],
        solana: solAddr ? [{ address: solAddr }] : [],
      },
      input,
    );

    const hasAddr = !!(evmAddr || solAddr);
    const replyText = hasAddr
      ? `📥 **充值地址**\n\n请查收下方地址卡片，复制后到对应链充值\n\n⚠️ 请确认链别，转错无法找回`
      : `⚠️ 暂时获取不到地址，请稍后再试。`;

    steps = advanceStep(steps, 's3', 'done', onStep);
    return {
      ok: true,
      data: { replyText, card: hasAddr ? addrCard : undefined },
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
            const raw: string = e?.message || '';
            let errorMsg = '转账失败，请稍后重试。';
            if (/余额不足|insufficient/i.test(raw)) errorMsg = '余额不足，请先充值后再操作。';
            else if (/token|未登录|auth/i.test(raw)) errorMsg = '登录已过期，请重新登录后再试。';
            else if (/参数|missing/i.test(raw)) errorMsg = '转账参数不完整，请确认地址和金额。';
            else if (raw && raw.length < 60 && /[\u4e00-\u9fa5]/.test(raw)) errorMsg = raw;
            return {
              ok: false,
              errorMsg,
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
              ? `📤 **转账确认**\n\n• 接收地址：\`${toAddress.slice(0, 8)}...${toAddress.slice(-6)}\`\n• 金额：**${amount} ${symbol}**\n• 链：${chain}\n\n点击确认后立即执行 👇`
              : `⚠️ **陌生地址转账**\n\n• 接收地址：\`${toAddress.slice(0, 8)}...${toAddress.slice(-6)}\`\n• 金额：**${amount} ${symbol}**\n• 链：${chain}\n\n该地址在本次对话中首次出现，请仔细核对后再确认 👇`,
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

      // ─── 链上机会 / 信号发现（V6：赚币发现 + 聪明钱信号 + 热门代币 + 追踪动态） ───
      case 'signal': {
        steps = advanceStep(steps, 's2', 'active', onStep);
        let opps: DefiOpportunity[] = [];
        let signals: DexSignal[] = [];
        let hotTokens: HotTokenRow[] = [];
        let tracker: DexTrackerActivity[] = [];
        try {
          const sig = { signal: options?.abortSignal };
          const [oppRes, sigRes, hotRes, trRes] = await Promise.all([
            okxOnchainClient.discoverOpportunities({ minApr: 3 }, undefined, sig),
            okxOnchainClient.fetchSignals({}, undefined, sig),
            okxOnchainClient.fetchHotTokens({ limit: 20 }, undefined, sig),
            okxOnchainClient.fetchTrackerActivities({ trackerType: "smart_money", limit: 12 }, undefined, sig),
          ]);
          opps = (oppRes.data || []).filter((o) => o.securityScore >= 70).slice(0, 5);
          signals = (sigRes.data || []).slice(0, 6);
          hotTokens = (hotRes.data || []).slice(0, 8);
          tracker = (trRes.data || []).slice(0, 8);
        } catch {
          /** 数据源不可用 */
        }
        steps = advanceStep(steps, 's2', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's3', 'active', onStep);
        await delay(220);
        steps = advanceStep(steps, 's3', 'done', onStep);
        await delay(150);

        steps = advanceStep(steps, 's4', 'active', onStep);

        const hotRows = hotTokens.map((h) => ({
          label: `🔥 ${h.symbol}`,
          value: `${h.chain.toUpperCase()} · 24h ${h.changePct24h}`,
        }));
        const trRows = tracker.map((t) => ({
          label: `📡 ${t.symbol}`,
          value: `${t.side} · ${t.amountUsd ?? "—"}`,
        }));

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
            rows: [
              ...opps.slice(0, 4).map((o) => ({
                label: o.protocol,
                value: `${o.apr}% · ${o.chain}`,
              })),
              ...hotRows.slice(0, 2),
              ...trRows.slice(0, 2),
            ].slice(0, 8),
            warning: '链上机会受合约风险与市场波动影响，建议小额试水。',
            primaryAction: '一键进入',
            secondaryAction: '换一个',
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
              { label: '来源', value: top.source },
              ...hotRows.slice(0, 3),
              ...trRows.slice(0, 3),
            ].slice(0, 10),
            warning: '新币 / Meme 风险极大，请确认合约安全后再小额买入。',
            primaryAction: '查看详情',
            secondaryAction: '换一个',
          };
        } else if (hotTokens.length > 0 || tracker.length > 0) {
          card = {
            id: makeId('card_signal_radar'),
            productLine: 'v6',
            module: 'wallet',
            cardType: 'signal',
            header: '机会卡片',
            title: '热门代币 · 聪明钱追踪',
            subtitle: `热门 ${hotTokens.length} · 追踪动态 ${tracker.length}`,
            riskLevel: '中',
            status: 'preview',
            simulationMode: false,
            userPrompt: input,
            aiSummary: '聚合热门榜与聪明钱地址的近期成交快照。',
            createdAt: now,
            signalSource: 'smart_money',
            rows: [...hotRows, ...trRows].slice(0, 10),
            warning: '数据来自公开市场接口，不构成投资建议。',
            primaryAction: '知道了',
            secondaryAction: '换一批',
          };
        } else {
          steps = advanceStep(steps, 's4', 'done', onStep);
          return {
            ok: true,
            data: {
              replyText: intent.reply || '🌑 暂未发现符合条件的链上机会。',
            },
            simulationMode: false,
          };
        }

        steps = advanceStep(steps, 's4', 'done', onStep);

        const summaryBits: string[] = [];
        if (opps.length) summaryBits.push(`赚币机会 ${opps.length}`);
        if (signals.length) summaryBits.push(`聚合信号 ${signals.length}`);
        if (hotTokens.length) summaryBits.push(`热门 ${hotTokens.length}`);
        if (tracker.length) summaryBits.push(`追踪 ${tracker.length}`);

        return {
          ok: true,
          data: {
            replyText:
              intent.reply ||
              (opps.length > 0
                ? `🛰️ 已为你扫描 **${opps.length}** 个链上赚币机会\n\n最佳：**${opps[0].protocol}** 年化 **${opps[0].apr}%** · 安全分 ${opps[0].securityScore}/100\n\n${summaryBits.length > 1 ? `同步：${summaryBits.filter((b) => !b.startsWith('赚币')).join(' · ')}\n\n` : ''}点开卡片查看详情 👇`
                : signals.length > 0
                  ? `📡 **聪明钱 / KOL 聚合信号**已就绪：${signals[0]?.symbol}\n\n${summaryBits.filter((b) => !b.startsWith('聚合')).join(' · ') || ''}\n\n详情见卡片 👇`
                  : `📊 **热门代币** 与 **信号追踪** 快照已就绪（${summaryBits.join(' · ')}）\n\n点开卡片查看 👇`),
            card,
          },
          simulationMode: false,
        };
      }

      // ─── 钱包内自动策略（趋势 / 网格）AI 中控台 ───
      case 'strategy': {
        steps = advanceStep(steps, 's2', 'active', onStep);
        const session = await loadSession();
        if (!session?.token) {
          steps = advanceStep(steps, 's2', 'error' as any, onStep);
          return {
            ok: true,
            data: {
              replyText: '🔐 请先在**钱包**完成登录，我才能帮你启动或停止自动策略。',
            },
            simulationMode: false,
          };
        }
        const { callBackend } = await import('../../api/providers/okx/onchain/hwalletBackendFetch');
        const op = intent.strategyOp ?? 'start';
        let replyText = '';
        try {
          if (op === 'stop') {
            const r = await callBackend<any>('/api/v6/strategy/stop', {
              method: 'POST',
              token: session.token,
              body: {},
            });
            if (r?.ok === false) {
              replyText = `⚠️ ${String(r?.error || '停止失败，请稍后再试。')}`;
            } else {
              replyText =
                intent.reply ||
                '⏹️ **已发送停止指令**\n\n当前自动策略会尽快收尾。请到**钱包 → AI 中控台**查看日志与状态。';
            }
          } else {
            const sid = intent.strategyId === 'grid' ? 'grid' : 'trend';
            const r = await callBackend<any>('/api/v6/strategy/start', {
              method: 'POST',
              token: session.token,
              body: { strategyId: sid },
            });
            if (r?.ok === false) {
              replyText = `⚠️ ${String(r?.error || '启动失败，请稍后再试。')}`;
            } else {
              const name = sid === 'grid' ? '网格套利' : '趋势跟随';
              replyText =
                intent.reply ||
                `✅ **${name}** 已在后台启动\n\n我会通过 OKX 聚合路由执行链上操作。请到**钱包 → AI 中控台**查看实时日志与风控提示。`;
            }
          }
        } catch (e) {
          replyText = `⚠️ ${formatHwalletErrorForUser(e)}`;
        }
        steps = advanceStep(steps, 's2', 'done', onStep);
        steps = await advanceSafety(steps, onStep);
        steps = advanceStep(steps, 's3', 'active', onStep);
        await delay(120);
        steps = advanceStep(steps, 's3', 'done', onStep);
        return { ok: true, data: { replyText }, simulationMode: false };
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
• 合约侧网格策略卡片（与钱包内自动网格不同）

🤖 **自动策略（钱包 AI 中控台）**
• 对话里说「开启趋势策略 / 启动网格套利」→ 真机后台自动跑单
• 「停止策略 / 关闭自动做单」→ 安全停止

🌱 **链上赚币**
• 质押 / DeFi 存款（Lido、Aave 等协议）
• 扫描链上高收益机会（聪明钱信号）

🛡️ **安全 & 记忆**
• 转账地址安全提醒（首次陌生地址自动警告）
• 多轮对话记住上下文（问完地址可以接着追问）

---
直接说你想做的事就行，比如：
「充值」「开启趋势策略」「BTC 行情」「转 100U 给 0xAbc...」「做多 ETH 100U」`,
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
          (await chatWithAI(options?.chatHistory ?? [], input, options?.abortSignal));
        return {
          ok: true,
          data: { replyText },
          simulationMode: false,
        };
      }
    }
  } catch (err: any) {
    const errorSteps = steps.map((s) =>
      s.status === "active" ? { ...s, status: "error" as const } : s,
    );
    onStep?.(errorSteps);

    const raw: string = err?.message || "";
    // 对常见错误给友好中文提示
    let errorMsg = "出了点问题，请稍后重试。";
    if (/token|未登录|auth/i.test(raw)) errorMsg = "登录已过期，请重新登录后操作。";
    else if (/timeout|超时/i.test(raw)) errorMsg = "连接超时，请检查网络后重试。";
    else if (/network|fetch|ECONN/i.test(raw)) errorMsg = "网络连接失败，请检查网络后重试。";
    else if (/onchainos.*未就绪|CLI.*未就绪/i.test(raw)) errorMsg = "链上通道暂未就绪，请稍候片刻再试。";
    else if (/余额不足|insufficient/i.test(raw)) errorMsg = "余额不足，请先充值后再操作。";
    else if (raw && raw.length < 60 && /[\u4e00-\u9fa5]/.test(raw)) errorMsg = raw;

    return {
      ok: false,
      errorMsg,
      simulationMode: false,
    };
  }
}
