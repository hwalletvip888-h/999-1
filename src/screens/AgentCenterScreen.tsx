/**
 * AgentCenterScreen — 综合呈现两大产品的运行情况
 *
 * 内容分两栏：
 *   ┌─ V5 智能交易（合约 / 网格策略）─┐
 *   ┌─ V6 智能钱包（链上赚币 / 信号机会）─┐
 *
 * 数据源：
 *   - cardLibrary.list() 过滤 running / executed → 当前活跃卡片
 *   - agentRunner.list()  → 真实策略执行状态
 *   - memberSystem.useMemberProfile → 顶部小型会员条
 *
 * 设计：奶白系背景，紫金高亮，与现有 WalletScreen 一致
 */
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Surface } from "../components/ui/Surface";
import { ChevronRightIcon, SparkIcon, CardStackIcon, LeafIcon, LockIcon } from "../components/ui/Icons";
import { useCardLibrary, type SavedCard } from "../services/cardLibrary";
import { useMemberProfile } from "../services/memberSystem";
import { useEmergencyState } from "../services/emergencyStop";
import { okxOnchainClient, type DefiOpportunity } from "../api/providers/okx/okxOnchainClient";
import type { AppView } from "../types";
import { uiColors, uiSpace } from "../theme/uiSystem";

type AgentCenterScreenProps = {
  onChangeView: (view: AppView) => void;
};

type StrategyRow = {
  id: string;
  title: string;
  subtitle: string;
  pnlText: string;
  pnlPositive: boolean;
  status: "running" | "stopped" | "preview";
  productLine: "v5" | "v6";
};

function classifyV5(card: SavedCard): StrategyRow | null {
  if (card.productLine !== "v5") return null;
  if (card.status === "cancelled" || card.status === "failed") return null;
  const isGrid = card.module === "grid" || card.category === "agent";
  const isPerp = card.module === "perpetual" || card.category === "perpetual";
  if (!isGrid && !isPerp) return null;
  const pnl = typeof card.pnlUsdt === "number" ? card.pnlUsdt : 0;
  return {
    id: card.id,
    title: card.title,
    subtitle: isGrid
      ? `${card.pair ?? ""} · 网格策略`
      : `${card.pair ?? ""} · ${card.direction ?? "永续"} ${card.leverage ? `${card.leverage}x` : ""}`.trim(),
    pnlText: pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`,
    pnlPositive: pnl >= 0,
    status: card.status === "running" ? "running" : card.status === "executed" ? "running" : "preview",
    productLine: "v5"
  };
}

function classifyV6(card: SavedCard): StrategyRow | null {
  if (card.productLine !== "v6") return null;
  if (card.status === "cancelled" || card.status === "failed") return null;
  const isEarn = card.module === "earn" || card.category === "stake" || card.category === "earn";
  const isSwap = card.module === "swap" || card.category === "swap";
  if (!isEarn && !isSwap) return null;
  const pnl = typeof card.pnlUsdt === "number" ? card.pnlUsdt : 0;
  return {
    id: card.id,
    title: card.title,
    subtitle: isEarn
      ? `${card.stakeProtocol ?? "DeFi"} · 年化 ${card.stakeApy ?? card.protocolApr ?? "—"}%`
      : `${card.fromSymbol ?? ""} → ${card.toSymbol ?? ""}`,
    pnlText: pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`,
    pnlPositive: pnl >= 0,
    status: card.status === "running" ? "running" : card.status === "executed" ? "running" : "preview",
    productLine: "v6"
  };
}

