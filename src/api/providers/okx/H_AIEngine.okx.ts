/**
 * H_AIEngine OKX 实盘实现 — 重构版
 * 
 * 核心改动：
 * 1. processMessage 变为 async，行情查询直接调用真实 API 返回实时数据
 * 2. 开仓/网格预览卡片填入真实价格和 AI 推荐参数
 * 3. 保持原有意图识别逻辑不变
 */
import type {
  IH_AIEngine,
  H_UserMessage,
  H_SessionContext,
  H_AIResponse,
  H_Intent,
} from '../../contracts/H_AIEngine';
import type { HWalletCard } from '../../../types/card';
import { makeId } from '../../../utils/id';
// V5 流程（合约下单 / 行情）— 走 V5 业务客户端
import * as okxClient from './okxClient';
import { getOkxGatewayCredentials, isOkxGatewayConfigured } from '../../../config/okxGatewayCreds';
import { getTrendSummary } from '../../../services/trendEngine';

// ─── 意图关键词映射 ─────────────────────────────────────────────
const INTENT_KEYWORDS: Record<string, string[]> = {
  market_query: ['价格', '行情', '多少钱', '涨了', '跌了', '现在', 'price', '资金费率', '费率', '持仓量'],
  open_position: ['开多', '做多', '开空', '做空', '开仓', 'long', 'short', '合约', '永续'],
  close_position: ['平仓', '平掉', '止盈', '止损', '关掉'],
  grid_create: ['网格', 'grid', '格子', '震荡', '区间'],
  grid_stop: ['停止网格', '关闭网格', '停掉'],
  swap: ['兑换', '换', '买', 'swap', '链上买'],
  earn: ['赚币', '质押', '存入', 'stake', 'earn', '理财'],
  transfer: ['转账', '转', '提币', '充值'],
  balance_query: ['余额', '资产', '账户', '持仓', 'balance'],
  risk_check: ['安全', '检查', '蜜罐', '扫描', 'rug'],
  trend_query: ['趋势', '分析', '预测', '方向', 'trend', '信号', '判断', '走势'],
  general_chat: [],
};

const PRODUCT_LINE_MAP: Record<string, 'V5' | 'V6' | 'common'> = {
  market_query: 'V5',
  open_position: 'V5',
  close_position: 'V5',
  grid_create: 'V5',
  grid_stop: 'V5',
  swap: 'V6',
  earn: 'V6',
  transfer: 'V6',
  balance_query: 'V5',
  risk_check: 'V6',
  trend_query: 'V5',
  general_chat: 'common',
};

function intentProductLineToCardPL(pl: string): 'v5' | 'v6' {
  return pl === 'v6' ? 'v6' : 'v5';
}

type ProductModule = 'market' | 'perpetual' | 'grid' | 'swap' | 'earn' | 'wallet' | 'account' | 'security';
function intentToModule(type: string): ProductModule {
  const map: Record<string, ProductModule> = {
    trend_query: 'market',
    market_query: 'market',
    open_position: 'perpetual',
    close_position: 'perpetual',
    grid_create: 'grid',
    grid_stop: 'grid',
    swap: 'swap',
    earn: 'earn',
    transfer: 'wallet',
    balance_query: 'account',
    risk_check: 'security',
    general_chat: 'market',
  };
  return map[type] || 'market';
}

export class OkxH_AIEngine implements IH_AIEngine {
  async processMessage(
    message: H_UserMessage,
    _context: H_SessionContext
  ): Promise<H_AIResponse> {
    const intent = this._identifyIntent(message.text);
    intent.params = this._extractParams(message.text, intent.type);

    // 对于行情查询，直接调用真实 API 生成回复
    let replyText: string;
    if (intent.type === 'market_query') {
      replyText = await this._fetchRealMarketData(intent);
    } else if (intent.type === 'balance_query') {
      replyText = await this._fetchRealBalance();
    } else if (intent.type === 'trend_query') {
      replyText = getTrendSummary();
    } else {
      replyText = this._generateReply(intent);
    }

    const requiresConfirmation = this._needsConfirmation(intent.type);
    let card: Partial<HWalletCard> | undefined;
    if (requiresConfirmation) {
      card = await this._generateRealPreviewCard(intent);
    }

    return { intent, replyText, card, requiresConfirmation };
  }

