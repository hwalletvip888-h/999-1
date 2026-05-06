import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CardStatus, TradeCard } from "../types";
import { computeRarity } from "./rarityEngine";

/**
 * 卡库 (Card Library) — 用户已确认 / 进行中的卡片落地存储。
 * 简单的模块级单例 + subscribe，避免引入额外依赖。
 * 已接入 AsyncStorage：启动自动 hydrate，变更自动持久化（debounced）。
 */

export type SavedCard = TradeCard & {
  savedAt: number; // ms epoch
  pnlUsdt: number; // 归档时计算的盈亏（USDT）
  volumeUsdt: number; // 归档时计算的「成交额」（USDT），用于活跃度统计
};
// 供 types/index.ts 统一 re-export

const STORAGE_KEY = "@hwallet/cardLibrary/v1";

let saved: SavedCard[] = [];
let firstSavedAt: number | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (!hydrated) return; // 避免 hydrate 之前覆盖磁盘
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ saved, firstSavedAt })
    ).catch(() => {
      /* 忽略写入失败 */
    });
  }, 300);
}

function notify() {
  listeners.forEach((fn) => fn());
  schedulePersist();
}

// 启动时 hydrate
(async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { saved?: SavedCard[]; firstSavedAt?: number | null };
      if (Array.isArray(parsed.saved)) saved = parsed.saved;
      if (typeof parsed.firstSavedAt === "number") firstSavedAt = parsed.firstSavedAt;
    }
  } catch {
    /* 忽略损坏 */
  } finally {
    hydrated = true;
    if (saved.length > 0) listeners.forEach((fn) => fn());
  }
})();

