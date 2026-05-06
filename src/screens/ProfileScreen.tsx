import React from "react";
import { useEffect } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { Surface } from "../components/ui/Surface";
import {
  ArrowLeftIcon,
  CardStackIcon,
  ChevronRightIcon,
  LockIcon,
  SparkIcon
} from "../components/ui/Icons";
import { sessionStore, useSession } from "../services/sessionStore";
import { refreshAddresses } from "../services/walletApi";
import { toastBus } from "../services/toastBus";
import type { AppView } from "../types";
import { getProfileStats } from "../services/core/userApi";

type ProfileScreenProps = {
  onChangeView: (view: AppView) => void;
};


const stats = getProfileStats();

const menu: {
  id: string;
  title: string;
  desc?: string;
  Icon: (p: { size?: number; color?: string }) => React.ReactNode;
  bg: string;
  color: string;
  badge?: string;
}[] = [
  {
    id: "notification",
    title: "通知管理",
    desc: "3 条新消息",
    Icon: SparkIcon,
    bg: "#FEE2E2",
    color: "#DC2626",
    badge: "3"
  },
  {
    id: "security",
    title: "安全中心",
    desc: "已开启双重验证",
    Icon: LockIcon,
    bg: "#DCFCE7",
    color: "#15803D"
  },
  {
    id: "agents",
    title: "我的 Agent",
    desc: "2 个策略运行中",
    Icon: CardStackIcon,
    bg: "#EEF2FF",
    color: "#4338CA"
  },
  {
    id: "help",
    title: "帮助与反馈",
    desc: "联系客服",
    Icon: SparkIcon,
    bg: "#FEF3C7",
    color: "#B45309"
  }
];