  async generateExecutionCard(
    intent: H_Intent,
    confirmed: boolean
  ): Promise<HWalletCard | null> {
    if (!confirmed) return null;
    const card: HWalletCard = {
      id: makeId('card'),
      productLine: intentProductLineToCardPL(intent.productLine),
      module: intentToModule(intent.type),
      cardType: 'trade',
      header: '交易卡片',
      title: this._getExecutionTitle(intent),
      riskLevel: '中',
      status: 'executed',
      simulationMode: false,
      userPrompt: '',
      aiSummary: `已执行: ${this._getExecutionTitle(intent)}`,
      createdAt: new Date().toISOString(),
    };
    return card;
  }

  // ─── 真实行情查询 ─────────────────────────────────────────────
  private async _fetchRealMarketData(intent: H_Intent): Promise<string> {
    const symbol = (intent.params.symbol as string) || 'BTC';
    const instId = `${symbol}-USDT`;
    const swapId = `${symbol}-USDT-SWAP`;

    try {
      const tickerRes = await okxClient.getTicker(instId);
      if (tickerRes.code !== '0' || !tickerRes.data?.[0]) {
        return `⚠️ 无法获取 ${symbol} 行情数据`;
      }
      const d = tickerRes.data[0];
      const last = parseFloat(d.last);
      const open24h = parseFloat(d.open24h || d.sodUtc0);
      const change = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
      const changeIcon = change >= 0 ? '📈' : '📉';
      const changeStr = change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;

      let reply = `${changeIcon} **${symbol}/USDT 实时行情**\n\n`;
      reply += `💰 当前价格：$${last.toLocaleString()}\n`;
      reply += `📊 24h涨跌：${changeStr}\n`;
      reply += `🔝 24h最高：$${parseFloat(d.high24h).toLocaleString()}\n`;
      reply += `🔻 24h最低：$${parseFloat(d.low24h).toLocaleString()}\n`;
      reply += `📦 24h成交量：${(parseFloat(d.vol24h) / 1e6).toFixed(2)}M`;

      // 尝试获取资金费率
      try {
        const frRes = await okxClient.getFundingRate(swapId);
        if (frRes.code === '0' && frRes.data?.[0]) {
          const rate = (parseFloat(frRes.data[0].fundingRate) * 100).toFixed(4);
          reply += `\n💹 资金费率：${rate}%`;
        }
      } catch { /* 非 SWAP 币种可能没有资金费率 */ }

      // 尝试获取持仓量
      try {
        const oiRes = await okxClient.getOpenInterest(swapId);
        if (oiRes.code === '0' && oiRes.data?.[0]) {
          const oi = parseFloat(oiRes.data[0].oi);
          reply += `\n📐 持仓量：${oi.toLocaleString()} 张`;
        }
      } catch { /* ignore */ }

      return reply;
    } catch (err: any) {
      return `⚠️ 行情获取失败：${err.message || '网络错误'}`;
    }
  }

  // ─── 真实余额查询 ─────────────────────────────────────────────
  private async _fetchRealBalance(): Promise<string> {
    try {
      const creds = getOkxGatewayCredentials();
      if (!isOkxGatewayConfigured(creds)) {
        return "⚠️ 无法获取账户余额，请检查 API 配置";
      }
      const res = await okxClient.getBalance(creds);
      if (res.code !== '0' || !res.data?.[0]) {
        return '⚠️ 无法获取账户余额，请检查 API 配置';
      }
      const acct = res.data[0];
      const totalEq = parseFloat(acct.totalEq || '0');
      let reply = `💼 **账户资产概览**\n\n`;
      reply += `📊 总权益：$${totalEq.toLocaleString()}\n`;

      if (acct.details && Array.isArray(acct.details)) {
        const nonZero = acct.details.filter((d: any) => parseFloat(d.eq || '0') > 0.01);
        if (nonZero.length > 0) {
          reply += `\n💰 持仓明细：\n`;
          for (const d of nonZero.slice(0, 10)) {
            reply += `  • ${d.ccy}: ${parseFloat(d.eq).toFixed(4)} (≈$${parseFloat(d.eqUsd || '0').toFixed(2)})\n`;
          }
        }
      }
      return reply;
    } catch (err: any) {
      return `⚠️ 余额查询失败：${err.message || '请检查 API 配置'}`;
    }
  }

