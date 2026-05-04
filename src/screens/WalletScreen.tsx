import React from "react";
import { useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";
import { Surface } from "../components/ui/Surface";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CardStackIcon,
  ChevronRightIcon,
  EyeIcon,
  LeafIcon,
  LockIcon,
  ScanIcon,
  SearchIcon,
  SparkIcon,
  SwapIcon
} from "../components/ui/Icons";
import { TokenIcon } from "../components/ui/TokenIcons";
import { CardLibraryScreen } from "./CardLibraryScreen";
import { MemeMarketScreen } from "./MemeMarketScreen";
import { useCardLibrary } from "../services/cardLibrary";
import { walletAssets } from "../data/mockData";
import type { AppView } from "../types";
import { isPositive } from "../utils/format";

const SCREEN_W = Dimensions.get("window").width;

type WalletScreenProps = {
  onChangeView: (view: AppView) => void;
};

const heroActions = [
  { id: "deposit", label: "充值", Icon: ArrowDownIcon },
  { id: "withdraw", label: "提现", Icon: ArrowUpIcon },
  { id: "swap", label: "兑换", Icon: SwapIcon },
  { id: "scan", label: "扫码", Icon: ScanIcon }
];

const services: {
  id: string;
  title: string;
  subtitle: string;
  Icon: (p: { size?: number; color?: string }) => React.ReactNode;
  bg: string[];
  color: string;
  locked?: boolean;
}[] = [
  {
    id: "cards",
    title: "卡库",
    subtitle: "12 笔交易",
    Icon: CardStackIcon,
    bg: ["#EEF2FF", "#E0E7FF"],
    color: "#4338CA"
  },
  {
    id: "staking",
    title: "质押",
    subtitle: "敬请期待",
    Icon: LockIcon,
    bg: ["#FEF3C7", "#FDE68A"],
    color: "#B45309",
    locked: true
  },
  {
    id: "earn",
    title: "链上赚币",
    subtitle: "稳健收益",
    Icon: LeafIcon,
    bg: ["#DCFCE7", "#BBF7D0"],
    color: "#15803D"
  },
  {
    id: "meme",
    title: "Meme 市场",
    subtitle: "实时热门",
    Icon: SparkIcon,
    bg: ["#FEF9C3", "#FEF08A"],
    color: "#CA8A04"
  },
  {
    id: "dph",
    title: "DPH",
    subtitle: "敬请期待",
    Icon: SwapIcon,
    bg: ["#FCE7F3", "#FBCFE8"],
    color: "#BE185D",
    locked: true
  }
];

// 模拟资产组合走势(用于 hero spark line)
const portfolioSpark = [
  18, 22, 19, 25, 28, 24, 30, 35, 33, 40, 38, 45, 50, 48, 55, 60, 58, 65, 70, 75
];

// 单个币种的迷你走势
const assetSparks: Record<string, number[]> = {
  USDT: [20, 21, 20, 21, 20, 22, 21, 22, 23, 22, 23, 22],
  ETH: [40, 38, 42, 41, 39, 36, 35, 34, 32, 33, 31, 30],
  BTC: [30, 32, 31, 33, 35, 34, 36, 38, 37, 39, 41, 42]
};

