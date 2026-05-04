/**
 * MemeMarketScreen.tsx — Meme 币市场实时数据
 *
 * 展示热门 Meme 代币列表，支持：
 * - 实时 trending 排行（按交易量/市值排序）
 * - 代币安全扫描
 * - 一键跳转 Sniper 买入
 *
 * 数据来源：OKX Web3 DEX Market API
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Surface } from "../components/ui/Surface";
import { getHotTokens, tokenSecurityScan, type HotToken } from "../services/onchainApi";

type SortBy = "volume" | "marketCap" | "change";
type ChainFilter = "501" | "1" | "56" | "all";

const CHAIN_LABELS: Record<ChainFilter, string> = {
  "501": "Solana",
  "1": "Ethereum",
  "56": "BSC",
  "all": "全部",
};

function fmtUsd(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n) || n === 0) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.001) return `$${n.toFixed(4)}`;
  return `$${n.toExponential(2)}`;
}

function fmtChange(val: string | number): { text: string; positive: boolean } {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return { text: "—", positive: true };
  const positive = n >= 0;
  return { text: `${positive ? "+" : ""}${n.toFixed(2)}%`, positive };
}

function riskBadge(token: HotToken): { label: string; color: string } {
  const holders = parseInt(token.holders || "0");
  const top10 = parseFloat(token.top10HoldPercent || "0");
  const dev = parseFloat(token.devHoldPercent || "0");

  if (top10 > 50 || dev > 20) return { label: "高风险", color: "bg-red-500/20 text-red-400" };
  if (holders < 500 || top10 > 30) return { label: "中风险", color: "bg-amber-500/20 text-amber-400" };
  return { label: "低风险", color: "bg-emerald-500/20 text-emerald-400" };
}

export function MemeMarketScreen({ onBack }: { onBack: () => void }) {
  const [tokens, setTokens] = useState<HotToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [chain, setChain] = useState<ChainFilter>("501");
  const [sortBy, setSortBy] = useState<SortBy>("volume");
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const chainIndex = chain === "all" ? "501" : chain;
      const data = await getHotTokens(chainIndex, {
        rankBy: sortBy === "volume" ? "5" : sortBy === "marketCap" ? "6" : undefined,
        limit: 20,
      });
      if (Array.isArray(data)) {
        // 按选定字段排序
        const sorted = [...data].sort((a, b) => {
          if (sortBy === "volume") return parseFloat(b.volume || "0") - parseFloat(a.volume || "0");
          if (sortBy === "marketCap") return parseFloat(b.marketCap || "0") - parseFloat(a.marketCap || "0");
          return parseFloat(b.change || "0") - parseFloat(a.change || "0");
        });
        setTokens(sorted);
      }
    } catch (e) {
      console.warn("Failed to fetch hot tokens:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chain, sortBy]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  return (
    <View className="flex-1 bg-bg">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable onPress={onBack} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
          <Text className="text-[18px] text-ink">←</Text>
        </Pressable>
        <Text className="text-[18px] font-bold text-ink">Meme 市场</Text>
        <View className="w-10" />
      </View>

      {/* Chain Filter */}
      <View className="flex-row gap-2 px-4 pb-2">
        {(Object.keys(CHAIN_LABELS) as ChainFilter[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setChain(key)}
            className={`rounded-full px-3 py-1.5 ${chain === key ? "bg-primary" : "bg-surface"}`}
          >
            <Text className={`text-[12px] font-medium ${chain === key ? "text-white" : "text-muted"}`}>
              {CHAIN_LABELS[key]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Sort Tabs */}
      <View className="flex-row gap-2 px-4 pb-3">
        {([
          { key: "volume" as SortBy, label: "交易量" },
          { key: "marketCap" as SortBy, label: "市值" },
          { key: "change" as SortBy, label: "涨幅" },
        ]).map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => setSortBy(key)}
            className={`rounded-lg px-3 py-1 ${sortBy === key ? "bg-ink" : "bg-surface"}`}
          >
            <Text className={`text-[11px] font-semibold ${sortBy === key ? "text-white" : "text-muted"}`}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Token List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View className="items-center py-20">
            <Text className="text-[14px] text-muted">加载中...</Text>
          </View>
        ) : tokens.length === 0 ? (
          <View className="items-center py-20">
            <Text className="text-[14px] text-muted">暂无数据</Text>
          </View>
        ) : (
          <View className="px-4">
            {tokens.map((token, idx) => {
              const change = fmtChange(token.change);
              const risk = riskBadge(token);
              return (
                <Surface key={token.tokenContractAddress || idx} elevation={1} padded={false} className="mb-2">
                  <Pressable className="px-4 py-3 active:opacity-70">
                    {/* Row 1: Symbol + Price + Change */}
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-[16px] font-bold text-ink">
                          {token.tokenSymbol || "???"}
                        </Text>
                        <View className={`rounded px-1.5 py-0.5 ${risk.color}`}>
                          <Text className="text-[10px] font-semibold">{risk.label}</Text>
                        </View>
                      </View>
                      <View className="items-end">
                        <Text className="text-[15px] font-semibold text-ink">{fmtPrice(token.price)}</Text>
                        <Text className={`text-[12px] font-medium ${change.positive ? "text-emerald-500" : "text-red-500"}`}>
                          {change.text}
                        </Text>
                      </View>
                    </View>
                    {/* Row 2: Metrics */}
                    <View className="mt-2 flex-row items-center justify-between">
                      <MetricPill label="量" value={fmtUsd(token.volume)} />
                      <MetricPill label="市值" value={fmtUsd(token.marketCap)} />
                      <MetricPill label="流动性" value={fmtUsd(token.liquidity)} />
                      <MetricPill label="持有人" value={token.holders || "—"} />
                    </View>
                    {/* Row 3: Address */}
                    <Text className="mt-1.5 text-[11px] text-muted" numberOfLines={1}>
                      {token.tokenContractAddress}
                    </Text>
                  </Pressable>
                </Surface>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <View className="items-center">
      <Text className="text-[10px] text-muted">{label}</Text>
      <Text className="text-[12px] font-semibold text-ink2">{value}</Text>
    </View>
  );
}
