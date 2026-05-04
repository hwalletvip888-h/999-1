import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "./ui/Button";
import { Surface } from "./ui/Surface";
import { Candlestick } from "./Candlestick";
import { TokenBTC, TokenETH, TokenUSDT } from "./ui/TokenIcons";
import type { CardStatus, HWalletCard } from "../types";

type TransactionCardProps = {
  card: HWalletCard;
  onConfirm?: (cardId: string) => void;
  onCancel?: (cardId: string) => void;
};

// ─────────────────────────────────────────────────────────────
// Status pill (shared across all card variants)
// ─────────────────────────────────────────────────────────────

const statusMeta: Record<
  CardStatus,
  { label: string; bg: string; fg: string; pulse?: boolean }
> = {
  preview: { label: "待确认", bg: "#F3F4F6", fg: "#6B7280" },
  pending: { label: "提交中", bg: "#FEF3C7", fg: "#B45309", pulse: true },
  confirmed: { label: "已确认", bg: "#DBEAFE", fg: "#1D4ED8" },
  executed: { label: "已成交", bg: "#DCFCE7", fg: "#15803D" },
  running: { label: "运行中", bg: "#DCFCE7", fg: "#15803D", pulse: true },
  profit: { label: "已结束 · 盈利", bg: "#DCFCE7", fg: "#15803D" },
  loss: { label: "已结束 · 止损", bg: "#FEE2E2", fg: "#DC2626" },
  cancelled: { label: "已取消", bg: "#F3F4F6", fg: "#9CA3AF" },
  failed: { label: "执行失败", bg: "#FEE2E2", fg: "#DC2626" },
  risk_checking: { label: "风控中", bg: "#F3F4F6", fg: "#6B7280" },
  ready_to_confirm: { label: "待确认", bg: "#F3F4F6", fg: "#6B7280" },
  confirming: { label: "确认中", bg: "#DBEAFE", fg: "#1D4ED8" }
};

function StatusPill({ status }: { status: CardStatus }) {
  const meta = statusMeta[status];
  const dot = useSharedValue(1);
  useEffect(() => {
    if (!meta.pulse) return;
    dot.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [meta.pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dot.value }));

  return (
    <View
      className="flex-row items-center rounded-full"
      style={{ backgroundColor: meta.bg, paddingHorizontal: 8, paddingVertical: 3 }}
    >
      {meta.pulse ? (
        <Animated.View
          style={[
            {
              width: 6,
              height: 6,
              borderRadius: 3,
              marginRight: 5,
              backgroundColor: meta.fg
            },
            dotStyle
          ]}
        />
      ) : null}
      <Text className="text-[11px] font-semibold" style={{ color: meta.fg }}>
        {meta.label}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function pickTokenIcon(card: HWalletCard, size = 22) {
  const sym = (card.pair || card.symbol || "").toUpperCase();
  if (sym.includes("BTC")) return <TokenBTC size={size} />;
  if (sym.includes("ETH")) return <TokenETH size={size} />;
  return <TokenUSDT size={size} />;
}

function tokenBySymbol(symbol: string | undefined, size = 22) {
  const s = (symbol ?? "").toUpperCase();
  if (s.includes("BTC")) return <TokenBTC size={size} />;
  if (s.includes("ETH")) return <TokenETH size={size} />;
  return <TokenUSDT size={size} />;
}

function formatPrice(n: number) {
  if (n >= 1000) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function CardShell({
  children,
  borderColor = "#EAECEF",
  bg = "#FFFFFF",
  shadowColor = "#0F172A"
}: {
  children: React.ReactNode;
  borderColor?: string;
  bg?: string;
  shadowColor?: string;
}) {
  return (
    <View className="mx-4 my-2.5">
      {/* 双层阴影：外层柔和大范围 + 内层主题色微染 */}
      <View
        style={{
          borderRadius: 28,
          backgroundColor: bg,
          // 主阴影 — 大范围柔光
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.08,
          shadowRadius: 24,
          elevation: 6
        }}
      >
        <View
          style={{
            borderRadius: 28,
            backgroundColor: bg,
            // 主题色二次染色阴影 — 让边缘有微微的光晕
            shadowColor,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 16
          }}
        >
          <View
            className="overflow-hidden"
            style={{
              borderRadius: 28,
              backgroundColor: bg,
              borderWidth: 1,
              borderColor
            }}
          >
            {/* 顶部内高光 — 让卡片有"玻璃质感" */}
            <LinearGradient
              colors={["rgba(255,255,255,0.85)", "rgba(255,255,255,0)"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 40,
                opacity: 0.6
              }}
              pointerEvents="none"
            />
            {/* 顶部 1px 内描边高光 */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                left: 12,
                right: 12,
                height: 1,
                backgroundColor: "rgba(255,255,255,0.9)"
              }}
            />
            {children}
          </View>
        </View>
      </View>
    </View>
  );
}

// Mini sparkline for Agent equity curve
function MiniSparkline({
  data,
  width,
  height,
  color = "#10B981"
}: {
  data: number[];
  width: number;
  height: number;
  color?: string;
}) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * height;
    return { x, y };
  });
  let line = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const q = pts[i];
    const cx = (p.x + q.x) / 2;
    line += ` Q ${cx.toFixed(2)} ${p.y.toFixed(2)} ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
  }
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const gradId = `mini-${color.replace("#", "")}`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.28} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${gradId})`} />
      <Path d={line} stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 1) PERPETUAL — Exchange-style position card (Binance / OKX vibe)
