import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { ArrowLeftIcon, CardStackIcon, SparkIcon } from "../components/ui/Icons";
import { TransactionCard } from "../components/TransactionCard";
import { DolphinLogo } from "../components/DolphinLogo";
import { cardLibrary, useCardLibrary } from "../services/cardLibrary";
import { inviteStore, useInvitedFriends, type InvitedFriend } from "../services/inviteStore";
import type { HWalletCard, TradeCardCategory } from "../types";
import type { SavedCard } from "../services/cardLibrary";
import { toastBus } from "../services/toastBus";
import * as Clipboard from "expo-clipboard";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type CardLibraryScreenProps = {
  onClose: () => void;
};

const filters: { id: "all" | TradeCardCategory; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "perpetual", label: "合约" },
  { id: "swap", label: "兑换" },
  { id: "agent", label: "Agent" },
  { id: "stake", label: "质押" }
];

function daysSince(ts: number) {
  const ms = Date.now() - ts;
  return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1); // "第 1 天"
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function CardLibraryScreen({ onClose }: CardLibraryScreenProps) {
  const all = useCardLibrary();
  const friends = useInvitedFriends();
  const [mainTab, setMainTab] = useState<"cards" | "friends">("cards");
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [shareOpen, setShareOpen] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 3) return cur; // 最多 3 张
      return [...cur, id];
    });
  };
  const clearSelect = () => setSelectedIds([]);

  const list = useMemo(
    () => (filter === "all" ? all : all.filter((c) => c.category === filter)),
    [all, filter]
  );

  // category 类型安全
  const counts = useMemo(() => {
    const map: Record<"all" | TradeCardCategory, number> = { all: all.length, perpetual: 0, swap: 0, agent: 0, stake: 0, earn: 0, grid: 0 };
    for (const c of all) {
      if (c.category && map.hasOwnProperty(c.category)) {
        map[c.category as TradeCardCategory] = (map[c.category as TradeCardCategory] ?? 0) + 1;
      }
    }
    return map;
  }, [all]);

  const totalPnl = useMemo(
    () => +all.reduce((s, c) => s + (c.pnlUsdt ?? 0), 0).toFixed(2),
    [all]
  );
  const swapVolume = useMemo(
    () =>
      +all
        .filter((c) => c.category === "swap")
        .reduce((s, c) => s + (c.volumeUsdt ?? 0), 0)
        .toFixed(2),
    [all]
  );
  const swapCount = counts.swap ?? 0;
  const firstAt = cardLibrary.firstSavedAt();

  return (
    <View className="flex-1 bg-bg">
      {/* Header */}
      <View
        className="px-3 py-3"
        style={{ borderBottomWidth: 1, borderColor: "#F1F3F5" }}
      >
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={onClose}
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: "#F3F4F6" }}
          >
            <ArrowLeftIcon size={18} color="#0F0F0F" />
          </Pressable>
          <Text className="text-[17px] font-bold text-ink">我的卡库</Text>
          <View style={{ width: 36 }} />
        </View>
        {/* 卡片 / 好友 切换 */}
        <View className="mt-3 flex-row items-center rounded-full bg-surface p-1" style={{ gap: 2 }}>
          <Pressable
            onPress={() => setMainTab("cards")}
            className="flex-1 items-center rounded-full py-2"
            style={{ backgroundColor: mainTab === "cards" ? "#0F0F0F" : "transparent" }}
          >
            <Text className="text-[13px] font-semibold" style={{ color: mainTab === "cards" ? "#FFFFFF" : "#6B7280" }}>
              卡片 ({all.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMainTab("friends")}
            className="flex-1 items-center rounded-full py-2"
            style={{ backgroundColor: mainTab === "friends" ? "#0F0F0F" : "transparent" }}
          >
            <Text className="text-[13px] font-semibold" style={{ color: mainTab === "friends" ? "#FFFFFF" : "#6B7280" }}>
              好友 ({friends.length})
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {mainTab === "friends" ? (
          <FriendsTab friends={friends} />
        ) : (
        <>
        {/* 仪式感 Hero */}
        {all.length > 0 && firstAt ? (
          <CeremonyHero
            mode={filter === "swap" ? "swap" : "pnl"}
            totalPnl={totalPnl}
            swapVolume={swapVolume}
            swapCount={swapCount}
            count={all.length}
            firstAt={firstAt}
          />
        ) : null}

        {/* 运行中 Agent 工作台 —— 实时跳数字 + 任务进度 */}
        <RunningAgentsDeck cards={all} />

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 8 }}
        >
          {filters.map((f) => {
            const active = filter === f.id;
            const count = counts[f.id] ?? 0;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                className="flex-row items-center rounded-full px-3.5 py-2"
                style={{ backgroundColor: active ? "#0F0F0F" : "#F3F4F6" }}
              >
                <Text
                  className="text-[13px] font-semibold"
                  style={{ color: active ? "#FFFFFF" : "#6B7280" }}
                >
                  {f.label}
                </Text>
                <View
                  className="ml-1.5 rounded-full px-1.5"
                  style={{
                    backgroundColor: active ? "rgba(255,255,255,0.18)" : "#E5E7EB",
                    minWidth: 18,
                    alignItems: "center"
                  }}
                >
                  <Text
                    className="text-[11px] font-semibold"
                    style={{ color: active ? "#FFFFFF" : "#6B7280" }}
                  >
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* List */}
        {list.length === 0 ? (
          <View className="items-center justify-center px-10 py-16">
            <View
              className="mb-4 h-20 w-20 items-center justify-center rounded-full"
              style={{ backgroundColor: "#F3F4F6" }}
            >
              <CardStackIcon size={36} color="#9CA3AF" />
            </View>
            <Text className="text-center text-[15px] font-semibold text-ink">
              {all.length === 0 ? "卡库还是空的" : "这个分类下没有卡片"}
            </Text>
            <Text className="mt-1 text-center text-[12px] text-muted">
              去聊天里发起交易、质押或启动 Agent，{"\n"}确认后会自动归档到这里。
            </Text>
          </View>
        ) : (
          <View className="px-3">
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
              {list.map((c) => (
                <GridTile
                  key={c.id}
                  card={c}
                  active={expandedId === c.id}
                  selected={selectedIds.includes(c.id)}
                  selectionMode={selectedIds.length > 0}
                  onPress={() => {
                    if (selectedIds.length > 0) {
                      toggleSelect(c.id);
                    } else {
                      setExpandedId((cur) => (cur === c.id ? null : c.id));
                    }
                  }}
                  onLongPress={() => toggleSelect(c.id)}
                />
              ))}
            </View>

            {/* 展开区 —— 选中后在网格下方展示完整卡片 */}
            {expandedId
              ? (() => {
                  const c = list.find((x) => x.id === expandedId);
                  if (!c) return null;
                  const day = daysSince(c.savedAt);
                  return (
                    <View className="mt-3">
                      <TransactionCard card={c as HWalletCard} />
                      <View className="mx-4 -mt-1 mb-2 flex-row items-center justify-between px-1 pb-2">
                        <View className="flex-row items-center" style={{ gap: 6 }}>
                          <View
                            className="rounded-full"
                            style={{
                              backgroundColor: "#FEF3C7",
                              paddingHorizontal: 7,
                              paddingVertical: 2
                            }}
                          >
                            <Text
                              className="text-[10px] font-bold"
                              style={{ color: "#B45309" }}
                            >
                              Day {day}
                            </Text>
                          </View>
                          <Text className="text-[10.5px] text-muted">
                            归档于 {fmtDate(c.savedAt)}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            cardLibrary.remove(c.id);
                            setExpandedId(null);
                          }}
                          className="px-2 py-1"
                        >
                          <Text
                            className="text-[11px] font-medium"
                            style={{ color: "#9CA3AF" }}
                          >
                            移除
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })()
              : null}
          </View>
        )}
      </>
        )}
      </ScrollView>

      {/* 浮动 CTA — 选中后出现 */}
      {selectedIds.length > 0 && !shareOpen ? (
        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 24,
            flexDirection: "row",
            gap: 10
          }}
        >
          <Pressable
            onPress={clearSelect}
            style={{
              paddingHorizontal: 16,
              height: 52,
              borderRadius: 26,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(15,15,15,0.06)"
            }}
          >
            <Text className="text-[13px] font-semibold" style={{ color: "#374151" }}>
              取消
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShareOpen(true)}
            style={{ flex: 1, height: 52, borderRadius: 26, overflow: "hidden" }}
          >
            <LinearGradient
              colors={["#7C3AED", "#5B21B6", "#4338CA"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#7C3AED",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.4,
                shadowRadius: 16,
                elevation: 8
              }}
            >
              <Text className="text-[15px] font-bold" style={{ color: "#FFFFFF" }}>
                生成战报 · {selectedIds.length}/3
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}

      {/* 战报全屏分享卡 */}
      {shareOpen ? (
        <ShareReportOverlay
          cards={selectedIds
            .map((id) => all.find((c) => c.id === id))
            .filter((c): c is SavedCard => !!c)}
          totalPnl={totalPnl}
          libraryCount={all.length}
          firstAt={firstAt}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </View>
  );
}

