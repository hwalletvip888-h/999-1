/**
 * H_WalletApi — Agent Wallet 接口契约
 * 职责：钱包创建 / 余额 / 转账 / 地址管理
 */

/** 链类型 */
export type H_Chain = 'EVM' | 'Solana' | 'Bitcoin';

/** 钱包地址 */
export interface H_WalletAddress {
  chain: H_Chain;
  address: string;
  /** 是否为默认地址 */
  isDefault: boolean;
}

/** 链上代币余额 */
export interface H_TokenBalance {
  chain: H_Chain;
  tokenSymbol: string;
  tokenAddress: string;
  balance: number;
  /** 折合 USDT */
  usdtValue: number;
  /** 代币图标 URL */
  iconUrl?: string;
}

/** 转账参数 */
export interface H_TransferParams {
  chain: H_Chain;
  tokenAddress: string;
  toAddress: string;
  amount: number;
}

/** 转账结果 */
export interface H_TransferResult {
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  chain: H_Chain;
  fromAddress: string;
  toAddress: string;
  amount: number;
  fee: number;
}

/** H_WalletApi 接口定义 */
export interface IH_WalletApi {
  /** 创建 Agent Wallet（注册时自动调用） */
  createWallet(userId: string): Promise<H_WalletAddress[]>;
  /** 获取钱包地址列表 */
  getAddresses(): Promise<H_WalletAddress[]>;
  /** 获取链上代币余额 */
  getTokenBalances(chain?: H_Chain): Promise<H_TokenBalance[]>;
  /** 获取总资产（折合 USDT） */
  getTotalBalance(): Promise<number>;
  /** 转账 */
  transfer(params: H_TransferParams): Promise<H_TransferResult>;
  /** 获取转账记录 */
  getTransferHistory(chain?: H_Chain, limit?: number): Promise<H_TransferResult[]>;
}
