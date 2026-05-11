import "./global.css";

import { useEffect, useState } from "react";
import { Dimensions, Text, TextInput, View } from "react-native";
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
import { EmergencyStopButton } from "./src/components/EmergencyStopButton";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { AuthScreen } from "./src/screens/AuthScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { CommunityScreen } from "./src/screens/CommunityScreen";
import { AgentCenterScreen } from "./src/screens/AgentCenterScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { NotificationScreen } from "./src/screens/NotificationScreen";
import { WalletScreen } from "./src/screens/WalletScreen";
import { setMarketFeed, OKXMarketFeed } from "./src/services/marketFeed";
import { setAgentRunner, LiveAgentRunner } from "./src/services/agentRunner";
import { loadOkxCredentials } from "./src/config/okx";
// OKX credentials loaded dynamically via loadOkxCredentials()
import { pingOkxAuth } from "./src/services/okxApi";
import { sessionStore, useSession } from "./src/services/sessionStore";
import { toastBus } from "./src/services/toastBus";
import type { AppView } from "./src/types";
import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold
} from "@expo-google-fonts/jetbrains-mono";

// Global typography baseline
const baseTextStyle = {
  fontFamily: "Inter_400Regular",
  color: "#0F0F0F",
  letterSpacing: -0.2
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
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });
  const [activeView, setActiveView] = useState<AppView>("chat");
  const [chatPrefill, setChatPrefill] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const session = useSession();

  const handleCommunityNavigate = (view: string, prefill?: string) => {
    if (prefill) setChatPrefill(prefill);
    setActiveView(view as AppView);
  };

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
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret,
      passphrase: creds.passphrase,
      enableRealOrders: true,
    }));
//    pingOkxAuth().then((res) => {
//      toastBus.push({
//        emoji: res.ok ? "🟢" : "🔴",
//        title: res.ok ? "OKX 已连接" : "OKX 鉴权失败",
//        subtitle: res.detail,
//        tone: res.ok ? "success" : "warn",
//        duration: res.ok ? 2200 : 4200
//      });
//    });
  }, []);

  const isWallet = activeView === "wallet";
  const isProfile = activeView === "profile";
  const isNotifications = activeView === "notifications";
  // 顶部胶囊三段：对话 / 社区 / Agent；其它视图（钱包、我的）通过滑入层覆盖
  const tabView: AppView =
    activeView === "community" ? "community" :
    activeView === "agent" ? "agent" :
    "chat";

  // Wallet slides in from left → right (translateX: -SCREEN_WIDTH → 0)
  const walletX = useSharedValue(-SCREEN_WIDTH);
  // Profile slides in from right → left (translateX: SCREEN_WIDTH → 0)
  const profileX = useSharedValue(SCREEN_WIDTH);
  const notificationsX = useSharedValue(SCREEN_WIDTH);

  useEffect(() => {
    walletX.value = withTiming(isWallet ? 0 : -SCREEN_WIDTH, {
      duration: 320,
      easing: Easing.out(Easing.cubic)
    });
    profileX.value = withTiming(isProfile ? 0 : SCREEN_WIDTH, {
      duration: 320,
      easing: Easing.out(Easing.cubic)
    });
    notificationsX.value = withTiming(isNotifications ? 0 : SCREEN_WIDTH, {
      duration: 320,
      easing: Easing.out(Easing.cubic)
    });
  }, [isWallet, isProfile, isNotifications, walletX, profileX, notificationsX]);

  const walletStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: walletX.value }]
  }));
  const profileStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: profileX.value }]
  }));
  const notificationsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: notificationsX.value }]
  }));

  // 未就绪或用户尚未完成邮箱注册登录：仅此全屏模块
  if (!hydrated || !fontsLoaded || !session) {
    return (
      <SafeAreaProvider>
        <GradientBackground>
          <StatusBar style="dark" />
          <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right", "bottom"]}>
            {hydrated && fontsLoaded ? (
              <AuthScreen onAuthSuccess={(s) => sessionStore.set(s)} />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 28, color: "#7B5BC7" }}>🐬</Text>
              </View>
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

        {/* 主页面:对话 / 社区 / Agent 三段切换 */}
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <View className="flex-1">
            <TopBar activeView={activeView} onChangeView={setActiveView} />
            <View className="flex-1">
              <ErrorBoundary>
                {tabView === "community" ? (
                  <CommunityScreen onChangeView={handleCommunityNavigate} />
                ) : tabView === "agent" ? (
                  <AgentCenterScreen onChangeView={setActiveView} />
                ) : (
                  <ChatScreen prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill("")} />
                )}
              </ErrorBoundary>
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
            <ErrorBoundary>
              <WalletScreen onChangeView={setActiveView} />
            </ErrorBoundary>
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
            <ErrorBoundary>
              <ProfileScreen onChangeView={setActiveView} />
            </ErrorBoundary>
          </SafeAreaView>
        </Animated.View>

        {/* 通知:整屏从右到左滑入 */}
        <Animated.View
          pointerEvents={isNotifications ? "auto" : "none"}
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#FFFFFF"
            },
            notificationsStyle
          ]}
        >
          <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right", "bottom"]}>
            <ErrorBoundary>
              <NotificationScreen onChangeView={setActiveView} />
            </ErrorBoundary>
          </SafeAreaView>
        </Animated.View>

        {/* 全局紧急停止红按钮 — 第四锁，仅有运行中策略时浮现 */}
        <EmergencyStopButton />

        {/* 全局通知条 — 始终位于最上层 */}
        <AppToast />
      </GradientBackground>
    </SafeAreaProvider>
  );
}
