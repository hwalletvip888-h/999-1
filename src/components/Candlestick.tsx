import { useRef, useState } from "react";
import { PanResponder, Text, View } from "react-native";
import Svg, { Defs, G, LinearGradient, Line, Path, Rect, Stop, Circle } from "react-native-svg";
import type { Candle } from "../types";

type CandlestickProps = {
  candles: Candle[];
  width: number;
  height: number;
  /** Theme drives the dominant tint (long = green, short = red). */
  theme?: "long" | "short";
  /** Optional horizontal entry-price reference line. */
  entryPrice?: number;
  /** Optional latest-price marker line. */
  lastPrice?: number;
  showGrid?: boolean;
  /** Enable long-press crosshair + OHLC tooltip. Defaults to true. */
  interactive?: boolean;
};

/**
 * Exchange-style mini candlestick chart.
 * Renders OHLC candles with wicks, a soft gradient backdrop and
 * an optional dashed entry-price reference line — like Binance/OKX.
 */
export function Candlestick({
  candles,
  width,
  height,
  theme = "long",
  entryPrice,
  lastPrice,
  showGrid = true,
  interactive = true
}: CandlestickProps) {
  if (!candles.length) {
    return <View style={{ width, height }} />;
  }

  const padX = 4;
  const padY = 8;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  let max = Math.max(...highs);
  let min = Math.min(...lows);
  if (entryPrice !== undefined) {
    max = Math.max(max, entryPrice);
    min = Math.min(min, entryPrice);
  }
  if (lastPrice !== undefined) {
    max = Math.max(max, lastPrice);
    min = Math.min(min, lastPrice);
  }
  // Add 4% breathing room
  const range = max - min || 1;
  max += range * 0.04;
  min -= range * 0.04;
  const span = max - min || 1;

  const yOf = (v: number) => padY + ((max - v) / span) * innerH;

  const slot = innerW / candles.length;
  const bodyW = Math.max(2, slot * 0.62);

  const upColor = "#10B981"; // emerald
  const downColor = "#EF4444"; // red
  const gridColor = "rgba(0,0,0,0.05)";

  const gradId = `cs-bg-${theme}`;
  const gradFrom = theme === "short" ? "#FEE2E2" : "#DCFCE7";
  const gradTo = "#FFFFFF";

  // Crosshair state — index of selected candle (null when not inspecting)
  const [cursor, setCursor] = useState<number | null>(null);

  const indexFromX = (x: number) => {
    const rel = Math.max(0, Math.min(innerW, x - padX));
    return Math.max(0, Math.min(candles.length - 1, Math.floor(rel / slot)));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => interactive,
      onMoveShouldSetPanResponder: () => interactive,
      onPanResponderGrant: (e) => {
        setCursor(indexFromX(e.nativeEvent.locationX));
      },
      onPanResponderMove: (e) => {
        setCursor(indexFromX(e.nativeEvent.locationX));
      },
      onPanResponderRelease: () => setCursor(null),
      onPanResponderTerminate: () => setCursor(null)
    })
  ).current;

  const focused = cursor !== null ? candles[cursor] : null;
  const focusedX = cursor !== null ? padX + cursor * slot + slot / 2 : 0;
  const focusedColor = focused ? (focused.c >= focused.o ? upColor : downColor) : "#0F0F0F";
  const tooltipOnLeft = focusedX > width / 2;
  // 与前一根 K 线收盘相比的涨跌幅
  const prev = cursor !== null && cursor > 0 ? candles[cursor - 1] : null;
  const changePct =
    focused && prev && prev.c !== 0 ? ((focused.c - prev.c) / prev.c) * 100 : null;

  return (
    <View {...panResponder.panHandlers} style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={gradFrom} stopOpacity={0.55} />
            <Stop offset="1" stopColor={gradTo} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* Soft tinted backdrop */}
        <Rect x={0} y={0} width={width} height={height} rx={12} fill={`url(#${gradId})`} />

        {/* Faint horizontal grid */}
        {showGrid
          ? [0.25, 0.5, 0.75].map((p) => (
              <Line
                key={p}
                x1={padX}
                x2={width - padX}
                y1={padY + innerH * p}
                y2={padY + innerH * p}
                stroke={gridColor}
                strokeWidth={1}
              />
            ))
          : null}

        {/* Candles */}
        {candles.map((c, i) => {
          const cx = padX + i * slot + slot / 2;
          const isUp = c.c >= c.o;
          const color = isUp ? upColor : downColor;
          const yHigh = yOf(c.h);
          const yLow = yOf(c.l);
          const yOpen = yOf(c.o);
          const yClose = yOf(c.c);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH = Math.max(1.2, Math.abs(yClose - yOpen));
          return (
            <G key={i}>
              {/* wick */}
              <Line
                x1={cx}
                x2={cx}
                y1={yHigh}
                y2={yLow}
                stroke={color}
                strokeWidth={1}
              />
              {/* body */}
              <Rect
                x={cx - bodyW / 2}
                y={bodyTop}
                width={bodyW}
                height={bodyH}
                fill={color}
                rx={0.8}
              />
            </G>
          );
        })}

        {/* Entry price dashed line */}
        {entryPrice !== undefined ? (
          <Path
            d={`M ${padX} ${yOf(entryPrice)} L ${width - padX} ${yOf(entryPrice)}`}
            stroke="#9CA3AF"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}

        {/* Last price marker line (solid, theme color) */}
        {lastPrice !== undefined ? (
          <Path
            d={`M ${padX} ${yOf(lastPrice)} L ${width - padX} ${yOf(lastPrice)}`}
            stroke={theme === "short" ? downColor : upColor}
            strokeWidth={1}
            opacity={0.5}
          />
        ) : null}

        {/* Crosshair — long-press / drag */}
        {focused ? (
          <G>
            <Line
              x1={focusedX}
              x2={focusedX}
              y1={padY}
              y2={padY + innerH}
              stroke="#0F0F0F"
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={0.55}
            />
            <Line
              x1={padX}
              x2={width - padX}
              y1={yOf(focused.c)}
              y2={yOf(focused.c)}
              stroke="#0F0F0F"
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={0.55}
            />
            <Circle cx={focusedX} cy={yOf(focused.c)} r={3.5} fill={focusedColor} stroke="#FFFFFF" strokeWidth={1.5} />
          </G>
        ) : null}
      </Svg>

      {/* OHLC tooltip overlay (HTML so text is crisp) */}
      {focused ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 4,
            left: tooltipOnLeft ? 6 : undefined,
            right: tooltipOnLeft ? undefined : 6,
            backgroundColor: "rgba(15,15,15,0.86)",
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 8,
            minWidth: 96
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={ohlcLabel}>O</Text>
            <Text style={ohlcValue}>{fmtCs(focused.o)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={ohlcLabel}>H</Text>
            <Text style={[ohlcValue, { color: "#A7F3D0" }]}>{fmtCs(focused.h)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={ohlcLabel}>L</Text>
            <Text style={[ohlcValue, { color: "#FCA5A5" }]}>{fmtCs(focused.l)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={ohlcLabel}>C</Text>
            <Text style={[ohlcValue, { color: focusedColor }]}>{fmtCs(focused.c)}</Text>
          </View>
          {changePct !== null ? (
            <View
              style={{
                marginTop: 4,
                paddingTop: 4,
                borderTopWidth: 1,
                borderTopColor: "rgba(255,255,255,0.12)",
                flexDirection: "row",
                justifyContent: "space-between"
              }}
            >
              <Text style={ohlcLabel}>%</Text>
              <Text
                style={[
                  ohlcValue,
                  { color: changePct >= 0 ? "#A7F3D0" : "#FCA5A5" }
                ]}
              >
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* 价格标签 — 紧贴右边缘，跟随十字线水平线 */}
      {focused ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: 0,
            top: yOf(focused.c) - 9,
            backgroundColor: focusedColor,
            paddingHorizontal: 5,
            paddingVertical: 2,
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4
          }}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 9,
              fontWeight: "800",
              fontVariant: ["tabular-nums"]
            }}
          >
            {fmtCs(focused.c)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const ohlcLabel = {
  color: "rgba(255,255,255,0.55)",
  fontSize: 9,
  fontWeight: "700" as const,
  marginRight: 8
};
const ohlcValue = {
  color: "#FFFFFF",
  fontSize: 10,
  fontWeight: "700" as const,
  fontVariant: ["tabular-nums" as const]
};

function fmtCs(n: number) {
  if (n >= 10000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (n >= 1000) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

/**
 * Deterministic mock OHLC generator. Same seed → same chart.
 * Walks a price around `start` for `count` steps, then nudges the
 * end toward `end` so the chart visually reaches the latest price.
 */
export function generateCandles(opts: {
  seed: string;
  count: number;
  start: number;
  end: number;
  volatility?: number; // 0..1, fraction of price as 1σ per step
}): Candle[] {
  const { seed, count, start, end, volatility = 0.004 } = opts;
  // simple string hash → 32-bit
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // mulberry32 PRNG
  function rand() {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const out: Candle[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    // bias drift toward end as i grows
    const progress = i / Math.max(1, count - 1);
    const target = start + (end - start) * progress;
    const drift = (target - price) * 0.18;
    const shock = (rand() - 0.5) * 2 * volatility * price;
    const o = price;
    const c = price + drift + shock;
    const wick = Math.abs(shock) + volatility * price * 0.6 * rand();
    const h2 = Math.max(o, c) + wick * (0.4 + rand() * 0.8);
    const l = Math.min(o, c) - wick * (0.4 + rand() * 0.8);
    out.push({ o, h: h2, l, c });
    price = c;
  }
  // snap last close to end exactly
  const last = out[out.length - 1];
  if (last) {
    last.c = end;
    last.h = Math.max(last.h, end);
    last.l = Math.min(last.l, end);
  }
  return out;
}
