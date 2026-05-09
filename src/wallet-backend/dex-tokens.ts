/**
 * 链别映射、常用代币合约（与 CLI swap/send 一致）
 */
import { runOnchainosJson } from "./onchainos-cli";

export function mapClientChainToCli(chain: string): string {
  const v = String(chain || "").toLowerCase();
  if (v === "xlayer") return "xlayer";
  if (v === "solana") return "solana";
  if (v === "base") return "base";
  if (v === "arbitrum") return "arbitrum";
  if (v === "bsc") return "bsc";
  if (v === "polygon") return "polygon";
  return "ethereum";
}

export const NATIVE_EVM = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const NATIVE_SOL = "So11111111111111111111111111111111111111112";

const TOKEN_BY_CHAIN: Record<string, Record<string, string>> = {
  xlayer: {
    OKB: NATIVE_EVM,
    USDT: "0x1e4a5963abfd975d8c9021ce480b42188849d41d",
    USDC: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
    ETH: "0x5a77f1443d16ee5761d310e38b62f77f726bc71c",
    WBTC: "0xea034fb02eb1808c2cc3adbc15f447b93cbe08e1",
  },
  ethereum: {
    ETH: NATIVE_EVM,
    WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    DAI: "0x6b175474e89094c44da98b954eedeac495271d0f",
    WBTC: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    OKB: "0x75231f58b43240c9718dd58b4967c5114342a86c",
  },
  bsc: {
    BNB: NATIVE_EVM,
    USDT: "0x55d398326f99059ff775485246999027b3197955",
    USDC: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    ETH: "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
  },
  polygon: {
    MATIC: NATIVE_EVM,
    USDT: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    USDC: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    WETH: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
    ETH: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
  },
  arbitrum: {
    ETH: NATIVE_EVM,
    USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    USDC: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    WBTC: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
  },
  base: {
    ETH: NATIVE_EVM,
    USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    USDT: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
  },
  solana: {
    SOL: NATIVE_SOL,
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  },
};

export function symbolToContract(symbol: string, chain: string): string {
  const s = String(symbol || "").trim().toUpperCase();
  const c = mapClientChainToCli(chain);
  if (!s) return "";
  if (s.startsWith("0X") && s.length === 42) return s.toLowerCase();
  if (c === "solana" && s.length >= 32 && s.length <= 64 && !s.includes(" ")) return symbol;
  return TOKEN_BY_CHAIN[c]?.[s] || "";
}

export function pickWalletAddressByChain(addresses: any, chain: string): string {
  const cliChain = mapClientChainToCli(chain);
  if (cliChain === "solana") {
    const a = addresses?.solana?.[0]?.address;
    return a && a !== "N/A" ? String(a) : "";
  }
  if (cliChain === "xlayer") {
    const a = addresses?.xlayer?.[0]?.address || addresses?.evm?.[0]?.address;
    return a && a !== "N/A" ? String(a) : "";
  }
  const a = addresses?.evm?.[0]?.address;
  return a && a !== "N/A" ? String(a) : "";
}

export function pickSignerAddressForChain(home: string, clientChain: string): string {
  let data: any;
  try {
    data = runOnchainosJson(["wallet", "addresses"], home, 15_000);
  } catch {
    return "";
  }
  if (data?.ok === false) return "";
  const d = data?.data ?? {};
  const cli = mapClientChainToCli(clientChain);

  if (cli === "solana") {
    const arr = Array.isArray(d.solana) ? d.solana : [];
    const a = arr.find((x: any) => x?.address && x.address !== "N/A") ?? arr[0];
    return a?.address ? String(a.address) : "";
  }

  const evmArr: any[] = Array.isArray(d.evm) ? d.evm : [];

  if (cli === "xlayer") {
    const xl = Array.isArray(d.xlayer) ? d.xlayer : [];
    const xa = xl.find((x: any) => x?.address && x.address !== "N/A") ?? xl[0];
    if (xa?.address) return String(xa.address);
    const hit196 = evmArr.find((e: any) => String(e?.chainIndex ?? "") === "196");
    if (hit196?.address) return String(hit196.address);
    return evmArr[0]?.address ? String(evmArr[0].address) : "";
  }

  const chainIndexFor: Record<string, string> = {
    ethereum: "1",
    polygon: "137",
    arbitrum: "42161",
    base: "8453",
    bsc: "56",
    xlayer: "196",
  };
  const want = chainIndexFor[cli];
  if (want) {
    const hit = evmArr.find((e: any) => String(e?.chainIndex ?? "") === want);
    if (hit?.address) return String(hit.address);
  }

  const eth = evmArr.find((e: any) => String(e?.chainName ?? "").toLowerCase() === "eth");
  if (eth?.address) return String(eth.address);
  return evmArr[0]?.address ? String(evmArr[0].address) : "";
}

/** @deprecated 使用 pickSignerAddressForChain */
export function getCurrentWalletAddress(home: string, chain: string): string {
  return pickSignerAddressForChain(home, chain);
}
