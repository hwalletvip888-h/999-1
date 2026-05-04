import "./global.css";

import { useEffect, useState } from "react";
import { Dimensions, Platform, Text, TextInput, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "./src/components/GradientBackground";
import { TopBar } from "./src/components/TopBar";
import { AppToast } from "./src/components/AppToast";
import { AuthScreen } from "./src/screens/AuthScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { CommunityScreen } from "./src/screens/CommunityScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { WalletScreen } from "./src/screens/WalletScreen";
import { setMarketFeed, OKXMarketFeed } from "./src/services/marketFeed";
import { setAgentRunner, LiveAgentRunner } from "./src/services/agentRunner";
import { loadOkxCredentials } from "./src/config/okx";
import { OKX_CONFIG } from "./src/config/okx.local";
import { pingOkxAuth } from "./src/services/okxApi";
import { sessionStore, useSession } from "./src/services/sessionStore";
import { toastBus } from "./src/services/toastBus";
import type { AppView } from "./src/types";

// Global typography baseline – unifies the look across every screen.
const baseFont = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
});

const baseTextStyle = {
  fontFamily: baseFont,
  color: "#0F0F0F",
  letterSpacing: 0
};

// @ts-expect-error – RN allows defaultProps on Text/TextInput
Text.defaultProps = Text.defaultProps || {};
// @ts-expect-error
Text.defaultProps.style = [baseTextStyle, Text.defaultProps.style];
// @ts-expect-error
Text.defaultProps.allowFontScaling = false;

// @ts-expect-error
TextInput.defaultProps = TextInput.defaultProps || {};
// @ts-expect-error
TextInput.defaultProps.style = [baseTextStyle, TextInput.defaultProps.style];
// @ts-expect-error
TextInput.defaultProps.allowFontScaling = false;

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function App() {
  const [activeView, setActiveView] = useState<AppView>("chat");
  const [hydrated, setHydrated] = useState(false);
  const session = useSession();

  // 启动：还原本地 session
  useEffect(() => {
    sessionStore.hydrate().finally(() => setHydrated(true));
  }, []);

  // 启动一次：检测 OKX 凭证 → 切换到真实行情 + 通知
  useEffect(() => {
    const creds = loadOkxCredentials();
    if (!creds) return; // 没配置就走 mock，不打扰
    setMarketFeed(new OKXMarketFeed());
    // 启用真实下单 Agent（使用 OKX 凭证）
    setAgentRunner(new LiveAgentRunner({
      exchange: "okx",
      apiKey: OKX_CONFIG.apiKey,
      apiSecret: OKX_CONFIG.secretKey,
      passphrase: OKX_CONFIG.passphrase,
      enableRealOrders: true,
    }));
    pingOkxAuth().then((res) => {
      toastBus.push({
        emoji: res.ok ? "🟢" : "🔴",
        title: res.ok ? "OKX 已连接" : "OKX 鉴权失败",
        subtitle: res.detail,
        tone: res.ok ? "success" : "warn",
        duration: res.ok ? 2200 : 4200
      });
    });
  }, []);

  const isWallet = activeView === "wallet";
  const isProfile = activeView === "profile";
  const tabView: AppView = activeView === "community" ? "community" : "chat";

  // Wallet slides in from left → right (translateX: -SCREEN_WIDTH → 0)
  const walletX = useSharedValue(-SCREEN_WIDTH);
  // Profile slides in from right → left (translateX: SCREEN_WIDTH → 0)
  const profileX = useSharedValue(SCREEN_WIDTH);

  useEffect(() => {
    walletX.value = withTiming(isWallet ? 0 : -SCREEN_WIDTH, {
      duration: 320,
      easing: Easing.out(Easing.cubic)
    });
    profileX.value = withTiming(isProfile ? 0 : SCREEN_WIDTH, {
      duration: 320,
      easing: Easing.out(Easing.cubic)
    });
  }, [isWallet, isProfile, walletX, profileX]);

  const walletStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: walletX.value }]
  }));
  const profileStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: profileX.value }]
  }));

  // 未还原完成 / 未登录 → 显示鉴权门户（保持渐变背景）
  if (!hydrated || !session) {
    return (
      <SafeAreaProvider>
        <GradientBackground>
          <StatusBar style="dark" />
          <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right", "bottom"]}>
            {hydrated ? (
              <AuthScreen onAuthSuccess={(s) => sessionStore.set(s)} />
            ) : (
              <View style={{ flex: 1 }} />
            )}
          </SafeAreaView>
          <AppToast />
        </GradientBackground>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <GradientBackground>
        <StatusBar style="dark" />

        {/* 主页面:对话/社区 */}
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <View className="flex-1">
            <TopBar activeView={activeView} onChangeView={setActiveView} />
            <View className="flex-1">
              {tabView === "community" ? <CommunityScreen /> : <ChatScreen />}
            </View>
          </View>
        </SafeAreaView>

        {/* 钱包:整屏从左到右滑入 */}
        <Animated.View
          pointerEvents={isWallet ? "auto" : "none"}
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#FFFFFF"
            },
            walletStyle
          ]}
        >
          <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right", "bottom"]}>
            <WalletScreen onChangeView={setActiveView} />
          </SafeAreaView>
        </Animated.View>

        {/* 我的:整屏从右到左滑入 */}
        <Animated.View
          pointerEvents={isProfile ? "auto" : "none"}
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#FFFFFF"
            },
            profileStyle
          ]}
        >
          <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right", "bottom"]}>
            <ProfileScreen onChangeView={setActiveView} />
          </SafeAreaView>
        </Animated.View>

        {/* 全局通知条 — 始终位于最上层 */}
        <AppToast />
      </GradientBackground>
    </SafeAreaProvider>
  );
}
