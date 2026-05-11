import React, { useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { Surface } from "../components/ui/Surface";
import { ArrowLeftIcon, CardStackIcon, ChevronRightIcon, LockIcon, SparkIcon } from "../components/ui/Icons";
import { sessionStore, useSession } from "../services/sessionStore";
import { toastBus } from "../services/toastBus";
import type { AppView } from "../types";
import { getProfileStats } from "../services/core/userApi";
import { uiColors } from "../theme/uiSystem";

type ProfileScreenProps = {
  onChangeView: (view: AppView) => void;
};


const menu: {
  id: string;
  title: string;
  desc?: string;
  Icon: (p: { size?: number; color?: string }) => React.ReactNode;
  bg: string;
  color: string;
  badge?: string;
}[] = [
  { id: "notification", title: "通知管理", desc: "功能开发中", Icon: SparkIcon, bg: "#FEE2E2", color: "#DC2626" },
  { id: "security", title: "安全中心", desc: "验证码登录与设备管理", Icon: LockIcon, bg: "#DCFCE7", color: "#15803D" },
  { id: "agents", title: "我的 Agent", desc: "策略与链上任务", Icon: CardStackIcon, bg: "#EEF2FF", color: "#4338CA" },
  { id: "help", title: "帮助与反馈", desc: "联系客服 / 文档", Icon: SparkIcon, bg: "#FEF3C7", color: "#B45309" }
];

export function ProfileScreen({ onChangeView }: ProfileScreenProps) {
  const session = useSession();
  const [stats, setStats] = useState(() => getProfileStats());

  useEffect(() => {
    setStats(getProfileStats());
  }, []);

  const handleMenuPress = (id: string) => {
    if (id === "notification") {
      onChangeView("notifications" as any);
    } else if (id === "security") {
      toastBus.push({ emoji: "🔒", title: "安全中心", subtitle: "验证码登录已启用，设备管理即将上线", tone: "info", duration: 2500 });
    } else if (id === "agents") {
      onChangeView("agent");
    } else if (id === "help") {
      Linking.openURL("mailto:support@hvip.app").catch(() =>
        toastBus.push({ emoji: "💬", title: "联系客服", subtitle: "support@hvip.app", tone: "info", duration: 3000 })
      );
    }
  };

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
    <View className="flex-1" style={{ backgroundColor: uiColors.appBg }}>
      {/* 顶栏 */}
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
        {/* 个人 Hero */}
        <ProfileHero email={session?.email ?? ""} />

        {/* 会员中心 */}
        <View className="mt-4 px-4">
          <MemberCenterCard />
        </View>

        {/* 邀请好友 */}
        <View className="mt-3 px-4">
          <InviteFriendsCard />
        </View>

        {/* 数据三联 */}
        <View className="mt-4 px-4">
          <Surface elevation={2} padded={false} className="flex-row items-center py-4">
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
        <View className="mt-4 px-4">
          <SecurityCard />
        </View>

        {/* 菜单 */}
        <View className="mt-4 px-4">
          <Text className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-muted">
            管理
          </Text>
          <Surface padded={false} elevation={2}>
            {menu.map(({ id, title, desc, Icon, bg, color, badge }, idx) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                onPress={() => handleMenuPress(id)}
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
        <View className="mt-4 px-4">
          <Pressable
            onPress={handleLogout}
            className="rounded-2xl border border-line bg-bg py-3.5 active:bg-surface"
          >
            <Text className="text-center text-[15px] font-semibold text-red-500">退出登录</Text>
          </Pressable>
        </View>

        <Text className="mt-5 text-center text-[11px] text-muted">v0.0.2 · H Wallet</Text>
      </ScrollView>
    </View>
  );
}

/* ============= 会员 & 邀请 ============= */

function MemberCenterCard() {
  return (
    <Surface elevation={2} padded={false}>
      <View className="px-4 py-4">
        <View className="flex-row items-center justify-between">
          <View style={{ flex: 1 }}>
            <Text className="text-[15px] font-bold text-ink">会员中心</Text>
            <Text className="mt-0.5 text-[12px] text-muted">
              会员等级与权益由官方活动统一开通；客户端不展示虚拟等级数据。
            </Text>
          </View>
          <View className="rounded-full bg-surface px-2.5 py-1">
            <Text className="text-[11px] font-semibold text-muted">待开通</Text>
          </View>
        </View>
      </View>
      <View className="border-t border-line px-4 py-3">
        <Pressable className="flex-row items-center justify-between active:opacity-60">
          <Text className="text-[13px] font-semibold text-ink">了解会员权益</Text>
          <ChevronRightIcon size={16} />
        </Pressable>
      </View>
    </Surface>
  );
}

function InviteFriendsCard() {
  return (
    <Surface elevation={2} padded={false}>
      <View className="px-4 py-4">
        <Text className="text-[15px] font-bold text-ink">邀请好友</Text>
        <Text className="mt-0.5 text-[12px] text-muted">
          邀请与奖励将在官方服务端就绪后启用；此处不生成虚拟邀请码。
        </Text>
        <View className="mt-3 rounded-xl bg-surface px-3 py-2.5">
          <Text className="text-[10px] uppercase tracking-wider text-muted">状态</Text>
          <Text className="mt-1 text-[14px] font-semibold text-muted">暂未开放</Text>
        </View>
      </View>
    </Surface>
  );
}

/* ============= 个人 Hero ============= */

function ProfileHero({ email }: { email: string }) {
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
          colors={["#2A1B5F", "#3F2E8C", "#5A3FB0"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14, alignItems: "center" }}
        >
          {/* 装饰光圈 */}
          <View
            style={{
              position: "absolute",
              top: -62,
              right: -52,
              width: 170,
              height: 170,
              borderRadius: 85,
              backgroundColor: "#D9AA43",
              opacity: 0.12
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

          {/* Agent Wallet ID（账户标识，非转账地址） */}
          <View className="mt-3 rounded-full bg-white/14 px-3 py-1.5">
            <Text className="text-[11px] text-white/80">个人设置中心</Text>
          </View>

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
  // SVG 半圆仪表
  const R = 50;
  const C = Math.PI * R; // 半圆弧长

  return (
    <Surface elevation={2} className="flex-row items-center py-4">
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
