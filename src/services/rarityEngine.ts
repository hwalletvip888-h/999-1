/**
 * rarityEngine — 卡片稀有度自动评级
 *
 * 设计目标（PRD 产品规划精华.md「卡库系统」）：
 *   - 5 级：common（普通）/ fine（精良）/ rare（稀有）/ legendary（传说）/ mythic（神话）
 *   - 由真实战绩自动派生，不需要用户主观操作
 *   - 喂给 memberSystem：legendary + mythic 数量决定能否升级 Lv2/Lv3/Lv4/Lv5
 *   - 第二阶段会把 legendary / mythic 上链 NFT，因此评分必须可复现
 *
 * 评级维度（按 max 取最高级别）：
 *   1. 名义成交额 / 投入额（volumeUsdt）
 *   2. 单笔盈亏（pnlUsdt）
 *   3. 杠杆水平（合约）
 *   4. 信号质量（V6 signal 卡：securityScore + apr）
 *   5. 卡片类型加成：signal / achievement 起步即 fine
 *
 * 输入只看「确定数值」，不依赖未来才能定的字段（成交日期等），保证可复现。
 */
import type { CardRarity, HWalletCard } from "../types/card";

type RarityRank = 0 | 1 | 2 | 3 | 4;
const RANK_TO_RARITY: Record<RarityRank, CardRarity> = {
  0: "common",
  1: "fine",
  2: "rare",
  3: "legendary",
  4: "mythic"
};

function rankFromVolume(v: number): RarityRank {
  if (v >= 100_000) return 4;
  if (v >= 10_000) return 3;
  if (v >= 1_000) return 2;
  if (v >= 100) return 1;
  return 0;
}

/** 单笔盈利金额对应的级别（亏损同样可贵 — 以绝对值计） */
function rankFromPnl(pnl: number): RarityRank {
  const abs = Math.abs(pnl);
  if (abs >= 1_000) return 4;
  if (abs >= 200) return 3;
  if (abs >= 50) return 2;
  if (abs >= 10) return 1;
  return 0;
}

/** 杠杆加成：>=50 给 +1（不会单独决定，但会把 fine 推到 rare） */
function leverageBoost(card: HWalletCard): number {
  if (card.module !== "perpetual" && card.category !== "perpetual") return 0;
  const lev = typeof card.leverage === "number"
    ? card.leverage
    : parseFloat((card.leverage ?? "1").toString().replace(/[^\d.]/g, "")) || 1;
  if (lev >= 50) return 1;
  return 0;
}

/** signal 卡：高安全分 + 高 APR 加成 */
function rankFromSignal(card: HWalletCard): RarityRank {
  if (card.cardType !== "signal") return 0;
  const sec = card.securityScore ?? 70;
  const apr = parseFloat((card.protocolApr ?? "0").toString().replace(/[^\d.]/g, "")) || 0;
  if (sec >= 90 && apr >= 30) return 3;   // 高安全 + 高息 → legendary
  if (sec >= 85 && apr >= 15) return 2;   // 高安全 + 中息 → rare
  if (sec >= 75) return 1;                // 安全 → fine
  return 0;
}

/** 卡片类型起步保底 */
function baseRankFromType(card: HWalletCard): RarityRank {
  if (card.cardType === "achievement") return 2; // 成就卡至少 rare
  if (card.cardType === "signal") return 1;       // 信号卡至少 fine
  return 0;
}

/**
 * 计算稀有度：取所有维度最大值
 * 注：这个函数纯函数，可在前后端任意调用，结果稳定
 */
export function computeRarity(card: HWalletCard, derived: { pnlUsdt?: number; volumeUsdt?: number } = {}): CardRarity {
  const volume = derived.volumeUsdt ?? 0;
  const pnl = derived.pnlUsdt ?? 0;

  const ranks: RarityRank[] = [
    baseRankFromType(card),
    rankFromVolume(volume),
    rankFromPnl(pnl),
    rankFromSignal(card)
  ];

  let max = Math.max(...ranks) as RarityRank;
  // 杠杆加成（最多顶到 mythic）
  const boosted = Math.min(4, max + leverageBoost(card)) as RarityRank;
  return RANK_TO_RARITY[boosted];
}

/** UI 展示用：稀有度对应的中文 / 颜色 / 图标，方便组件直接读取 */
export const RARITY_PRESET: Record<CardRarity, { label: string; color: string; bg: string; icon: string }> = {
  common:    { label: "普通", color: "#6B7280", bg: "#F3F4F6", icon: "·" },
  fine:      { label: "精良", color: "#2563EB", bg: "#DBEAFE", icon: "✦" },
  rare:      { label: "稀有", color: "#7C3AED", bg: "#EDE9FE", icon: "✧" },
  legendary: { label: "传说", color: "#B45309", bg: "#FEF3C7", icon: "★" },
  mythic:    { label: "神话", color: "#BE185D", bg: "#FCE7F3", icon: "✪" }
};