/** 估算一张卡的「贡献盈亏」(USDT)。Mock：合约用 amount × pnl%；Agent/Stake 用预估值。 */
function estimatePnl(card: TradeCard): number {
  switch (card.category) {
    case "perpetual": {
      const amountRow = card.rows?.find((r) => r.label === "金额");
      const amount = amountRow ? parseFloat(amountRow.value) : 100;
      return +(((amount * (card.pnlPercent ?? 0)) / 100)).toFixed(2);
    }
    case "agent": {
      // agentTotalProfit 形如 "+12.4 U"
      const m = (card.agentTotalProfit ?? "").match(/-?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : 0;
    }
    case "stake": {
      // 给一个小的「已生息」mock：年化的 3 天份
      const apy = parseFloat(card.stakeApy ?? "0") / 100;
      const amt = parseFloat((card.stakeAmount ?? "0").replace(/[^\d.]/g, "")) || 0;
      return +((amt * apy * (3 / 365))).toFixed(2);
    }
    case "swap":
    default:
      return 0;
  }
}

/** 估算一张卡的「成交额 / 投入额」(USDT)。给兑换量、合约名义、质押本金做统计。 */
function estimateVolume(card: TradeCard): number {
  switch (card.category) {
    case "perpetual": {
      const amountRow = card.rows?.find((r) => r.label === "金额");
      const amount = amountRow ? parseFloat(amountRow.value) : 0;
      const lev = typeof card.leverage === "number"
        ? card.leverage
        : parseFloat((card.leverage ?? "1").toString().replace(/[^\d.]/g, "")) || 1;
      // 名义成交额 = 保证金 × 杠杆
      return +(amount * lev).toFixed(2);
    }
    case "swap": {
      // fromAmount 已是字符串，可能含逗号
      const v = typeof card.fromAmount === "number"
        ? card.fromAmount
        : parseFloat((card.fromAmount ?? "0").toString().replace(/,/g, "")) || 0;
      return +v.toFixed(2);
    }
    case "stake": {
      return parseFloat((card.stakeAmount ?? "0").replace(/[^\d.]/g, "")) || 0;
    }
    case "agent":
    default:
      return 0;
  }
}

export const cardLibrary = {
  list(): SavedCard[] {
    return saved;
  },
  firstSavedAt(): number | null {
    return firstSavedAt;
  },
  totalPnl(): number {
    return +saved.reduce((sum, c) => sum + (c.pnlUsdt ?? 0), 0).toFixed(2);
  },
  totalSwapVolume(): number {
    return +saved
      .filter((c) => c.category === "swap")
      .reduce((sum, c) => sum + (c.volumeUsdt ?? 0), 0)
      .toFixed(2);
  },
  /** 基于卡库行为做画像分析，给 AI 投顾用。 */
  analyze(): LibraryAnalysis {
    return analyzeLibrary(saved);
  },
  add(card: TradeCard) {
    const now = Date.now();
    if (!firstSavedAt) firstSavedAt = now;
    const pnlUsdt = estimatePnl(card);
    const volumeUsdt = estimateVolume(card);
    // 自动评级稀有度（如果卡片自带 rarity 则尊重原值，例如 achievement 卡）
    const rarity = card.rarity ?? computeRarity(card, { pnlUsdt, volumeUsdt });
    const enriched: SavedCard = {
      ...card,
      rarity,
      savedAt: now,
      pnlUsdt,
      volumeUsdt
    };
    // 同 id 去重 → 取最新状态
    saved = [enriched, ...saved.filter((c) => c.id !== card.id)];
    notify();
  },
  updateStatus(cardId: string, status: CardStatus) {
    saved = saved.map((c) => (c.id === cardId ? { ...c, status } : c));
    notify();
  },
  remove(cardId: string) {
    saved = saved.filter((c) => c.id !== cardId);
    notify();
  },
  clear() {
    saved = [];
    firstSavedAt = null;
    notify();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }
};

/** React hook —— 订阅卡库变更，返回最新列表。 */
export function useCardLibrary(): SavedCard[] {
  const [list, setList] = useState<SavedCard[]>(cardLibrary.list());
  useEffect(() => {
    const unsubscribe = cardLibrary.subscribe(() => setList([...cardLibrary.list()]));
    return () => { unsubscribe(); };
  }, []);
  return list;
}

/* ─────────────────────────────────────────────
   AI 投顾画像分析
   ───────────────────────────────────────────── */

export type Insight = {
  id: string;
  level: "info" | "warn" | "good";
  icon: string; // emoji
  text: string;
};

export type Suggestion = {
  id: string;
  label: string; // 按钮上展示的短文案
  prompt: string; // 点击后回填到聊天输入框的完整 prompt
};

export type LibraryAnalysis = {
  /** 风险评分 0~100，越高越激进 */
  riskScore: number;
  /** 风险标签 */
  riskTag: "稳健" | "均衡" | "激进" | "高风险";
  /** 类别配比（百分比） */
  mix: { perpetual: number; swap: number; agent: number; stake: number };
  /** 最常交易的标的 */
  topSymbol: string | null;
  /** 平均杠杆 */
  avgLeverage: number;
  /** 合约胜率（已结算 + 未结算的预估） */
  perpWinRate: number | null;
  insights: Insight[];
  suggestions: Suggestion[];
};

function analyzeLibrary(list: SavedCard[]): LibraryAnalysis {
  const counts = { perpetual: 0, swap: 0, agent: 0, stake: 0 };
  const volumes = { perpetual: 0, swap: 0, agent: 0, stake: 0 };
  const symbolCount: Record<string, number> = {};
  let leverageSum = 0;
  let leverageN = 0;
  let perpWin = 0;
  let perpTotal = 0;

  for (const c of list) {
    if (c.category && c.category in counts) counts[c.category as keyof typeof counts]++;
    if (c.category && c.category in volumes) volumes[c.category as keyof typeof volumes] += c.volumeUsdt ?? 0;

    if (c.category === "perpetual") {
      const sym = c.pair?.replace(/USDT$/i, "") ?? "BTC";
      symbolCount[sym] = (symbolCount[sym] ?? 0) + 1;
      const lev = typeof c.leverage === "number"
        ? c.leverage
        : parseFloat((c.leverage ?? "1").toString().replace(/[^\d.]/g, "")) || 1;
      leverageSum += lev;
      leverageN++;
      if (typeof c.pnlPercent === "number") {
        perpTotal++;
        if (c.pnlPercent > 0) perpWin++;
      }
    }
    if (c.category === "swap") {
      const sym = c.toSymbol ?? "";
      if (sym) symbolCount[sym] = (symbolCount[sym] ?? 0) + 1;
    }
  }

  const total = list.length || 1;
  const mix = {
    perpetual: Math.round((counts.perpetual / total) * 100),
    swap: Math.round((counts.swap / total) * 100),
    agent: Math.round((counts.agent / total) * 100),
    stake: Math.round((counts.stake / total) * 100)
  };

  const avgLeverage = leverageN ? +(leverageSum / leverageN).toFixed(1) : 0;
  const perpWinRate = perpTotal ? Math.round((perpWin / perpTotal) * 100) : null;
  const topSymbol =
    Object.entries(symbolCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // 风险评分：合约占比 × 0.5 + 杠杆/100 × 0.3 + (1-质押占比/100) × 0.2
  const riskScore = Math.min(
    100,
    Math.round(mix.perpetual * 0.5 + Math.min(avgLeverage, 100) * 0.3 + (100 - mix.stake) * 0.2)
  );
  const riskTag: LibraryAnalysis["riskTag"] =
    riskScore >= 75 ? "高风险" : riskScore >= 55 ? "激进" : riskScore >= 30 ? "均衡" : "稳健";

  /* —— 生成洞察 —— */
  const insights: Insight[] = [];

  if (topSymbol && symbolCount[topSymbol] >= 2) {
    const pct = Math.round((symbolCount[topSymbol] / total) * 100);
    if (pct >= 50) {
      insights.push({
        id: "concentration",
        level: "warn",
        icon: "🎯",
        text: `${pct}% 的卡片集中在 ${topSymbol}，单一标的暴露较高，建议适当分散。`
      });
    } else {
      insights.push({
        id: "favorite",
        level: "info",
        icon: "⭐",
        text: `你最常交易的是 ${topSymbol}（${symbolCount[topSymbol]} 张），可以关注它的链上资金面。`
      });
    }
  }

  if (avgLeverage >= 20) {
    insights.push({
      id: "leverage",
      level: "warn",
      icon: "⚠️",
      text: `平均杠杆 ${avgLeverage}x，高于稳健区间 (≤10x)，行情波动 5% 即可触发强平。`
    });
  } else if (avgLeverage > 0 && avgLeverage <= 5) {
    insights.push({
      id: "leverage-low",
      level: "good",
      icon: "🛡️",
      text: `平均杠杆 ${avgLeverage}x，仓位控制扎实，适合长线持有。`
    });
  }

  if (perpWinRate !== null && perpTotal >= 3) {
    if (perpWinRate >= 60) {
      insights.push({
        id: "winrate-high",
        level: "good",
        icon: "🎯",
        text: `合约胜率 ${perpWinRate}%（${perpTotal} 单），手感不错，可以考虑跑一个跟单 Agent 放大收益。`
      });
    } else if (perpWinRate <= 40) {
      insights.push({
        id: "winrate-low",
        level: "warn",
        icon: "📉",
        text: `合约胜率仅 ${perpWinRate}%，建议先复盘最近 3 单，再降低杠杆试手。`
      });
    }
  }

  if (mix.stake < 10 && total >= 3) {
    insights.push({
      id: "no-stake",
      level: "info",
      icon: "🌱",
      text: `质押类仅占 ${mix.stake}%，配置 20-30% 稳健生息可以平衡组合波动。`
    });
  } else if (mix.stake >= 40) {
    insights.push({
      id: "stake-heavy",
      level: "good",
      icon: "🌿",
      text: `质押类占 ${mix.stake}%，被动收益结构清晰，可保留少量仓位捕捉行情。`
    });
  }

  if (mix.swap >= 50) {
    insights.push({
      id: "swap-heavy",
      level: "info",
      icon: "🔄",
      text: `兑换类占 ${mix.swap}%，更像现货囤币党，可考虑 DCA 定投 Agent 减少时机焦虑。`
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "starter",
      level: "info",
      icon: "✨",
      text: `数据样本较少，多操作几张卡后我能给出更精准的建议。`
    });
  }

  /* —— 生成动作建议 —— */
  const suggestions: Suggestion[] = [];

  if (avgLeverage >= 20) {
    suggestions.push({
      id: "lower-lev",
      label: "降到 10x 重开",
      prompt: `把上一单 ${topSymbol ?? "BTC"} 永续杠杆降到 10x 重新开一笔，仓位 100U`
    });
  }
  if (mix.stake < 20 && total >= 2) {
    suggestions.push({
      id: "add-stake",
      label: "配 30% 质押",
      prompt: `帮我把 30% 仓位配置到 Aave/Lido 稳健质押，用 USDC 做计价`
    });
  }
  if (perpWinRate !== null && perpWinRate >= 60) {
    suggestions.push({
      id: "run-agent",
      label: "跟单 Agent",
      prompt: `按我最近做${(list.find((c) => c.category === "perpetual")?.direction === "做多") ? "多" : "空"} ${topSymbol ?? "BTC"} 的策略跑一个跟单 Agent`
    });
  }
  if (mix.swap >= 50) {
    suggestions.push({
      id: "dca",
      label: "试试 DCA",
      prompt: `给我配置一个每周定投 ${topSymbol ?? "ETH"} 的 DCA Agent，每次 50U`
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      id: "balance",
      label: "做个均衡组合",
      prompt: `根据我的卡库现状，帮我设计一个 40% 现货 / 30% 质押 / 30% 合约的均衡组合`
    });
  }

  return {
    riskScore,
    riskTag,
    mix,
    topSymbol,
    avgLeverage,
    perpWinRate,
    insights,
    suggestions: suggestions.slice(0, 3)
  };
}