  // ─── 生成带真实数据的预览卡片 ─────────────────────────────────
  private async _generateRealPreviewCard(intent: H_Intent): Promise<Partial<HWalletCard>> {
    const symbol = (intent.params.symbol as string) || 'BTC';
    const amount = (intent.params.amount as number) || 100;
    const direction = (intent.params.direction as string) || 'long';
    const leverage = (intent.params.leverage as number) || 3;

    // 获取真实价格
    let currentPrice = 0;
    try {
      const instId = intent.type.includes('grid') ? `${symbol}-USDT-SWAP` : `${symbol}-USDT`;
      const res = await okxClient.getTicker(instId);
      if (res.code === '0' && res.data?.[0]) {
        currentPrice = parseFloat(res.data[0].last);
      }
    } catch { /* use 0 as fallback */ }

    if (intent.type === 'open_position') {
      return {
        id: makeId('preview'),
        productLine: 'v5',
        module: 'perpetual',
        cardType: 'trade',
        title: `${symbol}/USDT ${direction === 'short' ? '做空' : '做多'} ${amount}U`,
        riskLevel: leverage > 10 ? '高' : leverage > 5 ? '中' : '低',
        status: 'ready_to_confirm',
        simulationMode: false,
        pair: `${symbol}/USDT`,
        amount,
        currency: 'USDT',
        direction: direction === 'short' ? '做空' : '做多',
        leverage,
        entryPrice: currentPrice,
        lastPrice: currentPrice,
        rows: [
          { label: '币种', value: `${symbol}/USDT` },
          { label: '方向', value: direction === 'short' ? '做空' : '做多' },
          { label: '金额', value: `${amount} USDT` },
          { label: '杠杆', value: `${leverage}x` },
          { label: '当前价格', value: currentPrice > 0 ? `$${currentPrice.toLocaleString()}` : '获取中...' },
        ],
      };
    }

    if (intent.type === 'grid_create') {
      const upperPrice = currentPrice > 0 ? currentPrice * 1.1 : 0;
      const lowerPrice = currentPrice > 0 ? currentPrice * 0.9 : 0;
      return {
        id: makeId('preview'),
        productLine: 'v5',
        module: 'grid',
        cardType: 'strategy',
        title: `${symbol}/USDT 合约网格`,
        riskLevel: '中',
        status: 'ready_to_confirm',
        simulationMode: false,
        pair: `${symbol}/USDT`,
        amount,
        currency: 'USDT',
        agentName: `网格 · ${symbol}/USDT`,
        agentTags: ['网格', `${symbol}/USDT`, '中性'],
        rows: [
          { label: '投入金额', value: `${amount} USDT` },
          { label: '价格上限', value: upperPrice > 0 ? `$${upperPrice.toFixed(0)}` : '计算中...' },
          { label: '价格下限', value: lowerPrice > 0 ? `$${lowerPrice.toFixed(0)}` : '计算中...' },
          { label: '网格数', value: '20' },
          { label: '当前价格', value: currentPrice > 0 ? `$${currentPrice.toLocaleString()}` : '获取中...' },
        ],
        warning: '网格策略在单边行情中可能产生浮亏，请确认风险承受能力。',
        primaryAction: '启动网格',
        secondaryAction: '调整参数',
      };
    }

    if (intent.type === 'swap') {
      const estimatedAmount = currentPrice > 0 ? amount / currentPrice : 0;
      return {
        id: makeId('preview'),
        productLine: 'v6',
        module: 'swap',
        cardType: 'trade',
        title: `${symbol} 链上兑换`,
        riskLevel: '低',
        status: 'ready_to_confirm',
        simulationMode: false,
        fromAmount: amount,
        fromSymbol: 'USDT',
        toAmount: estimatedAmount,
        toSymbol: symbol,
        rate: currentPrice > 0 ? `1 ${symbol} ≈ $${currentPrice.toLocaleString()}` : '获取中...',
        slippage: '0.5%',
        rows: [
          { label: '支付', value: `${amount} USDT` },
          { label: '获得', value: estimatedAmount > 0 ? `≈${estimatedAmount.toFixed(6)} ${symbol}` : '计算中...' },
          { label: '参考价格', value: currentPrice > 0 ? `$${currentPrice.toLocaleString()}` : '获取中...' },
          { label: '滑点容忍', value: '0.5%' },
        ],
        warning: '链上兑换受滑点影响，实际到账数量可能略有差异。',
        primaryAction: '确认兑换',
        secondaryAction: '换一个',
      };
    }

    // 默认预览卡片
    return {
      id: makeId('preview'),
      productLine: intentProductLineToCardPL(intent.productLine),
      module: intentToModule(intent.type),
      cardType: 'trade',
      title: this._getExecutionTitle(intent),
      riskLevel: '中',
      status: 'ready_to_confirm',
      simulationMode: false,
    };
  }

