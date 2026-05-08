import React from "react";
import { useEffect, useState } from "react";
import { Alert, Dimensions, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";
import { Surface } from "../components/ui/Surface";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  BellIcon,
  CardStackIcon,
  ChevronRightIcon,
  LeafIcon,
  LockIcon,
  ScanIcon,
  SearchIcon,
  SparkIcon,
  SwapIcon
} from "../components/ui/Icons";
import { TokenIcon } from "../components/ui/TokenIcons";
import { CardLibraryScreen } from "./CardLibraryScreen";
import { useCardLibrary } from "../services/cardLibrary";
import { api } from "../api/gateway";
import { okxOnchainClient } from "../api/providers/okx/okxOnchainClient";
import type { AppView } from "../types";
import { isPositive } from "../utils/format";
import { useSession } from "../services/sessionStore";
import { refreshAddresses } from "../services/walletApi";
import { uiColors, uiSpace } from "../theme/uiSystem";

const SCREEN_W = Dimensions.get("window").width;

type WalletScreenProps = {
  onChangeView: (view: AppView) => void;
};

const heroActions = [
  { id: "deposit", label: "充值", Icon: ArrowDownIcon },
  { id: "withdraw", label: "提现", Icon: ArrowUpIcon },
  { id: "swap", label: "兑换", Icon: SwapIcon, primary: true },
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
    id: "earn",
    title: "链上赚币",
    subtitle: "稳健收益",
    Icon: LeafIcon,
    bg: ["#DCFCE7", "#BBF7D0"],
    color: "#15803D"
  },
  {
    id: "staking",
    title: "质押",
    subtitle: "即将开放",
    Icon: LockIcon,
    bg: ["#FEF3C7", "#FDE68A"],
    color: "#B45309",
    locked: true
  },
  {
    id: "dph",
    title: "DPH",
    subtitle: "灰度测试中",
    Icon: SwapIcon,
    bg: ["#FCE7F3", "#FBCFE8"],
    color: "#BE185D",
    locked: true
  }
];

