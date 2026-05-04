/**
 * H_ChatOrchestrator OKX 实盘实现 — 重构版
 * 
 * 核心改动：
 * 1. handleCardAction 中 confirm 分支调用真实 OKX API 执行交易
 * 2. 保持原有对话→意图→路由→卡片流程不变
 * 3. 集成 trend_engine 数据（如果可用）
 */
import type {
  IH_ChatOrchestrator,
  H_UserMessage,
  H_BotResponse,
  H_CardAction,
  H_SessionContext,
} from '../../contracts/H_ChatOrchestrator';
import type { H_Intent } from '../../contracts/H_AIEngine';
import type { HWalletCard } from '../../../types/card';
import { OkxH_AIEngine } from './H_AIEngine.okx';
import { OkxH_IntentRouter } from './H_IntentRouter.okx';
import { makeId } from '../../../utils/id';
import * as okxClient from './okxClient';

interface PendingAction {
  cardId: string;
  intent: H_Intent;
  plan: { targetApi: string; method: string; params: Record<string, any> };
}

type ProductModule = 'market' | 'perpetual' | 'grid' | 'swap' | 'earn' | 'wallet' | 'account' | 'security';

function toCardPL(pl: string): 'v5' | 'v6' {
  return pl === 'v6' ? 'v6' : 'v5';
}

