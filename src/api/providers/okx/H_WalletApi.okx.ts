/**
 * H_WalletApi OKX 实盘实现
 * 对接 OKX Onchain OS — Wallet API
 * https://www.okx.com/docs-v5/en/#wallet
 */

import type {
  IH_WalletApi,
  H_WalletAddress,
  H_TokenBalance,
  H_TransferParams,
  H_TransferResult,
  H_Chain,
} from '../../contracts/H_WalletApi';
import type { OkxCredentials } from './okxClient';
import * as okxClient from './okxClient';

/** OKX 链 ID 映射 */
const CHAIN_ID_MAP: Record<H_Chain, string> = {
  EVM: '1',      // Ethereum mainnet
  Solana: '501',
  Bitcoin: '0',
};

export class OkxH_WalletApi implements IH_WalletApi {
  private creds: OkxCredentials;

  constructor(creds: OkxCredentials) {
    this.creds = creds;
  }

  async createWallet(userId: string): Promise<H_WalletAddress[]> {
    // OKX Agent Wallet 创建 — 通过 Onchain OS API
    const res = await okxClient.request(
      'POST',
      '/api/v5/waas/wallet/create-wallet',
      this.creds,
      { userId, chains: ['1', '501', '0'] }
    );
    if (res.code !== '0') {
      throw new Error(`[H_WalletApi] createWallet 失败: ${res.msg}`);
    }
    const wallets = res.data || [];
    return wallets.map((w: any, idx: number) => ({
      chain: this._chainFromId(w.chainId || '1'),
      address: w.address || '',
      isDefault: idx === 0,
    }));
  }

  async getAddresses(): Promise<H_WalletAddress[]> {
    const res = await okxClient.request(
      'GET',
      '/api/v5/waas/wallet/addresses',
      this.creds
    );
    if (res.code !== '0') {
      throw new Error(`[H_WalletApi] getAddresses 失败: ${res.msg}`);
    }
    return (res.data || []).map((a: any, idx: number) => ({
      chain: this._chainFromId(a.chainId || '1'),
      address: a.address || '',
      isDefault: idx === 0,
    }));
  }

  async getTokenBalances(chain?: H_Chain): Promise<H_TokenBalance[]> {
    const chainId = chain ? CHAIN_ID_MAP[chain] : undefined;
    const query = chainId ? `?chainId=${chainId}` : '';
    const res = await okxClient.request(
      'GET',
      `/api/v5/waas/asset/token-balances${query}`,
      this.creds
    );
    if (res.code !== '0') {
      throw new Error(`[H_WalletApi] getTokenBalances 失败: ${res.msg}`);
    }
    return (res.data || []).map((t: any) => ({
      chain: this._chainFromId(t.chainId || '1'),
      tokenSymbol: t.symbol || '',
      tokenAddress: t.tokenAddress || '',
      balance: parseFloat(t.balance || '0'),
      usdtValue: parseFloat(t.usdValue || '0'),
      iconUrl: t.logoUrl,
    }));
  }

  async getTotalBalance(): Promise<number> {
    const balances = await this.getTokenBalances();
    return balances.reduce((sum, b) => sum + b.usdtValue, 0);
  }

  async transfer(params: H_TransferParams): Promise<H_TransferResult> {
    const chainId = CHAIN_ID_MAP[params.chain];
    const res = await okxClient.request(
      'POST',
      '/api/v5/waas/transaction/send',
      this.creds,
      {
        chainId,
        tokenAddress: params.tokenAddress,
        toAddress: params.toAddress,
        amount: String(params.amount),
      }
    );
    if (res.code !== '0') {
      throw new Error(`[H_WalletApi] transfer 失败: ${res.msg}`);
    }
    const tx = res.data?.[0] || {};
    return {
      txHash: tx.txHash || '',
      status: 'pending',
      chain: params.chain,
      fromAddress: tx.fromAddress || '',
      toAddress: params.toAddress,
      amount: params.amount,
      fee: parseFloat(tx.fee || '0'),
    };
  }

  async getTransferHistory(chain?: H_Chain, limit = 20): Promise<H_TransferResult[]> {
    const chainId = chain ? CHAIN_ID_MAP[chain] : undefined;
    const query = chainId ? `?chainId=${chainId}&limit=${limit}` : `?limit=${limit}`;
    const res = await okxClient.request(
      'GET',
      `/api/v5/waas/transaction/history${query}`,
      this.creds
    );
    if (res.code !== '0') {
      throw new Error(`[H_WalletApi] getTransferHistory 失败: ${res.msg}`);
    }
    return (res.data || []).map((tx: any) => ({
      txHash: tx.txHash || '',
      status: tx.status === '2' ? 'confirmed' : tx.status === '3' ? 'failed' : 'pending',
      chain: this._chainFromId(tx.chainId || '1'),
      fromAddress: tx.fromAddress || '',
      toAddress: tx.toAddress || '',
      amount: parseFloat(tx.amount || '0'),
      fee: parseFloat(tx.fee || '0'),
    }));
  }

  /** 内部工具：chainId → H_Chain */
  private _chainFromId(chainId: string): H_Chain {
    switch (chainId) {
      case '501': return 'Solana';
      case '0': return 'Bitcoin';
      default: return 'EVM';
    }
  }
}