export function AgentCenterScreen({ onChangeView }: AgentCenterScreenProps) {
  const cards = useCardLibrary();
  const member = useMemberProfile();
  const emerg = useEmergencyState();

  const v5Rows = useMemo(() => cards.map(classifyV5).filter((x): x is StrategyRow => x !== null), [cards]);
  const v6Rows = useMemo(() => cards.map(classifyV6).filter((x): x is StrategyRow => x !== null), [cards]);

  // 今日机会推送（V6 链上发现） — 进入页面时拉一次，缓存到本地 state
  const [opportunities, setOpportunities] = useState<DefiOpportunity[]>([]);
  useEffect(() => {
    let cancelled = false;
    okxOnchainClient.discoverOpportunities({ minApr: 3 }).then((res) => {
      if (cancelled) return;
      const safe = (res.data || []).filter((o) => o.securityScore >= 70).slice(0, 3);
      setOpportunities(safe);
    }).catch(() => {
      if (!cancelled) setOpportunities([]);
    });
    return () => { cancelled = true; };
  }, []);

  const v5TotalPnl = v5Rows.reduce((s, r) => s + parseFloat(r.pnlText.replace(/[^\d.\-]/g, "")) * (r.pnlPositive ? 1 : -1), 0);
  const v6TotalPnl = v6Rows.reduce((s, r) => s + parseFloat(r.pnlText.replace(/[^\d.\-]/g, "")) * (r.pnlPositive ? 1 : -1), 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: uiColors.appBg }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 顶部：会员等级条 + 紧急状态横幅 */}
      <View style={{ paddingHorizontal: uiSpace.pageX, paddingTop: 12 }}>
        {emerg.active && (
          <View style={{ backgroundColor: "#FEE2E2", borderRadius: 12, padding: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: "#DC2626" }}>
            <Text style={{ fontSize: 13, color: "#991B1B", fontFamily: "Inter_700Bold" }}>🛑 紧急停止已触发</Text>
            <Text style={{ fontSize: 11, color: "#7F1D1D", marginTop: 4 }}>{emerg.reason} · {emerg.stoppedCardIds.length} 个策略受影响</Text>
          </View>
        )}

        <Pressable
          onPress={() => onChangeView("profile")}
          style={{
            borderRadius: 16,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.04,
            shadowRadius: 12,
            elevation: 2
          }}
        >
          <LinearGradient
            colors={[member.tierColor, "#0F0F0F"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: 14, flexDirection: "row", alignItems: "center" }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase" }}>
                {member.tier} · {member.tierLabel}
              </Text>
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 4 }}>
                {member.progressHint}
              </Text>
              <View style={{ height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, marginTop: 10, overflow: "hidden" }}>
                <View style={{ height: 4, width: `${member.progressPct}%`, backgroundColor: "#F7D877" }} />
              </View>
            </View>
            <ChevronRightIcon size={18} color="rgba(255,255,255,0.6)" />
          </LinearGradient>
        </Pressable>
      </View>

      {/* 总览：两个产品线的累计盈亏 */}
      <View style={{ flexDirection: "row", paddingHorizontal: uiSpace.pageX, marginTop: uiSpace.sectionGap, gap: 10 }}>
        <SummaryTile
          icon={<SparkIcon size={18} color="#7B5BC7" />}
          label="AI 合约策略"
          countText={`${v5Rows.filter((r) => r.status === "running").length} 个运行中`}
          pnl={v5TotalPnl}
          tint="#EEF2FF"
        />
        <SummaryTile
          icon={<LeafIcon size={18} color="#15803D" />}
          label="链上赚币"
          countText={`${v6Rows.filter((r) => r.status === "running").length} 个运行中`}
          pnl={v6TotalPnl}
          tint="#DCFCE7"
        />
      </View>

      {/* 今日机会推送（V6 链上发现） */}
      {opportunities.length > 0 ? (
        <>
          <SectionHeader
            title="今日机会"
            subtitle="数据源可用时展示真实扫描结果 · 不可用则为空态"
            rightLabel="问 AI"
            onPressRight={() => onChangeView("chat")}
          />
          <View style={{ paddingHorizontal: uiSpace.pageX }}>
            {opportunities.map((o, i) => (
              <OpportunityCard key={o.id ?? i} opportunity={o} onPress={() => onChangeView("chat")} />
            ))}
          </View>
        </>
      ) : null}

      {/* V5：AI 合约策略 */}
      <SectionHeader
        title="AI 合约策略"
        subtitle="永续合约 · 合约网格"
        rightLabel="新建"
        onPressRight={() => onChangeView("chat")}
      />
      <View style={{ paddingHorizontal: uiSpace.pageX }}>
        {v5Rows.length === 0 ? (
          <EmptyState
            icon={<SparkIcon size={28} color="#7B5BC7" />}
            title="还没有合约策略"
            subtitle="试试在对话页说 “100U 开 BTC 永续做多” 或 “开一个 BTC 网格”"
            cta="去对话页"
            onCta={() => onChangeView("chat")}
          />
        ) : (
          v5Rows.map((row) => <StrategyCard key={row.id} row={row} />)
        )}
      </View>

      {/* V6：链上赚币 */}
      <SectionHeader
        title="链上赚币"
        subtitle="Agent Wallet · 自动信号"
        rightLabel="发现机会"
        onPressRight={() => onChangeView("chat")}
      />
      <View style={{ paddingHorizontal: uiSpace.pageX }}>
        {v6Rows.length === 0 ? (
          <EmptyState
            icon={<LeafIcon size={28} color="#15803D" />}
            title="还没有链上仓位"
            subtitle="试试问 AI ：“帮我把 100U 拿去赚币” 或 “找今天的链上机会”"
            cta="去对话页"
            onCta={() => onChangeView("chat")}
          />
        ) : (
          v6Rows.map((row) => <StrategyCard key={row.id} row={row} />)
        )}
      </View>

      {/* 底部说明 */}
      <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 24 }}>
        <View style={{ backgroundColor: "#F4F4F5", borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "flex-start" }}>
          <LockIcon size={16} color="#6B7280" />
          <Text style={{ flex: 1, marginLeft: 8, fontSize: 11, lineHeight: 16, color: "#6B7280", fontFamily: "Inter_400Regular" }}>
            五道安全锁：授权金额上限、平台统一止损、冷静期、紧急停止、透明日志。AI 仅在你的授权额度内操作，亏损达 10% 自动平仓。
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── 小组件 ──────────────────────────────────────