/* ─────────────────────────────────────────────
   GridTile — 九宫格小卡，只露盈亏 / 类别 / 状态
   ───────────────────────────────────────────── */

const categoryMeta: Record<
  TradeCardCategory,
  { label: string; emoji: string; color: string; bg: string }
> = {
  perpetual: { label: "合约", emoji: "📈", color: "#B91C1C", bg: "#FEF2F2" },
  swap: { label: "兑换", emoji: "🔄", color: "#4338CA", bg: "#EEF2FF" },
  agent: { label: "Agent", emoji: "🤖", color: "#6D28D9", bg: "#F5F3FF" },
  stake: { label: "质押", emoji: "🌱", color: "#047857", bg: "#ECFDF5" },
  earn: { label: "理财", emoji: "💰", color: "#B45309", bg: "#FFFBEB" },
  grid: { label: "网格", emoji: "🔲", color: "#0E7490", bg: "#ECFEFF" }
};

function tileTitle(card: SavedCard): string {
  switch (card.category) {
    case "perpetual":
      return card.pair?.replace(/USDT$/i, "") ?? "PERP";
    case "swap":
      return `${card.fromSymbol ?? "?"}→${card.toSymbol ?? "?"}`;
    case "agent":
      return card.agentName ?? "Agent";
    case "stake":
      return card.stakeProtocol ?? "质押";
    default:
      return card.title ?? "卡片";
  }
}