const defaultSpark = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export function WalletScreen({ onChangeView }: WalletScreenProps) {
  const session = useSession();
  const [hideBalance, setHideBalance] = useState(false);
  const [tab, setTab] = useState<"assets" | "nft" | "activity">("assets");
  const [totalBalance, setTotalBalance] = useState("0.00");
  const [pnlPercent, setPnlPercent] = useState("+0.0%");
  const [monthPnl, setMonthPnl] = useState("+$0.00");
  const [realAssets, setRealAssets] = useState<Array<{id:string;symbol:string;name:string;icon:string;chain:string;balance:string;valueUsd:string;change24h:string}>>([]);
  const [assetSparks, setAssetSparks] = useState<Record<string, number[]>>({});
  const [portfolioSpark, setPortfolioSpark] = useState(defaultSpark);
  const [loading, setLoading] = useState(true);
  const [walletDataError, setWalletDataError] = useState("");
  const [agentAssets, setAgentAssets] = useState<Array<{symbol:string; qty:number; price:number; valueUsd:number; change24h:number}>>([]);
  const [agentAssetLoading, setAgentAssetLoading] = useState(true);

  const accountIdMasked = session?.accountId
    ? `${session.accountId.slice(0, 6)}…${session.accountId.slice(-4)}`
    : "未连接";

  // 加载 Agent Wallet 汇总（仅真实接口，无本地模拟兜底）
  useEffect(() => {
    (async () => {
      try {
        if (!session?.token) {
          setWalletDataError("请先登录 Agent Wallet 以加载链上真实资产");
          setTotalBalance("—");
          setRealAssets([]);
          setAssetSparks({});
          setPortfolioSpark(defaultSpark);
          setAgentAssets([]);
          setAgentAssetLoading(false);
          setLoading(false);
          return;
        }

        try {
          const portfolio = await okxOnchainClient.getWalletPortfolio(session.token);
          setWalletDataError("");
          const tokens = portfolio.data.tokens ?? [];
          const totalUsd = Number(portfolio.data.totalUsd || 0);
          setTotalBalance(totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          // 上方 Agent Wallet 面板已合计展示 SOL / USDT / BNB / OKB，
          // 这里的「全部资产」列表过滤掉这 4 个币种，避免同一个 USDT 在面板里看一次、又在下方列表里再看一次（用户觉得「多了 2 个 USDT」）
          const fixedSymbols = new Set(["SOL", "USDT", "BNB", "OKB"]);
          // 同一币种在不同链上拆开展示时，按 (symbol, chain) 聚合，避免跨账户重复行
          type AssetRow = { id: string; symbol: string; name: string; icon: string; chain: string; balance: string; valueUsd: string; change24h: string; _amt: number; _usd: number };
          const acc = new Map<string, AssetRow>();
          for (const t of tokens) {
            const symbol = String(t.symbol || "").toUpperCase();
            if (!symbol) continue;
            if (fixedSymbols.has(symbol)) continue;
            const usd = Number(t.usdValue || 0);
            const amt = Number(t.amount || 0);
            if (!(usd > 0.001 || amt > 0)) continue;
            const chain = String(t.chain || "Onchain");
            const key = `${symbol}__${chain}`;
            const prev = acc.get(key);
            if (prev) {
              prev._amt += amt;
              prev._usd += usd;
              prev.balance = `${prev._amt.toFixed(6)} ${symbol}`;
              prev.valueUsd = `$${prev._usd.toFixed(2)}`;
            } else {
              acc.set(key, {
                id: `asset_${symbol.toLowerCase()}_${chain}`,
                symbol,
                name: symbol,
                icon: symbol === "BTC" ? "₿" : symbol === "ETH" ? "◆" : symbol === "USDT" ? "₮" : symbol.slice(0, 1),
                chain,
                balance: `${amt.toFixed(6)} ${symbol}`,
                valueUsd: `$${usd.toFixed(2)}`,
                change24h: "+0.0%",
                _amt: amt,
                _usd: usd,
              });
            }
          }
          const assets = Array.from(acc.values()).map(({ _amt: _a, _usd: _u, ...row }) => row);
          setRealAssets(assets);
          setAssetSparks({});
          setPortfolioSpark(defaultSpark);
        } catch (portfolioErr: unknown) {
          const msg =
            portfolioErr instanceof Error
              ? portfolioErr.message
              : "暂时拉不到链上资产汇总，请检查网络或稍后重试。";
          setWalletDataError(
            Platform.OS === "web"
              ? "浏览器环境需经服务端代理调用 OKX 资产接口；请使用 Expo Go 或配置 HTTPS 后端。"
              : msg
          );
          setTotalBalance("—");
          setRealAssets([]);
          setAgentAssets([]);
        }
        setLoading(false);
      } catch (err) {
        console.warn("[WalletScreen] 加载真实数据失败:", err);
        setWalletDataError("Agent Wallet 实时资产拉取失败，请稍后重试");
        setTotalBalance("—");
        setRealAssets([]);
        setAgentAssets([]);
        setLoading(false);
      }
    })();
  }, [session?.token]);

  // 进入 Wallet 页面后刷新一次 Agent Wallet 地址
  useEffect(() => {
    refreshAddresses().catch(() => {});
  }, []);

  // 资产面板行 — 来源是真实持仓：按 symbol 跨链聚合，只保留余额 > 0 的币种，
  // 再用 OKX 行情拉单价 + 24h 涨跌（拉不到就用持仓 USD 估值反推）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!session?.token) {
          if (!cancelled) {
            setAgentAssets([]);
            setAgentAssetLoading(false);
          }
          return;
        }

        let tokens: any[] = [];
        try {
          const portfolio = await okxOnchainClient.getWalletPortfolio(session.token);
          tokens = portfolio.data.tokens ?? [];
        } catch {
          if (!cancelled) {
            setAgentAssets([]);
            setAgentAssetLoading(false);
          }
          return;
        }

        // 跨链同 symbol 聚合
        const map = new Map<string, { qty: number; valueUsd: number }>();
        for (const t of tokens) {
          const symbol = String(t.symbol || "").toUpperCase();
          if (!symbol) continue;
          const qty = Number(t.amount || 0);
          const usd = Number(t.usdValue || 0);
          if (!(qty > 0 || usd > 0.001)) continue;
          const prev = map.get(symbol) ?? { qty: 0, valueUsd: 0 };
          map.set(symbol, { qty: prev.qty + qty, valueUsd: prev.valueUsd + usd });
        }

        // 只展示真有余额的币种；按 USD 价值降序
        const sortedSymbols = Array.from(map.entries())
          .sort((a, b) => b[1].valueUsd - a[1].valueUsd)
          .map(([s]) => s);

        const rows = await Promise.all(
          sortedSymbols.map(async (symbol) => {
            const bal = map.get(symbol)!;
            let price = symbol === "USDT" || symbol === "USDC" || symbol === "DAI" ? 1 : 0;
            let change24h = 0;
            try {
              const ticker = await api.market.getTicker(`${symbol}-USDT`);
              const p = Number(ticker.last);
              if (Number.isFinite(p) && p > 0) price = p;
              change24h = Number(ticker.changePercent24h || 0);
            } catch {
              /* 无行情就用 持仓USD/数量 反推单价 */
              if (price === 0 && bal.qty > 0) price = bal.valueUsd / bal.qty;
            }
            return {
              symbol,
              qty: bal.qty,
              price,
              valueUsd: bal.valueUsd > 0 ? bal.valueUsd : bal.qty * price,
              change24h
            };
          })
        );
        if (!cancelled) {
          setAgentAssets(rows);
          setAgentAssetLoading(false);
        }
      } catch {
        if (!cancelled) {
          setAgentAssets([]);
          setAgentAssetLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.token]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryMounted, setLibraryMounted] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapMounted, setSwapMounted] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositMounted, setDepositMounted] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawMounted, setWithdrawMounted] = useState(false);
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
  const swapX = useSharedValue(SCREEN_W);
  useEffect(() => {
    if (swapOpen) {
      setSwapMounted(true);
      swapX.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    } else if (swapMounted) {
      swapX.value = withTiming(SCREEN_W, { duration: 280, easing: Easing.out(Easing.cubic) });
      const t = setTimeout(() => setSwapMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [swapOpen, swapMounted, swapX]);
  const swapStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swapX.value }]
  }));
  const depositX = useSharedValue(SCREEN_W);
  useEffect(() => {
    if (depositOpen) {
      setDepositMounted(true);
      depositX.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    } else if (depositMounted) {
      depositX.value = withTiming(SCREEN_W, { duration: 280, easing: Easing.out(Easing.cubic) });
      const t = setTimeout(() => setDepositMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [depositOpen, depositMounted, depositX]);
  const depositStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: depositX.value }]
  }));
  const withdrawX = useSharedValue(SCREEN_W);
  useEffect(() => {
    if (withdrawOpen) {
      setWithdrawMounted(true);
      withdrawX.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    } else if (withdrawMounted) {
      withdrawX.value = withTiming(SCREEN_W, { duration: 280, easing: Easing.out(Easing.cubic) });
      const t = setTimeout(() => setWithdrawMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [withdrawOpen, withdrawMounted, withdrawX]);
  const withdrawStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withdrawX.value }]
  }));

  return (
    <View className="flex-1" style={{ backgroundColor: uiColors.appBg }}>
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
          <Text className="text-[14px] font-semibold text-ink">Agent Wallet</Text>
          <Text className="text-[13px] text-muted">{accountIdMasked}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => onChangeView("notifications")}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-80"
          style={{
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#E5E7EB",
            shadowColor: "#0F172A",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 6,
            elevation: 2
          }}
        >
          <View>
            <BellIcon size={22} />
            <View
              style={{
                position: "absolute",
                top: 1,
                right: 0,
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: "#10B981",
                borderWidth: 1,
                borderColor: "#FFFFFF"
              }}
            />
          </View>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 96 }}>
        {walletDataError ? (
          <View style={{ paddingHorizontal: uiSpace.pageX, paddingTop: 10 }}>
            <View className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <Text className="text-[12px] font-medium text-amber-800">{walletDataError}</Text>
            </View>
          </View>
        ) : null}
        {/* Hero 卡 */}
        <View style={{ paddingHorizontal: uiSpace.pageX, paddingTop: 12 }}>
          <HeroCard hideBalance={hideBalance} totalBalance={totalBalance} pnlPercent={pnlPercent} monthPnl={monthPnl} portfolioSpark={portfolioSpark} />
        </View>

        {/* 操作区：快捷操作 */}
        <View style={{ marginTop: uiSpace.sectionGap + 6, paddingHorizontal: uiSpace.pageX }}>
          <Surface elevation={1} padded={false}>
            <View className="flex-row items-center justify-around px-2 py-2.5">
              {heroActions.map(({ id, label, Icon, primary }) => (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  className="items-center active:opacity-60"
                  onPress={() => {
                    if (id === "swap") setSwapOpen(true);
                    if (id === "deposit") setDepositOpen(true);
                    if (id === "withdraw") setWithdrawOpen(true);
                  }}
                >
                  <View
                    className="h-11 w-11 items-center justify-center rounded-2xl"
                    style={{
                      backgroundColor: primary ? "#EDE9FE" : "#F3F4F6",
                      borderWidth: primary ? 1 : 0,
                      borderColor: primary ? "#C4B5FD" : "transparent"
                    }}
                  >
                    <Icon size={19} color={primary ? "#5B21B6" : "#0F0F0F"} />
                  </View>
                  <Text className="mt-2 text-[13px] font-medium text-ink2">{label}</Text>
                </Pressable>
              ))}
            </View>
          </Surface>
        </View>

        {/* Agent 状态条：放在操作后，形成主流程连续性 */}
        <View style={{ marginTop: 12, paddingHorizontal: uiSpace.pageX }}>
          <AgentBanner compact onNavigate={onChangeView} />
        </View>

        {/* 资产列表表头：分段标签 + 添加代币（同一容器） */}
        <View style={{ marginTop: 14, paddingHorizontal: uiSpace.pageX }}>
          <Surface padded={false} elevation={1} style={{ overflow: "hidden" }}>
            <View className="p-1">
              <View className="flex-row items-center gap-1 rounded-full bg-surface p-1">
                <SegmentTab label="资产" active={tab === "assets"} onPress={() => setTab("assets")} />
                <SegmentTab label="NFT" active={tab === "nft"} onPress={() => setTab("nft")} />
                <SegmentTab label="活动" active={tab === "activity"} onPress={() => setTab("activity")} />
              </View>
            </View>
          </Surface>
        </View>

        {/* 资产列表 — 单一来源：链上真实持仓，按 symbol 跨链聚合 */}
        {tab === "assets" && (
          <View style={{ marginTop: 10, paddingHorizontal: uiSpace.pageX }}>
            <AgentWalletPanel
              rows={agentAssets}
              loading={agentAssetLoading}
              onDeposit={() => setDepositOpen(true)}
            />
            {agentAssets.length > 0 && !agentAssetLoading && (
              <Pressable
                className="mt-2 flex-row items-center justify-center rounded-xl border border-line bg-surface py-2.5 active:opacity-70"
                onPress={() => setDepositOpen(true)}
              >
                <Text className="text-[13px] font-semibold text-ink2">+ 充入更多代币</Text>
              </Pressable>
            )}
          </View>
        )}

        {tab === "nft" && (
          <View style={{ marginTop: 10, paddingHorizontal: uiSpace.pageX }}>
            <Surface elevation={1} className="items-center py-10">
              <Text className="text-[14px] text-muted">暂无 NFT 收藏</Text>
            </Surface>
          </View>
        )}

        {tab === "activity" && (
          <View style={{ marginTop: 10, paddingHorizontal: uiSpace.pageX }}>
            <Surface elevation={1} className="items-center py-10">
              <Text className="text-[14px] text-muted">暂无活动记录</Text>
            </Surface>
          </View>
        )}

        {/* 服务网格 */}
        <View style={{ marginTop: 18, paddingHorizontal: uiSpace.pageX }}>
          <Surface elevation={1} padded={false}>
            <View className="px-4 pt-3">
              <Text className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted">服务</Text>
            </View>
            <View className="px-3 pb-3">
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
                    id === "cards"
                      ? () => setLibraryOpen(true)
                      : id === "earn"
                      ? () => onChangeView("chat")
                      : undefined
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
                        opacity: locked ? 0.55 : 1
                      }}
                    >
                      <View
                        className="h-9 w-9 items-center justify-center rounded-xl"
                        style={{ backgroundColor: "rgba(255,255,255,0.65)" }}
                      >
                        <Icon size={18} color={color} />
                      </View>
                      <View>
                        <Text className="text-[16px] font-bold" style={{ color }}>
                          {title}
                        </Text>
                        <Text className="text-[12px]" style={{ color, opacity: locked ? 0.95 : 0.72 }}>
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
                          即将开放
                        </Text>
                      </View>
                    ) : null}
                    {!locked ? (
                      <View
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          borderRadius: 999,
                          paddingHorizontal: 7,
                          paddingVertical: 3,
                          backgroundColor: "rgba(255,255,255,0.72)"
                        }}
                      >
                        <Text style={{ fontSize: 9, fontWeight: "700", color }}>
                          可用
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </TiltCard>
              );
            })}
              </View>
            </View>
          </Surface>
        </View>
      </ScrollView>

      {/* 底部搜索框 · 占位占型，后续接代币/地址/合约搜索 */}
      {!swapMounted ? <WalletSearchBar /> : null}

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

      {/* 兑换二级页 · 从右滑入 */}
      {swapMounted ? (
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
            swapStyle
          ]}
        >
          <SwapScreen onClose={() => setSwapOpen(false)} token={session?.token} assets={agentAssets} />
        </Animated.View>
      ) : null}

      {depositMounted ? (
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
            depositStyle
          ]}
        >
          <DepositScreen onClose={() => setDepositOpen(false)} session={session} assets={agentAssets} />
        </Animated.View>
      ) : null}

      {withdrawMounted ? (
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
            withdrawStyle
          ]}
        >
          <WithdrawScreen onClose={() => setWithdrawOpen(false)} assets={agentAssets} session={session} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function DepositScreen({
  onClose,
  session,
  assets
}: {
  onClose: () => void;
  session: ReturnType<typeof useSession>;
  assets: Array<{symbol:string; qty:number; price:number; valueUsd:number; change24h:number}>;
}) {
  type DepositPage = "main" | "token" | "network";
  const [page, setPage] = useState<DepositPage>("token");
  const [symbol, setSymbol] = useState<string>("USDT");
  const [network, setNetwork] = useState<"X Layer" | "Ethereum" | "Solana">("X Layer");
  const [tokenSearch, setTokenSearch] = useState("");
  const [networkSearch, setNetworkSearch] = useState("");
  const [promoIdx, setPromoIdx] = useState(0);

  const tokenOptions = assets
    .filter((a) => a.symbol && (a.qty > 0 || ["USDT", "ETH", "SOL", "BNB", "OKB", "USDC"].includes(a.symbol)))
    .sort((a, b) => b.valueUsd - a.valueUsd);
  const visibleTokens = tokenOptions.filter((t) =>
    t.symbol.toLowerCase().includes(tokenSearch.trim().toLowerCase())
  );

  const networkCandidates: Array<{ name: "X Layer" | "Ethereum" | "Solana"; feeLabel: string; enabled: boolean }> = [
    { name: "X Layer", feeLabel: "待估算", enabled: !!session?.addresses?.xlayer?.[0]?.address || !!session?.addresses?.evm?.[0]?.address },
    { name: "Solana", feeLabel: "待估算", enabled: !!session?.addresses?.solana?.[0]?.address },
    { name: "Ethereum", feeLabel: "待估算", enabled: !!session?.addresses?.evm?.[0]?.address }
  ];
  const networkOptions = networkCandidates.filter((n) => n.enabled);
  const visibleNetworks = networkOptions.filter((n) =>
    n.name.toLowerCase().includes(networkSearch.trim().toLowerCase())
  );
  const promoCards = [
    { id: "p1", title: "从交易所账户快捷提币", subtitle: "如钱包已关联交易所账户，提币无需验证", tone: "#166534" },
    { id: "p2", title: "Agent Wallet 安全收款", subtitle: "网络与地址自动匹配，避免错充", tone: "#1D4ED8" },
    { id: "p3", title: "支持多链网络", subtitle: "X Layer / Solana / Ethereum", tone: "#7C3AED" }
  ] as const;

  useEffect(() => {
    if (page !== "token") return;
    const t = setInterval(() => setPromoIdx((i) => (i + 1) % promoCards.length), 3200);
    return () => clearInterval(t);
  }, [page]);

  const currentAddress = (() => {
    if (network === "Solana") return session?.addresses?.solana?.[0]?.address ?? "";
    if (network === "Ethereum") return session?.addresses?.evm?.[0]?.address ?? "";
    return session?.addresses?.xlayer?.[0]?.address ?? session?.addresses?.evm?.[0]?.address ?? "";
  })();

  const copyCurrentAddress = async () => {
    const addr = (currentAddress || "").trim();
    if (!addr) {
      Alert.alert("暂无地址", "当前网络地址未加载完成，请稍后再试。");
      return;
    }
    await Clipboard.setStringAsync(addr);
    Alert.alert("已复制", "收款地址已复制到剪贴板");
  };

  if (page === "token") {
    return (
      <View style={{ flex: 1, backgroundColor: uiColors.appBg }}>
        <View className="flex-row items-center px-3 pb-2 pt-1">
          <Pressable onPress={() => setPage("main")} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
            <ArrowLeftIcon size={22} />
          </Pressable>
          <View className="ml-1">
            <Text className="text-[30px] font-bold text-ink">选择币种</Text>
            <Text className="text-[12px] text-muted">选择后自动筛选可充值网络</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX }}>
          <View className="flex-row items-center rounded-2xl border border-line bg-surface px-3 py-2.5">
            <SearchIcon size={18} color="#9CA3AF" />
            <TextInput
              value={tokenSearch}
              onChangeText={setTokenSearch}
              placeholder="搜索币种"
              className="ml-2 flex-1 text-[14px] text-ink"
            />
          </View>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 10 }}>
          <View
            style={{
              borderRadius: 18,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "#DDEBDD",
              backgroundColor: "#F8FFFA",
              shadowColor: "#15803D",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.08,
              shadowRadius: 10,
              elevation: 2
            }}
          >
            <View className="px-4 py-3">
              <Text className="text-[21px] font-bold" style={{ color: promoCards[promoIdx].tone }}>{promoCards[promoIdx].title}</Text>
              <Text className="mt-1 text-[13px]" style={{ color: "#4B5563" }}>{promoCards[promoIdx].subtitle}</Text>
              <View className="mt-2 flex-row" style={{ gap: 4 }}>
                {promoCards.map((p, i) => (
                  <View key={p.id} style={{ width: i === promoIdx ? 12 : 5, height: 5, borderRadius: 3, backgroundColor: i === promoIdx ? promoCards[promoIdx].tone : "#D1D5DB" }} />
                ))}
              </View>
            </View>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: uiSpace.pageX, paddingTop: 10, paddingBottom: 24 }}>
          {visibleTokens.map((t) => (
            <Pressable
              key={t.symbol}
              onPress={() => {
                setSymbol(t.symbol);
                setPage("network");
              }}
              className="flex-row items-center justify-between border-b border-line py-4 active:opacity-70"
            >
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <TokenIcon symbol={t.symbol} size={28} />
                <View>
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <Text className="text-[22px] font-semibold text-ink">{t.symbol}</Text>
                    <View className="rounded-md bg-surface px-1.5 py-0.5">
                      <Text className="text-[10px] font-semibold text-muted">{network}</Text>
                    </View>
                  </View>
                  <Text className="text-[12px] text-muted">可用余额</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-[22px] font-semibold text-ink">{t.qty.toFixed(t.qty >= 1 ? 4 : 6)}</Text>
                <Text className="text-[12px] text-muted">${t.valueUsd.toFixed(2)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (page === "network") {
    return (
      <View style={{ flex: 1, backgroundColor: uiColors.appBg }}>
        <View className="flex-row items-center px-3 pb-2 pt-1">
          <Pressable onPress={() => setPage("token")} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
            <ArrowLeftIcon size={22} />
          </Pressable>
          <View className="ml-1">
            <Text className="text-[30px] font-bold text-ink">选择网络</Text>
            <Text className="text-[12px] text-muted">仅展示 Agent Wallet 当前支持网络</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX }}>
          <View className="flex-row items-center rounded-2xl border border-line bg-surface px-3 py-2.5">
            <SearchIcon size={18} color="#9CA3AF" />
            <TextInput
              value={networkSearch}
              onChangeText={setNetworkSearch}
              placeholder="搜索"
              className="ml-2 flex-1 text-[14px] text-ink"
            />
          </View>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 10 }}>
          <View className="rounded-2xl border border-line bg-white px-4 py-3">
              <Text className="text-[22px] font-bold text-ink">Agent Wallet 支持网络</Text>
              <Text className="mt-1 text-[13px] text-muted">网络能力来自当前钱包地址</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: uiSpace.pageX, paddingTop: 10, paddingBottom: 24 }}>
          {visibleNetworks.map((n) => (
            <Pressable
              key={n.name}
              disabled={!n.enabled}
              onPress={() => {
                if (!n.enabled) return;
                setNetwork(n.name);
                setPage("main");
              }}
              className="flex-row items-center justify-between border-b border-line py-4 active:opacity-70"
              style={{ opacity: n.enabled ? 1 : 0.45 }}
            >
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <TokenIcon symbol={n.name === "X Layer" ? "OKB" : n.name === "Solana" ? "SOL" : "ETH"} size={28} />
                <View className="flex-row items-center" style={{ gap: 6 }}>
                  <Text className="text-[22px] font-semibold text-ink">{n.name}</Text>
                  {n.name === "X Layer" ? (
                    <View className="rounded-md bg-lime-200 px-1.5 py-0.5">
                      <Text className="text-[10px] font-bold" style={{ color: "#365314" }}>Fast</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View className="items-end">
                <Text className="text-[16px] font-semibold text-ink">{n.feeLabel}</Text>
                <Text className="text-[12px] text-muted">网络费</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: uiColors.appBg }}>
      <View className="flex-row items-center justify-between px-3 pb-2 pt-1">
        <Pressable onPress={onClose} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
          <ArrowLeftIcon size={22} />
        </Pressable>
        <Text className="text-[17px] font-semibold text-ink">收款</Text>
        <Pressable className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
          <Text className="text-[18px] text-ink2">?</Text>
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 12 }}>
          <Surface elevation={2} padded={false}>
            <View className="items-center px-4 py-4">
              <Pressable onPress={() => setPage("network")} className="mb-2 rounded-full bg-surface px-3 py-1.5 active:opacity-70">
                <Text className="text-[13px] font-semibold text-ink">{network}</Text>
              </Pressable>
              <View
                style={{
                  width: 260,
                  height: 260,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  backgroundColor: "#FFFFFF",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {currentAddress ? (
                  <QRCode value={currentAddress} size={210} />
                ) : (
                  <View
                    style={{
                      width: 210,
                      height: 210,
                      borderRadius: 10,
                      borderWidth: 8,
                      borderColor: "#111827",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <TokenIcon symbol={symbol} size={46} />
                  </View>
                )}
              </View>
              <Text className="mt-3 text-[12px] text-muted">仅支持接收 {network} 资产</Text>
            </View>
            <View className="border-t border-line px-4 py-3.5">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-[36px] font-bold text-ink">{symbol}</Text>
                  <Text className="mt-1 text-[13px] text-muted">{network}</Text>
                </View>
                <Pressable className="rounded-full bg-surface px-2.5 py-1.5 active:opacity-70">
                  <Text className="text-[12px] font-semibold text-ink2">切换常用地址</Text>
                </Pressable>
              </View>
              <Text className="mt-2 text-[13px] font-semibold text-ink">{currentAddress || "地址加载中..."}</Text>
            </View>
            <View className="flex-row border-t border-line px-4 py-3" style={{ gap: 10 }}>
              <Pressable className="h-11 flex-1 items-center justify-center rounded-xl bg-surface active:opacity-80">
                <Text className="text-[14px] font-semibold text-ink2">分享</Text>
              </Pressable>
              <Pressable onPress={() => setPage("token")} className="h-11 flex-1 items-center justify-center rounded-xl bg-surface active:opacity-80">
                <Text className="text-[14px] font-semibold text-ink2">选择币种</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={copyCurrentAddress}
              className="mx-4 mb-4 h-11 items-center justify-center rounded-xl bg-ink active:opacity-80"
              style={{ shadowColor: "#111827", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 10, elevation: 4 }}
            >
              <Text className="text-[14px] font-semibold text-white">复制地址</Text>
            </Pressable>
          </Surface>
        </View>
      </ScrollView>
    </View>
  );
}

function WithdrawScreen({
  onClose,
  assets,
  session
}: {
  onClose: () => void;
  assets: Array<{symbol:string; qty:number; price:number; valueUsd:number; change24h:number}>;
  session: ReturnType<typeof useSession>;
}) {
  type WithdrawPage = "token" | "network" | "address" | "amount" | "confirm";
  type AddressTab = "recent" | "mine" | "book";
  const [page, setPage] = useState<WithdrawPage>("token");
  const [addressTab, setAddressTab] = useState<AddressTab>("recent");
  const [symbol, setSymbol] = useState<string>("USDT");
  const [network, setNetwork] = useState<"X Layer" | "Ethereum" | "Solana">("X Layer");
  const [tokenSearch, setTokenSearch] = useState("");
  const [networkSearch, setNetworkSearch] = useState("");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [recentAddresses, setRecentAddresses] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const tokenOptions = assets
    .filter((a) => a.symbol && (a.qty > 0 || ["USDT", "ETH", "SOL", "BNB", "OKB", "USDC"].includes(a.symbol)))
    .sort((a, b) => b.valueUsd - a.valueUsd);
  const visibleTokens = tokenOptions.filter((t) =>
    t.symbol.toLowerCase().includes(tokenSearch.trim().toLowerCase())
  );

  const networkCandidates: Array<{ name: "X Layer" | "Ethereum" | "Solana"; feeLabel: string; tag?: string }> = [
    { name: "X Layer", feeLabel: "待估算", tag: "免Gas" },
    { name: "Solana", feeLabel: "待估算" },
    { name: "Ethereum", feeLabel: "待估算" }
  ];
  const visibleNetworks = networkCandidates.filter((n) =>
    n.name.toLowerCase().includes(networkSearch.trim().toLowerCase())
  );
  const balance = assets.find((a) => a.symbol === symbol)?.qty ?? 0;
  const unitPrice = assets.find((a) => a.symbol === symbol)?.price ?? 0;
  const canSubmit = !!address.trim() && Number(amount) > 0 && Number(amount) <= balance;

  const myWalletAddresses = (() => {
    const all = [
      ...(session?.addresses?.xlayer ?? []),
      ...(session?.addresses?.evm ?? []),
      ...(session?.addresses?.solana ?? [])
    ]
      .map((a) => String(a.address || ""))
      .filter((a) => !!a && a !== "N/A");
    return Array.from(new Set(all));
  })();

  const addressOptions = addressTab === "mine" ? myWalletAddresses : recentAddresses;
  const displayedAddresses = addressOptions.length > 0 ? addressOptions : [];

  const RECENT_ADDR_KEY = "h_wallet.withdraw.recent_addresses.v1";

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RECENT_ADDR_KEY);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          setRecentAddresses(arr.map((x) => String(x)).filter(Boolean));
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const rememberAddress = async (addr: string) => {
    const v = addr.trim();
    if (!v) return;
    const next = [v, ...recentAddresses.filter((a) => a !== v)].slice(0, 20);
    setRecentAddresses(next);
    try {
      await AsyncStorage.setItem(RECENT_ADDR_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const renderAddressIdenticon = (seed: string) => {
    const palette = ["#1D4ED8", "#7C3AED", "#16A34A", "#CA8A04", "#DC2626", "#0891B2"];
    const color = palette[Math.abs(seed.charCodeAt(2) || 0) % palette.length];
    const bg = "#E5E7EB";
    const cells = Array.from({ length: 25 }, (_, i) => {
      const ch = seed.charCodeAt((i % Math.max(seed.length, 1)) + 2) || 0;
      return ch % 3 === 0;
    });
    return (
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: "#F3F4F6", padding: 3 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 1 }}>
          {cells.map((on, idx) => (
            <View
              key={`${seed}-${idx}`}
              style={{
                width: 5,
                height: 5,
                borderRadius: 1,
                backgroundColor: on ? color : bg
              }}
            />
          ))}
        </View>
      </View>
    );
  };

  const appendAmount = (ch: string) => {
    setAmount((prev) => {
      if (ch === "." && prev.includes(".")) return prev;
      if (prev === "0" && ch !== ".") return ch;
      return `${prev}${ch}`;
    });
  };

  if (page === "token") {
    return (
      <View style={{ flex: 1, backgroundColor: uiColors.appBg }}>
        <View className="flex-row items-center px-3 pb-2 pt-1">
          <Pressable onPress={onClose} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
            <ArrowLeftIcon size={22} />
          </Pressable>
          <View className="ml-1">
            <Text className="text-[30px] font-bold text-ink">选择币种</Text>
            <Text className="text-[12px] text-muted">先选资产，再匹配提现网络</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX }}>
          <View className="flex-row items-center rounded-2xl border border-line bg-surface px-3 py-2.5">
            <SearchIcon size={18} color="#9CA3AF" />
            <TextInput value={tokenSearch} onChangeText={setTokenSearch} placeholder="搜索币种" className="ml-2 flex-1 text-[14px] text-ink" />
          </View>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 10 }}>
          <View className="rounded-2xl border border-line bg-white px-4 py-3">
            <Text className="text-[21px] font-bold text-ink">可提现资产</Text>
            <Text className="mt-1 text-[13px] text-muted">优先展示当前持仓与常用币种</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: uiSpace.pageX, paddingTop: 10, paddingBottom: 24 }}>
          {visibleTokens.map((t) => (
            <Pressable
              key={t.symbol}
              onPress={() => {
                setSymbol(t.symbol);
                setPage("network");
              }}
              className="flex-row items-center justify-between border-b border-line py-4 active:opacity-70"
            >
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <TokenIcon symbol={t.symbol} size={28} />
                <View>
                  <Text className="text-[22px] font-semibold text-ink">{t.symbol}</Text>
                  <Text className="text-[13px] text-muted">X Layer</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-[22px] font-semibold text-ink">{t.qty.toFixed(t.qty >= 1 ? 4 : 6)}</Text>
                <Text className="text-[12px] text-muted">${t.valueUsd.toFixed(2)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (page === "network") {
    return (
      <View style={{ flex: 1, backgroundColor: uiColors.appBg }}>
        <View className="flex-row items-center px-3 pb-2 pt-1">
          <Pressable onPress={() => setPage("token")} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
            <ArrowLeftIcon size={22} />
          </Pressable>
          <View className="ml-1">
            <Text className="text-[30px] font-bold text-ink">选择网络</Text>
            <Text className="text-[12px] text-muted">根据目标地址选择最优费用网络</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX }}>
          <View className="flex-row items-center rounded-2xl border border-line bg-surface px-3 py-2.5">
            <SearchIcon size={18} color="#9CA3AF" />
            <TextInput value={networkSearch} onChangeText={setNetworkSearch} placeholder="搜索网络" className="ml-2 flex-1 text-[14px] text-ink" />
          </View>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 10 }}>
          <View className="rounded-2xl border border-line bg-white px-4 py-3">
            <Text className="text-[21px] font-bold text-ink">可用网络</Text>
            <Text className="mt-1 text-[13px] text-muted">系统将优先推荐低手续费网络</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: uiSpace.pageX, paddingTop: 10, paddingBottom: 24 }}>
          {visibleNetworks.map((n) => (
            <Pressable
              key={n.name}
              onPress={() => {
                setNetwork(n.name);
                setPage("address");
              }}
              className="flex-row items-center justify-between border-b border-line py-4 active:opacity-70"
            >
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <TokenIcon symbol={n.name === "X Layer" ? "OKB" : n.name === "Solana" ? "SOL" : "ETH"} size={28} />
                <View className="flex-row items-center" style={{ gap: 6 }}>
                  <Text className="text-[22px] font-semibold text-ink">{n.name}</Text>
                  {n.tag ? (
                    <View className="rounded-md bg-lime-200 px-1.5 py-0.5">
                      <Text className="text-[10px] font-bold" style={{ color: "#365314" }}>{n.tag}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View className="items-end">
                <Text className="text-[16px] font-semibold text-ink">{n.feeLabel}</Text>
                <Text className="text-[12px] text-muted">网络费</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (page === "address") {
    return (
      <View style={{ flex: 1, backgroundColor: uiColors.appBg }}>
        <View className="flex-row items-center px-3 pb-1 pt-1">
          <Pressable onPress={() => setPage("network")} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
            <ArrowLeftIcon size={22} />
          </Pressable>
          <Text className="ml-1 text-[30px] font-bold text-ink">收款地址</Text>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 2 }}>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="输入钱包地址或域名"
            placeholderTextColor="#9CA3AF"
            className="text-[34px] font-semibold text-ink"
          />
          <View className="mt-3 flex-row justify-end">
            <Pressable className="rounded-full border border-line bg-surface px-4 py-2 active:opacity-80">
              <Text className="text-[14px] font-semibold text-ink2">粘贴</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB" }}>
          <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 10 }}>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Pressable onPress={() => setAddressTab("recent")} className={`rounded-full px-3 py-1.5 ${addressTab === "recent" ? "bg-ink" : "border border-line bg-surface"}`}>
                <Text className={`text-[13px] font-semibold ${addressTab === "recent" ? "text-white" : "text-ink2"}`}>最近使用</Text>
              </Pressable>
              <Pressable onPress={() => setAddressTab("mine")} className={`rounded-full px-3 py-1.5 ${addressTab === "mine" ? "bg-ink" : "border border-line bg-surface"}`}>
                <Text className={`text-[13px] font-semibold ${addressTab === "mine" ? "text-white" : "text-ink2"}`}>我的钱包</Text>
              </Pressable>
              <Pressable onPress={() => setAddressTab("book")} className={`rounded-full px-3 py-1.5 ${addressTab === "book" ? "bg-ink" : "border border-line bg-surface"}`}>
                <Text className={`text-[13px] font-semibold ${addressTab === "book" ? "text-white" : "text-ink2"}`}>地址簿</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: uiSpace.pageX, paddingTop: 8, paddingBottom: 24 }}>
          {addressTab === "book" && displayedAddresses.length === 0 ? (
            <View className="items-center py-12">
              <Text className="text-[14px] text-muted">地址簿暂未接入，敬请期待</Text>
            </View>
          ) : null}
          {displayedAddresses.map((addr, idx) => (
            <Pressable
              key={addr}
              onPress={() => {
                setAddress(addr);
                setPage("amount");
              }}
              className="flex-row items-center justify-between border-b border-line py-3.5 active:opacity-70"
            >
              <View className="flex-row items-center" style={{ gap: 10 }}>
                {renderAddressIdenticon(addr)}
                <View>
                  <Text className="text-[18px] font-semibold text-ink">{addr.slice(0, 6)}...{addr.slice(-4)}</Text>
                  <Text className="text-[14px] text-muted">{addr}</Text>
                </View>
              </View>
              <Text className="text-[22px] text-muted">×</Text>
            </Pressable>
          ))}
          {addressTab !== "book" && displayedAddresses.length === 0 ? (
            <View className="items-center py-12">
              <Text className="text-[14px] text-muted">{addressTab === "mine" ? "暂无钱包地址" : "暂无最近地址，请先输入或完成一次提现"}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  if (page === "amount") {
    const readyToNext = !!address.trim() && Number(amount) > 0 && Number(amount) <= balance;
    return (
      <View style={{ flex: 1, backgroundColor: uiColors.appBg }}>
        <View className="flex-row items-center px-3 pb-2 pt-1">
          <Pressable onPress={() => setPage("address")} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
            <ArrowLeftIcon size={22} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX }}>
          <Text className="text-[16px] text-muted">可用：{balance.toFixed(symbol === "USDT" || symbol === "USDC" ? 2 : 4)} {symbol} <Text className="font-bold text-ink">最大</Text></Text>
          <View className="mt-2 flex-row items-center" style={{ gap: 6 }}>
            <View style={{ width: 3, height: 54, borderRadius: 99, backgroundColor: "#16A34A" }} />
            <Text className="text-[68px] font-bold text-ink">{amount || "0"}</Text>
            <Text className="text-[64px] font-semibold" style={{ color: "#9CA3AF" }}>{symbol}</Text>
          </View>
          <View className="mt-1 flex-row items-center justify-between">
            <Text className="text-[17px] text-muted">{(Number(amount || 0) * unitPrice).toFixed(2)} USD  ▾</Text>
            <Text className="text-[24px] font-semibold text-ink">⇅</Text>
          </View>
        </View>
        <View className="mt-auto px-8 pb-6">
          <View className="flex-row flex-wrap justify-between">
            {["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((k) => (
              <Pressable
                key={k}
                onPress={() => {
                  if (k === "⌫") {
                    setAmount((prev) => prev.slice(0, -1));
                    return;
                  }
                  appendAmount(k);
                }}
                style={{ width: "30%", height: 52, alignItems: "center", justifyContent: "center", marginBottom: 10 }}
              >
                <Text className="text-[32px] text-ink">{k}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => {
              if (!readyToNext) return;
              rememberAddress(address);
              setPage("confirm");
            }}
            className="mt-2 h-12 items-center justify-center rounded-full active:opacity-80"
            style={{ backgroundColor: readyToNext ? "#1F7A1F" : "#B8D9B8" }}
          >
            <Text className="text-[18px] font-semibold text-white">下一步</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: uiColors.appBg }}>
      <View className="flex-row items-center justify-between px-3 pb-2 pt-1">
        <Pressable onPress={() => setPage("amount")} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
          <ArrowLeftIcon size={22} />
        </Pressable>
        <Text className="text-[17px] font-semibold text-ink">确认发送</Text>
        <View className="h-10 w-10" />
      </View>
      <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 10 }}>
        <Surface elevation={1} padded={false}>
          <View className="px-4 py-3">
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <TokenIcon symbol={symbol} size={28} />
              <Text className="text-[40px] font-semibold text-ink">-{amount || "0"} {symbol}</Text>
            </View>
          </View>
          <View className="border-t border-line px-4 py-3">
            <View className="flex-row items-center justify-between py-1.5">
              <Text className="text-[14px] text-ink2">网络</Text>
              <Text className="text-[14px] font-semibold text-ink">{network}</Text>
            </View>
            <View className="flex-row items-center justify-between py-1.5">
              <Text className="text-[14px] text-ink2">网络费用</Text>
              <View className="rounded-md border border-line bg-surface px-1.5 py-0.5">
                <Text className="text-[11px] font-bold text-ink2">待链上估算</Text>
              </View>
            </View>
            <View className="flex-row items-center justify-between py-1.5">
              <Text className="text-[14px] text-ink2">发送地址</Text>
              <Text className="text-[13px] font-semibold text-ink">{symbol} 钱包</Text>
            </View>
            <View className="flex-row items-center justify-between py-1.5">
              <Text className="text-[14px] text-ink2">收款地址</Text>
              <Text className="text-[13px] font-semibold text-ink">{address.slice(0, 8)}...{address.slice(-6)}</Text>
            </View>
          </View>
        </Surface>
      </View>
      <View className="mt-auto flex-row px-4 pb-6" style={{ gap: 10 }}>
        <Pressable className="h-12 flex-1 items-center justify-center rounded-full bg-surface active:opacity-80" onPress={() => setPage("amount")}>
          <Text className="text-[18px] font-semibold text-ink2">拒绝</Text>
        </Pressable>
        <Pressable
          disabled={!canSubmit || sending}
          onPress={async () => {
            if (!canSubmit || sending || !session?.token) return;
            setSendError("");
            setSending(true);
            try {
              const chain =
                network === "X Layer" ? "xlayer" :
                network === "Solana" ? "solana" :
                "ethereum";
              const res = await okxOnchainClient.sendWalletTransfer(
                {
                  chain,
                  symbol,
                  toAddress: address.trim(),
                  amount: amount.trim()
                },
                session.token
              );
              const txHash = String(res?.data?.txHash || "");
              Alert.alert("发送已提交", txHash ? `交易哈希：${txHash}` : "已广播到链上，等待确认");
              setAmount("");
              setAddress("");
              setPage("token");
            } catch (err) {
              const msg = err instanceof Error ? err.message : "发送失败，请稍后重试";
              setSendError(msg);
            } finally {
              setSending(false);
            }
          }}
          className="h-12 flex-1 items-center justify-center rounded-full active:opacity-80"
          style={{ backgroundColor: canSubmit && !sending ? "#15803D" : "#D1D5DB" }}
        >
          <Text className="text-[18px] font-semibold text-white">{sending ? "发送中..." : "确认"}</Text>
        </Pressable>
      </View>
      {sendError ? (
        <Text className="px-4 pb-4 text-center text-[12px]" style={{ color: "#B91C1C" }}>
          {sendError}
        </Text>
      ) : null}
    </View>
  );
}

