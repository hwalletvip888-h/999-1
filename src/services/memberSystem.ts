/**
 * memberSystem — 从卡库派生会员等级、进度、权益。
 *
 * 会员系统两条路径（PRD 产品规划精华.md）：
 *   A. 付费订阅：Free / Pro $29 / Elite $99
 *   B. 累积卡片自然升级（不付费也能进阶）
 *
 * 当前实现 B 路径的纯算法层，A 路径所需的字段（paidTier 等）预留在签名里。
 * 不引入第三方依赖，所有计算从 cardLibrary.list() 派生。
 */
import { useEffect, useState } from "react";
import { cardLibrary, useCardLibrary, type SavedCard } from "./cardLibrary";
import type { CardRarity } from "../types/card";

export type MemberTier = "Lv0" | "Lv1" | "Lv2" | "Lv3" | "Lv4" | "Lv5";

export type MemberPaidTier = "Free" | "Pro" | "Elite";

export type MemberProfile = {
  tier: MemberTier;
  tierLabel: string;            // 中文头衔
  tierColor: string;             // 主色（用于卡片渐变 / 徽章）
  paidTier: MemberPaidTier;      // 付费侧（默认 Free，预留升级钩子）
  // ── 进度 ──
  cardsCount: number;
  legendaryCount: number;
  mythicCount: number;
  cumulativeVolumeUsd: number;
  cumulativePnlUsd: number;
  // ── 升级条件（向 UI 展示「再差 N 张稀有卡到 Lv3」这种）──
  nextTier: MemberTier | null;
  nextTierLabel: string;
  progressPct: number;           // 0..100
  progressHint: string;          // 中文进度提示
  // ── 解锁权益（中文短句，UI 直接展示）──
  benefits: string[];
};

const TIER_CONFIG: Array<{
  tier: MemberTier;
  label: string;
  color: string;
  cards: number;
  rare: number;
  benefits: string[];
}> = [
  { tier: "Lv0", label: "新人", color: "#9CA3AF", cards: 0, rare: 0, benefits: ["AI 对话", "卡库基础统计"] },
  { tier: "Lv1", label: "见习交易员", color: "#7B5BC7", cards: 5, rare: 0, benefits: ["策略推荐增强", "社区分享"] },
  { tier: "Lv2", label: "策略玩家", color: "#4338CA", cards: 20, rare: 1, benefits: ["免费 AI 策略 1 条", "卡片稀有度系统解锁"] },
  { tier: "Lv3", label: "进阶者", color: "#15803D", cards: 50, rare: 3, benefits: ["AI 紧急平仓秒级响应", "聪明钱信号订阅"] },
  { tier: "Lv4", label: "鲸友", color: "#B45309", cards: 100, rare: 6, benefits: ["机构级风控（双止损）", "DeFi 利差额外 1%"] },
  { tier: "Lv5", label: "传奇", color: "#D9AA43", cards: 200, rare: 10, benefits: ["策略并发数无限", "传说+神话卡上链 NFT"] }
];

/** 根据卡库快照计算等级。 */
export function computeMemberProfile(saved: SavedCard[], paidTier: MemberPaidTier = "Free"): MemberProfile {
  const cardsCount = saved.length;
  let legendaryCount = 0;
  let mythicCount = 0;
  let volume = 0;
  let pnl = 0;
  for (const c of saved) {
    const r: CardRarity | undefined = c.rarity;
    if (r === "legendary") legendaryCount++;
    if (r === "mythic") mythicCount++;
    if (typeof c.volumeUsdt === "number") volume += c.volumeUsdt;
    if (typeof c.pnlUsdt === "number") pnl += c.pnlUsdt;
  }
  const rareCount = legendaryCount + mythicCount;

  // 找到当前满足条件的最高等级
  let currentIdx = 0;
  for (let i = 0; i < TIER_CONFIG.length; i++) {
    const cfg = TIER_CONFIG[i];
    if (cardsCount >= cfg.cards && rareCount >= cfg.rare) currentIdx = i;
  }
  const cur = TIER_CONFIG[currentIdx];
  const next = TIER_CONFIG[currentIdx + 1] ?? null;

  // 进度计算：用更卡的那个维度衡量（卡片数 vs 稀有数）
  let progressPct = 100;
  let progressHint = "已达最高等级";
  if (next) {
    const cardsRatio = next.cards > cur.cards
      ? Math.min(100, ((cardsCount - cur.cards) / (next.cards - cur.cards)) * 100)
      : 100;
    const rareRatio = next.rare > cur.rare
      ? Math.min(100, ((rareCount - cur.rare) / (next.rare - cur.rare)) * 100)
      : 100;
    progressPct = Math.max(0, Math.min(100, Math.min(cardsRatio, rareRatio)));
    const cardsRemaining = Math.max(0, next.cards - cardsCount);
    const rareRemaining = Math.max(0, next.rare - rareCount);
    if (rareRemaining > 0 && cardsRemaining > 0) {
      progressHint = `再 ${cardsRemaining} 张卡 + ${rareRemaining} 张稀有卡升 ${next.label}`;
    } else if (cardsRemaining > 0) {
      progressHint = `再 ${cardsRemaining} 张卡升 ${next.label}`;
    } else if (rareRemaining > 0) {
      progressHint = `再 ${rareRemaining} 张稀有卡升 ${next.label}`;
    } else {
      progressHint = `已达 ${next.label} 升级条件，下一次操作后生效`;
    }
  }

  return {
    tier: cur.tier,
    tierLabel: cur.label,
    tierColor: cur.color,
    paidTier,
    cardsCount,
    legendaryCount,
    mythicCount,
    cumulativeVolumeUsd: +volume.toFixed(2),
    cumulativePnlUsd: +pnl.toFixed(2),
    nextTier: next ? next.tier : null,
    nextTierLabel: next ? next.label : cur.label,
    progressPct: Math.round(progressPct),
    progressHint,
    benefits: cur.benefits
  };
}

/** Hook：响应式订阅会员 profile。 */
export function useMemberProfile(paidTier: MemberPaidTier = "Free"): MemberProfile {
  const list = useCardLibrary();
  const [profile, setProfile] = useState<MemberProfile>(() => computeMemberProfile(list, paidTier));
  useEffect(() => {
    setProfile(computeMemberProfile(list, paidTier));
  }, [list, paidTier]);
  return profile;
}

/** 工具：当前等级（同步获取，用于非 React 上下文） */
export function getCurrentTier(paidTier: MemberPaidTier = "Free"): MemberProfile {
  return computeMemberProfile(cardLibrary.list(), paidTier);
}