export function WalletScreen({ onChangeView }: WalletScreenProps) {
  const [hideBalance, setHideBalance] = useState(false);
  const [tab, setTab] = useState<"assets" | "nft" | "activity">("assets");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [memeOpen, setMemeOpen] = useState(false);
  const [libraryMounted, setLibraryMounted] = useState(false);
  const library = useCardLibrary();

  // 卡库从右滑入；关闭时延迟卸载以保留动画
  const libraryX = useSharedValue(SCREEN_W);
  useEffect(() => {
    if (libraryOpen) {
      setLibraryMounted(true);
      libraryX.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    } else if (libraryMounted) {
      libraryX.value = withTiming(SCREEN_W, { duration: 280, easing: Easing.out(Easing.cubic) });
      const t = setTimeout(() => setLibraryMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [libraryOpen, libraryMounted, libraryX]);
  const libraryStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: libraryX.value }]
  }));

  return (
    <View className="flex-1 bg-bg">
      {/* 顶部导航 */}
      <View className="flex-row items-center justify-between px-3 pb-2 pt-1">
        <Pressable
          accessibilityRole="button"
          onPress={() => onChangeView("chat")}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface"
        >
          <ArrowLeftIcon size={22} />
        </Pressable>

        {/* 中间钱包地址胶囊 */}
        <Pressable className="flex-row items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 active:opacity-70">
          <View className="h-2 w-2 rounded-full bg-emerald-500" />
          <Text className="text-[13px] font-semibold text-ink">主账户</Text>
          <Text className="text-[12px] text-muted">0x9a…3F2c</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface"
        >
          <ScanIcon size={20} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 96 }}>
        {/* Hero 卡 */}
        <View className="px-4 pt-3">
          <HeroCard hideBalance={hideBalance} onToggleHide={() => setHideBalance((v) => !v)} />
        </View>

        {/* 快捷操作 */}
        <View className="mt-5 px-4">
          <Surface elevation={1} padded={false} className="flex-row items-center justify-around py-3">
            {heroActions.map(({ id, label, Icon }) => (
              <Pressable key={id} accessibilityRole="button" className="items-center active:opacity-60">
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-surface">
                  <Icon size={20} color="#0F0F0F" />
                </View>
                <Text className="mt-1.5 text-[12px] font-medium text-ink2">{label}</Text>
              </Pressable>
            ))}
          </Surface>
        </View>

        {/* Agent banner */}
        <View className="mx-4 mt-4">
          <AgentBanner />
        </View>

        {/* 分段标签 */}
        <View className="mt-6 px-4">
          <View className="flex-row items-center gap-1 rounded-full bg-surface p-1">
            <SegmentTab label="资产" active={tab === "assets"} onPress={() => setTab("assets")} />
            <SegmentTab label="NFT" active={tab === "nft"} onPress={() => setTab("nft")} />
            <SegmentTab label="活动" active={tab === "activity"} onPress={() => setTab("activity")} />
          </View>
        </View>

        {/* 资产列表 */}
        {tab === "assets" && (
          <View className="mt-3 px-4">
            <Surface padded={false} elevation={1}>
              {walletAssets.map((asset, idx) => {
                const positive = isPositive(asset.change24h);
                const spark = assetSparks[asset.symbol] ?? assetSparks.USDT;
                return (
                  <Pressable
                    key={asset.id}
                    accessibilityRole="button"
                    className={`flex-row items-center px-4 py-3.5 active:bg-surface ${
                      idx < walletAssets.length - 1 ? "border-b border-line" : ""
                    }`}
                  >
                    <TokenIcon symbol={asset.symbol} size={40} />
                    <View className="ml-3 flex-1">
                      <Text className="text-[16px] font-semibold text-ink">{asset.symbol}</Text>
                      <Text className="text-[12px] text-muted">{asset.balance}</Text>
                    </View>

                    {/* 迷你走势 */}
                    <View className="mr-3 h-8 w-16">
                      <SparkChart
                        values={spark}
                        stroke={positive ? "#10B981" : "#EF4444"}
                        fill={positive ? "#10B981" : "#EF4444"}
                        height={32}
                        thin
                      />
                    </View>

                    <View className="items-end">
                      <Text className="text-[15px] font-semibold text-ink">{asset.valueUsd}</Text>
                      <Text className={`text-[12px] font-medium ${positive ? "text-emerald-600" : "text-red-500"}`}>
                        {asset.change24h}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              {/* 添加代币 */}
              <Pressable className="flex-row items-center justify-center gap-1 border-t border-line py-3 active:opacity-60">
                <Text className="text-[13px] font-medium text-muted">+ 添加代币</Text>
              </Pressable>
            </Surface>
          </View>
        )}

        {tab === "nft" && (
          <View className="mt-3 px-4">
            <Surface elevation={1} className="items-center py-10">
              <Text className="text-[14px] text-muted">暂无 NFT 收藏</Text>
            </Surface>
          </View>
        )}

        {tab === "activity" && (
          <View className="mt-3 px-4">
            <Surface elevation={1} className="items-center py-10">
              <Text className="text-[14px] text-muted">暂无活动记录</Text>
            </Surface>
          </View>
        )}

        {/* 服务网格 */}
        <View className="mt-6 px-4">
          <Text className="mb-3 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">服务</Text>
          <View className="flex-row flex-wrap gap-3">
            {services.map(({ id, title, subtitle, Icon, bg, color, locked }) => {
              const display =
                id === "cards"
                  ? library.length > 0
                    ? `${library.length} 张已归档`
                    : "点击查看"
                  : subtitle;
              return (
                <TiltCard
                  key={id}
                  style={{ width: "47.5%" }}
                  shadowColor={color}
                  onPress={
                    id === "cards" ? () => setLibraryOpen(true) :
                    id === "meme" ? () => setMemeOpen(true) :
                    undefined
                  }
                >
                  <View style={{ borderRadius: 18, overflow: "hidden" }}>
                    <LinearGradient
                      colors={bg as [string, string]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        padding: 14,
                        height: 100,
                        justifyContent: "space-between",
                        borderRadius: 18,
                        opacity: locked ? 0.85 : 1
                      }}
                    >
                      <View
                        className="h-9 w-9 items-center justify-center rounded-xl"
                        style={{ backgroundColor: "rgba(255,255,255,0.65)" }}
                      >
                        <Icon size={18} color={color} />
                      </View>
                      <View>
                        <Text className="text-[15px] font-bold" style={{ color }}>
                          {title}
                        </Text>
                        <Text className="text-[11px]" style={{ color, opacity: 0.7 }}>
                          {display}
                        </Text>
                      </View>
                    </LinearGradient>

                    {/* 锁定设计：右上角小锁徽章，表明“中期上线” */}
                    {locked ? (
                      <View
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: "rgba(15,15,15,0.75)",
                          borderRadius: 999,
                          paddingHorizontal: 7,
                          paddingVertical: 3,
                          gap: 3
                        }}
                      >
                        <LockIcon size={10} color="#FCD34D" />
                        <Text
                          style={{ fontSize: 9, fontWeight: "700", color: "#FDE68A" }}
                        >
                          锁定
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </TiltCard>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* 底部搜索框 · 占位占型，后续接代币/地址/合约搜索 */}
      <WalletSearchBar />

      {/* 卡库 · 从右滑入（仅打开时挂载，避免遮挡返回） */}
      {libraryMounted ? (
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#FFFFFF"
            },
            libraryStyle
          ]}
        >
          <CardLibraryScreen onClose={() => setLibraryOpen(false)} />
        </Animated.View>
      ) : null}

      {/* Meme 市场全屏覆盖 */}
      {memeOpen ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFFFF" }}>
          <MemeMarketScreen onBack={() => setMemeOpen(false)} />
        </View>
      ) : null}
    </View>
  );
}

