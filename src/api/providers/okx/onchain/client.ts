import { loadOkxCredentials } from "../../../../config/okx";
import { getHwalletApiBase } from "../../../../services/walletApiCore";
import { callBackend } from "./hwalletBackendFetch";
import { normalizePortfolioPayload } from "./portfolioNormalize";
import type {
  ChainId,
  DefiOpportunity,
  DefiPosition,
  DexSignal,
  DexSwapExecuteResult,
  DexSwapQuote,
  WalletPortfolio,
  WalletSendResult,
} from "./types";

export const okxOnchainClient = {
  async getWalletPortfolio(token: string): Promise<{ data: WalletPortfolio; simulationMode: boolean }> {
    const backendBase = getHwalletApiBase();

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[okxOnchainClient] getWalletPortfolio backendBase:", backendBase || "(未配置)");
    }

    if (!backendBase) {
      throw new Error("未配置 EXPO_PUBLIC_HWALLET_API_BASE，无法经后端拉取钱包资产。");
    }
    const raw = await callBackend<any>("/api/v6/wallet/portfolio", { token });
    const normalized = normalizePortfolioPayload(raw);
    if (!normalized) {
      throw new Error("OKX 官方余额接口返回异常");
    }
    return { data: normalized, simulationMode: false };
  },

  async getSwapQuote(
    params: {
      fromChain: ChainId;
      fromSymbol: string;
      fromAmount: string;
      toChain: ChainId;
      toSymbol: string;
      slippageBps?: number;
    },
    token?: string,
  ): Promise<{ data: DexSwapQuote; simulationMode: boolean }> {
    const creds = loadOkxCredentials();
    const builderCode = creds?.builderCode;
    const data = await callBackend<DexSwapQuote>("/api/v6/dex/swap-quote", {
      method: "POST",
      body: { ...params, builderCode },
      token,
      builderCode,
    });
    return { data, simulationMode: false };
  },

  async executeSwap(
    params: {
      fromChain: ChainId;
      fromSymbol: string;
      fromAmount: string;
      toChain: ChainId;
      toSymbol: string;
      slippageBps?: number;
    },
    token?: string,
  ): Promise<{ data: DexSwapExecuteResult; simulationMode: boolean }> {
    const creds = loadOkxCredentials();
    const builderCode = creds?.builderCode;
    const data = await callBackend<DexSwapExecuteResult>("/api/v6/dex/swap-execute", {
      method: "POST",
      body: { ...params, builderCode },
      token,
      builderCode,
    });
    return { data, simulationMode: false };
  },

  async sendWalletTransfer(
    params: {
      chain: ChainId;
      symbol: string;
      toAddress: string;
      amount: string;
      tokenAddress?: string;
    },
    token: string,
  ): Promise<{ data: WalletSendResult; simulationMode: boolean }> {
    const data = await callBackend<WalletSendResult>("/api/v6/wallet/send", {
      method: "POST",
      body: params,
      token,
    });
    return { data, simulationMode: false };
  },

  async discoverOpportunities(
    filter: { minApr?: number; chain?: ChainId; riskTag?: "low" | "medium" | "high" } = {},
    token?: string,
  ): Promise<{ data: DefiOpportunity[]; simulationMode: boolean }> {
    const data = await callBackend<DefiOpportunity[]>("/api/v6/defi/discover", {
      method: "POST",
      body: filter,
      token,
    });
    return { data: Array.isArray(data) ? data : [], simulationMode: false };
  },

  async getDefiPositions(token: string): Promise<{ data: DefiPosition[]; simulationMode: boolean }> {
    const data = await callBackend<DefiPosition[]>("/api/v6/defi/portfolio", { token });
    return { data: Array.isArray(data) ? data : [], simulationMode: false };
  },

  async fetchSignals(
    filter: { signalType?: "smart_money_buy" | "kol_call" | "trenches_new"; chain?: ChainId } = {},
    token?: string,
  ): Promise<{ data: DexSignal[]; simulationMode: boolean }> {
    const data = await callBackend<DexSignal[]>("/api/v6/dex/signal", {
      method: "POST",
      body: filter,
      token,
    });
    return { data: Array.isArray(data) ? data : [], simulationMode: false };
  },

  async securityScan(
    params: { contract: string; chain: ChainId },
    token?: string,
  ): Promise<{ data: { score: number; flags: string[]; isHoneypot: boolean }; simulationMode: boolean }> {
    const data = await callBackend<{ score: number; flags: string[]; isHoneypot: boolean }>("/api/v6/security/scan", {
      method: "POST",
      body: params,
      token,
    });
    return { data, simulationMode: false };
  },
};
