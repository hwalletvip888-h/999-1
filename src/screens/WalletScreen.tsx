import React from "react";
import { useEffect, useMemo, useState } from "react";
import { Alert, Dimensions, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
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
  ChevronRightIcon,
  SearchIcon,
  SparkIcon,
  SwapIcon
} from "../components/ui/Icons";
import { TokenIcon } from "../components/ui/TokenIcons";
import { api } from "../api/gateway";
import { okxOnchainClient, type ChainId } from "../api/providers/okx/okxOnchainClient";
import type { AppView } from "../types";
import { isPositive } from "../utils/format";
import { useSession, sessionStore } from "../services/sessionStore";
import { refreshAddresses, listAccounts, switchAccount, addAccount, type WalletAccount } from "../services/walletApi";
import { formatHwalletErrorForUser } from "../services/hwalletErrorUi";
import { uiColors, uiSpace } from "../theme/uiSystem";

const SCREEN_W = Dimensions.get("window").width;

type WalletScreenProps = {
  onChangeView: (view: AppView) => void;
};

const defaultSpark = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export function WalletScreen({ onChangeView }: WalletScreenProps) {
  const session = useSession();
  const [hideBalance, setHideBalance] = useState(false);
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
  // 同 symbol 跨链分布：{ USDT: [{chain:'xlayer',qty:1.04,usdValue:1.04}, ...] }
  const [tokenBreakdown, setTokenBreakdown] = useState<Record<string, Array<{chain: string; chainLabel: string; qty: number; usdValue: number; contract?: string}>>>({});
  // 顶部 HeroCard 上的网络过滤器：全部 / EVM / SOL → 控制资产列表 + 总余额一起变
  const [chainFilter, setChainFilter] = useState<"all" | "evm" | "solana">("all");
  // PnL 时间窗（暂只切 UI，数字目前都是 0；后面对接 OKX 历史 API 后会有真实数据）
  const [timeWindow, setTimeWindow] = useState<30 | 90 | 180 | 360>(30);
  // 子账户切换
  const [accountList, setAccountList] = useState<WalletAccount[]>([]);
  const [accountListLoading, setAccountListLoading] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [accountSwitching, setAccountSwitching] = useState(false);

  const accountIdMasked = session?.accountId
    ? `${session.accountId.slice(0, 6)}…${session.accountId.slice(-4)}`
    : "未连接";

  // 根据 chainFilter 过滤 + 按链重新聚合的资产行；filteredTotal 同步反映
  const isSolanaChain = (c: string) => String(c || "").toLowerCase() === "solana";
  const { filteredAssets, filteredBreakdown, filteredTotalUsd } = useMemo(() => {
    const fb: typeof tokenBreakdown = {};
    let totalUsd = 0;
    const rows: typeof agentAssets = [];
    for (const row of agentAssets) {
      const all = tokenBreakdown[row.symbol] ?? [];
      const matched =
        chainFilter === "all"
          ? all
          : chainFilter === "solana"
            ? all.filter((b) => isSolanaChain(b.chain))
            : all.filter((b) => !isSolanaChain(b.chain));
      if (matched.length === 0) continue;
      const qty = matched.reduce((s, b) => s + b.qty, 0);
      const usd = matched.reduce((s, b) => s + b.usdValue, 0);
      if (!(qty > 0 || usd > 0.001)) continue;
      fb[row.symbol] = matched;
      totalUsd += usd;
      rows.push({ ...row, qty, valueUsd: usd });
    }
    rows.sort((a, b) => b.valueUsd - a.valueUsd);
    return { filteredAssets: rows, filteredBreakdown: fb, filteredTotalUsd: totalUsd };
  }, [chainFilter, agentAssets, tokenBreakdown]);

  const filteredTotalLabel = filteredTotalUsd.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
          const msg = formatHwalletErrorForUser(portfolioErr);
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
        setWalletDataError(formatHwalletErrorForUser(err));
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

  // 拉子账户列表（顶部切换器用）
  const reloadAccountList = async () => {
    if (!session?.token) return;
    setAccountListLoading(true);
    try {
      const res = await listAccounts();
      if (res.ok) setAccountList(res.accounts);
    } finally {
      setAccountListLoading(false);
    }
  };
  useEffect(() => {
    reloadAccountList().catch(() => {});
  }, [session?.token, session?.accountId]);

  // 触发重新拉资产 — 切换账号 / 新建账号后调用
  const reloadEverything = async () => {
    setAgentAssetLoading(true);
    setLoading(true);
    try {
      if (!session?.token) return;
      const portfolio = await okxOnchainClient.getWalletPortfolio(session.token);
      const tokens = portfolio.data.tokens ?? [];
      // 这两个 useEffect 会自动重跑，这里只是兜底
      void tokens;
    } catch {
      /* noop */
    }
    // 强制触发上面两个 useEffect [session?.token]：通过 update accountId 在 sessionStore，让 useSession 改变引用
    const cur = sessionStore.get();
    if (cur) await sessionStore.set({ ...cur });
  };

  const handleSwitchAccount = async (accountId: string) => {
    if (!accountId || accountId === session?.accountId) {
      setAccountPickerOpen(false);
      return;
    }
    setAccountSwitching(true);
    try {
      const res = await switchAccount(accountId);
      if (!res.ok) {
        Alert.alert("切换失败", res.error || "请稍后重试");
        return;
      }
      await reloadAccountList();
      await reloadEverything();
      setAccountPickerOpen(false);
    } finally {
      setAccountSwitching(false);
    }
  };

  const handleAddAccount = async () => {
    setAccountSwitching(true);
    try {
      const res = await addAccount();
      if (!res.ok) {
        Alert.alert("新建失败", res.error || "请稍后重试");
        return;
      }
      // wallet add 后 CLI 自动激活了新账户，本地 session 也要同步
      if (res.accountId) {
        const cur = sessionStore.get();
        if (cur) await sessionStore.set({ ...cur, accountId: res.accountId });
      }
      await reloadAccountList();
      await reloadEverything();
      setAccountPickerOpen(false);
    } finally {
      setAccountSwitching(false);
    }
  };

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

        // 跨链同 symbol 聚合 + 同时保留每条链的明细
        const chainLabel = (c: string): string => {
          const v = String(c || "").toLowerCase();
          if (v === "xlayer") return "X Layer";
          if (v === "bsc") return "BNB Chain";
          if (v === "polygon") return "Polygon";
          if (v === "arbitrum") return "Arbitrum";
          if (v === "base") return "Base";
          if (v === "solana") return "Solana";
          if (v === "ethereum") return "Ethereum";
          return v ? v.charAt(0).toUpperCase() + v.slice(1) : "Onchain";
        };
        const map = new Map<string, { qty: number; valueUsd: number }>();
        const breakdown: Record<string, Array<{ chain: string; chainLabel: string; qty: number; usdValue: number; contract?: string }>> = {};
        for (const t of tokens) {
          const symbol = String(t.symbol || "").toUpperCase();
          if (!symbol) continue;
          const qty = Number(t.amount || 0);
          const usd = Number(t.usdValue || 0);
          if (!(qty > 0 || usd > 0.001)) continue;
          const prev = map.get(symbol) ?? { qty: 0, valueUsd: 0 };
          map.set(symbol, { qty: prev.qty + qty, valueUsd: prev.valueUsd + usd });
          const chainKey = String(t.chain || "");
          (breakdown[symbol] ||= []).push({
            chain: chainKey,
            chainLabel: chainLabel(chainKey),
            qty,
            usdValue: usd,
            contract: t.contract,
          });
        }
        // 每个 symbol 的明细按 USD 价值降序
        for (const sym of Object.keys(breakdown)) {
          breakdown[sym].sort((a, b) => b.usdValue - a.usdValue);
        }
        if (!cancelled) setTokenBreakdown(breakdown);

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
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapMounted, setSwapMounted] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositMounted, setDepositMounted] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawMounted, setWithdrawMounted] = useState(false);

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

        {/* 中间钱包地址胶囊 — 点击展开账号选择器 */}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setAccountPickerOpen(true);
            reloadAccountList().catch(() => {});
          }}
          className="flex-row items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 active:opacity-70"
        >
          <View className="h-2 w-2 rounded-full bg-emerald-500" />
          <Text className="text-[14px] font-semibold text-ink">Agent Wallet</Text>
          <Text className="text-[13px] text-muted">{accountIdMasked}</Text>
          <Text style={{ fontSize: 11, color: "#94A3B8", marginLeft: 2 }}>▾</Text>
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
          <HeroCard
            hideBalance={hideBalance}
            totalBalance={filteredTotalLabel}
            pnlPercent={pnlPercent}
            monthPnl={monthPnl}
            portfolioSpark={portfolioSpark}
            chainFilter={chainFilter}
            onChangeChainFilter={setChainFilter}
            timeWindow={timeWindow}
            onChangeTimeWindow={setTimeWindow}
          />
        </View>

        {/* 操作区：3 张大色块卡 — 充值 / 提现 / 兑换。点哪都跑不了 */}
        <View
          style={{
            marginTop: uiSpace.sectionGap + 6,
            paddingHorizontal: uiSpace.pageX,
            flexDirection: "row",
            gap: 10,
          }}
        >
          <ActionCard
            label="充值"
            sub="收款 · 二维码"
            Icon={ArrowDownIcon}
            colors={["#10B981", "#059669"]}
            onPress={() => setDepositOpen(true)}
          />
          <ActionCard
            label="提现"
            sub="发送到任意地址"
            Icon={ArrowUpIcon}
            colors={["#7C3AED", "#5B21B6"]}
            onPress={() => setWithdrawOpen(true)}
          />
          <ActionCard
            label="兑换"
            sub="500+ DEX 聚合"
            Icon={SwapIcon}
            colors={["#F59E0B", "#D97706"]}
            onPress={() => setSwapOpen(true)}
          />
        </View>

        {/* Agent 状态条：放在操作后，形成主流程连续性 */}
        <View style={{ marginTop: 12, paddingHorizontal: uiSpace.pageX }}>
          <AgentBanner compact onNavigate={onChangeView} />
        </View>

        {/* 资产列表 — 单一来源：链上真实持仓，按 symbol 跨链聚合 */}
        <View style={{ marginTop: 14, paddingHorizontal: uiSpace.pageX, paddingBottom: 24 }}>
          <View className="mb-2 flex-row items-center justify-between px-1">
            <Text className="text-[13px] font-semibold uppercase tracking-wider text-muted">资产</Text>
            {filteredAssets.length > 0 && !agentAssetLoading ? (
              <Text className="text-[12px] text-muted">{filteredAssets.length} 个币种</Text>
            ) : null}
          </View>
          <AgentWalletPanel
            rows={filteredAssets}
            breakdown={filteredBreakdown}
            loading={agentAssetLoading}
            onDeposit={() => setDepositOpen(true)}
          />
        </View>
      </ScrollView>

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
          <WithdrawScreen
            onClose={() => setWithdrawOpen(false)}
            assets={agentAssets}
            tokenBreakdown={tokenBreakdown}
            session={session}
          />
        </Animated.View>
      ) : null}

      {/* 账号选择器 — 点中间胶囊弹出 */}
      {accountPickerOpen ? (
        <Pressable
          onPress={() => !accountSwitching && setAccountPickerOpen(false)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15,15,15,0.45)",
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 12,
              paddingBottom: 28,
              paddingHorizontal: 16,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E5E7EB" }} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F0F0F", marginBottom: 4 }}>
              切换账号
            </Text>
            <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 14 }}>
              同邮箱下可建多个独立子账户，地址各自隔离
            </Text>

            {accountListLoading ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: "#94A3B8" }}>加载中…</Text>
              </View>
            ) : (
              <View>
                {accountList.map((acc) => {
                  const active = acc.accountId === session?.accountId;
                  const masked = `${acc.accountId.slice(0, 6)}…${acc.accountId.slice(-4)}`;
                  return (
                    <Pressable
                      key={acc.accountId}
                      onPress={() => handleSwitchAccount(acc.accountId)}
                      disabled={accountSwitching}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 14,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? "#7C3AED" : "#E5E7EB",
                        backgroundColor: active ? "#F5F3FF" : "#FFFFFF",
                        marginBottom: 8,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: active ? "#7C3AED" : "#E5E7EB",
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 12,
                        }}
                      >
                        <Text style={{ color: active ? "#FFFFFF" : "#6B7280", fontWeight: "700", fontSize: 14 }}>
                          {acc.accountName?.match(/\d+/)?.[0] || "•"}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F0F0F" }}>{acc.accountName}</Text>
                          {active ? (
                            <View style={{ backgroundColor: "#7C3AED", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                              <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700" }}>当前</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }} numberOfLines={1}>
                          ID {masked}
                        </Text>
                        {acc.evmAddress ? (
                          <Text style={{ fontSize: 11, color: "#64748B", marginTop: 1 }} numberOfLines={1}>
                            EVM {acc.evmAddress.slice(0, 8)}…{acc.evmAddress.slice(-6)}
                          </Text>
                        ) : null}
                      </View>
                      {!active ? (
                        <Text style={{ fontSize: 12, color: "#7C3AED", fontWeight: "600" }}>切换</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={handleAddAccount}
                  disabled={accountSwitching}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 14,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: "#A78BFA",
                    backgroundColor: "#FAF5FF",
                    marginTop: 4,
                  }}
                >
                  <Text style={{ color: "#7C3AED", fontWeight: "700", fontSize: 14 }}>
                    {accountSwitching ? "处理中…" : "+ 新建子账户"}
                  </Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
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
  const [page, setPage] = useState<DepositPage>("main");
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
              className="mx-4 mb-4 active:opacity-90"
              style={{
                borderRadius: 16,
                overflow: "hidden",
                shadowColor: "#059669",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.28,
                shadowRadius: 14,
                elevation: 6,
              }}
            >
              <LinearGradient
                colors={["#10B981", "#059669"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFFFFF" }}>
                  复制收款地址
                </Text>
              </LinearGradient>
            </Pressable>
          </Surface>
        </View>
      </ScrollView>
    </View>
  );
}

/** 代币在某条 chain 上的分链持仓（用于提现：必须与发币的网络一致） */
type WithdrawBreakRow = {
  chain: string;
  chainLabel: string;
  qty: number;
  usdValue: number;
  contract?: string;
};

/** portfolio 返回的 chain key → UI 文案 + 后端 `wallet send` / transfer 参数 */
const WITHDRAW_CHAIN_META: Record<string, { ui: string; api: string }> = {
  xlayer: { ui: "X Layer", api: "xlayer" },
  ethereum: { ui: "Ethereum", api: "ethereum" },
  solana: { ui: "Solana", api: "solana" },
  bsc: { ui: "BNB Chain", api: "bsc" },
  polygon: { ui: "Polygon", api: "polygon" },
  arbitrum: { ui: "Arbitrum", api: "arbitrum" },
  base: { ui: "Base", api: "base" },
};

function aggregateWithdrawChains(
  breakdown: Record<string, WithdrawBreakRow[]> | undefined,
  symbol: string
): Array<{ chain: string; ui: string; api: string; qty: number; usdValue: number }> {
  const rows = breakdown?.[symbol] ?? [];
  const m = new Map<string, { qty: number; usdValue: number }>();
  for (const r of rows) {
    const ck = String(r.chain || "").toLowerCase();
    if (!ck) continue;
    const p = m.get(ck) ?? { qty: 0, usdValue: 0 };
    m.set(ck, { qty: p.qty + Number(r.qty || 0), usdValue: p.usdValue + Number(r.usdValue || 0) });
  }
  const list = [...m.entries()].map(([chain, v]) => ({
    chain,
    ui:
      WITHDRAW_CHAIN_META[chain]?.ui ??
      (rows.find((x) => String(x.chain).toLowerCase() === chain)?.chainLabel ?? chain),
    api: WITHDRAW_CHAIN_META[chain]?.api ?? chain,
    qty: v.qty,
    usdValue: v.usdValue,
  }));
  list.sort((a, b) => b.usdValue - a.usdValue);
  return list;
}

/** 提现网络列表里的小图标占位（与 Asset 币种图标不同维） */
function withdrawNetworkGlyph(chainKey: string): string {
  if (chainKey === "solana") return "SOL";
  if (chainKey === "bsc") return "BNB";
  if (chainKey === "xlayer") return "OKB";
  return "ETH";
}

function WithdrawScreen({
  onClose,
  assets,
  tokenBreakdown,
  session
}: {
  onClose: () => void;
  assets: Array<{symbol:string; qty:number; price:number; valueUsd:number; change24h:number}>;
  tokenBreakdown?: Record<string, WithdrawBreakRow[]>;
  session: ReturnType<typeof useSession>;
}) {
  type WithdrawPage = "token" | "network" | "address" | "amount" | "confirm";
  type AddressTab = "recent" | "mine" | "book";
  const [page, setPage] = useState<WithdrawPage>("token");
  const [addressTab, setAddressTab] = useState<AddressTab>("recent");
  const [symbol, setSymbol] = useState<string>("USDT");
  /** 选中的提现网络（必须与 OKX portfolio 里的 chain 一致；如 USDT-on-BSC ⇒ bsc） */
  const [withdrawChainKey, setWithdrawChainKey] = useState<string>("");
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

  const aggregatedChains = useMemo(
    () => aggregateWithdrawChains(tokenBreakdown, symbol),
    [tokenBreakdown, symbol]
  );
  /** 有余额的链——提现只能从这些网络出金 */
  const chainsWithBalance = useMemo(
    () => aggregatedChains.filter((c) => c.qty > 0 || c.usdValue > 0.001),
    [aggregatedChains]
  );
  /** 若没有正余额明细（少见），仍可展示聚合行避免死路 */
  const networkPickerRows = chainsWithBalance.length > 0 ? chainsWithBalance : aggregatedChains;

  const networkRowsFiltered = networkPickerRows.filter(
    (n) =>
      n.ui.toLowerCase().includes(networkSearch.trim().toLowerCase()) ||
      n.chain.toLowerCase().includes(networkSearch.trim().toLowerCase())
  );

  const withdrawUiLabel =
    WITHDRAW_CHAIN_META[withdrawChainKey]?.ui ??
    aggregatedChains.find((c) => c.chain === withdrawChainKey)?.ui ??
    (withdrawChainKey ? withdrawChainKey : "—");

  const onThisChain = (tokenBreakdown?.[symbol] ?? []).filter(
    (r) => String(r.chain).toLowerCase() === withdrawChainKey.toLowerCase()
  );
  const tokenContractForSend =
    onThisChain.find((r) => String(r.contract || "").trim())?.contract?.trim() ?? "";

  const aggregatedQty = assets.find((a) => a.symbol === symbol)?.qty ?? 0;
  /** 已选定网络时用该链分项之和；不要用「总资产」顶替，否则会把 BNB 上的币当成别的链余额 */
  const balance = withdrawChainKey
    ? onThisChain.reduce((s, r) => s + Number(r.qty || 0), 0)
    : aggregatedQty;
  const unitPrice = assets.find((a) => a.symbol === symbol)?.price ?? 0;
  const canSubmit =
    !!withdrawChainKey.trim() &&
    !!address.trim() &&
    Number(amount) > 0 &&
    Number(amount) <= balance;

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
          {visibleTokens.map((t) => {
            const agg = aggregateWithdrawChains(tokenBreakdown, t.symbol);
            const positive = agg.filter((c) => c.qty > 0 || c.usdValue > 0.001);
            const subtitle =
              positive.length === 0
                ? agg.length === 0
                  ? "下拉刷新资产后可按链提现"
                  : agg.map((c) => c.ui).join(" · ")
                : positive.map((c) => c.ui).join(" · ");
            return (
            <Pressable
              key={t.symbol}
              onPress={() => {
                const rowsAgg = aggregateWithdrawChains(tokenBreakdown, t.symbol);
                const rowsPos = rowsAgg.filter((c) => c.qty > 0 || c.usdValue > 0.001);
                const pickerBase = rowsPos.length > 0 ? rowsPos : rowsAgg;
                if (pickerBase.length === 0) {
                  Alert.alert(
                    "暂无链上明细",
                    `${t.symbol} 的分链余额未加载。请返回钱包下拉刷新资产后再试。`
                  );
                  return;
                }
                setSymbol(t.symbol);
                setAddress("");
                setAmount("");
                if (pickerBase.length === 1) {
                  setWithdrawChainKey(pickerBase[0].chain);
                  setPage("address");
                } else {
                  setWithdrawChainKey("");
                  setPage("network");
                }
              }}
              className="flex-row items-center justify-between border-b border-line py-4 active:opacity-70"
            >
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <TokenIcon symbol={t.symbol} size={28} />
                <View>
                  <Text className="text-[22px] font-semibold text-ink">{t.symbol}</Text>
                  <Text className="text-[13px] text-muted" numberOfLines={2}>{subtitle}</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-[22px] font-semibold text-ink">{t.qty.toFixed(t.qty >= 1 ? 4 : 6)}</Text>
                <Text className="text-[12px] text-muted">${t.valueUsd.toFixed(2)}</Text>
              </View>
            </Pressable>
            );
          })}
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
            <Text className="text-[12px] text-muted">
              USDT 等在每条链上是不同合约；仅能选择你在这颗币上**实际有余额**的网络出金
            </Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX }}>
          <View className="flex-row items-center rounded-2xl border border-line bg-surface px-3 py-2.5">
            <SearchIcon size={18} color="#9CA3AF" />
            <TextInput value={networkSearch} onChangeText={setNetworkSearch} placeholder="搜索网络" className="ml-2 flex-1 text-[14px] text-ink" />
          </View>
        </View>
        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 10 }}>
          <View className="rounded-2xl border border-line bg-amber-50 px-4 py-3">
            <Text className="text-[14px] font-semibold text-ink">当前币种：{symbol}</Text>
            <Text className="mt-1 text-[12px] leading-5 text-amber-950/80">
              BNB Chain 上的 USDT 不能从 X Layer 提出；请认准下方网络与可用余额。
            </Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: uiSpace.pageX, paddingTop: 10, paddingBottom: 24 }}>
          {networkRowsFiltered.length === 0 ? (
            <View className="items-center py-12">
              <Text className="text-[14px] text-muted">没有匹配的网络</Text>
            </View>
          ) : null}
          {networkRowsFiltered.map((n) => (
            <Pressable
              key={n.chain}
              onPress={() => {
                setWithdrawChainKey(n.chain);
                setPage("address");
              }}
              className="flex-row items-center justify-between border-b border-line py-4 active:opacity-70"
            >
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <TokenIcon symbol={withdrawNetworkGlyph(n.chain)} size={28} />
                <View className="flex-row items-center flex-wrap" style={{ gap: 6 }}>
                  <Text className="text-[22px] font-semibold text-ink">{n.ui}</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-[16px] font-semibold text-ink">
                  {n.qty.toFixed(symbol === "USDT" || symbol === "USDC" ? 4 : 6)} {symbol}
                </Text>
                <Text className="text-[12px] text-muted">${n.usdValue.toFixed(2)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (page === "address") {
    const isEvmLike = withdrawChainKey !== "solana";
    const pickerCount = networkPickerRows.length;
    const looksValid =
      isEvmLike
        ? /^0x[a-fA-F0-9]{40}$/.test(address.trim())
        : address.trim().length >= 32 && address.trim().length <= 64;
    return (
      <View style={{ flex: 1, backgroundColor: uiColors.appBg }}>
        <View className="flex-row items-center px-3 pb-1 pt-1">
          <Pressable onPress={() => setPage(pickerCount <= 1 ? "token" : "network")} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface">
            <ArrowLeftIcon size={22} />
          </Pressable>
          <Text className="ml-1 text-[30px] font-bold text-ink">收款地址</Text>
        </View>
        {withdrawChainKey ? (
          <View style={{ paddingHorizontal: uiSpace.pageX }}>
            <Text className="text-[13px] font-semibold text-violet-700">
              当前提现网络：{withdrawUiLabel}（必须与地址所在链一致）
            </Text>
          </View>
        ) : null}
        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 2 }}>
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: looksValid ? "#10B981" : "#E5E7EB",
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              minHeight: 88,
            }}
          >
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder={isEvmLike ? "粘贴或输入 0x… 收款地址" : "粘贴 Solana 收款地址"}
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              multiline
              style={{
                fontSize: 16,
                color: "#0F0F0F",
                fontWeight: "600",
                paddingTop: 0,
                paddingBottom: 0,
                lineHeight: 22,
              }}
            />
            {looksValid ? (
              <Text style={{ marginTop: 6, fontSize: 12, color: "#059669", fontWeight: "600" }}>
                ✓ 地址格式正确
              </Text>
            ) : null}
          </View>
          <View className="mt-3 flex-row" style={{ gap: 8, justifyContent: "flex-end" }}>
            <Pressable
              onPress={async () => {
                try {
                  const v = await Clipboard.getStringAsync();
                  if (v && v.trim()) {
                    setAddress(v.trim());
                  } else {
                    Alert.alert("剪贴板为空", "复制一个地址再点粘贴");
                  }
                } catch (e) {
                  Alert.alert("无法读取剪贴板", String((e as any)?.message || e));
                }
              }}
              className="rounded-full border border-line bg-surface px-4 py-2 active:opacity-80"
            >
              <Text className="text-[14px] font-semibold text-ink2">粘贴</Text>
            </Pressable>
            {address.length > 0 ? (
              <Pressable
                onPress={() => setAddress("")}
                className="rounded-full border border-line bg-surface px-4 py-2 active:opacity-80"
              >
                <Text className="text-[14px] font-semibold text-ink2">清空</Text>
              </Pressable>
            ) : null}
          </View>
          {looksValid ? (
            <Pressable
              onPress={() => {
                rememberAddress(address.trim());
                setPage("amount");
              }}
              className="mt-3 active:opacity-90"
              style={{
                borderRadius: 14,
                overflow: "hidden",
                shadowColor: "#7C3AED",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.28,
                shadowRadius: 12,
                elevation: 4,
              }}
            >
              <LinearGradient
                colors={["#7C3AED", "#5B21B6"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 48, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>下一步</Text>
              </LinearGradient>
            </Pressable>
          ) : null}
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
              <Text className="text-[14px] font-semibold text-ink">{withdrawUiLabel}</Text>
            </View>
            <Text className="pb-1.5 text-[11px] text-muted">
              必须与收款地址所在网络一致（如 BNB Chain 的币不能填 X Layer 地址）
            </Text>
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
              if (!withdrawChainKey.trim()) {
                Alert.alert("未选择网络", "请退回上一步重新选择提现网络。");
                return;
              }
              const apiChain = (aggregatedChains.find((c) => c.chain === withdrawChainKey)?.api ??
                WITHDRAW_CHAIN_META[withdrawChainKey]?.api ??
                withdrawChainKey) as ChainId;
              const res = await okxOnchainClient.sendWalletTransfer(
                {
                  chain: apiChain,
                  symbol,
                  toAddress: address.trim(),
                  amount: amount.trim(),
                  ...(tokenContractForSend ? { tokenAddress: tokenContractForSend } : {}),
                },
                session.token
              );
              const txHash = String(res?.data?.txHash || "");
              Alert.alert("发送已提交", txHash ? `交易哈希：${txHash}` : "已广播到链上，等待确认");
              setAmount("");
              setAddress("");
              setWithdrawChainKey("");
              setPage("token");
            } catch (err) {
              setSendError(formatHwalletErrorForUser(err));
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
                  } catch (e) {
                    setLastTxHash("");
                    setQuoteError(formatHwalletErrorForUser(e));
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

/**
 * 充值 / 提现 / 兑换 — 大色块按钮，点哪都能命中。
 * 56pt 图标，18pt 主标题，12pt 子标题，垂直填充。
 */
function ActionCard({
  label,
  sub,
  Icon,
  colors,
  onPress,
}: {
  label: string;
  sub: string;
  Icon: (p: { size?: number; color?: string }) => React.ReactNode;
  colors: [string, string];
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.96, { duration: 100, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
      }}
      style={[
        {
          flex: 1,
          borderRadius: 20,
          overflow: "hidden",
          shadowColor: colors[1],
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.32,
          shadowRadius: 14,
          elevation: 6,
        },
        aStyle,
      ]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingVertical: 16,
          paddingHorizontal: 12,
          alignItems: "center",
          justifyContent: "center",
          minHeight: 108,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.22)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8,
          }}
        >
          <Icon size={20} color="#FFFFFF" />
        </View>
        <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>{label}</Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.78)",
            fontSize: 10.5,
            marginTop: 2,
            fontWeight: "500",
          }}
          numberOfLines={1}
        >
          {sub}
        </Text>
      </LinearGradient>
    </AnimatedPressable>
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
  breakdown,
  loading,
  onDeposit
}: {
  rows: Array<{symbol:string; qty:number; price:number; valueUsd:number; change24h:number}>;
  breakdown?: Record<string, Array<{ chain: string; chainLabel: string; qty: number; usdValue: number; contract?: string }>>;
  loading: boolean;
  onDeposit?: () => void;
}) {
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

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
            const chains = breakdown?.[row.symbol] ?? [];
            const hasMulti = chains.length > 1;
            const isExpanded = expandedSymbol === row.symbol;
            return (
              <View key={`${row.symbol}_${idx}`}>
                <Pressable
                  onPress={() => {
                    if (chains.length > 0) {
                      setExpandedSymbol(isExpanded ? null : row.symbol);
                    }
                  }}
                  accessibilityRole="button"
                  className={`flex-row items-center px-4 py-4 active:bg-surface ${idx > 0 ? "border-t border-line" : ""}`}
                >
                  <TokenIcon symbol={row.symbol} size={32} />
                  <View className="ml-3 flex-1">
                    <View className="flex-row items-start justify-between">
                      <View>
                        <View className="flex-row items-center" style={{ gap: 6 }}>
                          <Text className="text-[16px] font-semibold text-ink">{row.symbol}</Text>
                          {hasMulti ? (
                            <View className="rounded-md bg-surface px-1.5 py-0.5">
                              <Text className="text-[10px] font-semibold text-muted">{chains.length} 条链</Text>
                            </View>
                          ) : null}
                        </View>
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
                </Pressable>
                {isExpanded && chains.length > 0 ? (
                  <View style={{ backgroundColor: "#FAFAFB", borderTopWidth: 1, borderTopColor: "#EEF0F4" }}>
                    {chains.map((c, ci) => (
                      <View
                        key={`${row.symbol}_${c.chain}_${ci}`}
                        className="flex-row items-center px-5 py-3"
                        style={{ borderTopWidth: ci === 0 ? 0 : 1, borderTopColor: "#EEF0F4" }}
                      >
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: "#A78BFA",
                            marginRight: 10,
                          }}
                        />
                        <View className="flex-1">
                          <Text className="text-[14px] font-medium text-ink">{c.chainLabel}</Text>
                          <Text className="mt-0.5 text-[12px] text-muted">
                            {c.qty.toFixed(c.qty >= 1 ? 4 : 6)} {row.symbol}
                          </Text>
                        </View>
                        <Text className="text-[14px] font-semibold text-ink">${c.usdValue.toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
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
  portfolioSpark,
  chainFilter,
  onChangeChainFilter,
  timeWindow,
  onChangeTimeWindow,
}: {
  hideBalance: boolean;
  totalBalance: string;
  pnlPercent: string;
  monthPnl: string;
  portfolioSpark: number[];
  chainFilter: "all" | "evm" | "solana";
  onChangeChainFilter: (v: "all" | "evm" | "solana") => void;
  timeWindow: 30 | 90 | 180 | 360;
  onChangeTimeWindow: (v: 30 | 90 | 180 | 360) => void;
}) {
  const driftA = useSharedValue(0); // 金色光晕 0→1
  const driftB = useSharedValue(0); // 紫色光晕 0→1
  const numPulse = useSharedValue(0);
  const greenPulse = useSharedValue(0);

  const [chainOpen, setChainOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const chainLabel =
    chainFilter === "all" ? "全部网络" : chainFilter === "evm" ? "EVM" : "SOL";

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
    <View style={{ position: "relative" }}>
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

        {/* 顶部：网络下拉（点 ▾ 弹列表） */}
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            onPress={() => setChainOpen((v) => !v)}
            className="flex-row items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 active:opacity-70"
          >
            <View className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            <Text className="text-[13px] font-semibold text-white">{chainLabel}</Text>
            <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginLeft: 1 }}>▾</Text>
          </Pressable>
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
            {/* 时间窗下拉 — 点 ▾ 弹 30/90/180/360 列表（先 UI 切换，数据待接 OKX 历史 API） */}
            <Pressable
              accessibilityRole="button"
              onPress={() => setTimeOpen((v) => !v)}
              className="flex-row items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 active:opacity-70"
            >
              <Text className="text-[13px] font-medium text-white/85">最近 {timeWindow} 天</Text>
              <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>▾</Text>
            </Pressable>
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

      {/* 网络下拉浮层 — 贴在「全部网络 ▾」胶囊正下方 */}
      {chainOpen ? (
        <>
          <Pressable
            onPress={() => setChainOpen(false)}
            style={{
              position: "absolute", top: -1000, left: -1000, right: -1000, bottom: -1000,
              zIndex: 50,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 52, left: 16, width: 168,
              backgroundColor: "#FFFFFF",
              borderRadius: 14,
              paddingVertical: 6,
              shadowColor: "#0F172A",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.18,
              shadowRadius: 16,
              elevation: 16,
              zIndex: 100,
            }}
          >
            {([
              { key: "all", label: "全部网络", sub: "EVM + Solana" },
              { key: "evm", label: "EVM", sub: "ETH/BSC/Polygon/Arb…" },
              { key: "solana", label: "SOL", sub: "Solana" },
            ] as const).map((opt) => {
              const active = chainFilter === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    onChangeChainFilter(opt.key);
                    setChainOpen(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F0F0F" }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{opt.sub}</Text>
                  </View>
                  {active ? (
                    <Text style={{ fontSize: 14, color: "#7C3AED", fontWeight: "700" }}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {/* 时间窗下拉浮层 — 贴在「最近 N 天 ▾」胶囊正下方 */}
      {timeOpen ? (
        <>
          <Pressable
            onPress={() => setTimeOpen(false)}
            style={{
              position: "absolute", top: -1000, left: -1000, right: -1000, bottom: -1000,
              zIndex: 50,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 152, right: 16, width: 132,
              backgroundColor: "#FFFFFF",
              borderRadius: 14,
              paddingVertical: 6,
              shadowColor: "#0F172A",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.18,
              shadowRadius: 16,
              elevation: 16,
              zIndex: 100,
            }}
          >
            {([30, 90, 180, 360] as const).map((d) => {
              const active = timeWindow === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => {
                    onChangeTimeWindow(d);
                    setTimeOpen(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F0F0F" }}>
                    最近 {d} 天
                  </Text>
                  {active ? (
                    <Text style={{ fontSize: 14, color: "#7C3AED", fontWeight: "700" }}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