/* ─────────────────────────────────────────────
   底部搜索栏 · MVP 占位
   - 输入框聚焦展示快捷分类（代币 / 地址 / 合约）
   - 后续接入：搜索代币、地址、合约
   ───────────────────────────────────────────── */
function WalletSearchBar() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  // 键盘出现/隐藏时，抬高搜索条
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKbHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const quickChips = [
    { id: "token", label: "代币", emoji: "🪙" },
    { id: "address", label: "地址", emoji: "📮" },
    { id: "contract", label: "合约", emoji: "📜" }
  ];

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: kbHeight, // 随键盘抬高
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: kbHeight > 0 ? 8 : 14,
        backgroundColor: "rgba(255,255,255,0.92)",
        borderTopWidth: 1,
        borderTopColor: "#F1F3F5"
      }}
    >
      {/* 聚焦时展示快捷分类 */}
      {focused ? (
        <View className="mb-2 flex-row" style={{ gap: 6 }}>
          {quickChips.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setQuery((q) => (q ? q : `${c.label}: `))}
              className="flex-row items-center rounded-full px-3 py-1.5"
              style={{ backgroundColor: "#F3F4F6" }}
            >
              <Text style={{ fontSize: 12, marginRight: 4 }}>{c.emoji}</Text>
              <Text className="text-[12px] font-semibold" style={{ color: "#374151" }}>
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View
        className="flex-row items-center rounded-2xl px-3"
        style={{
          backgroundColor: "#F3F4F6",
          borderWidth: 1,
          borderColor: focused ? "#7C3AED" : "transparent",
          height: 44
        }}
      >
        <SearchIcon size={18} color={focused ? "#7C3AED" : "#9CA3AF"} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="搜索代币 / 地址 / 合约"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            marginLeft: 8,
            fontSize: 14,
            color: "#0F0F0F",
            paddingVertical: 0
          }}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery("")}
            hitSlop={8}
            className="ml-1 h-5 w-5 items-center justify-center rounded-full"
            style={{ backgroundColor: "#D1D5DB" }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 11, lineHeight: 12 }}>×</Text>
          </Pressable>
        ) : (
          <View
            className="ml-1 rounded-full px-2 py-0.5"
            style={{ backgroundColor: "#E5E7EB" }}
          >
            <Text className="text-[10px] font-semibold" style={{ color: "#6B7280" }}>
              敬请期待
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function SegmentTab({
  label,
  active,
  onPress
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-1 items-center rounded-full py-2 ${active ? "bg-bg" : ""}`}
      style={
        active
          ? {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 3
            }
          : undefined
      }
    >
      <Text className={`text-[14px] font-semibold ${active ? "text-ink" : "text-muted"}`}>{label}</Text>
    </Pressable>
  );
}

/**
 * 极简 SVG sparkline:平滑面积 + 顶线。
 */
function SparkChart({
  values,
  stroke,
  fill,
  height,
  thin
}: {
  values: number[];
  stroke: string;
  fill: string;
  height: number;
  thin?: boolean;
}) {
  const W = 100; // viewBox 宽,使用 preserveAspectRatio="none" 拉伸
  const H = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = W / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = H - ((v - min) / range) * (H - 6) - 3;
    return [x, y] as const;
  });

  // 平滑路径
  const linePath = points
    .map((p, i) => {
      if (i === 0) return `M ${p[0]} ${p[1]}`;
      const prev = points[i - 1];
      const cx = (prev[0] + p[0]) / 2;
      return `Q ${cx} ${prev[1]} ${cx} ${(prev[1] + p[1]) / 2} T ${p[0]} ${p[1]}`;
    })
    .join(" ");

  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const gradId = `g-${stroke.replace("#", "")}-${values.length}`;

  return (
    <Svg
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <Defs>
        <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fill} stopOpacity={thin ? 0.18 : 0.35} />
          <Stop offset="1" stopColor={fill} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradId})`} />
      <Path d={linePath} stroke={stroke} strokeWidth={thin ? 1.5 : 2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Agent 状态 Banner:闪烁绿点 + 数字脉冲 + 跑动光带。
 */
function AgentBanner() {
  // 1. 状态绿点呼吸闪烁
  const dot = useSharedValue(1);
  // 2. 数字 +2U 微脉冲
  const pulse = useSharedValue(0);
  // 3. 跑光带 -100% → 100%
  const shine = useSharedValue(-1);

  useEffect(() => {
    dot.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    shine.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.linear }),
        withTiming(-1, { duration: 0 }),
        withTiming(-1, { duration: 1200 })
      ),
      -1,
      false
    );
  }, [dot, pulse, shine]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dot.value,
    transform: [{ scale: 0.85 + dot.value * 0.4 }]
  }));
  const dotHaloStyle = useAnimatedStyle(() => ({
    opacity: (1 - dot.value) * 0.6,
    transform: [{ scale: 1 + (1 - dot.value) * 1.4 }]
  }));
  const profitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.06 }]
  }));
  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shine.value * 280 }, { rotate: "20deg" }]
  }));

  return (
    <Pressable accessibilityRole="button" className="active:opacity-90">
      <View
        style={{
          borderRadius: 18,
          overflow: "hidden",
          shadowColor: "#D9AA43",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.22,
          shadowRadius: 14
        }}
      >
        <LinearGradient
          colors={["#FCD34D", "#F59E0B", "#D9AA43"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center"
          }}
        >
          {/* 跑动光带 */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: -20,
                bottom: -20,
                width: 60,
                backgroundColor: "rgba(255,255,255,0.45)"
              },
              shineStyle
            ]}
          />

          {/* 左侧 spark icon + 闪烁绿点 */}
          <View className="h-10 w-10 items-center justify-center">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-white/35">
              <SparkIcon size={20} color="#7C2D12" />
            </View>
            {/* 状态绿点 */}
            <View
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 12,
                height: 12,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: "#22C55E"
                  },
                  dotHaloStyle
                ]}
              />
              <Animated.View
                style={[
                  {
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "#22C55E",
                    borderWidth: 1.5,
                    borderColor: "#FFFFFF"
                  },
                  dotStyle
                ]}
              />
            </View>
          </View>

          <View className="ml-3 flex-1">
            <Text className="text-[14px] font-bold text-amber-950">
              Agent · 2 个策略正在运行
            </Text>
            <View className="mt-0.5 flex-row items-baseline">
              <Text className="text-[12px] text-amber-900/80">累计盈利 </Text>
              <Animated.Text
                style={[
                  { fontSize: 13, fontWeight: "800", color: "#065F46" },
                  profitStyle
                ]}
              >
                +2 U
              </Animated.Text>
            </View>
          </View>

          <ChevronRightIcon size={18} color="#7C2D12" />
        </LinearGradient>
      </View>
    </Pressable>
  );
}

