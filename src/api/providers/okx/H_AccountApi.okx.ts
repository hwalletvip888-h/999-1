/**
 * H_AccountApi OKX 实盘实现
 * 对接 OKX V5 账户接口（需 API Key 签名）
 */

import type {
  IH_AccountApi,
  H_AccountOverview,
  H_AssetBalance,
  H_PnlRecord,
} from '../../contracts/H_AccountApi';
import type { OkxCredentials } from './okxClient';
import * as okxClient from './okxClient';

export class OkxH_AccountApi implements IH_AccountApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  async getOverview(): Promise<H_AccountOverview> {
    const res = await okxClient.getBalance(this.creds);
    if (res.code !== '0' || !res.data?.[0]) {
      throw new Error(`[H_AccountApi] getOverview 失败: ${res.msg}`);
    }
    const acct = res.data[0];

    const balances: H_AssetBalance[] = (acct.details || []).map((d: any) => ({
      currency: d.ccy,
      available: parseFloat(d.availBal || '0'),
      frozen: parseFloat(d.frozenBal || '0'),
      total: parseFloat(d.eq || '0'),
      usdtValue: parseFloat(d.eqUsd || d.eq || '0'),
    }));

    return {
      totalEquity: parseFloat(acct.totalEq || '0'),
      availableBalance: parseFloat(acct.details?.[0]?.availBal || '0'),
      usedMargin: parseFloat(acct.imr || '0'),
      unrealizedPnl: parseFloat(acct.upl || '0'),
      marginRatio: parseFloat(acct.mgnRatio || '0'),
      balances,
      updateTime: parseInt(acct.uTime || '0'),
    };
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
    const res = await okxClient.getBills(this.creds);
    if (res.code !== '0') {
      throw new Error(`[H_AccountApi] getPnlHistory 失败: ${res.msg}`);
    }

    // 按日期聚合盈亏
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