function GridTile({
  card,
  active,
  selected,
  selectionMode,
  onPress,
  onLongPress
}: {
  card: SavedCard;
  active: boolean;
  selected?: boolean;
  selectionMode?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const meta = categoryMeta[card.category as TradeCardCategory] ?? categoryMeta.swap;
  const pnl = card.pnlUsdt ?? 0;
  const positive = pnl > 0;
  const negative = pnl < 0;
  const flat = pnl === 0;

  const pnlText = flat
    ? card.category === "swap"
      ? "已成交"
      : "—"
    : `${positive ? "+" : ""}${pnl.toFixed(2)}`;

  const pnlColor = positive ? "#10B981" : negative ? "#EF4444" : "#6B7280";
  const day = daysSince(card.savedAt);
  const dateLabel = fmtDate(card.savedAt).slice(5); // 仅 "MM.DD"，节省宽度

  // 按下微缩放
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }]
  }));

  // 运行中 / 进行中卡片：底色微呼吸（高光闪一闪）
  const breath = useSharedValue(0);
  const isLive = card.status === "running" || card.status === "pending";
  useEffect(() => {
    if (!isLive) return;
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [isLive, breath]);
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + breath.value * 0.32
  }));

  return (
    <View style={{ width: "33.3333%", padding: 4 }}>
      <AnimatedPressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={260}
        onPressIn={() =>
          (press.value = withTiming(0.96, { duration: 120, easing: Easing.out(Easing.quad) }))
        }
        onPressOut={() =>
          (press.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }))
        }
        style={[
          {
            aspectRatio: 1,
            borderRadius: 16,
            backgroundColor: meta.bg,
            borderWidth: selected ? 2.5 : active ? 2 : 1,
            borderColor: selected ? "#7C3AED" : active ? meta.color : "rgba(15,23,42,0.05)",
            padding: 10,
            justifyContent: "space-between",
            shadowColor: selected ? "#7C3AED" : meta.color,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: selected ? 0.35 : active ? 0.18 : 0.06,
            shadowRadius: selected ? 14 : 10,
            elevation: selected ? 5 : active ? 3 : 1,
            overflow: "hidden",
            opacity: selectionMode && !selected ? 0.55 : 1
          },
          pressStyle
        ]}
      >
        {/* LIVE 状态高光 */}
        {isLive ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: -10,
                right: -10,
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: "#10B981"
              },
              haloStyle
            ]}
          />
        ) : null}

        {/* 选中徽章 */}
        {selected ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: "#7C3AED",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#7C3AED",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.5,
              shadowRadius: 4,
              elevation: 4,
              zIndex: 10
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900", lineHeight: 14 }}>
              ✓
            </Text>
          </View>
        ) : null}

        {/* 顶部：类别小徽 + Day 徽章 */}
        <View className="flex-row items-center justify-between">
          <View
            className="flex-row items-center rounded-full"
            style={{
              backgroundColor: "rgba(255,255,255,0.7)",
              paddingHorizontal: 5,
              paddingVertical: 2,
              gap: 3
            }}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor:
                  card.status === "running"
                    ? "#10B981"
                    : card.status === "cancelled" || card.status === "failed"
                    ? "#9CA3AF"
                    : meta.color
              }}
            />
            <Text className="text-[9px] font-bold" style={{ color: meta.color }}>
              {meta.label}
            </Text>
          </View>
          <View
            className="rounded-full"
            style={{
              backgroundColor: "rgba(255,255,255,0.85)",
              paddingHorizontal: 5,
              paddingVertical: 2
            }}
          >
            <Text className="text-[9px] font-bold" style={{ color: "#B45309" }}>
              D{day}
            </Text>
          </View>
        </View>

        {/* 中部：盈亏巨字 */}
        <View className="items-center">
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontSize: 17,
              fontWeight: "800",
              color: pnlColor,
              letterSpacing: -0.5
            }}
          >
            {pnlText}
          </Text>
          {!flat ? (
            <Text className="text-[9px]" style={{ color: "#9CA3AF", marginTop: 1 }}>
              U
            </Text>
          ) : null}
        </View>

        {/* 底部：标题 + 入库日期 */}
        <View className="items-center">
          <Text
            numberOfLines={1}
            className="text-center text-[10.5px] font-semibold"
            style={{ color: "#374151" }}
          >
            {tileTitle(card)}
          </Text>
          <Text className="text-[9px]" style={{ color: "#9CA3AF", marginTop: 1 }}>
            {dateLabel}
          </Text>
        </View>
      </AnimatedPressable>
    </View>
  );
}

/* ─────────────────────────────────────────────
   Ceremony Hero — 紫金渐变 + 累计盈亏 + 首次归档纪念
   ───────────────────────────────────────────── */