/**
 * Hero 资产卡:
 *  - 紫金双光晕慢漂(8s + 11s)
 *  - 总资产数字呼吸脉冲
 *  - +8.2% 绿胶囊呼吸高亮
 */
function HeroCard({
  hideBalance,
  onToggleHide
}: {
  hideBalance: boolean;
  onToggleHide: () => void;
}) {
  const driftA = useSharedValue(0); // 金色光晕 0→1
  const driftB = useSharedValue(0); // 紫色光晕 0→1
  const numPulse = useSharedValue(0);
  const greenPulse = useSharedValue(0);

  useEffect(() => {
    driftA.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 8000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 8000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    driftB.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 11000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 11000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    numPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    greenPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [driftA, driftB, numPulse, greenPulse]);

  const aStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -40 + driftA.value * 30 },
      { translateY: -60 + driftA.value * 20 },
      { scale: 1 + driftA.value * 0.15 }
    ],
    opacity: 0.12 + driftA.value * 0.08
  }));
  const bStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -40 - driftB.value * 30 },
      { translateY: 80 - driftB.value * 25 },
      { scale: 1 + driftB.value * 0.18 }
    ],
    opacity: 0.25 + driftB.value * 0.12
  }));
  const numStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + numPulse.value * 0.015 }],
    textShadowRadius: 6 + numPulse.value * 14
  }));
  const greenStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + greenPulse.value * 0.06 }],
    shadowOpacity: 0.2 + greenPulse.value * 0.5
  }));

  return (
    <View
      style={{
        borderRadius: 28,
        overflow: "hidden",
        shadowColor: "#2A0D4D",
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.28,
        shadowRadius: 28,
        elevation: 10
      }}
    >
      <LinearGradient
        colors={["#0F0427", "#2A0D4D", "#5B21B6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 }}
      >
        {/* 金色光晕(漂移) */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              right: 0,
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: "#D9AA43"
            },
            aStyle
          ]}
        />
        {/* 紫色光晕(漂移) */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              bottom: 0,
              left: 0,
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: "#7C3AED"
            },
            bStyle
          ]}
        />

        {/* 顶部 */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
            <View className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            <Text className="text-[11px] font-semibold text-white">Multi-chain</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Text className="text-[11px] text-white/60">本月收益</Text>
            <Text className="text-[12px] font-bold text-emerald-300">+$952.30</Text>
          </View>
        </View>

        {/* 余额 */}
        <View className="mt-4">
          <Text className="text-[12px] tracking-wider text-white/60">总资产 (USD)</Text>
          <View className="mt-1 flex-row items-center">
            <Animated.Text
              style={[
                {
                  fontSize: 40,
                  lineHeight: 44,
                  fontWeight: "800",
                  color: "#FFFFFF",
                  textShadowColor: "rgba(217,170,67,0.55)",
                  textShadowOffset: { width: 0, height: 0 }
                },
                numStyle
              ]}
            >
              {hideBalance ? "$ ••••••" : "$12,580.45"}
            </Animated.Text>
            <Pressable
              onPress={onToggleHide}
              className="ml-2 h-7 w-7 items-center justify-center rounded-full bg-white/15 active:opacity-70"
            >
              <EyeIcon size={14} color="#FFFFFF" />
            </Pressable>
          </View>

          <View className="mt-2 flex-row items-center gap-2">
            <Animated.View
              style={[
                {
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  backgroundColor: "rgba(52,211,153,0.28)",
                  shadowColor: "#34D399",
                  shadowOffset: { width: 0, height: 0 },
                  shadowRadius: 10
                },
                greenStyle
              ]}
            >
              <Text className="text-[12px] font-bold text-emerald-300">+8.2%</Text>
            </Animated.View>
            <Text className="text-[12px] text-white/70">最近 30 天</Text>
          </View>
        </View>

        {/* 走势图 */}
        <View className="mt-4 h-14 w-full">
          <SparkChart
            values={portfolioSpark}
            stroke="#A78BFA"
            fill="#A78BFA"
            height={56}
          />
        </View>
      </LinearGradient>
    </View>
  );
}

/**
 * 服务卡按压视差:按下时缩 0.96,松开 spring 弹回。
 */
function TiltCard({
  children,
  style,
  shadowColor,
  onPress
}: {
  children: React.ReactNode;
  style?: any;
  shadowColor: string;
  onPress?: () => void;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.95, { duration: 120, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      }}
      style={[
        style,
        aStyle,
        {
          borderRadius: 18,
          overflow: "hidden",
          shadowColor,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.16,
          shadowRadius: 14
        }
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