function SwapScreen({
  onClose,
  token,
  assets
}: {
  onClose: () => void;
  token?: string;
  assets: Array<{symbol:string; qty:number; price:number; valueUsd:number; change24h:number}>;
}) {
  const [fromSymbol, setFromSymbol] = useState<"USDT" | "ETH" | "SOL" | "USDC">("USDT");
  const [toSymbol, setToSymbol] = useState<"USDT" | "ETH" | "SOL" | "USDC">("ETH");
  const [pickerSide, setPickerSide] = useState<null | "from" | "to">(null);
  const [amount, setAmount] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [networkFeeUsd, setNetworkFeeUsd] = useState("0.32");
  const [priceImpactPct, setPriceImpactPct] = useState("0.00");
  const [routerLabel, setRouterLabel] = useState("OKX DEX Aggregator");
  const [slippageBps, setSlippageBps] = useState(50);
  const [remoteToAmount, setRemoteToAmount] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [lastTxHash, setLastTxHash] = useState<string>("");
  const prices: Record<string, number> = { USDT: 1, USDC: 1, ETH: 2380, SOL: 165 };
  const balances: Record<string, number> = {
    USDT: assets.find((a) => a.symbol === "USDT")?.qty ?? 0,
    USDC: assets.find((a) => a.symbol === "USDC")?.qty ?? 0,
    ETH: assets.find((a) => a.symbol === "ETH")?.qty ?? 0,
    SOL: assets.find((a) => a.symbol === "SOL")?.qty ?? 0
  };
  const parsedAmount = Number(amount || 0);
  const fromPrice = prices[fromSymbol];
  const toPrice = prices[toSymbol];
  const outputAmount = parsedAmount > 0 && fromPrice > 0 && toPrice > 0 ? (parsedAmount * fromPrice) / toPrice : 0;
  const quote = remoteToAmount ?? "";
  const minReceived = (Number(quote) * 0.995).toFixed(6);
  const insufficient = parsedAmount > (balances[fromSymbol] ?? 0);
  const hasAmount = parsedAmount > 0;
  const hasRealQuote = !!quote && Number(quote) > 0;
  const canPreview = hasAmount && !insufficient && hasRealQuote && !quoteLoading;
  const buttonText = parsedAmount <= 0
    ? "输入金额"
    : insufficient
    ? `${fromSymbol} 余额不足，去补充`
    : quoteLoading
    ? "报价中..."
    : "预览兑换";

  useEffect(() => {
    if (!hasAmount) return;
    let cancelled = false;
    (async () => {
      try {
        setQuoteLoading(true);
        setQuoteError("");
        const quoteRes = await okxOnchainClient.getSwapQuote(
          {
            fromChain: "xlayer",
            fromSymbol,
            fromAmount: String(parsedAmount),
            toChain: "xlayer",
            toSymbol,
            slippageBps
          },
          token
        );
        if (cancelled) return;
        const q = quoteRes.data;
        const toAmt = Number(q.toAmount);
        if (Number.isFinite(toAmt) && toAmt > 0) {
          setRemoteToAmount(toAmt.toFixed(6));
        } else {
          setRemoteToAmount(null);
          setQuoteError("未获取到有效报价");
        }
        setNetworkFeeUsd(q.estimatedGasUsd || "0.32");
        setPriceImpactPct(((q.priceImpactBps || 0) / 100).toFixed(2));
        setRouterLabel(q.routerLabel || "OKX DEX Aggregator");
        if (typeof q.slippageBps === "number" && q.slippageBps > 0) setSlippageBps(q.slippageBps);
      } catch {
        setRemoteToAmount(null);
        setQuoteError("OKX 报价不可用，请稍后重试");
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromSymbol, toSymbol, parsedAmount, hasAmount, token, slippageBps]);

  useEffect(() => {
    if (!hasAmount) {
      setRemoteToAmount(null);
      setNetworkFeeUsd("0.32");
      setPriceImpactPct("0.00");
      setRouterLabel("OKX DEX Aggregator");
      setQuoteError("");
      setQuoteLoading(false);
    }
  }, [hasAmount]);

  function flipPair() {
    setFromSymbol(toSymbol);
    setToSymbol(fromSymbol);
  }

  function pickSymbol(symbol: "USDT" | "ETH" | "SOL" | "USDC") {
    if (!pickerSide) return;
    if (pickerSide === "from") {
      if (symbol === toSymbol) {
        setFromSymbol(symbol);
        setToSymbol(fromSymbol);
      } else {
        setFromSymbol(symbol);
      }
    } else {
      if (symbol === fromSymbol) {
        setToSymbol(symbol);
        setFromSymbol(toSymbol);
      } else {
        setToSymbol(symbol);
      }
    }
    setPickerSide(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: uiColors.appBg }}>
      <View className="flex-row items-center justify-between px-3 pb-2 pt-1">
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface"
        >
          <ArrowLeftIcon size={22} />
        </Pressable>
        <Text className="text-[17px] font-semibold text-ink">兑换</Text>
        <View className="h-10 w-10" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 8 }}>
          <Surface elevation={1} padded={false}>
            <View className="px-4 py-3">
              <Text className="text-[12px] font-medium text-muted">你支付</Text>
              <View className="mt-2 flex-row items-center justify-between">
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  className="text-[30px] font-bold text-ink"
                  style={{ minWidth: 130, paddingVertical: 0 }}
                />
                <Pressable onPress={() => setPickerSide("from")} className="rounded-full border border-line bg-surface px-3 py-1.5 active:opacity-70">
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <TokenIcon symbol={fromSymbol} size={18} />
                    <Text className="text-[14px] font-semibold text-ink">{fromSymbol}</Text>
                  </View>
                </Pressable>
              </View>
              <Text className="mt-1 text-[12px] text-muted">
                余额 {balances[fromSymbol].toFixed(fromSymbol === "USDT" || fromSymbol === "USDC" ? 2 : 4)} {fromSymbol}
              </Text>
            </View>

            <View style={{ alignItems: "center", marginTop: -4, marginBottom: -4, zIndex: 3 }}>
              <Pressable
                onPress={flipPair}
                className="h-10 w-10 items-center justify-center rounded-full border border-line bg-white active:opacity-80"
                style={{
                  shadowColor: "#0F172A",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 6,
                  elevation: 2
                }}
              >
                <SwapIcon size={18} color="#0F0F0F" />
              </Pressable>
            </View>

            <View className="border-t border-line px-4 py-3">
              <Text className="text-[12px] font-medium text-muted">你将收到</Text>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-[26px] font-bold text-ink">{quote || "--"}</Text>
                <Pressable onPress={() => setPickerSide("to")} className="rounded-full border border-line bg-surface px-3 py-1.5 active:opacity-70">
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <TokenIcon symbol={toSymbol} size={18} />
                    <Text className="text-[14px] font-semibold text-ink">{toSymbol}</Text>
                  </View>
                </Pressable>
              </View>
              <Text className="mt-1 text-[12px] text-muted">
                {quoteLoading ? "获取实时报价中..." : quoteError ? quoteError : `约 $${(Number(quote || 0) * toPrice).toFixed(2)}`}
              </Text>
            </View>
          </Surface>
        </View>

        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 12 }}>
          {hasAmount ? (
            <View
              className="mb-2 rounded-xl border px-3 py-2.5"
              style={{
                borderColor: insufficient ? "#FECACA" : "#E5E7EB",
                backgroundColor: "#FFFFFF"
              }}
            >
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  top: 8,
                  bottom: 8,
                  width: 3,
                  borderTopLeftRadius: 6,
                  borderBottomLeftRadius: 6,
                  backgroundColor: insufficient ? "#EF4444" : "#9CA3AF"
                }}
              />
              <Text className="text-[12px]" style={{ color: insufficient ? "#7F1D1D" : "#475569", paddingLeft: 4 }}>
                {insufficient
                  ? `余额不足：当前仅 ${balances[fromSymbol].toFixed(2)} ${fromSymbol}`
                  : `流动性良好，预计成交滑点约 0.12%`}
              </Text>
            </View>
          ) : null}
          <Surface elevation={1} padded={false}>
            <View className="flex-row items-center justify-between px-4 py-3">
              <Text className="text-[13px] text-muted">预估汇率</Text>
              <Text className="text-[13px] font-semibold text-ink">1 {toSymbol} ≈ {(toPrice / fromPrice).toFixed(4)} {fromSymbol}</Text>
            </View>
            <View className="border-t border-line flex-row items-center justify-between px-4 py-3">
              <Text className="text-[13px] text-muted">网络费</Text>
              <Text className="text-[13px] font-semibold text-ink">≈ ${networkFeeUsd}</Text>
            </View>
            {hasAmount ? (
              <View className="border-t border-line flex-row items-center justify-between px-4 py-3">
                <Text className="text-[13px] text-muted">滑点保护</Text>
                <Text className="text-[13px] font-semibold text-ink">{(slippageBps / 100).toFixed(2)}%</Text>
              </View>
            ) : null}
            <View className="border-t border-line flex-row items-center justify-between px-4 py-3">
              <Text className="text-[13px] text-muted">价格影响 / 路由</Text>
              <Text className="text-[13px] font-semibold text-ink">{priceImpactPct}% · {routerLabel}</Text>
            </View>
          </Surface>
        </View>

        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 16 }}>
          <Pressable
            className="h-12 items-center justify-center rounded-xl active:opacity-80"
            style={{ backgroundColor: canPreview ? "#0F0F0F" : "#D1D5DB" }}
            onPress={() => {
              if (!canPreview) return;
              setPreviewOpen(true);
            }}
          >
            <Text className="text-[15px] font-semibold text-white">{buttonText}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {previewOpen ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#FFFFFF"
          }}
        >
          <View
            style={{
              flex: 1,
              paddingHorizontal: 16,
              paddingTop: 6,
              paddingBottom: 22
            }}
          >
            <View className="mb-3 flex-row items-center">
              <Pressable onPress={() => setPreviewOpen(false)} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
                <ArrowLeftIcon size={22} />
              </Pressable>
              <Text className="ml-1 text-[24px] font-bold text-ink">
                确认 <Text style={{ color: "#16A34A" }}>授权并兑换</Text>
              </Text>
            </View>

            <View className="border-t border-line pt-3">
              <Text className="text-[14px] text-ink2">交易 1　授权</Text>
              <View className="mt-2 flex-row items-center">
                <TokenIcon symbol={fromSymbol} size={28} />
                <Text className="ml-2 text-[42px] font-semibold text-ink">无限 {fromSymbol}</Text>
              </View>
            </View>

            <View className="mt-4 border-t border-line pt-3">
              <Text className="text-[14px] text-ink2">交易 2　兑换</Text>
              <View className="mt-2 flex-row items-center">
                <TokenIcon symbol={fromSymbol} size={28} />
                <Text className="ml-2 text-[44px] font-semibold text-ink">-{amount || "0"} {fromSymbol}</Text>
              </View>
              <View className="mt-1 flex-row items-center">
                <TokenIcon symbol={toSymbol} size={28} />
                <Text className="ml-2 text-[44px] font-semibold text-ink">+{quote} {toSymbol}</Text>
              </View>
            </View>

            <View className="mt-5 border-t border-line pt-3">
              <View className="flex-row items-center justify-between py-1.5">
                <Text className="text-[14px] text-ink2">网络</Text>
                <Text className="text-[14px] font-medium text-ink">X Layer</Text>
              </View>
              <View className="flex-row items-center justify-between py-1.5">
                <Text className="text-[14px] text-ink2">汇率</Text>
                <Text className="text-[14px] font-medium text-ink">1 {fromSymbol} ≈ {(1 / Math.max(Number(quote || "0.000001"), 0.000001)).toFixed(4)} {toSymbol}</Text>
              </View>
              <View className="flex-row items-center justify-between py-1.5">
                <Text className="text-[14px] text-ink2">最少获得</Text>
                <Text className="text-[14px] font-medium text-ink">{minReceived} {toSymbol}</Text>
              </View>
            </View>

            <View className="mt-auto flex-row" style={{ gap: 10 }}>
              <Pressable
                className="h-12 flex-1 items-center justify-center rounded-full bg-surface"
                onPress={() => setPreviewOpen(false)}
              >
                <Text className="text-[16px] font-semibold text-ink2">取消</Text>
              </Pressable>
              <Pressable
                className="h-12 flex-1 items-center justify-center rounded-full bg-emerald-700 active:opacity-80"
                onPress={async () => {
                  if (!canPreview) return;
                  setConfirming(true);
                  try {
                    const execRes = await okxOnchainClient.executeSwap(
                      {
                        fromChain: "xlayer",
                        fromSymbol,
                        fromAmount: String(parsedAmount),
                        toChain: "xlayer",
                        toSymbol,
                        slippageBps
                      },
                      token
                    );
                    setLastTxHash(execRes.data.txHash || "");
                  } catch {
                    setLastTxHash("");
                    setQuoteError("OKX 执行失败，请稍后重试");
                    return;
                  } finally {
                    setConfirming(false);
                  }
                  setPreviewOpen(false);
                  setDoneOpen(true);
                }}
              >
                <Text className="text-[16px] font-semibold text-white">
                  {confirming ? "执行中..." : "确认"}
                </Text>
              </Pressable>
            </View>
            {quoteError ? (
              <Text className="mt-2 text-center text-[12px]" style={{ color: "#B91C1C" }}>
                {quoteError}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {doneOpen ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15,23,42,0.25)",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 26
          }}
        >
          <View className="w-full rounded-2xl bg-white px-5 py-5">
            <Text className="text-[17px] font-bold text-ink">兑换已提交</Text>
            <Text className="mt-1 text-[13px] text-ink2">
              {amount || "0"} {fromSymbol} → {quote} {toSymbol}
            </Text>
            <Text className="mt-1 text-[12px] text-muted">
              {lastTxHash ? `交易哈希：${lastTxHash.slice(0, 14)}...${lastTxHash.slice(-8)}` : "交易哈希将在链上确认后展示。"}
            </Text>
            <View className="mt-4 flex-row" style={{ gap: 8 }}>
              <Pressable
                className="flex-1 h-10 items-center justify-center rounded-xl border border-line bg-surface"
                onPress={() => setDoneOpen(false)}
              >
                <Text className="text-[13px] font-semibold text-ink2">继续兑换</Text>
              </Pressable>
              <Pressable
                className="flex-1 h-10 items-center justify-center rounded-xl bg-ink"
                onPress={() => {
                  setDoneOpen(false);
                  onClose();
                }}
              >
                <Text className="text-[13px] font-semibold text-white">返回钱包</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {pickerSide ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15,23,42,0.25)",
            justifyContent: "flex-end"
          }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 20
            }}
          >
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-[16px] font-bold text-ink">选择币种</Text>
              <Pressable onPress={() => setPickerSide(null)} className="rounded-full bg-surface px-2.5 py-1">
                <Text className="text-[12px] font-semibold text-ink2">关闭</Text>
              </Pressable>
            </View>
            {(["USDT", "USDC", "ETH", "SOL"] as const).map((symbol) => (
              <Pressable
                key={symbol}
                onPress={() => pickSymbol(symbol)}
                className="flex-row items-center justify-between border-b border-line px-1 py-3 active:opacity-70"
              >
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <TokenIcon symbol={symbol} size={22} />
                  <Text className="text-[15px] font-semibold text-ink">{symbol}</Text>
                </View>
                <Text className="text-[12px] text-muted">余额 {balances[symbol].toFixed(symbol === "USDT" || symbol === "USDC" ? 2 : 4)}</Text>
              </Pressable>
            ))}
          </View>
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
            style={{ backgroundColor: "#E5E7EB", flexDirection: "row", alignItems: "center", gap: 3 }}
          >
            <LockIcon size={10} color="#6B7280" />
            <Text className="text-[10px] font-semibold" style={{ color: "#6B7280" }}>
              即将开放
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
      <Text className={`text-[15px] ${active ? "font-bold text-ink" : "font-medium text-muted"}`}>{label}</Text>
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
  // 防御：上游可能传 undefined / 空数组 / 单点 → 用零线兜底，不再让 Math.min(...undefined) 把 App 整崩
  const safeValues: number[] =
    Array.isArray(values) && values.length >= 2
      ? values
      : Array.isArray(values) && values.length === 1
        ? [values[0], values[0]]
        : [0, 0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = max - min || 1;
  const stepX = W / (safeValues.length - 1);

  const points = safeValues.map((v, i) => {
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
function AgentBanner({
  compact = false,
  onNavigate
}: {
  compact?: boolean;
  onNavigate: (view: AppView) => void;
}) {
  const banners: Array<{
    id: string;
    title: string;
    subtitle: string;
    target: AppView;
    colors: [string, string, string];
    accent: string;
  }> = [
    {
      id: "agent",
      title: "Agent · 运行中 2",
      subtitle: "累计 +2 U",
      target: "agent",
      colors: ["#F8C93F", "#F4B320", "#E8A51C"],
      accent: "#065F46"
    },
    {
      id: "signal",
      title: "发现链上机会",
      subtitle: "点我去 AI 对话，一句话开跑",
      target: "chat",
      colors: ["#A78BFA", "#8B5CF6", "#7C3AED"],
      accent: "#EDE9FE"
    },
    {
      id: "community",
      title: "社区热策略更新",
      subtitle: "点我去社区，查看最新讨论",
      target: "community",
      colors: ["#34D399", "#10B981", "#059669"],
      accent: "#D1FAE5"
    }
  ];
  const [idx, setIdx] = useState(0);
  const current = banners[idx];

  // 1. 状态绿点呼吸闪烁
  const dot = useSharedValue(1);
  // 2. 数字 +2U 微脉冲
  const pulse = useSharedValue(0);

  useEffect(() => {
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % banners.length);
    }, 4200);
    return () => clearInterval(t);
  }, [banners.length]);

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
  }, [dot, pulse]);

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
  return (
    <Pressable
      accessibilityRole="button"
      className="active:opacity-90"
      onPress={() => onNavigate(current.target)}
    >
      <View
        style={{
          borderRadius: compact ? 18 : 18,
          overflow: "hidden",
          shadowColor: "#C18412",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 10
        }}
      >
        <LinearGradient
          colors={current.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingVertical: compact ? 17 : 16,
            paddingHorizontal: compact ? 18 : 16,
            flexDirection: "row",
            alignItems: "center"
          }}
        >
          {/* 右侧静态高光：更接近 OKX 的克制风格 */}
          <View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: -8,
                bottom: -8,
                right: 62,
                width: 56,
                backgroundColor: "rgba(255,255,255,0.26)",
                transform: [{ skewX: "-20deg" }]
              }
            ]}
          />

          {/* 左侧 spark icon + 闪烁绿点 */}
          <View className="h-11 w-11 items-center justify-center">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-white/30">
              <SparkIcon size={20} color="rgba(15,23,42,0.78)" />
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
                    width: 13,
                    height: 13,
                    borderRadius: 6.5,
                    backgroundColor: "#22C55E"
                  },
                  dotHaloStyle
                ]}
              />
              <Animated.View
                style={[
                  {
                    width: 9,
                    height: 9,
                    borderRadius: 4.5,
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
            <Text className="text-[15px] font-bold text-amber-950" style={{ letterSpacing: -0.2 }}>
              {current.title}
            </Text>
            <View className="mt-0.5 flex-row items-baseline">
              <Text className="text-[13px] text-amber-900/85">
                {current.subtitle.includes("累计") ? "累计 " : ""}
              </Text>
              <Animated.Text
                style={[
                  { fontSize: 15, fontWeight: "800", color: current.accent },
                  profitStyle
                ]}
              >
                {current.subtitle.includes("累计")
                  ? current.subtitle.replace("累计 ", "")
                  : current.subtitle}
              </Animated.Text>
            </View>
            <View className="mt-1 flex-row" style={{ gap: 4 }}>
              {banners.map((b, i) => (
                <View
                  key={b.id}
                  style={{
                    width: i === idx ? 12 : 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: i === idx ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.5)"
                  }}
                />
              ))}
            </View>
          </View>

          <ChevronRightIcon size={18} color="rgba(93,49,7,0.55)" />
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
function AgentWalletPanel({
  rows,
  loading,
  onDeposit
}: {
  rows: Array<{symbol:string; qty:number; price:number; valueUsd:number; change24h:number}>;
  loading: boolean;
  onDeposit?: () => void;
}) {
  return (
    <Surface elevation={1} padded={false}>
      <View>
        {loading ? (
          <View className="px-4 py-6 items-center">
            <Text className="text-[13px] text-muted">链上资产加载中…</Text>
          </View>
        ) : rows.length === 0 ? (
          <View className="px-6 py-8 items-center">
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "#F5F3FF",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 30 }}>👋</Text>
            </View>
            <Text className="text-[18px] font-bold text-ink mb-2">钱包还是空的</Text>
            <Text className="text-[13px] text-muted text-center mb-5" style={{ lineHeight: 20 }}>
              充入你的第一笔代币，开启 AI 自动交易、跨链兑换与转账
            </Text>
            <Pressable
              onPress={onDeposit}
              accessibilityRole="button"
              style={{
                backgroundColor: "#7C3AED",
                paddingHorizontal: 22,
                paddingVertical: 12,
                borderRadius: 999,
              }}
              className="active:opacity-80"
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                充入第一笔代币
              </Text>
            </Pressable>
          </View>
        ) : (
          rows.map((row, idx) => {
            const up = row.change24h >= 0;
            return (
              <View key={`${row.symbol}_${idx}`} className={`flex-row items-center px-4 py-4 ${idx > 0 ? "border-t border-line" : ""}`}>
                <TokenIcon symbol={row.symbol} size={32} />
                <View className="ml-3 flex-1">
                  <View className="flex-row items-start justify-between">
                    <View>
                      <Text className="text-[16px] font-semibold text-ink">{row.symbol}</Text>
                      <Text className="mt-1 text-[13px]" style={{ color: "#94A3B8" }}>
                        数量 {row.qty.toFixed(row.qty >= 1 ? 4 : 6)}
                      </Text>
                    </View>
                    <View style={{ minWidth: 98, alignItems: "flex-end" }}>
                      <Text className="text-[16px] font-semibold text-ink">${row.valueUsd.toFixed(2)}</Text>
                      <Text className="mt-1 text-[13px]" style={{ color: "#94A3B8" }}>
                        ${row.price.toFixed(row.price >= 1 ? 2 : 6)}
                      </Text>
                    </View>
                  </View>
                </View>
                <View className="ml-2 rounded-full px-2 py-0.5" style={{ backgroundColor: up ? "#DCFCE7" : "#FEE2E2" }}>
                  <Text className="text-[11px] font-semibold" style={{ color: up ? "#15803D" : "#DC2626" }}>
                    {up ? "+" : ""}{row.change24h.toFixed(2)}%
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </Surface>
  );
}

function HeroCard({
  hideBalance,
  totalBalance,
  pnlPercent,
  monthPnl,
  portfolioSpark
}: {
  hideBalance: boolean;
  totalBalance: string;
  pnlPercent: string;
  monthPnl: string;
  portfolioSpark: number[];
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
            <Text className="text-[13px] font-semibold text-white">Multi-chain</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Text className="text-[13px] font-medium text-white/70">本月收益</Text>
            <Text className="text-[14px] font-bold text-emerald-300">{monthPnl}</Text>
          </View>
        </View>

        {/* 余额 */}
        <View className="mt-4">
          <Text className="text-[14px] font-medium tracking-wider text-white/70">总资产 (USD)</Text>
          <View className="mt-1 flex-row items-center">
            <Animated.Text
              style={[
                {
                  fontSize: 40,
                  fontFamily: "Inter_700Bold",
                  lineHeight: 44,
                  fontWeight: "800",
                  color: "#FFFFFF",
                  textShadowColor: "rgba(217,170,67,0.55)",
                  textShadowOffset: { width: 0, height: 0 }
                },
                numStyle
              ]}
            >
              {hideBalance ? "$ ••••••" : `$${totalBalance}`}
            </Animated.Text>
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
              <Text className="text-[14px] font-bold text-emerald-300">{pnlPercent}</Text>
            </Animated.View>
            <Text className="text-[14px] font-medium text-white/75">最近 30 天</Text>
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