function SummaryTile({ icon, label, countText, pnl, tint }: { icon: React.ReactNode; label: string; countText: string; pnl: number; tint: string }) {
  const positive = pnl >= 0;
  return (
    <View style={{
      flex: 1,
      backgroundColor: "#FFFFFF",
      borderRadius: 14,
      padding: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 1
    }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}>
          {icon}
        </View>
        <Text style={{ marginLeft: 8, fontSize: 12, color: "#6B7280", fontFamily: "Inter_500Medium" }}>{label}</Text>
      </View>
      <Text style={{ marginTop: 10, fontSize: 18, color: "#0F0F0F", fontFamily: "Inter_700Bold", letterSpacing: -0.5 }}>
        {pnl === 0 ? "—" : positive ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`}
      </Text>
      <Text style={{ marginTop: 2, fontSize: 11, color: "#9CA3AF", fontFamily: "Inter_400Regular" }}>{countText}</Text>
    </View>
  );
}

function SectionHeader({ title, subtitle, rightLabel, onPressRight }: { title: string; subtitle: string; rightLabel: string; onPressRight: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, marginTop: 22, marginBottom: 10 }}>
      <View>
        <Text style={{ fontSize: 16, color: "#0F0F0F", fontFamily: "Inter_700Bold", letterSpacing: -0.4 }}>{title}</Text>
        <Text style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter_400Regular", marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Pressable
        onPress={onPressRight}
        hitSlop={6}
        style={{ backgroundColor: "#F4F4F5", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, flexDirection: "row", alignItems: "center" }}
      >
        <Text style={{ fontSize: 11, color: "#0F0F0F", fontFamily: "Inter_600SemiBold" }}>{rightLabel}</Text>
        <ChevronRightIcon size={12} color="#0F0F0F" />
      </Pressable>
    </View>
  );
}

function EmptyState({ icon, title, subtitle, cta, onCta }: { icon: React.ReactNode; title: string; subtitle: string; cta: string; onCta: () => void }) {
  return (
    <View style={{
      backgroundColor: "#FFFFFF",
      borderRadius: 16,
      padding: 18,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#F3F4F6",
      borderStyle: "dashed"
    }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#F4F4F5", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        {icon}
      </View>
      <Text style={{ fontSize: 14, color: "#0F0F0F", fontFamily: "Inter_700Bold" }}>{title}</Text>
      <Text style={{ marginTop: 4, fontSize: 12, color: "#6B7280", fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 }}>
        {subtitle}
      </Text>
      <Pressable
        onPress={onCta}
        style={{ marginTop: 14, backgroundColor: "#0F0F0F", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{cta}</Text>
      </Pressable>
    </View>
  );
}

function OpportunityCard({ opportunity, onPress }: { opportunity: DefiOpportunity; onPress: () => void }) {
  const sourceLabel =
    opportunity.source === "smart_money" ? "聪明钱" :
    opportunity.source === "trenches" ? "战壕" :
    "趋势引擎";
  const tone = opportunity.riskTag === "low"
    ? { color: "#15803D", bg: "#DCFCE7" }
    : opportunity.riskTag === "medium"
    ? { color: "#B45309", bg: "#FEF3C7" }
    : { color: "#DC2626", bg: "#FEE2E2" };
  return (
    <Pressable onPress={onPress}>
      <Surface style={{ marginBottom: 10, padding: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F4F4F5", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
            <Text style={{ fontSize: 14, color: "#0F0F0F", fontFamily: "Inter_700Bold" }}>
              {opportunity.protocol.slice(0, 2)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 14, color: "#0F0F0F", fontFamily: "Inter_700Bold" }}>{opportunity.protocol}</Text>
              <View style={{ marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: tone.bg }}>
                <Text style={{ fontSize: 10, color: tone.color, fontFamily: "Inter_500Medium" }}>
                  {sourceLabel}
                </Text>
              </View>
            </View>
            <Text style={{ marginTop: 2, fontSize: 11, color: "#6B7280" }}>
              {opportunity.asset} · {opportunity.chain} · TVL ${opportunity.tvlUsd}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 16, color: "#0F0F0F", fontFamily: "Inter_700Bold", letterSpacing: -0.4 }}>
              {opportunity.apr}%
            </Text>
            <Text style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter_500Medium", marginTop: 2 }}>
              年化 · 安全 {opportunity.securityScore}
            </Text>
          </View>
        </View>
      </Surface>
    </Pressable>
  );
}

function StrategyCard({ row }: { row: StrategyRow }) {
  const lineColor = row.productLine === "v5" ? "#7B5BC7" : "#15803D";
  const statusColor = row.status === "running" ? "#10B981" : row.status === "stopped" ? "#9CA3AF" : "#F59E0B";
  return (
    <Surface style={{ marginBottom: 10, padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: lineColor, marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, color: "#0F0F0F", fontFamily: "Inter_700Bold" }}>{row.title}</Text>
          <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{row.subtitle}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 14, color: row.pnlPositive ? "#10B981" : "#DC2626", fontFamily: "Inter_700Bold", letterSpacing: -0.3 }}>
            {row.pnlText}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor, marginRight: 4 }} />
            <Text style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter_500Medium" }}>
              {row.status === "running" ? "运行中" : row.status === "stopped" ? "已停止" : "待确认"}
            </Text>
          </View>
        </View>
      </View>
    </Surface>
  );
}