export function ProfileScreen({ onChangeView }: ProfileScreenProps) {
  const session = useSession();

  // 挂载时主动刷新一次地址（兜底"登录了没地址"场景：verify 时 OKX 没回 addressList）
  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    refreshAddresses().then((next) => {
      if (cancelled || !next || !session) return;
      // 只在地址有更新时写回 session（避免无限触发 useSession）
      const oldAddr = session.addresses;
      const sameEvm = (oldAddr?.evm?.[0]?.address ?? "") === (next.evm?.[0]?.address ?? "");
      const sameSol = (oldAddr?.solana?.[0]?.address ?? "") === (next.solana?.[0]?.address ?? "");
      if (!sameEvm || !sameSol) {
        sessionStore.set({ ...session, addresses: next });
      }
    }).catch(() => { /* 网络失败静默 */ });
    return () => { cancelled = true; };
  }, [session?.token]);

  const handleLogout = () => {
    Alert.alert("退出登录", "退出后需重新输入邮箱验证码，确定吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "退出",
        style: "destructive",
        onPress: async () => {
          await sessionStore.clear();
          toastBus.push({
            emoji: "👋",
            title: "已退出登录",
            tone: "info",
            duration: 1800
          });
        }
      }
    ]);
  };

  return (
    <View className="flex-1 bg-bg">
      {/* 顶 */}
      <View className="flex-row items-center justify-between px-3 pb-2 pt-1">
        <Pressable
          accessibilityRole="button"
          onPress={() => onChangeView("chat")}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface"
        >
          <ArrowLeftIcon size={22} />
        </Pressable>
        <Text className="text-[17px] font-semibold text-ink">我的</Text>
        <Pressable className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
          <Text className="text-[18px] text-ink">⚙</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* 个人 hero */}
        <ProfileHero email={session?.email ?? ""} accountId={session?.accountId ?? ""} />

        {/* 链上钱包地址（Agent Wallet 多链） */}
        {session?.addresses ? (
          <View className="mt-5 px-4">
            <Text className="mb-2.5 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
              我的钱包地址
            </Text>
            <Surface padded={false} elevation={1}>
              <AddressRow chain="EVM" address={session.addresses.evm?.[0]?.address ?? ""} />
              <AddressRow chain="Solana" address={session.addresses.solana?.[0]?.address ?? ""} divider />
              <AddressRow chain="X Layer" address={session.addresses.xlayer?.[0]?.address ?? ""} divider />
            </Surface>
          </View>
        ) : null}

        {/* 数据三联 */}
        <View className="mt-5 px-4">
          <Surface elevation={1} padded={false} className="flex-row items-center py-4">
            {stats.map((s, i) => (
              <View key={s.id} className="flex-1 flex-row items-center justify-center">
                <View className="items-center">
                  <Text className="text-[20px] font-bold" style={{ color: s.color }}>
                    {s.value}
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-muted">{s.label}</Text>
                </View>
                {i < stats.length - 1 && <View className="absolute right-0 h-8 w-px bg-line" />}
              </View>
            ))}
          </Surface>
        </View>

        {/* 安全得分仪表 */}
        <View className="mt-5 px-4">
          <SecurityCard />
        </View>

        {/* 菜单 */}
        <View className="mt-5 px-4">
          <Text className="mb-2.5 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
            管理
          </Text>
          <Surface padded={false} elevation={1}>
            {menu.map(({ id, title, desc, Icon, bg, color, badge }, idx) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                className={`flex-row items-center px-4 py-3.5 active:bg-surface ${
                  idx < menu.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <View
                  style={{ backgroundColor: bg }}
                  className="mr-3 h-10 w-10 items-center justify-center rounded-2xl"
                >
                  <Icon size={18} color={color} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-ink">{title}</Text>
                  {desc ? <Text className="text-[12px] text-muted">{desc}</Text> : null}
                </View>
                {badge ? (
                  <View className="mr-2 h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5">
                    <Text className="text-[11px] font-bold text-white">{badge}</Text>
                  </View>
                ) : null}
                <ChevronRightIcon size={18} />
              </Pressable>
            ))}
          </Surface>
        </View>

        {/* 退出 */}
        <View className="mt-5 px-4">
          <Pressable
            onPress={handleLogout}
            className="rounded-2xl border border-line bg-bg py-3.5 active:bg-surface"
          >
            <Text className="text-center text-[15px] font-semibold text-red-500">退出登录</Text>
          </Pressable>
        </View>

        <Text className="mt-5 text-center text-[12px] text-muted">v1.0.0 · H Wallet</Text>
      </ScrollView>
    </View>
  );
}

/* ============= 链上地址行 ============= */

function AddressRow({ chain, address, divider }: { chain: string; address: string; divider?: boolean }) {
  const display = address
    ? `${address.slice(0, 6)}...${address.slice(-6)}`
    : "未生成";
  const isEmpty = !address || address === "N/A";

  async function copy() {
    if (!address || isEmpty) return;
    await Clipboard.setStringAsync(address);
    toastBus.push({ emoji: "📋", title: "地址已复制", subtitle: chain, tone: "success", duration: 1500 });
  }

  return (
    <Pressable
      onPress={copy}
      disabled={isEmpty}
      className={`flex-row items-center px-4 py-3 active:bg-surface ${divider ? "border-t border-line" : ""}`}
    >
      <View className="mr-3 h-9 w-9 items-center justify-center rounded-2xl" style={{ backgroundColor: "#F4F4F5" }}>
        <Text className="text-[12px] font-semibold text-ink">
          {chain === "EVM" ? "Ξ" : chain === "Solana" ? "◎" : "X"}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-ink">{chain}</Text>
        <Text className={`mt-0.5 text-[12px] ${isEmpty ? "text-muted italic" : "text-muted"}`} style={{ fontFamily: isEmpty ? undefined : "JetBrainsMono_400Regular" }}>
          {display}
        </Text>
      </View>
      {!isEmpty ? (
        <View className="rounded-full bg-surface px-2.5 py-1">
          <Text className="text-[11px] font-semibold text-ink">复制</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* ============= 个人 Hero ============= */

function ProfileHero({ email, accountId }: { email: string; accountId: string }) {
  // 头像光环旋转
  const halo = useSharedValue(0);
  useEffect(() => {
    halo.value = withRepeat(withTiming(1, { duration: 12000, easing: Easing.linear }), -1, false);
  }, [halo]);
  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${halo.value * 360}deg` }]
  }));

  const displayName = email ? email.split("@")[0] : "Trader";
  const initial = (displayName[0] ?? "T").toUpperCase();
  const masked = accountId
    ? `${accountId.slice(0, 6)}…${accountId.slice(-4)}`
    : "地址未生成";

  const copyAddress = async () => {
    if (!accountId) return;
    await Clipboard.setStringAsync(accountId);
    toastBus.push({
      emoji: "📋",
      title: "地址已复制",
      subtitle: masked,
      tone: "success",
      duration: 1800
    });
  };

  return (
    <View className="px-4 pt-2">
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
          style={{ padding: 20, alignItems: "center" }}
        >
          {/* 装饰光圈 */}
          <View
            style={{
              position: "absolute",
              top: -50,
              right: -40,
              width: 180,
              height: 180,
              borderRadius: 90,
              backgroundColor: "#D9AA43",
              opacity: 0.18
            }}
          />

          {/* 头像 + 旋转光环 */}
          <View className="items-center justify-center">
            <Animated.View
              style={[
                {
                  position: "absolute",
                  width: 96,
                  height: 96,
                  alignItems: "center",
                  justifyContent: "center"
                },
                haloStyle
              ]}
            >
              <Svg width={96} height={96} viewBox="0 0 96 96">
                <Defs>
                  <SvgLinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#D9AA43" stopOpacity="0" />
                    <Stop offset="0.5" stopColor="#D9AA43" stopOpacity="1" />
                    <Stop offset="1" stopColor="#D9AA43" stopOpacity="0" />
                  </SvgLinearGradient>
                </Defs>
                <Circle
                  cx={48}
                  cy={48}
                  r={44}
                  fill="none"
                  stroke="url(#ring)"
                  strokeWidth={2}
                  strokeDasharray="100 200"
                  strokeLinecap="round"
                />
              </Svg>
            </Animated.View>

            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.4)"
              }}
            >
              <Text style={{ fontSize: 32, fontWeight: "800", color: "#1E1B4B" }}>{initial}</Text>
            </View>
          </View>

          <Text className="mt-3 text-[20px] font-bold text-white">{displayName}</Text>
          <Text className="mt-0.5 text-[12px] text-white/60">{email || "未登录"}</Text>

          {/* 钱包地址 · 点击复制 */}
          <Pressable
            onPress={copyAddress}
            disabled={!accountId}
            className="mt-3 flex-row items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5"
          >
            <Text style={{ fontSize: 12, color: "#FFFFFF" }}>🔗</Text>
            <Text className="text-[13px] font-semibold text-white">{masked}</Text>
            {accountId ? <Text className="text-[11px] text-white/70">复制</Text> : null}
          </Pressable>

          {/* 等级进度 */}
          <View className="mt-4 w-full">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] text-white/70">距离 Lv.4</Text>
              <Text className="text-[11px] font-semibold text-white/90">650 / 1,000</Text>
            </View>
            <View className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15">
              <LinearGradient
                colors={["#FCD34D", "#D9AA43"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: "65%", height: "100%", borderRadius: 999 }}
              />
            </View>
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

