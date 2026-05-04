import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
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
import { Avatar } from "../components/ui/Avatar";
import { ChatInput } from "../components/ChatInput";
import { ChevronRightIcon, SparkIcon } from "../components/ui/Icons";
import { TokenIcon } from "../components/ui/TokenIcons";
import { makeId } from "../utils/id";
import type { CommunityMessage } from "../types";

// 社区消息初始为空，用户可以发送消息
const communityMessages: CommunityMessage[] = [];

const kols = [
  { id: "k1", name: "AlphaWolf", avatar: "🐺", roi: "+128%", live: true },
  { id: "k2", name: "ETH Maxi", avatar: "Ξ", roi: "+86%", live: false },
  { id: "k3", name: "DeFiDog", avatar: "🐕", roi: "+62%", live: true },
  { id: "k4", name: "Layla", avatar: "L", roi: "+45%", live: false },
  { id: "k5", name: "Satoshi.Jr", avatar: "S", roi: "+39%", live: false }
];

const strategies = [
  {
    id: "s1",
    title: "ETH 趋势跟随",
    author: "AlphaWolf",
    roi: "+24.5%",
    period: "30D",
    spark: [10, 12, 11, 14, 16, 15, 18, 22, 20, 25, 28, 32],
    color: "#10B981",
    bg: ["#ECFDF5", "#D1FAE5"] as [string, string]
  },
  {
    id: "s2",
    title: "BTC 网格套利",
    author: "ETH Maxi",
    roi: "+12.8%",
    period: "30D",
    spark: [10, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 18],
    color: "#4338CA",
    bg: ["#EEF2FF", "#E0E7FF"] as [string, string]
  },
  {
    id: "s3",
    title: "稳定币挖矿",
    author: "DeFiDog",
    roi: "+8.2%",
    period: "30D",
    spark: [10, 10, 11, 10, 11, 12, 11, 12, 13, 12, 13, 14],
    color: "#B45309",
    bg: ["#FEF3C7", "#FDE68A"] as [string, string]
  }
];

const hotMarkets = [
  { symbol: "BTC", price: "$67,832", change: "+2.4%", up: true },
  { symbol: "ETH", price: "$3,842", change: "-0.5%", up: false },
  { symbol: "SOL", price: "$182.5", change: "+5.1%", up: true },
  { symbol: "USDT", price: "$1.0001", change: "+0.0%", up: true }
];