function CeremonyHero({
  mode,
  totalPnl,
  swapVolume,
  swapCount,
  count,
  firstAt
}: {
  mode: "pnl" | "swap";
  totalPnl: number;
  swapVolume: number;
  swapCount: number;
  count: number;
  firstAt: number;
}) {
  const day = daysSince(firstAt);
  const isSwap = mode === "swap";
  const positive = totalPnl >= 0;

  // 金色数字呼吸
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [pulse]);
  const numStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  // 装饰光晕缓慢漂浮
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false);
  }, [drift]);
  const haloA = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.sin(drift.value * Math.PI * 2) * 12 },
      { translateY: Math.cos(drift.value * Math.PI * 2) * 8 }
    ]
  }));
  const haloB = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(drift.value * Math.PI * 2) * -14 },
      { translateY: Math.sin(drift.value * Math.PI * 2) * 10 }
    ]
  }));

  // 闪烁星点
  const star = useSharedValue(0.4);
  useEffect(() => {
    star.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.3, { duration: 1300, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [star]);
  const starStyle = useAnimatedStyle(() => ({ opacity: star.value }));

  return (
    <View className="px-4 pt-3">
      <View
        style={{
          borderRadius: 24,
          overflow: "hidden",
          shadowColor: "#2A0D4D",
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.22,
          shadowRadius: 22,
          elevation: 8
        }}
      >
        <LinearGradient
          colors={["#1E1B4B", "#3730A3", "#5B21B6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 18 }}
        >
          {/* 漂浮光晕 */}
          <Animated.View
            style={[
              {
                position: "absolute",
                top: -40,
                right: -30,
                width: 160,
                height: 160,
                borderRadius: 80,
                backgroundColor: "#D9AA43",
                opacity: 0.18
              },
              haloA
            ]}
          />
          <Animated.View
            style={[
              {
                position: "absolute",
                bottom: -50,
                left: -30,
                width: 140,
                height: 140,
                borderRadius: 70,
                backgroundColor: "#7C3AED",
                opacity: 0.32
              },
              haloB
            ]}
          />

          {/* 顶部小标 + 闪烁星 */}
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Animated.View style={starStyle}>
              <SparkIcon size={14} color="#FCD34D" />
            </Animated.View>
            <Text className="text-[11px] font-semibold tracking-widest" style={{ color: "#E9D5FF" }}>
              {isSwap ? "MY SWAP JOURNEY" : "MY CARD COLLECTION"}
            </Text>
          </View>

          {/* 主指标 */}
          <Text className="mt-3 text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>
            {isSwap ? "累计兑换量" : "累计盈亏"}
          </Text>
          <Animated.View style={numStyle}>
            {isSwap ? (
              <Text
                className="text-[40px] font-extrabold"
                style={{
                  color: "#FCD34D",
                  letterSpacing: -1,
                  textShadowColor: "rgba(252,211,77,0.55)",
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 16
                }}
              >
                {swapVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })} U
              </Text>
            ) : (
              <Text
                className="text-[40px] font-extrabold"
                style={{
                  color: positive ? "#FCD34D" : "#FCA5A5",
                  letterSpacing: -1,
                  textShadowColor: positive
                    ? "rgba(252,211,77,0.55)"
                    : "rgba(252,165,165,0.5)",
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 16
                }}
              >
                {positive ? "+" : ""}
                {totalPnl.toFixed(2)} U
              </Text>
            )}
          </Animated.View>

          {/* 三联指标 */}
          <View
            className="mt-4 flex-row items-center rounded-2xl px-3 py-2.5"
            style={{ backgroundColor: "rgba(255,255,255,0.10)" }}
          >
            <View className="flex-1 items-center">
              <Text className="text-[10px]" style={{ color: "rgba(255,255,255,0.65)" }}>
                {isSwap ? "兑换笔数" : "收藏卡片"}
              </Text>
              <Text className="mt-0.5 text-[16px] font-extrabold text-bg">
                {isSwap ? swapCount : count}
              </Text>
            </View>
            <View style={{ width: 1, height: 22, backgroundColor: "rgba(255,255,255,0.15)" }} />
            <View className="flex-1 items-center">
              <Text className="text-[10px]" style={{ color: "rgba(255,255,255,0.65)" }}>
                首次归档
              </Text>
              <Text className="mt-0.5 text-[13px] font-bold text-bg">{fmtDate(firstAt)}</Text>
            </View>
            <View style={{ width: 1, height: 22, backgroundColor: "rgba(255,255,255,0.15)" }} />
            <View className="flex-1 items-center">
              <Text className="text-[10px]" style={{ color: "rgba(255,255,255,0.65)" }}>
                同行
              </Text>
              <Text className="mt-0.5 text-[16px] font-extrabold" style={{ color: "#FCD34D" }}>
                第 {day} 天
              </Text>
            </View>
          </View>

          {/* 底部勋章带 */}
          <View className="mt-3 flex-row items-center flex-wrap" style={{ gap: 6 }}>
            <Medallion icon="🏆" label={count >= 5 ? "卡牌大师" : "新晋藏家"} />
            <Medallion icon="🔥" label={positive ? "稳定盈利" : "持续耕耘"} />
            {day >= 7 ? <Medallion icon="📅" label="一周老友" /> : null}
            {swapVolume >= 1000 ? <Medallion icon="⚡️" label="兑换达人" /> : null}
            {swapCount >= 5 ? <Medallion icon="🔄" label={`${swapCount} 笔兑换`} /> : null}
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

function Medallion({ icon, label }: { icon: string; label: string }) {
  return (
    <View
      className="flex-row items-center rounded-full"
      style={{
        backgroundColor: "rgba(255,255,255,0.14)",
        paddingHorizontal: 9,
        paddingVertical: 4,
        gap: 4
      }}
    >
      <Text style={{ fontSize: 11 }}>{icon}</Text>
      <Text className="text-[11px] font-semibold" style={{ color: "#FDE68A" }}>
        {label}
      </Text>
    </View>
  );
}

/* ─────────────────────────────────────────────
   RunningAgentsDeck — 运行中 Agent 实时工作台
   - 仅展示 status === "running" 且 category === "agent"
   - 跳数字 / 进度条 / 实时日志
   ───────────────────────────────────────────── */

const agentLogs = [
  "扫描 BTC 5m K 线...",
  "捕获 RSI 背离信号",
  "下单 0.012 BTC @ 78,420",
  "止盈 +0.32 U",
  "回撤检查通过 ✓",
  "持仓再平衡中...",
  "等待入场信号..."
];

function RunningAgentsDeck({ cards }: { cards: SavedCard[] }) {
  const runningAgents = cards.filter(
    (c) => c.category === "agent" && c.status === "running"
  );
  if (runningAgents.length === 0) return null;

  return (
    <View className="px-4 pt-3">
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <PulseDot />
          <Text className="text-[12px] font-bold" style={{ color: "#0F0F0F" }}>
            运行中 · {runningAgents.length} 个 Agent
          </Text>
        </View>
        <Text className="text-[10.5px]" style={{ color: "#9CA3AF" }}>
          实时
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 4 }}
      >
        {runningAgents.map((c) => (
          <RunningAgentTile key={c.id} card={c} />
        ))}
      </ScrollView>
    </View>
  );
}

function PulseDot() {
  const v = useSharedValue(0.4);
  useEffect(() => {
    v.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.4, { duration: 700 })),
      -1
    );
  }, [v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value }));
  return (
    <Animated.View
      style={[
        {
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: "#10B981",
          shadowColor: "#10B981",
          shadowOpacity: 0.6,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 }
        },
        style
      ]}
    />
  );
}