/* ============= 安全得分仪表 ============= */

function SecurityCard() {
  const score = 92; // 0-100
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withTiming(score / 100, { duration: 1500, easing: Easing.out(Easing.cubic) });
  }, [sweep, score]);

  // SVG 半圆仪表
  const R = 50;
  const C = Math.PI * R; // 半圆弧长

  const animatedDash = useAnimatedStyle(() => ({
    // workletless dummy — SVG strokeDashoffset can't be animated via reanimated easily here
  }));

  return (
    <Surface elevation={1} className="flex-row items-center py-4">
      {/* 仪表盘 */}
      <View style={{ width: 110, height: 70, alignItems: "center" }}>
        <Svg width={110} height={70} viewBox="0 0 120 70">
          <Defs>
            <SvgLinearGradient id="sec" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#34D399" />
              <Stop offset="1" stopColor="#10B981" />
            </SvgLinearGradient>
          </Defs>
          {/* 底圈 */}
          <Circle
            cx={60}
            cy={60}
            r={R}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={10}
            strokeDasharray={`${C} ${C}`}
            strokeDashoffset={0}
            transform="rotate(180 60 60)"
            strokeLinecap="round"
          />
          {/* 渐变进度 */}
          <Circle
            cx={60}
            cy={60}
            r={R}
            fill="none"
            stroke="url(#sec)"
            strokeWidth={10}
            strokeDasharray={`${C} ${C}`}
            strokeDashoffset={C - (C * score) / 100}
            transform="rotate(180 60 60)"
            strokeLinecap="round"
          />
        </Svg>
        <View style={{ position: "absolute", top: 22, alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: "#0F0F0F" }}>{score}</Text>
          <Text style={{ fontSize: 10, color: "#6B7280", marginTop: -2 }}>安全分</Text>
        </View>
      </View>

      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-bold text-ink">账户保护良好</Text>
        <Text className="mt-0.5 text-[12px] text-muted">
          已开启双重验证 · 助记词已备份
        </Text>
        <View className="mt-2 self-start rounded-full bg-emerald-50 px-2.5 py-0.5">
          <Text className="text-[11px] font-bold text-emerald-700">查看详情 →</Text>
        </View>
      </View>
    </Surface>
  );
}
