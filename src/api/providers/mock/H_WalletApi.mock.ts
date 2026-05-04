/**
 * H_WalletApi Mock 实现
 */

import type {
  IH_WalletApi,
  H_WalletAddress,
  H_TokenBalance,
  H_TransferParams,
  H_TransferResult,
  H_Chain,
} from '../../contracts/H_WalletApi';

const MOCK_ADDRESSES: H_WalletAddress[] = [
  { chain: 'EVM', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD3e', isDefault: true },
  { chain: 'Solana', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', isDefault: true },
];

export class MockH_WalletApi implements IH_WalletApi {
  async createWallet(_userId: string): Promise<H_WalletAddress[]> {
    return MOCK_ADDRESSES;
  }

  async getAddresses(): Promise<H_WalletAddress[]> {
    return MOCK_ADDRESSES;
  }

  async getTokenBalances(chain?: H_Chain): Promise<H_TokenBalance[]> {
    const all: H_TokenBalance[] = [
      { chain: 'EVM', tokenSymbol: 'USDT', tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', balance: 5200, usdtValue: 5200 },
      { chain: 'EVM', tokenSymbol: 'ETH', tokenAddress: '0x0000000000000000000000000000000000000000', balance: 1.5, usdtValue: 5175 },
      { chain: 'Solana', tokenSymbol: 'SOL', tokenAddress: 'So11111111111111111111111111111111111111112', balance: 30, usdtValue: 5340 },
      { chain: 'Solana', tokenSymbol: 'USDC', tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', balance: 2000, usdtValue: 2000 },
    ];
    if (chain) return all.filter((t) => t.chain === chain);
    return all;
  }

  async getTotalBalance(): Promise<number> {
    const balances = await this.getTokenBalances();
    return balances.reduce((sum, b) => sum + b.usdtValue, 0);
  }

  async transfer(params: H_TransferParams): Promise<H_TransferResult> {
    return {
      txHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
      status: 'confirmed',
      chain: params.chain,
      fromAddress: MOCK_ADDRESSES.find((a) => a.chain === params.chain)?.address || '',
      toAddress: params.toAddress,
      amount: params.amount,
      fee: 0.5,
    };
  }

  async getTransferHistory(_chain?: H_Chain, _limit = 20): Promise<H_TransferResult[]> {
    return [
      {
        txHash: '0xabc123def456',
        status: 'confirmed',
        chain: 'EVM',
        fromAddress: MOCK_ADDRESSES[0].address,
        toAddress: '0x1234567890abcdef1234567890abcdef12345678',
        amount: 100,
        fee: 0.5,
      },
    ];
  }
}