// ─────────────────────────────────────────────────────────────

function PerpetualExchangeCard({ card, onConfirm, onCancel }: TransactionCardProps) {
  const isShort = card.direction === "做空";
  const pnl = card.pnlPercent ?? 0;
  const pnlPositive = pnl >= 0;
  const pnlColor = pnlPositive ? "#10B981" : "#EF4444";
  const directionBg = isShort ? "#FEE2E2" : "#DCFCE7";
  const directionText = isShort ? "#DC2626" : "#15803D";
  const ctaBg = pnlPositive ? "#10B981" : "#DC2626";
  const interactive = card.status === "preview";

  return (
    <CardShell bg="#FFF5F5" borderColor="#FECACA" shadowColor="#EF4444">
      {/* Header */}
      <View className="flex-row items-center justify-between px-3.5 pb-2 pt-3">
        <View className="flex-1 flex-row items-center" style={{ gap: 6 }}>
          {pickTokenIcon(card, 22)}
          <Text className="ml-1 text-[16px] font-bold text-ink">{card.pair ?? card.symbol ?? ""}</Text>
          <View
            className="ml-1 rounded-md px-1.5"
            style={{ backgroundColor: "#F3F4F6", paddingVertical: 2 }}
          >
            <Text className="text-[11px] font-medium text-muted">{card.contractType ?? "永续"}</Text>
          </View>
          <View
            className="rounded-md px-1.5"
            style={{ backgroundColor: "#F3F4F6", paddingVertical: 2 }}
          >
            <Text className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>
              {card.leverage ?? "10x"}
            </Text>
          </View>
          <View
            className="rounded-md px-1.5"
            style={{ backgroundColor: directionBg, paddingVertical: 2 }}
          >
            <Text className="text-[11px] font-semibold" style={{ color: directionText }}>
              {isShort ? "做空" : "做多"}
            </Text>
          </View>
          <StatusPill status={card.status} />
        </View>

        <Pressable
          onPress={() => onConfirm?.(card.id)}
          disabled={!interactive}
          className="rounded-full px-3"
          style={{
            backgroundColor: interactive ? ctaBg : "#E5E7EB",
            paddingVertical: 6,
            opacity: interactive ? 1 : 0.7
          }}
        >
          <Text className="text-[12px] font-semibold text-bg">去交易</Text>
        </Pressable>
      </View>

      {/* Candlestick chart */}
      <View className="px-1.5">
        <Candlestick
          candles={card.candles ?? []}
          width={320}
          height={110}
          theme={isShort ? "short" : "long"}
          entryPrice={card.entryPrice}
          lastPrice={card.lastPrice}
        />
      </View>

      {/* PnL */}
      <View className="px-4 pt-2">
        <Text className="text-[12px] text-muted">浮动收益</Text>
        <Text
          className="mt-0.5 text-[28px] font-extrabold"
          style={{ color: pnlColor, letterSpacing: -0.5 }}
        >
          {pnlPositive ? "+" : ""}
          {pnl.toFixed(2)}%
        </Text>
      </View>

      {/* Footer prices */}
      <View
        className="mt-2 flex-row items-center justify-between px-4"
        style={{ paddingBottom: interactive ? 12 : 14 }}
      >
        <Text className="text-[12px] text-muted">
          入场价{" "}
          <Text className="text-ink">{card.entryPrice !== undefined ? formatPrice(card.entryPrice) : "--"}</Text>
        </Text>
        <Text className="text-[12px] text-muted">
          最新价{" "}
          <Text className="text-ink">{card.lastPrice !== undefined ? formatPrice(card.lastPrice) : "--"}</Text>
        </Text>
      </View>

      {interactive ? (
        <View
          className="flex-row items-center justify-between border-t px-4 py-2.5"
          style={{ borderColor: "#F1F3F5" }}
        >
          <Text className="text-[11px] text-muted" style={{ flex: 1 }} numberOfLines={1}>
            这是 Mock 卡片，不会真实下单
          </Text>
          <Pressable onPress={() => onCancel?.(card.id)} className="px-3 py-1.5">
            <Text className="text-[13px] font-medium text-muted">{card.secondaryAction ?? "取消"}</Text>
          </Pressable>
        </View>
      ) : null}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 2) SWAP — 现货兑换卡 (Uniswap-like)
// ─────────────────────────────────────────────────────────────

function SwapCard({ card, onConfirm, onCancel }: TransactionCardProps) {
  const interactive = card.status === "preview";
  return (
    <CardShell bg="#EEF2FF" borderColor="#C7D2FE" shadowColor="#6366F1">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <View
            className="h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: "#EEF2FF" }}
          >
            <Text style={{ color: "#4338CA", fontWeight: "700", fontSize: 14 }}>↔</Text>
          </View>
          <Text className="text-[16px] font-bold text-ink">兑换</Text>
        </View>
        <StatusPill status={card.status} />
      </View>

      {/* From box */}
      <View className="mx-4 mt-1 rounded-2xl" style={{ backgroundColor: "#F9FAFB", padding: 12 }}>
        <Text className="text-[11px] text-muted">支付</Text>
        <View className="mt-1 flex-row items-center justify-between">
          <Text
            className="text-[26px] font-extrabold text-ink"
            style={{ letterSpacing: -0.5 }}
          >
            {card.fromAmount ?? "0"}
          </Text>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            {tokenBySymbol(card.fromSymbol, 24)}
            <Text className="text-[15px] font-semibold text-ink">{card.fromSymbol ?? "USDT"}</Text>
          </View>
        </View>
      </View>

      {/* Swap arrow */}
      <View className="my-1 items-center">
        <View
          className="h-7 w-7 items-center justify-center rounded-full bg-bg"
          style={{
            borderWidth: 1,
            borderColor: "#E5E7EB",
            marginTop: -10,
            marginBottom: -10,
            zIndex: 2
          }}
        >
          <Text style={{ color: "#6B7280", fontWeight: "700" }}>↓</Text>
        </View>
      </View>

      {/* To box */}
      <View className="mx-4 mb-3 rounded-2xl" style={{ backgroundColor: "#F0FDF4", padding: 12 }}>
        <Text className="text-[11px] text-muted">收到</Text>
        <View className="mt-1 flex-row items-center justify-between">
          <Text
            className="text-[26px] font-extrabold"
            style={{ color: "#15803D", letterSpacing: -0.5 }}
          >
            {card.toAmount ?? "0"}
          </Text>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            {tokenBySymbol(card.toSymbol, 24)}
            <Text className="text-[15px] font-semibold text-ink">{card.toSymbol ?? "ETH"}</Text>
          </View>
        </View>
      </View>

      {/* Detail rows */}
      <View className="mx-4 mb-3 rounded-2xl px-3 py-2.5" style={{ backgroundColor: "#FAFAFA" }}>
        {[
          { label: "汇率", value: card.rate ?? "—" },
          { label: "滑点", value: card.slippage ?? "0.5%" },
          { label: "网络费", value: card.networkFee ?? "—" }
        ].map((r) => (
          <View key={r.label} className="flex-row items-center justify-between py-1">
            <Text className="text-[12px] text-muted">{r.label}</Text>
            <Text className="text-[12px] font-medium text-ink">{r.value}</Text>
          </View>
        ))}
      </View>

      {interactive ? (
        <View className="flex-row gap-2 border-t px-4 py-3" style={{ borderColor: "#F1F3F5" }}>
          <Button
            label={card.secondaryAction ?? "取消"}
            variant="secondary"
            size="sm"
            onPress={() => onCancel?.(card.id)}
            className="flex-1"
          />
          <Button
            label={card.primaryAction ?? "确认"}
            variant="primary"
            size="sm"
            onPress={() => onConfirm?.(card.id)}
            className="flex-1"
          />
        </View>
      ) : null}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 3) AGENT — 策略卡（带运行心跳 + 收益曲线）
// ─────────────────────────────────────────────────────────────

function AgentCard({ card, onConfirm, onCancel }: TransactionCardProps) {
  const isRunning = card.status === "running";
  const interactive = card.status === "preview";

  // 呼吸光晕（运行态）
  const halo = useSharedValue(0.5);
  useEffect(() => {
    if (!isRunning) return;
    halo.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [isRunning]);
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }));

  return (
    <CardShell borderColor="#E5E7FF" bg="#F5F3FF" shadowColor="#7C3AED">
      {/* Hero gradient strip */}
      <LinearGradient
        colors={["#1E1B4B", "#3730A3", "#5B21B6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 16, paddingVertical: 14 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <View
              className="h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: "rgba(255,255,255,0.16)" }}
            >
              <Text style={{ color: "#FCD34D", fontWeight: "800", fontSize: 16 }}>A</Text>
            </View>
            <View>
              <Text className="text-[15px] font-bold text-bg">{card.agentName ?? "AI 策略"}</Text>
              <View className="flex-row" style={{ gap: 4, marginTop: 2 }}>
                {(card.agentTags ?? []).map((t) => (
                  <View
                    key={t}
                    className="rounded-md px-1.5"
                    style={{ backgroundColor: "rgba(255,255,255,0.18)", paddingVertical: 1 }}
                  >
                    <Text className="text-[10px] font-medium text-bg">{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Status pill on dark bg */}
          {isRunning ? (
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <Animated.View
                style={[
                  {
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "#34D399",
                    shadowColor: "#34D399",
                    shadowOpacity: 1,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 0 }
                  },
                  haloStyle
                ]}
              />
              <Text className="text-[11px] font-semibold" style={{ color: "#A7F3D0" }}>
                运行中
              </Text>
            </View>
          ) : (
            <StatusPill status={card.status} />
          )}
        </View>

        {/* Big total profit */}
        <View className="mt-3">
          <Text className="text-[11px]" style={{ color: "rgba(255,255,255,0.7)" }}>
            累计盈利
          </Text>
          <Text
            className="mt-0.5 text-[30px] font-extrabold"
            style={{ color: "#FCD34D", letterSpacing: -0.5 }}
          >
            {card.agentTotalProfit ?? "+0 U"}
          </Text>
        </View>
      </LinearGradient>

      {/* Equity curve */}
      {card.agentEquityCurve && card.agentEquityCurve.length > 1 ? (
        <View className="px-3 pt-2">
          <MiniSparkline data={card.agentEquityCurve} width={304} height={56} color="#10B981" />
        </View>
      ) : null}

      {/* Stats trio */}
      <View className="flex-row px-4 pt-1 pb-3">
        {[
          { label: "今日", value: card.agentTodayProfit ?? "+0 U", color: "#10B981" },
          { label: "运行时长", value: card.agentRunDuration ?? "—", color: "#0F172A" },
          { label: "胜率", value: card.agentWinRate ?? "—", color: "#7C3AED" }
        ].map((s, i) => (
          <View
            key={s.label}
            className="flex-1 items-center"
            style={{
              borderLeftWidth: i === 0 ? 0 : 1,
              borderLeftColor: "#F1F3F5"
            }}
          >
            <Text className="text-[11px] text-muted">{s.label}</Text>
            <Text
              className="mt-0.5 text-[15px] font-bold"
              style={{ color: s.color }}
            >
              {s.value}
            </Text>
          </View>
        ))}
      </View>

      {/* Actions */}
      {interactive ? (
        <View className="flex-row gap-2 border-t px-4 py-3" style={{ borderColor: "#F1F3F5" }}>
          <Button
            label={card.secondaryAction ?? "取消"}
            variant="secondary"
            size="sm"
            onPress={() => onCancel?.(card.id)}
            className="flex-1"
          />
          <Button
            label={card.primaryAction ?? "确认"}
            variant="primary"
            size="sm"
            onPress={() => onConfirm?.(card.id)}
            className="flex-1"
          />
        </View>
      ) : isRunning ? (
        <View className="flex-row gap-2 border-t px-4 py-3" style={{ borderColor: "#F1F3F5" }}>
          <Button
            label="暂停"
            variant="secondary"
            size="sm"
            onPress={() => onCancel?.(card.id)}
            className="flex-1"
          />
          <Button
            label="查看详情"
            variant="primary"
            size="sm"
            onPress={() => onConfirm?.(card.id)}
            className="flex-1"
          />
        </View>
      ) : null}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 4) STAKE — 质押 / 锁仓卡
// ─────────────────────────────────────────────────────────────

function StakeCard({ card, onConfirm, onCancel }: TransactionCardProps) {
  const interactive = card.status === "preview";
  const riskMap = {
    low: { label: "低风险", color: "#15803D", bg: "#DCFCE7" },
    medium: { label: "中风险", color: "#B45309", bg: "#FEF3C7" },
    high: { label: "高风险", color: "#DC2626", bg: "#FEE2E2" }
  } as const;
  const risk = riskMap[card.stakeRiskLevel ?? "low"];

  return (
    <CardShell borderColor="#A7F3D0" bg="#ECFDF5" shadowColor="#10B981">
      {/* Top: APY hero */}
      <LinearGradient
        colors={["#ECFDF5", "#D1FAE5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 16, paddingVertical: 14 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <View
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: "#10B981" }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>％</Text>
            </View>
            <View>
              <Text className="text-[15px] font-bold text-ink">{card.stakeProtocol ?? "Lido"}</Text>
              <Text className="text-[12px] text-muted">{card.stakeChain ?? "Ethereum"} · 链上质押</Text>
            </View>
          </View>
          <StatusPill status={card.status} />
        </View>

        <View className="mt-3 flex-row items-end justify-between">
          <View>
            <Text className="text-[11px] text-muted">预估年化</Text>
            <View className="flex-row items-end" style={{ gap: 2 }}>
              <Text
                className="text-[34px] font-extrabold"
                style={{ color: "#047857", letterSpacing: -0.5 }}
              >
                {card.stakeApy ?? "5.20"}
              </Text>
              <Text
                className="text-[18px] font-extrabold"
                style={{ color: "#047857", marginBottom: 5 }}
              >
                %
              </Text>
            </View>
          </View>
          <View
            className="rounded-full"
            style={{ backgroundColor: risk.bg, paddingHorizontal: 10, paddingVertical: 4 }}
          >
            <Text className="text-[11px] font-semibold" style={{ color: risk.color }}>
              {risk.label}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Detail block */}
      <View className="px-4 py-3">
        {[
          { label: "投入金额", value: card.stakeAmount ?? "—" },
          { label: "锁仓周期", value: card.stakeLockPeriod ?? "灵活" },
          { label: "奖励代币", value: card.stakeRewardSymbol ?? "—" },
          {
            label: "预计收益",
            value: card.stakeEstReward ?? "—",
            accent: "positive" as const
          }
        ].map((r) => (
          <View key={r.label} className="flex-row items-center justify-between py-1.5">
            <Text className="text-[13px] text-muted">{r.label}</Text>
            <Text
              className={`text-[14px] font-semibold ${
                r.accent === "positive" ? "text-emerald-600" : "text-ink"
              }`}
            >
              {r.value}
            </Text>
          </View>
        ))}
      </View>

      {/* Warning */}
      <View
        className="mx-4 mb-3 rounded-xl px-3 py-2"
        style={{ backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A" }}
      >
        <Text className="text-[11px]" style={{ color: "#92400E" }}>
          ⚠ {card.warning}
        </Text>
      </View>

      {interactive ? (
        <View className="flex-row gap-2 border-t px-4 py-3" style={{ borderColor: "#F1F3F5" }}>
          <Button
            label={card.secondaryAction ?? "取消"}
            variant="secondary"
            size="sm"
            onPress={() => onCancel?.(card.id)}
            className="flex-1"
          />
          <Button
            label={card.primaryAction ?? "确认"}
            variant="primary"
            size="sm"
            onPress={() => onConfirm?.(card.id)}
            className="flex-1"
          />
        </View>
      ) : null}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Generic fallback (earn / grid)
// ─────────────────────────────────────────────────────────────

function GenericCard({ card, onConfirm, onCancel }: TransactionCardProps) {
  const interactive = card.status === "preview";
  const rows = card.rows ?? [];
  const secondaryActionLabel = card.secondaryAction ?? "取消";
  const primaryActionLabel = card.primaryAction ?? "确认模拟执行";
  return (
    <View className="mx-4 my-2">
      <Surface padded={false}>
        <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
          <View className="flex-row items-center gap-2.5">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-surface">
              <Text className="text-sm font-semibold text-ink">{card.icon}</Text>
            </View>
            <View>
              <Text className="text-[17px] font-semibold text-ink">{card.title}</Text>
              <Text className="text-[13px] text-muted">{card.subtitle}</Text>
            </View>
          </View>
          <StatusPill status={card.status} />
        </View>

        <View className="px-4 py-2">
          {rows.map((row) => (
            <View
              key={`${card.id}_${row.label}`}
              className="flex-row items-center justify-between py-2"
            >
              <Text className="text-[14px] text-muted">{row.label}</Text>
              <Text
                className={`text-[15px] font-medium ${
                  row.accent === "positive"
                    ? "text-emerald-600"
                    : row.accent === "negative"
                      ? "text-red-500"
                      : row.accent === "warning"
                        ? "text-amber-600"
                        : "text-ink"
                }`}
              >
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        {interactive ? (
          <View className="flex-row gap-2 border-t border-line px-4 py-3">
            <Button
              label={secondaryActionLabel}
              variant="secondary"
              size="sm"
              onPress={() => onCancel?.(card.id)}
              className="flex-1"
            />
            <Button
              label={primaryActionLabel}
              variant="primary"
              size="sm"
              onPress={() => onConfirm?.(card.id)}
              className="flex-1"
            />
          </View>
        ) : null}
      </Surface>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// PriceCard — 行情价格卡片（精美数据卡片 + 交易按钮）
// ─────────────────────────────────────────────────────────────
function PriceCard({ card, onConfirm, onCancel }: TransactionCardProps) {
  const pd = card.priceData;
  if (!pd) return <GenericCard card={card} onConfirm={onConfirm} onCancel={onCancel} />;

  const isUp = pd.changePercent24h >= 0;
  const accentColor = isUp ? '#10B981' : '#EF4444';
  const accentBg = isUp ? '#ECFDF5' : '#FEF2F2';
  const symbol = card.symbol || 'BTC';
  const TokenIcon = symbol === 'BTC' ? TokenBTC : symbol === 'ETH' ? TokenETH : TokenUSDT;

  const formatPrice = (n: number) => {
    if (n >= 1000) return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (n >= 1) return `$${n.toFixed(4)}`;
    return `$${n.toFixed(6)}`;
  };
  const formatVol = (n: number) => {
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(0);
  };

  return (
    <View className="my-2 px-4">
      <Surface className="overflow-hidden rounded-2xl">
        {/* Header */}
        <LinearGradient
          colors={isUp ? ['#ECFDF5', '#F0FDF4'] : ['#FEF2F2', '#FFF5F5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center" style={{ gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
                <TokenIcon size={28} />
              </View>
              <View>
                <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#0F0F0F' }}>
                  {symbol}/USDT
                </Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6B7280', marginTop: 1 }}>
                  实时行情
                </Text>
              </View>
            </View>
            <View style={{ backgroundColor: accentBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ fontSize: 13, fontFamily: 'JetBrainsMono_600SemiBold', color: accentColor }}>
                {isUp ? '+' : ''}{pd.changePercent24h.toFixed(2)}%
              </Text>
            </View>
          </View>

          {/* Big Price */}
          <Text style={{ fontSize: 36, fontFamily: 'JetBrainsMono_700Bold', color: '#0F0F0F', marginTop: 12 }}>
            {formatPrice(pd.price)}
          </Text>
          <Text style={{ fontSize: 13, fontFamily: 'JetBrainsMono_400Regular', color: accentColor, marginTop: 2 }}>
            {isUp ? '↑' : '↓'} {formatPrice(Math.abs(pd.change24h))} (24h)
          </Text>
        </LinearGradient>

        {/* Spark Chart */}
        {pd.sparkData && pd.sparkData.length > 2 && (
          <View style={{ height: 60, marginHorizontal: 16, marginTop: 4 }}>
            <SparkChartInline values={pd.sparkData} stroke={accentColor} fill={accentColor} height={60} />
          </View>
        )}

        {/* Stats Grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          {[
            { label: '24h 最高', value: formatPrice(pd.high24h) },
            { label: '24h 最低', value: formatPrice(pd.low24h) },
            { label: '24h 成交量', value: formatVol(pd.vol24h) },
            ...(pd.fundingRate != null ? [{ label: '资金费率', value: `${(pd.fundingRate * 100).toFixed(4)}%` }] : []),
          ].map((item, i) => (
            <View key={i} style={{ width: '50%', paddingVertical: 6 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#9CA3AF' }}>
                {item.label}
              </Text>
              <Text style={{ fontSize: 14, fontFamily: 'JetBrainsMono_600SemiBold', color: '#374151', marginTop: 2 }}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Action Buttons */}
        <View className="flex-row gap-2 border-t border-line px-4 py-3">
          <Button
            label="做空"
            variant="secondary"
            size="sm"
            onPress={() => onCancel?.(card.id)}
            className="flex-1"
          />
          <Button
            label="做多"
            variant="primary"
            size="sm"
            onPress={() => onConfirm?.(card.id)}
            className="flex-1"
          />
        </View>
      </Surface>
    </View>
  );
}

// Inline SparkChart for PriceCard (same as WalletScreen's SparkChart)
function SparkChartInline({ values, stroke, fill, height }: { values: number[]; stroke: string; fill: string; height: number }) {
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
    .join(' ');
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const gradId = `price-${stroke.replace('#', '')}-${values.length}`;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Defs>
        <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fill} stopOpacity={0.25} />
          <Stop offset="1" stopColor={fill} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradId})`} />
      <Path d={linePath} stroke={stroke} strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────
// PositionCard — 持仓卡片
// ─────────────────────────────────────────────────────────────
function PositionCard({ card, onConfirm, onCancel }: TransactionCardProps) {
  const positions = card.positions;
  if (!positions || positions.length === 0) {
    return (
      <View className="my-2 px-4">
        <Surface className="overflow-hidden rounded-2xl p-4">
          <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0F0F0F', textAlign: 'center' }}>
            📭 当前没有持仓
          </Text>
          <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#9CA3AF', textAlign: 'center', marginTop: 4 }}>
            你可以说"100U 做多 BTC"来开仓
          </Text>
        </Surface>
      </View>
    );
  }

  return (
    <View className="my-2 px-4">
      <Surface className="overflow-hidden rounded-2xl">
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
          <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: '#0F0F0F' }}>
            📊 当前持仓 ({positions.length})
          </Text>
        </View>
        {positions.map((pos, idx) => {
          const isLong = pos.side === 'long';
          const isPnlPositive = pos.unrealizedPnl >= 0;
          const pnlColor = isPnlPositive ? '#10B981' : '#EF4444';
          const symbol = pos.instId.replace('-USDT-SWAP', '').replace('-USDT', '');
          return (
            <View
              key={idx}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderTopWidth: idx > 0 ? 1 : 0,
                borderTopColor: '#F3F4F6',
              }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#0F0F0F' }}>
                    {symbol}/USDT
                  </Text>
                  <View style={{
                    backgroundColor: isLong ? '#ECFDF5' : '#FEF2F2',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 6,
                  }}>
                    <Text style={{
                      fontSize: 11,
                      fontFamily: 'Inter_600SemiBold',
                      color: isLong ? '#10B981' : '#EF4444',
                    }}>
                      {isLong ? '做多' : '做空'} {pos.leverage}x
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 15, fontFamily: 'JetBrainsMono_600SemiBold', color: pnlColor }}>
                  {isPnlPositive ? '+' : ''}{pos.unrealizedPnl.toFixed(2)} USDT
                </Text>
              </View>
              <View className="flex-row justify-between" style={{ marginTop: 6 }}>
                <View>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#9CA3AF' }}>开仓价</Text>
                  <Text style={{ fontSize: 13, fontFamily: 'JetBrainsMono_400Regular', color: '#374151' }}>
                    ${pos.avgPrice.toLocaleString()}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#9CA3AF' }}>标记价</Text>
                  <Text style={{ fontSize: 13, fontFamily: 'JetBrainsMono_400Regular', color: '#374151' }}>
                    ${pos.markPrice.toLocaleString()}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#9CA3AF' }}>盈亏率</Text>
                  <Text style={{ fontSize: 13, fontFamily: 'JetBrainsMono_600SemiBold', color: pnlColor }}>
                    {isPnlPositive ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(2)}%
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#9CA3AF' }}>强平价</Text>
                  <Text style={{ fontSize: 13, fontFamily: 'JetBrainsMono_400Regular', color: '#EF4444' }}>
                    ${pos.liquidationPrice.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </Surface>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// PortfolioCard — 资产总览卡片
// ─────────────────────────────────────────────────────────────
function PortfolioCard({ card, onConfirm, onCancel }: TransactionCardProps) {
  const balances = card.balances;
  const totalEquity = card.totalEquity ?? 0;

  return (
    <View className="my-2 px-4">
      <Surface className="overflow-hidden rounded-2xl">
        <LinearGradient
          colors={['#F5F3FF', '#EDE9FE']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14 }}
        >
          <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6B7280' }}>
            总资产 (USDT)
          </Text>
          <Text style={{ fontSize: 32, fontFamily: 'JetBrainsMono_700Bold', color: '#0F0F0F', marginTop: 4 }}>
            ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </LinearGradient>

        {balances && balances.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#6B7280', marginBottom: 8 }}>
              资产明细
            </Text>
            {balances.filter(b => b.usdtValue > 0.01).map((b, idx) => (
              <View
                key={idx}
                className="flex-row items-center justify-between"
                style={{ paddingVertical: 6, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F3F4F6' }}
              >
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                      {b.currency.slice(0, 2)}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#0F0F0F' }}>
                      {b.currency}
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#9CA3AF' }}>
                      可用 {b.available.toFixed(4)}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontFamily: 'JetBrainsMono_600SemiBold', color: '#0F0F0F' }}>
                    {b.total.toFixed(4)}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: 'JetBrainsMono_400Regular', color: '#9CA3AF' }}>
                    ≈ ${b.usdtValue.toFixed(2)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Surface>
    </View>
  );
}


// ─────────────────────────────────────────────────────────────
// Public dispatcher
// ─────────────────────────────────────────────────────────────

export function TransactionCard(props: TransactionCardProps) {
  // 业务分发：优先按 cardType/module 判断
  const { card } = props;
  // PriceCard 行情价格卡片
  if (card.priceData && card.module === "market") {
    return <PriceCard {...props} />;
  }
  // PositionCard 持仓卡片
  if (card.positions !== undefined && card.module === "account" && card.title === "当前持仓") {
    return <PositionCard {...props} />;
  }
  // PortfolioCard 资产总览卡片
  if (card.balances !== undefined && card.module === "account") {
    return <PortfolioCard {...props} />;
  }
  // PerpetualCard 永续合约
  if (card.cardType === "trade" && card.module === "perpetual") {
    return <PerpetualExchangeCard {...props} />;
  }
  // SwapCard 兑换
  if (card.cardType === "trade" && card.module === "swap") {
    return <SwapCard {...props} />;
  }
  // AgentCard 策略（赚币/网格）
  if (card.cardType === "strategy" && card.module === "earn") {
    return <AgentCard {...props} />;
  }
  if (card.cardType === "strategy" && card.module === "grid") {
    return <AgentCard {...props} />;
  }
  // GenericCard 通用
  return <GenericCard {...props} />;
}