function CommunityRow({ message }: { message: CommunityMessage }) {
  const isRight = message.align === "right";
  const isAi = message.role === "ai";

  return (
    <View className={`my-1.5 flex-row px-4 ${isRight ? "justify-end" : "justify-start"}`}>
      {!isRight ? (
        <View className="mr-2">
          <Avatar emoji={message.avatar} tone={isAi ? "ink" : "neutral"} size={32} />
        </View>
      ) : null}

      <View className={`max-w-[80%] ${isRight ? "items-end" : "items-start"}`}>
        {!isRight ? (
          <View className="mb-0.5 flex-row items-center gap-1.5">
            <Text className="text-[12px] font-semibold text-ink2">{message.author}</Text>
            {isAi ? (
              <View className="rounded-full bg-indigo-100 px-1.5">
                <Text className="text-[10px] font-bold text-indigo-700">AI</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {message.card ? (
          <View className="rounded-2xl border border-line bg-bg px-3.5 py-2.5">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-[14px] font-semibold text-ink">{message.card.pair}</Text>
              <Text className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-600">
                {message.card.tag}
              </Text>
            </View>
            <Text className="mt-1 text-[13px] text-ink">
              {message.card.direction}{" "}
              <Text className="font-bold text-emerald-600">{message.card.pnl}</Text>
            </Text>
          </View>
        ) : (
          <View
            className={`rounded-2xl px-3.5 py-2 ${
              isRight ? "bg-ink" : "bg-surface2"
            }`}
          >
            <Text className={`text-[14px] leading-5 ${isRight ? "text-bg" : "text-ink"}`}>
              {message.text}
            </Text>
          </View>
        )}
      </View>

      {isRight ? (
        <View className="ml-2">
          <Avatar label={message.avatar} tone="ink" size={32} />
        </View>
      ) : null}
    </View>
  );
}

export function CommunityScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<CommunityMessage[]>(communityMessages);
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<"feed" | "chat">("feed");

  function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((current) => [
      ...current,
      { id: makeId("cm_me"), author: "我", avatar: "T", role: "member", text: trimmed, align: "right" }
    ]);
    setInput("");
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  return (
    <View className="flex-1">
      {/* 顶部 tab */}
      <View className="px-4 pb-2 pt-1">
        <View className="flex-row items-center gap-1 rounded-full bg-surface p-1">
          <TabPill label="发现" active={tab === "feed"} onPress={() => setTab("feed")} />
          <TabPill label="聊天" active={tab === "chat"} onPress={() => setTab("chat")} />
        </View>
      </View>

      {tab === "feed" ? (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {/* KOL 横滑 */}
          <View className="mt-1">
            <View className="mb-2 flex-row items-center justify-between px-4">
              <Text className="text-[15px] font-bold text-ink">热门交易员</Text>
              <Pressable>
                <Text className="text-[12px] text-muted">全部 →</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
            >
              {kols.map((k) => (
                <KolCard key={k.id} kol={k} />
              ))}
            </ScrollView>
          </View>

          {/* 热门策略 */}
          <View className="mt-5">
            <View className="mb-2 flex-row items-center justify-between px-4">
              <Text className="text-[15px] font-bold text-ink">热门策略</Text>
              <Pressable>
                <Text className="text-[12px] text-muted">全部 →</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            >
              {strategies.map((s) => (
                <StrategyCard key={s.id} s={s} />
              ))}
            </ScrollView>
          </View>

          {/* AI 行情榜 */}
          <View className="mt-5 px-4">
            <View className="mb-2 flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <Text className="text-[15px] font-bold text-ink">AI 行情榜</Text>
                <View className="flex-row items-center gap-1 rounded-full bg-indigo-100 px-1.5 py-0.5">
                  <View className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
                  <Text className="text-[10px] font-bold text-indigo-700">LIVE</Text>
                </View>
              </View>
              <Pressable>
                <Text className="text-[12px] text-muted">查看全部 →</Text>
              </Pressable>
            </View>
            <View
              className="overflow-hidden rounded-2xl border border-line bg-bg"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 3
              }}
            >
              {hotMarkets.map((m, idx) => (
                <Pressable
                  key={m.symbol}
                  className={`flex-row items-center px-4 py-3 active:bg-surface ${
                    idx < hotMarkets.length - 1 ? "border-b border-line" : ""
                  }`}
                >
                  <Text className="w-5 text-[12px] font-bold text-muted">{idx + 1}</Text>
                  <View className="ml-2">
                    <TokenIcon symbol={m.symbol} size={32} />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-[14px] font-bold text-ink">{m.symbol}/USDT</Text>
                    <Text className="text-[11px] text-muted">现货 · 24h</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-[14px] font-bold text-ink">{m.price}</Text>
                    <Text className={`text-[12px] font-bold ${m.up ? "text-emerald-600" : "text-red-500"}`}>
                      {m.change}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 群聊预览入口 */}
          <Pressable
            onPress={() => setTab("chat")}
            className="mx-4 mt-5 flex-row items-center rounded-2xl border border-line bg-bg px-4 py-3.5 active:bg-surface"
          >
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100">
              <SparkIcon size={20} color="#4338CA" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-[14px] font-bold text-ink">H Wallet 官方社区</Text>
              <Text className="text-[12px] text-muted">3,284 人在线 · 进入聊天</Text>
            </View>
            <ChevronRightIcon size={18} />
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 16 }}
        >
          {messages.map((message) => (
            <CommunityRow key={message.id} message={message} />
          ))}
        </ScrollView>
      )}

      {tab === "chat" ? (
        <ChatInput value={input} placeholder="发送消息..." onChangeText={setInput} onSubmit={sendMessage} />
      ) : null}
    </View>
  );
}

/* ========= 组件 ========= */

function TabPill({
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
      <Text className={`text-[14px] font-semibold ${active ? "text-ink" : "text-muted"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function KolCard({
  kol
}: {
  kol: { id: string; name: string; avatar: string; roi: string; live: boolean };
}) {
  // 直播态闪烁
  const blink = useSharedValue(1);
  useEffect(() => {
    if (!kol.live) return;
    blink.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [kol.live, blink]);
  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  return (
    <Pressable className="items-center active:opacity-70" style={{ width: 76 }}>
      <View className="items-center justify-center" style={{ width: 64, height: 64 }}>
        {/* 渐变环 */}
        <LinearGradient
          colors={["#FCD34D", "#F59E0B", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: "absolute",
            width: 64,
            height: 64,
            borderRadius: 32
          }}
        />
        <View
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Text style={{ fontSize: 26 }}>{kol.avatar}</Text>
        </View>
        {kol.live ? (
          <Animated.View
            style={[
              {
                position: "absolute",
                bottom: -2,
                backgroundColor: "#DC2626",
                paddingHorizontal: 6,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: "#FFFFFF"
              },
              blinkStyle
            ]}
          >
            <Text style={{ fontSize: 9, fontWeight: "800", color: "#FFFFFF" }}>LIVE</Text>
          </Animated.View>
        ) : null}
      </View>
      <Text
        className="mt-2 text-[12px] font-semibold text-ink"
        numberOfLines={1}
        style={{ maxWidth: 72 }}
      >
        {kol.name}
      </Text>
      <Text className="text-[11px] font-bold text-emerald-600">{kol.roi}</Text>
    </Pressable>
  );
}

function StrategyCard({
  s
}: {
  s: {
    id: string;
    title: string;
    author: string;
    roi: string;
    period: string;
    spark: number[];
    color: string;
    bg: [string, string];
  };
}) {
  return (
    <Pressable
      style={{
        width: 220,
        borderRadius: 18,
        overflow: "hidden",
        shadowColor: s.color,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14,
        shadowRadius: 14
      }}
      className="active:opacity-90"
    >
      <LinearGradient
        colors={s.bg}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 14 }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-[14px] font-bold" style={{ color: s.color }}>
            {s.title}
          </Text>
          <View className="rounded-full bg-white/60 px-1.5 py-0.5">
            <Text className="text-[10px] font-bold" style={{ color: s.color }}>
              {s.period}
            </Text>
          </View>
        </View>
        <Text className="mt-0.5 text-[11px]" style={{ color: s.color, opacity: 0.7 }}>
          @{s.author}
        </Text>

        <View className="mt-2 h-10">
          <Sparkline values={s.spark} color={s.color} />
        </View>

        <View className="mt-2 flex-row items-end justify-between">
          <View>
            <Text className="text-[10px]" style={{ color: s.color, opacity: 0.7 }}>
              收益
            </Text>
            <Text className="text-[20px] font-bold" style={{ color: s.color }}>
              {s.roi}
            </Text>
          </View>
          <View
            className="rounded-full px-3 py-1.5"
            style={{ backgroundColor: s.color }}
          >
            <Text className="text-[11px] font-bold text-white">跟单</Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const W = 100;
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
  const linePath = points
    .map((p, i) => {
      if (i === 0) return `M ${p[0]} ${p[1]}`;
      const prev = points[i - 1];
      const cx = (prev[0] + p[0]) / 2;
      return `Q ${cx} ${prev[1]} ${cx} ${(prev[1] + p[1]) / 2} T ${p[0]} ${p[1]}`;
    })
    .join(" ");
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const gradId = `sg-${color.replace("#", "")}-${values.length}`;
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Defs>
        <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradId})`} />
      <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