  // ─── 私有方法 ─────────────────────────────────────────────────
  private _identifyIntent(text: string): H_Intent {
    let bestType: H_Intent['type'] = 'general_chat';
    let bestScore = 0;

    for (const [type, keywords] of Object.entries(INTENT_KEYWORDS)) {
      if (keywords.length === 0) continue;
      let score = 0;
      for (const kw of keywords) {
        if (text.toLowerCase().includes(kw.toLowerCase())) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestType = type as H_Intent['type'];
      }
    }

    return {
      type: bestType,
      confidence: bestScore > 0 ? Math.min(0.95, 0.5 + bestScore * 0.15) : 0.3,
      params: {},
      productLine: PRODUCT_LINE_MAP[bestType],
    };
  }

  private _extractParams(text: string, intentType: H_Intent['type']): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    const pairMatch = text.match(/\b(BTC|ETH|SOL|DOGE|XRP|ADA|AVAX|MATIC|DOT|LINK)[-/]?(USDT|USD)?\b/i);
    if (pairMatch) {
      params.instId = `${pairMatch[1].toUpperCase()}-USDT${intentType.includes('position') || intentType.includes('grid') ? '-SWAP' : ''}`;
      params.symbol = pairMatch[1].toUpperCase();
    }

    // 如果没匹配到英文，尝试中文
    if (!params.symbol) {
      if (/比特|btc/i.test(text)) params.symbol = 'BTC';
      else if (/以太|eth/i.test(text)) params.symbol = 'ETH';
      else if (/sol/i.test(text)) params.symbol = 'SOL';
      else if (/狗狗|doge/i.test(text)) params.symbol = 'DOGE';
    }

    const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(U|USDT|美元|刀)?/i);
    if (amountMatch) params.amount = parseFloat(amountMatch[1]);

    if (text.includes('做多') || text.includes('开多') || text.includes('long')) {
      params.direction = 'long';
    } else if (text.includes('做空') || text.includes('开空') || text.includes('short')) {
      params.direction = 'short';
    }

    const leverMatch = text.match(/(\d+)\s*[xX倍]/);
    if (leverMatch) params.leverage = parseInt(leverMatch[1], 10);

    return params;
  }

  private _generateReply(intent: H_Intent): string {
    const symbol = (intent.params.symbol as string) || 'BTC';
    const amount = intent.params.amount || '';
    const direction = intent.params.direction === 'short' ? '做空' : '做多';
    const leverage = intent.params.leverage || 3;

    const map: Record<string, string> = {
      open_position: `收到开仓指令：${symbol}/USDT ${direction} ${amount}U（${leverage}x杠杆）。请确认卡片后执行。`,
      close_position: `收到平仓指令，正在查询 ${symbol} 当前持仓...`,
      grid_create: `收到网格策略指令：${symbol}/USDT 合约网格（中性），请确认参数后执行。`,
      grid_stop: '收到停止网格指令，正在查询运行中的网格...',
      swap: `收到兑换指令：${amount || 100}U → ${symbol}，正在获取最优报价...`,
      earn: '正在查询可用的赚币产品...',
      transfer: '收到转账指令，请确认转账详情。',
      risk_check: '正在进行代币安全检测...',
      trend_query: '正在获取最新趋势分析报告...',
      general_chat: '我是 H Wallet AI 助手，可以帮您：\n\n📊 查行情（如"BTC 价格"）\n📈 开合约（如"100U 开 ETH 做多"）\n🔲 跑网格（如"ETH 网格策略"）\n🔄 链上兑换（如"100U 换 ETH"）\n💰 质押赚币\n\n请问有什么可以帮您？',
    };
    return map[intent.type] || '收到，正在处理...';
  }

  private _needsConfirmation(type: H_Intent['type']): boolean {
    return ['open_position', 'close_position', 'grid_create', 'grid_stop', 'swap', 'earn', 'transfer'].includes(type);
  }

  private _getExecutionTitle(intent: H_Intent): string {
    const symbol = (intent.params.symbol as string) || 'BTC';
    const amount = intent.params.amount || '';
    const map: Record<string, string> = {
      open_position: `${symbol} ${intent.params.direction === 'short' ? '做空' : '做多'} ${amount}U`,
      close_position: `${symbol} 平仓`,
      grid_create: `${symbol} 合约网格`,
      grid_stop: `停止 ${symbol} 网格`,
      swap: `兑换 ${symbol}`,
      earn: `${symbol} 赚币`,
      transfer: `转账 ${amount}U`,
      trend_query: 'BTC 趋势分析',
      market_query: `查询 ${symbol} 行情`,
      balance_query: '查询账户余额',
      risk_check: '风险检查',
      general_chat: '操作',
    };
    return map[intent.type] || '操作';
  }
}