function toModule(type: string): ProductModule {
  const map: Record<string, ProductModule> = {
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

function getCredentials() {
  try {
    const localConfig = require('../../../config/okx.local');
    return {
      apiKey: localConfig.OKX_CONFIG.apiKey,
      secretKey: localConfig.OKX_CONFIG.secretKey,
      passphrase: localConfig.OKX_CONFIG.passphrase,
    };
  } catch {
    return null;
  }
}

export class OkxH_ChatOrchestrator implements IH_ChatOrchestrator {
  private aiEngine: OkxH_AIEngine;
  private router: OkxH_IntentRouter;
  private context: H_SessionContext;
  private pendingActions: Map<string, PendingAction> = new Map();

  constructor() {
    this.aiEngine = new OkxH_AIEngine();
    this.router = new OkxH_IntentRouter();
    this.context = {
      sessionId: makeId('session'),
      userId: '',
      history: [],
      activeProductLine: undefined,
    };
  }

  async handleMessage(message: H_UserMessage): Promise<H_BotResponse> {
    // 1. 记录历史
    this.context.history.push(message);
    if (this.context.history.length > 20) {
      this.context.history = this.context.history.slice(-20);
    }

    // 2. AI 处理（现在会调用真实 API）
    const aiResponse = await this.aiEngine.processMessage(message, this.context);

    // 3. 更新活跃产品线
    if (aiResponse.intent.productLine !== 'common') {
      this.context.activeProductLine = aiResponse.intent.productLine;
    }

    // 4. 路由
    const plan = await this.router.route(aiResponse.intent);

    // 5. 构建响应
    const cards: HWalletCard[] = [];

    if (aiResponse.requiresConfirmation && aiResponse.card) {
      const card: HWalletCard = {
        id: aiResponse.card.id || makeId('card'),
        productLine: aiResponse.card.productLine || toCardPL(aiResponse.intent.productLine),
        module: aiResponse.card.module || toModule(aiResponse.intent.type),
        cardType: aiResponse.card.cardType || 'trade',
        header: '交易卡片',
        title: aiResponse.card.title || '操作确认',
        riskLevel: aiResponse.card.riskLevel || '中',
        status: 'pending',
        simulationMode: false,
        userPrompt: message.text,
        aiSummary: aiResponse.replyText,
        createdAt: new Date().toISOString(),
        // 传递真实数据字段
        ...(aiResponse.card.rows && { rows: aiResponse.card.rows }),
        ...(aiResponse.card.pair && { pair: aiResponse.card.pair }),
        ...(aiResponse.card.amount && { amount: aiResponse.card.amount }),
        ...(aiResponse.card.direction && { direction: aiResponse.card.direction }),
        ...(aiResponse.card.leverage && { leverage: aiResponse.card.leverage }),
        ...(aiResponse.card.entryPrice && { entryPrice: aiResponse.card.entryPrice }),
        ...(aiResponse.card.warning && { warning: aiResponse.card.warning }),
        ...(aiResponse.card.primaryAction && { primaryAction: aiResponse.card.primaryAction }),
        ...(aiResponse.card.secondaryAction && { secondaryAction: aiResponse.card.secondaryAction }),
      };
      cards.push(card);

      this.pendingActions.set(card.id, {
        cardId: card.id,
        intent: aiResponse.intent,
        plan: { targetApi: plan.targetApi, method: plan.method, params: plan.params },
      });
    } else if (!aiResponse.requiresConfirmation) {
      // 行情查询等不需要确认的操作，直接返回信息卡片
      const infoCard: HWalletCard = {
        id: makeId('info'),
        productLine: toCardPL(aiResponse.intent.productLine),
        module: toModule(aiResponse.intent.type),
        cardType: 'info',
        header: '信息卡片',
        title: aiResponse.intent.type === 'market_query' ? '实时行情' : '查询结果',
        riskLevel: '低',
        status: 'executed',
        simulationMode: false,
        userPrompt: message.text,
        aiSummary: aiResponse.replyText,
        createdAt: new Date().toISOString(),
      };
      cards.push(infoCard);
    }

    return {
      text: aiResponse.replyText,
      cards,
      sessionComplete: false,
    };
  }

  async handleCardAction(action: H_CardAction): Promise<H_BotResponse> {
    const pending = this.pendingActions.get(action.cardId);
    if (!pending) {
      return { text: '该操作已过期或不存在。', cards: [], sessionComplete: false };
    }

    switch (action.type) {
      case 'confirm': {
        this.pendingActions.delete(action.cardId);
        // 真实执行交易
        const result = await this._executeRealTrade(pending.intent);
        return result;
      }
      case 'cancel': {
        this.pendingActions.delete(action.cardId);
        return { text: '✅ 操作已取消。', cards: [], sessionComplete: false };
      }
      case 'modify': {
        Object.assign(pending.plan.params, action.changes);
        Object.assign(pending.intent.params, action.changes);
        // 重新生成预览卡片
        const aiResponse = await this.aiEngine.processMessage(
          { id: makeId('msg'), text: `修改参数：${JSON.stringify(action.changes)}`, timestamp: Date.now() },
          this.context
        );
        const updatedCard: HWalletCard = {
          id: makeId('card'),
          productLine: toCardPL(pending.intent.productLine),
          module: toModule(pending.intent.type),
          cardType: 'trade',
          header: '交易卡片',
          title: '已更新参数',
          riskLevel: '中',
          status: 'pending',
          simulationMode: false,
          userPrompt: '',
          aiSummary: '参数已更新，请重新确认',
          createdAt: new Date().toISOString(),
        };
        this.pendingActions.delete(action.cardId);
        this.pendingActions.set(updatedCard.id, { ...pending, cardId: updatedCard.id });
        return { text: '参数已更新，请确认新的操作。', cards: [updatedCard], sessionComplete: false };
      }
      default:
        return { text: '未知操作。', cards: [], sessionComplete: false };
    }
  }

  // ─── 真实交易执行 ─────────────────────────────────────────────
  private async _executeRealTrade(intent: H_Intent): Promise<H_BotResponse> {
    const creds = getCredentials();
    if (!creds) {
      return {
        text: '⚠️ API 凭证未配置，无法执行交易。请先在设置中配置 OKX API Key。',
        cards: [],
        sessionComplete: false,
      };
    }

    const symbol = (intent.params.symbol as string) || 'BTC';
    const amount = (intent.params.amount as number) || 100;
    const direction = (intent.params.direction as string) || 'long';
    const leverage = (intent.params.leverage as number) || 3;
    const instId = `${symbol}-USDT-SWAP`;

    try {
      switch (intent.type) {
        case 'open_position': {
          // 1. 设置杠杆
          await okxClient.setLeverage(creds, instId, leverage, 'isolated');
          
          // 2. 获取当前价格计算下单数量
          const tickerRes = await okxClient.getTicker(instId);
          const price = parseFloat(tickerRes.data?.[0]?.last || '0');
          if (price === 0) throw new Error('无法获取当前价格');
          
          // 计算合约张数（每张面值根据币种不同）
          const ctVal = symbol === 'BTC' ? 0.01 : symbol === 'ETH' ? 0.1 : 10;
          const sz = Math.max(1, Math.floor((amount * leverage) / (price * ctVal)));
          
          // 3. 下单
          const orderRes = await okxClient.placeOrder(creds, {
            instId,
            tdMode: 'isolated',
            side: direction === 'short' ? 'sell' : 'buy',
            posSide: direction === 'short' ? 'short' : 'long',
            ordType: 'market',
            sz: String(sz),
          });

          if (orderRes.code !== '0') {
            throw new Error(orderRes.data?.[0]?.sMsg || orderRes.msg || '下单失败');
          }

          const ordId = orderRes.data?.[0]?.ordId || '';
          const resultCard: HWalletCard = {
            id: makeId('result'),
            productLine: 'v5',
            module: 'perpetual',
            cardType: 'trade',
            header: '交易卡片',
            title: `${symbol} ${direction === 'short' ? '做空' : '做多'} 已成交`,
            riskLevel: leverage > 10 ? '高' : '中',
            status: 'executed',
            simulationMode: false,
            userPrompt: '',
            aiSummary: `订单号: ${ordId}`,
            createdAt: new Date().toISOString(),
            rows: [
              { label: '币种', value: `${symbol}/USDT` },
              { label: '方向', value: direction === 'short' ? '做空' : '做多' },
              { label: '数量', value: `${sz} 张` },
              { label: '杠杆', value: `${leverage}x` },
              { label: '成交价', value: `≈$${price.toLocaleString()}` },
              { label: '订单号', value: ordId },
            ],
          };

          return {
            text: `✅ ${symbol}/USDT ${direction === 'short' ? '做空' : '做多'} 已成交！\n\n📋 数量：${sz}张\n💰 成交价：≈$${price.toLocaleString()}\n⚡ 杠杆：${leverage}x\n🆔 订单号：${ordId}`,
            cards: [resultCard],
            sessionComplete: false,
          };
        }

        case 'close_position': {
          const closeRes = await okxClient.closePosition(creds, instId, 'isolated');
          if (closeRes.code !== '0') {
            throw new Error(closeRes.msg || '平仓失败');
          }
          return {
            text: `✅ ${symbol}/USDT 持仓已全部平仓。`,
            cards: [],
            sessionComplete: false,
          };
        }

        case 'grid_create': {
          // 获取当前价格
          const gTickerRes = await okxClient.getTicker(instId);
          const gPrice = parseFloat(gTickerRes.data?.[0]?.last || '0');
          if (gPrice === 0) throw new Error('无法获取当前价格');

          const upperPrice = gPrice * 1.1;
          const lowerPrice = gPrice * 0.9;
          const gridCount = 20;

          const gridRes = await okxClient.placeGridOrder(creds, {
            instId,
            algoOrdType: 'contract_grid',
            maxPx: String(upperPrice.toFixed(1)),
            minPx: String(lowerPrice.toFixed(1)),
            gridNum: String(gridCount),
            runType: '1',
            sz: String(amount),
            direction: 'neutral',
            lever: String(leverage),
          });

          if (gridRes.code !== '0') {
            throw new Error(gridRes.data?.[0]?.sMsg || gridRes.msg || '网格创建失败');
          }

          const algoId = gridRes.data?.[0]?.algoId || '';
          return {
            text: `✅ ${symbol}/USDT 合约网格已启动！\n\n📐 价格区间：$${lowerPrice.toFixed(0)} ~ $${upperPrice.toFixed(0)}\n🔲 网格数：${gridCount}\n💰 投入：${amount}U\n🆔 策略ID：${algoId}`,
            cards: [],
            sessionComplete: false,
          };
        }

        case 'grid_stop': {
          // 获取运行中的网格
          const gridsRes = await okxClient.getGridOrders(creds);
          if (gridsRes.code !== '0' || !gridsRes.data?.length) {
            return { text: '当前没有运行中的网格策略。', cards: [], sessionComplete: false };
          }
          // 停止第一个匹配的网格
          const grid = gridsRes.data.find((g: any) => g.instId.includes(symbol)) || gridsRes.data[0];
          const stopRes = await okxClient.stopGridOrder(creds, grid.algoId, grid.instId);
          if (stopRes.code !== '0') {
            throw new Error(stopRes.msg || '停止网格失败');
          }
          return {
            text: `✅ 网格策略 ${grid.algoId} 已停止并平仓。`,
            cards: [],
            sessionComplete: false,
          };
        }

        default:
          return { text: '该操作类型暂不支持自动执行。', cards: [], sessionComplete: false };
      }
    } catch (err: any) {
      return {
        text: `❌ 交易执行失败：${err.message || '未知错误'}\n\n请检查账户余额和 API 权限后重试。`,
        cards: [],
        sessionComplete: false,
      };
    }
  }

  getContext(): H_SessionContext {
    return { ...this.context };
  }

  resetSession(): void {
    this.context = {
      sessionId: makeId('session'),
      userId: this.context.userId,
      history: [],
      activeProductLine: undefined,
    };
    this.pendingActions.clear();
  }
}