function RunningAgentTile({ card }: { card: SavedCard }) {
  // 起始值取自 agentTotalProfit / agentTodayProfit
  const baseTotal = (() => {
    const m = (card.agentTotalProfit ?? "").match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
  })();
  const baseToday = (() => {
    const m = (card.agentTodayProfit ?? "").match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
  })();

  const [total, setTotal] = useState(baseTotal);
  const [today, setToday] = useState(baseToday);
  const [trades, setTrades] = useState<number>(0);
  const [logIdx, setLogIdx] = useState(0);

  // 跳数字：每 1.8s 微调一下，70% 概率小盈，30% 小亏
  useEffect(() => {
    const t = setInterval(() => {
      const sign = Math.random() < 0.7 ? 1 : -1;
      const delta = +(sign * (Math.random() * 0.18 + 0.02)).toFixed(2);
      setTotal((v) => +(v + delta).toFixed(2));
      setToday((v) => +(v + delta).toFixed(2));
      // 偶尔产生一次成交
      if (Math.random() < 0.35) setTrades((n: number) => n + 1);
      setLogIdx((i) => (i + 1) % agentLogs.length);
      // 大概率盈利时偶尔触发一条全局 toast — 让用户感受到 Agent 在干活
      if (sign === 1 && delta >= 0.12 && Math.random() < 0.18) {
        toastBus.push({
          emoji: "🐬",
          title: `${card.title} 刚止盈 +${delta.toFixed(2)} U`,
          subtitle: "点这里查看运行详情",
          tone: "success"
        });
      }
    }, 1800);
    return () => clearInterval(t);
  }, [card.title]);

  // 进度条：循环 0→100%（"扫描中"指示，3s 一个周期）
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.quad) }),
      -1,
      false
    );
  }, [progress]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`
  }));

  const totalPositive = total >= 0;

  return (
    <View
      style={{
        width: 240,
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: "#1E1B4B",
        shadowColor: "#7C3AED",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 14,
        elevation: 5
      }}
    >
      <LinearGradient
        colors={["#1E1B4B", "#3730A3", "#6D28D9"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 12 }}
      >
        {/* 顶部：Agent 名 + 状态 */}
        <View className="flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center" style={{ gap: 6 }}>
            <View
              className="items-center justify-center rounded-lg"
              style={{
                width: 22,
                height: 22,
                backgroundColor: "rgba(255,255,255,0.18)"
              }}
            >
              <Text style={{ fontSize: 11, color: "#FDE68A", fontWeight: "800" }}>A</Text>
            </View>
            <Text
              numberOfLines={1}
              className="flex-1 text-[12.5px] font-bold"
              style={{ color: "#FFFFFF" }}
            >
              {card.agentName ?? "Agent"}
            </Text>
          </View>
          <View
            className="flex-row items-center rounded-full"
            style={{
              backgroundColor: "rgba(16,185,129,0.22)",
              paddingHorizontal: 6,
              paddingVertical: 2,
              gap: 4
            }}
          >
            <PulseDot />
            <Text className="text-[9px] font-bold" style={{ color: "#A7F3D0" }}>
              LIVE
            </Text>
          </View>
        </View>

        {/* 跳动总盈利 */}
        <View className="mt-2 flex-row items-baseline" style={{ gap: 6 }}>
          <Text
            style={{
              fontSize: 24,
              fontWeight: "800",
              letterSpacing: -0.5,
              color: totalPositive ? "#FCD34D" : "#FCA5A5",
              textShadowColor: totalPositive
                ? "rgba(252,211,77,0.4)"
                : "rgba(252,165,165,0.4)",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 10
            }}
          >
            {totalPositive ? "+" : ""}
            {total.toFixed(2)}
          </Text>
          <Text className="text-[10px]" style={{ color: "rgba(255,255,255,0.7)" }}>
            U · 累计
          </Text>
        </View>

        {/* 任务进度条 */}
        <View className="mt-2.5">
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>
              {agentLogs[logIdx]}
            </Text>
          </View>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: "rgba(255,255,255,0.12)",
              overflow: "hidden"
            }}
          >
            <Animated.View
              style={[
                {
                  height: "100%",
                  borderRadius: 2,
                  backgroundColor: "#FCD34D"
                },
                fillStyle
              ]}
            />
          </View>
        </View>

        {/* 三联指标 */}
        <View
          className="mt-2.5 flex-row items-center rounded-xl px-2 py-1.5"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        >
          <View className="flex-1 items-center">
            <Text className="text-[9px]" style={{ color: "rgba(255,255,255,0.55)" }}>
              今日
            </Text>
            <Text
              className="text-[11.5px] font-bold"
              style={{ color: today >= 0 ? "#A7F3D0" : "#FCA5A5" }}
            >
              {today >= 0 ? "+" : ""}
              {today.toFixed(2)}
            </Text>
          </View>
          <View style={{ width: 1, height: 18, backgroundColor: "rgba(255,255,255,0.12)" }} />
          <View className="flex-1 items-center">
            <Text className="text-[9px]" style={{ color: "rgba(255,255,255,0.55)" }}>
              成交
            </Text>
            <Text className="text-[11.5px] font-bold" style={{ color: "#FFFFFF" }}>
              {trades}
            </Text>
          </View>
          <View style={{ width: 1, height: 18, backgroundColor: "rgba(255,255,255,0.12)" }} />
          <View className="flex-1 items-center">
            <Text className="text-[9px]" style={{ color: "rgba(255,255,255,0.55)" }}>
              胜率
            </Text>
            <Text className="text-[11.5px] font-bold" style={{ color: "#FCD34D" }}>
              {card.agentWinRate ?? "—"}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

/* ─────────────────────────────────────────────
   ShareReportOverlay — 全屏战报海报，长按截屏分享
   ───────────────────────────────────────────── */

function ShareReportOverlay({
  cards,
  totalPnl,
  libraryCount,
  firstAt,
  onClose
}: {
  cards: SavedCard[];
  totalPnl: number;
  libraryCount: number;
  firstAt: number | null;
  onClose: () => void;
}) {
  // 海报浮入
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) });
  }, [enter]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 24 }]
  }));

  // 截图 / 分享
  const shotRef = useRef<ViewShot>(null);
  const [busy, setBusy] = useState<null | "save" | "share">(null);

  async function captureUri(): Promise<string | null> {
    try {
      const node = shotRef.current;
      if (!node || typeof node.capture !== "function") return null;
      const uri = await node.capture();
      return uri ?? null;
    } catch (e) {
      console.warn("[ShareReport] capture failed", e);
      return null;
    }
  }

  async function onSave() {
    if (busy) return;
    setBusy("save");
    try {
      const uri = await captureUri();
      if (!uri) {
        toastBus.push({ emoji: "⚠️", title: "截图失败，请重试", tone: "warn" });
        return;
      }
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        toastBus.push({ emoji: "📷", title: "需要相册权限才能保存", tone: "warn" });
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      toastBus.push({ emoji: "✅", title: "战报已保存到相册", subtitle: "现在可以发朋友圈了", tone: "success" });
    } finally {
      setBusy(null);
    }
  }

  async function onShare() {
    if (busy) return;
    setBusy("share");
    try {
      const uri = await captureUri();
      if (!uri) {
        toastBus.push({ emoji: "⚠️", title: "截图失败，请重试", tone: "warn" });
        return;
      }
      const ok = await Sharing.isAvailableAsync();
      if (!ok) {
        toastBus.push({ emoji: "🚫", title: "当前设备不支持系统分享", tone: "warn" });
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "我的 H Wallet 战报"
      });
    } finally {
      setBusy(null);
    }
  }

  // 累计 PnL 呼吸
  const breath = useSharedValue(0);
  useEffect(() => {
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [breath]);
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.025 }],
    textShadowColor: `rgba(253, 224, 71, ${0.35 + breath.value * 0.4})`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14 + breath.value * 12
  }));

  // 累计天数
  const journeyDays = firstAt ? daysSince(firstAt) : 1;
  const today = new Date();
  const todayStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

  // 统计选中
  const selPnl = +cards.reduce((s, c) => s + (c.pnlUsdt ?? 0), 0).toFixed(2);
  const selWin = cards.filter((c) => (c.pnlUsdt ?? 0) > 0).length;
  const selBest = cards.reduce<SavedCard | null>(
    (best, c) => (best && (best.pnlUsdt ?? 0) >= (c.pnlUsdt ?? 0) ? best : c),
    null
  );

  const positive = selPnl >= 0;
  const heroColor = positive ? "#FDE68A" : "#FCA5A5";

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15,15,30,0.92)",
        zIndex: 100
      }}
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: 56, paddingBottom: 140, paddingHorizontal: 18 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 关闭按钮 */}
        <View style={{ position: "absolute", top: 14, right: 14, zIndex: 5 }}>
          <Pressable
            onPress={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.14)"
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 16, lineHeight: 18, fontWeight: "700" }}>
              ✕
            </Text>
          </Pressable>
        </View>

        <Animated.View style={[{ borderRadius: 28, overflow: "hidden" }, enterStyle]}>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 1, result: "tmpfile" }}>
          <LinearGradient
            colors={["#1E1B4B", "#3730A3", "#5B21B6", "#7C3AED"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: 22, paddingBottom: 26 }}
          >
            {/* 漂浮光晕 */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -40,
                right: -40,
                width: 180,
                height: 180,
                borderRadius: 90,
                backgroundColor: "rgba(253,224,71,0.18)"
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                bottom: -30,
                left: -30,
                width: 140,
                height: 140,
                borderRadius: 70,
                backgroundColor: "rgba(124,58,237,0.35)"
              }}
            />

            {/* 顶部品牌区 */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <DolphinLogo size={42} animated={false} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>
                  H Wallet
                </Text>
                <Text
                  style={{
                    color: "rgba(255,255,255,0.6)",
                    fontSize: 10,
                    fontWeight: "700",
                    letterSpacing: 1.5,
                    marginTop: 2
                  }}
                >
                  AI · INVESTMENT · WALLET
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 10,
                  backgroundColor: "rgba(253,224,71,0.18)"
                }}
              >
                <Text style={{ color: "#FDE68A", fontSize: 9, fontWeight: "800" }}>
                  {todayStr}
                </Text>
              </View>
            </View>

            {/* 标题 */}
            <View style={{ marginTop: 22, alignItems: "center" }}>
              <Text
                style={{
                  color: "rgba(253,224,71,0.85)",
                  fontSize: 10,
                  fontWeight: "800",
                  letterSpacing: 3
                }}
              >
                MY TRADING REPORT
              </Text>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 22,
                  fontWeight: "900",
                  marginTop: 6,
                  letterSpacing: -0.5
                }}
              >
                我的 H Wallet 战报
              </Text>
            </View>

            {/* 巨字 PnL */}
            <View style={{ alignItems: "center", marginTop: 18, marginBottom: 6 }}>
              <Text
                style={{
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 2
                }}
              >
                {cards.length === libraryCount ? "ACCUMULATED P&L" : "SELECTED P&L"}
              </Text>
              <Animated.Text
                style={[
                  {
                    color: heroColor,
                    fontSize: 56,
                    fontWeight: "900",
                    letterSpacing: -2,
                    marginTop: 4,
                    fontVariant: ["tabular-nums"]
                  },
                  breathStyle
                ]}
              >
                {positive ? "+" : ""}
                {selPnl.toFixed(2)}
              </Animated.Text>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: "700" }}>
                USDT
              </Text>
            </View>

            {/* 三联统计 */}
            <View
              style={{
                marginTop: 14,
                flexDirection: "row",
                backgroundColor: "rgba(255,255,255,0.08)",
                borderRadius: 16,
                paddingVertical: 14
              }}
            >
              <ReportStat label="精选战绩" value={`${cards.length}`} suffix="张" />
              <Divider />
              <ReportStat label="盈利占比" value={`${cards.length ? Math.round((selWin / cards.length) * 100) : 0}`} suffix="%" />
              <Divider />
              <ReportStat label="入市天数" value={`${journeyDays}`} suffix="天" />
            </View>

            {/* 入选卡片摘要 */}
            <View style={{ marginTop: 16, gap: 8 }}>
              {cards.map((c, i) => (
                <ReportRow key={c.id} card={c} rank={i + 1} />
              ))}
            </View>

            {/* 战绩印章 */}
            {selBest && (selBest.pnlUsdt ?? 0) > 0 ? (
              <View
                style={{
                  marginTop: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(253,224,71,0.4)",
                  padding: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: "rgba(253,224,71,0.08)"
                }}
              >
                <Text style={{ fontSize: 22 }}>🏆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "rgba(253,224,71,0.8)", fontSize: 9, fontWeight: "800", letterSpacing: 1.5 }}>
                    BEST PICK
                  </Text>
                  <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800", marginTop: 2 }}>
                    {tileTitle(selBest)} · +{(selBest.pnlUsdt ?? 0).toFixed(2)} U
                  </Text>
                </View>
              </View>
            ) : null}

            {/* 底部品牌 */}
            <View style={{ marginTop: 22, alignItems: "center" }}>
              <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600" }}>
                与 AI 同行 · 让每一笔都被记得
              </Text>
              <Text
                style={{
                  color: "rgba(253,224,71,0.7)",
                  fontSize: 10,
                  fontWeight: "800",
                  letterSpacing: 2,
                  marginTop: 4
                }}
              >
                @ H WALLET · h-wallet.app
              </Text>
            </View>
          </LinearGradient>
          </ViewShot>
        </Animated.View>

        {/* 操作提示 */}
        <View style={{ marginTop: 16, alignItems: "center", gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onSave}
              disabled={busy !== null}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.14)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.25)",
                opacity: busy ? 0.55 : 1
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>
                {busy === "save" ? "保存中…" : "💾 保存到相册"}
              </Text>
            </Pressable>
            <Pressable
              onPress={onShare}
              disabled={busy !== null}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderRadius: 999,
                backgroundColor: "#FDE68A",
                opacity: busy ? 0.55 : 1
              }}
            >
              <Text style={{ color: "#78350F", fontSize: 13, fontWeight: "900" }}>
                {busy === "share" ? "准备中…" : "🚀 分享给朋友"}
              </Text>
            </Pressable>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>
            截图将保存为高清 PNG · 适合朋友圈直发
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Divider() {
  return (
    <View
      style={{ width: 1, backgroundColor: "rgba(255,255,255,0.12)", marginVertical: 4 }}
    />
  );
}

function ReportStat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 22,
            fontWeight: "900",
            fontVariant: ["tabular-nums"]
          }}
        >
          {value}
        </Text>
        {suffix ? (
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "700" }}>
            {suffix}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: "600", marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

function ReportRow({ card, rank }: { card: SavedCard; rank: number }) {
  const meta = categoryMeta[card.category as TradeCardCategory] ?? categoryMeta.swap;
  const pnl = card.pnlUsdt ?? 0;
  const pos = pnl > 0;
  const flat = pnl === 0;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: 12,
        gap: 10
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(253,224,71,0.18)"
        }}
      >
        <Text style={{ color: "#FDE68A", fontSize: 11, fontWeight: "900" }}>{rank}</Text>
      </View>
      <Text style={{ fontSize: 18 }}>{meta.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }} numberOfLines={1}>
          {tileTitle(card)}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600", marginTop: 2 }}>
          {meta.label} · {fmtDate(card.savedAt).slice(5)}
        </Text>
      </View>
      <Text
        style={{
          color: flat ? "rgba(255,255,255,0.7)" : pos ? "#86EFAC" : "#FCA5A5",
          fontSize: 15,
          fontWeight: "900",
          fontVariant: ["tabular-nums"]
        }}
      >
        {flat ? "—" : `${pos ? "+" : ""}${pnl.toFixed(2)}`}
      </Text>
    </View>
  );
}


/* ─────────────────────────────────────────────
   FriendsTab — 好友列表 + 邀请入口
   ───────────────────────────────────────────── */

const friendAvatars = ["🐬", "🦊", "🐻", "🦁", "🐼", "🐨", "🐰", "🐸", "🦄", "🐙"];

function FriendsTab({ friends }: { friends: InvitedFriend[] }) {
  const [inviteCode] = useState(() => inviteStore.generateCode());

  async function copyInviteLink() {
    const link = inviteStore.generateShareLink();
    try {
      await Clipboard.setStringAsync(link);
      toastBus.push({
        emoji: "📋",
        title: "邀请链接已复制",
        subtitle: "发送给朋友即可邀请",
        tone: "success",
      });
    } catch {
      toastBus.push({
        emoji: "⚠️",
        title: "复制失败",
        subtitle: "请手动复制邀请码",
        tone: "warn",
      });
    }
  }

  function addDemoFriend() {
    const names = ["小明", "小红", "阿强", "小美", "大壮", "小花", "阿杰", "小丽"];
    const name = names[Math.floor(Math.random() * names.length)];
    const avatar = friendAvatars[Math.floor(Math.random() * friendAvatars.length)];
    inviteStore.addFriend({
      nickname: name,
      avatar,
      status: Math.random() > 0.3 ? "joined" : "pending",
    });
    toastBus.push({
      emoji: "🎉",
      title: `${name} 已通过邀请加入`,
      tone: "success",
    });
  }

  return (
    <View className="px-4 pt-4">
      {/* 邀请卡片 */}
      <View style={{ borderRadius: 20, overflow: "hidden", marginBottom: 16 }}>
        <LinearGradient
          colors={["#7C3AED", "#5B21B6", "#4338CA"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 20 }}
        >
          {/* 装饰光晕 */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -20,
              right: -20,
              width: 100,
              height: 100,
              borderRadius: 50,
              backgroundColor: "rgba(253,224,71,0.15)",
            }}
          />
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900" }}>
            邀请好友，一起赚
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "500", marginTop: 6 }}>
            分享你的交易卡片，邀请好友加入 H Wallet
          </Text>

          {/* 邀请码 */}
          <View
            style={{
              marginTop: 14,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: 12,
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "700" }}>
                我的邀请码
              </Text>
              <Text style={{ color: "#FDE68A", fontSize: 18, fontWeight: "900", letterSpacing: 2, marginTop: 2 }}>
                {inviteCode}
              </Text>
            </View>
            <Pressable
              onPress={copyInviteLink}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: "#FDE68A",
              }}
            >
              <Text style={{ color: "#78350F", fontSize: 12, fontWeight: "900" }}>
                复制链接
              </Text>
            </Pressable>
          </View>

          {/* 统计 */}
          <View style={{ marginTop: 14, flexDirection: "row", gap: 16 }}>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900" }}>
                {friends.length}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "600" }}>
                已邀请
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.15)" }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900" }}>
                {friends.filter((f) => f.status === "joined" || f.status === "active").length}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "600" }}>
                已加入
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.15)" }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: "#FDE68A", fontSize: 22, fontWeight: "900" }}>
                {friends.filter((f) => f.status === "active").length}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "600" }}>
                活跃中
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* 好友列表 */}
      {friends.length === 0 ? (
        <View className="items-center justify-center px-10 py-12">
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🐬</Text>
          <Text className="text-center text-[15px] font-semibold text-ink">
            还没有邀请好友
          </Text>
          <Text className="mt-1 text-center text-[12px] text-muted">
            分享你的交易卡片或邀请链接，{"\n"}好友加入后会出现在这里。
          </Text>
          <Pressable
            onPress={addDemoFriend}
            style={{
              marginTop: 16,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: "#7C3AED",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>
              模拟邀请一个好友
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Text className="mb-1 px-1 text-[13px] font-semibold text-muted">
            好友列表
          </Text>
          {friends.map((friend) => (
            <FriendRow key={friend.id} friend={friend} />
          ))}
        </View>
      )}
    </View>
  );
}

function FriendRow({ friend }: { friend: InvitedFriend }) {
  const statusMeta = {
    pending: { label: "等待加入", color: "#F59E0B", bg: "#FEF3C7" },
    joined: { label: "已加入", color: "#10B981", bg: "#D1FAE5" },
    active: { label: "活跃中", color: "#7C3AED", bg: "#EDE9FE" },
  };
  const meta = statusMeta[friend.status];
  const dateStr = fmtDate(friend.invitedAt);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 12,
        gap: 12,
        borderWidth: 1,
        borderColor: "#F1F3F5",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
      }}
    >
      {/* 头像 */}
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: "#F3F4F6",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 22 }}>{friend.avatar || "🐬"}</Text>
      </View>

      {/* 信息 */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F0F0F" }}>
            {friend.nickname}
          </Text>
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: meta.bg,
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: "800", color: meta.color }}>
              {meta.label}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
          {friend.cardTitle ? `通过「${friend.cardTitle}」邀请` : `邀请于 ${dateStr}`}
        </Text>
      </View>

      {/* 日期 */}
      <Text style={{ fontSize: 10, color: "#9CA3AF" }}>
        {dateStr.slice(5)}
      </Text>
    </View>
  );
}
