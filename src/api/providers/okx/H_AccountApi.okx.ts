/**
 * H_AccountApi — 资产总览走链上钱包组合（BFF `/api/v6/wallet/portfolio`），不连 OKX 交易所账户。
 * getPnlHistory / transfer 仍为 CEX，需本地 `okx.local` 或网关凭证。
 */

import type {
  IH_AccountApi,
  H_AccountOverview,
  H_AssetBalance,
  H_PnlRecord,
} from '../../contracts/H_AccountApi';
import { loadSession } from '../../../services/walletApi';
import { getHwalletApiBase } from '../../../services/walletApiCore';
import type { OkxCredentials } from './okxClient';
import * as okxClient from './okxClient';
import { okxOnchainClient } from './onchain/client';
import type { WalletPortfolio } from './onchain/types';

function mapWalletPortfolioToOverview(p: WalletPortfolio): H_AccountOverview {
  const balances: H_AssetBalance[] = p.tokens.map((t) => {
    const usd = parseFloat(String(t.usdValue || '0'));
    const amt = parseFloat(String(t.amount || '0'));
    return {
      currency: t.symbol,
      available: amt,
      frozen: 0,
      total: amt,
      usdtValue: Number.isFinite(usd) ? usd : 0,
    };
  });
  const total = parseFloat(String(p.totalUsd || '0'));
  const ts = Date.parse(String(p.lastUpdatedAt || ''));
  return {
    totalEquity: Number.isFinite(total) ? total : 0,
    availableBalance: Number.isFinite(total) ? total : 0,
    usedMargin: 0,
    unrealizedPnl: 0,
    marginRatio: 0,
    balances,
    updateTime: Number.isFinite(ts) ? ts : Date.now(),
  };
}

function assertCexConfigured(creds: OkxCredentials): void {
  if (!creds.apiKey?.trim() || !creds.secretKey?.trim() || !creds.passphrase?.trim()) {
    throw new Error('[H_AccountApi] 交易所 CEX 能力未配置（当前为链上钱包模式）');
  }
}

export class OkxH_AccountApi implements IH_AccountApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  async getOverview(): Promise<H_AccountOverview> {
    if (!getHwalletApiBase()) {
      throw new Error('[H_AccountApi] 未配置 EXPO_PUBLIC_HWALLET_API_BASE，无法拉取钱包资产总览');
    }
    const session = await loadSession();
    if (!session?.token) {
      throw new Error('[H_AccountApi] 请先完成钱包登录');
    }
    const { data } = await okxOnchainClient.getWalletPortfolio(session.token);
    return mapWalletPortfolioToOverview(data);
  }

  async getBalance(currency: string): Promise<H_AssetBalance> {
    const overview = await this.getOverview();
    const found = overview.balances.find(
      (b) => b.currency.toUpperCase() === currency.toUpperCase()
    );
    if (!found) {
      return {
        currency: currency.toUpperCase(),
        available: 0,
        frozen: 0,
        total: 0,
        usdtValue: 0,
      };
    }
    return found;
  }

  async getPnlHistory(days = 7): Promise<H_PnlRecord[]> {
    assertCexConfigured(this.creds);
    const res = await okxClient.getBills(this.creds);
    if (res.code !== '0') {
      throw new Error(`[H_AccountApi] getPnlHistory 失败: ${res.msg}`);
    }

    const dailyMap = new Map<string, number>();
    for (const bill of res.data || []) {
      const date = new Date(parseInt(bill.ts)).toISOString().slice(0, 10);
      const pnl = parseFloat(bill.pnl || '0');
      dailyMap.set(date, (dailyMap.get(date) || 0) + pnl);
    }

    const records: H_PnlRecord[] = [];
    let cumulative = 0;
    const sorted = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [date, pnl] of sorted) {
      cumulative += pnl;
      records.push({
        date,
        pnl,
        pnlPercent: 0,
        cumulativePnl: cumulative,
      });
    }

    return records.slice(-days);
  }

  async transfer(
    currency: string,
    amount: number,
    direction: 'toTrade' | 'toFunding'
  ): Promise<boolean> {
    assertCexConfigured(this.creds);
    const from = direction === 'toTrade' ? '6' : '18';
    const to = direction === 'toTrade' ? '18' : '6';

    const res = await okxClient.transfer(
      this.creds,
      currency.toUpperCase(),
      String(amount),
      from as '6' | '18',
      to as '6' | '18'
    );

    if (res.code !== '0') {
      throw new Error(`[H_AccountApi] transfer 失败: ${res.msg}`);
    }
    return true;
  }
}
