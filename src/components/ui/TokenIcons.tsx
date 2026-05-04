import { View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";

type TokenProps = { size?: number };

/** Branded coin badges. Solid color disc + clean monogram. */
export function TokenUSDT({ size = 36 }: TokenProps) {
  return (
    <View>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Defs>
          <LinearGradient id="usdt-bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#34D399" />
            <Stop offset="1" stopColor="#059669" />
          </LinearGradient>
        </Defs>
        <Circle cx={20} cy={20} r={20} fill="url(#usdt-bg)" />
        <Path d="M11 13h18" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
        <Path d="M20 14v14" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
        <Path
          d="M14 16.6c0 1.6 2.7 2.4 6 2.4s6-.8 6-2.4"
          stroke="#fff"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

export function TokenETH({ size = 36 }: TokenProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="eth-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#8B93B0" />
          <Stop offset="1" stopColor="#3C3C5B" />
        </LinearGradient>
      </Defs>
      <Circle cx={20} cy={20} r={20} fill="url(#eth-bg)" />
      <Path d="M20 8L12 21l8 4 8-4z" fill="#fff" opacity={0.95} />
      <Path d="M20 8v9.6L12 21z" fill="#fff" opacity={0.7} />
      <Path d="M20 26.5L12 22.5l8 11 8-11z" fill="#fff" opacity={0.95} />
      <Path d="M20 33.5v-7l-8-4z" fill="#fff" opacity={0.7} />
    </Svg>
  );
}

export function TokenBTC({ size = 36 }: TokenProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="btc-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FBBF24" />
          <Stop offset="1" stopColor="#D97706" />
        </LinearGradient>
      </Defs>
      <Circle cx={20} cy={20} r={20} fill="url(#btc-bg)" />
      <SvgText
        x={20}
        y={27}
        fontSize={20}
        fontWeight="700"
        fill="#FFFFFF"
        textAnchor="middle"
      >
        ₿
      </SvgText>
    </Svg>
  );
}

export function TokenHWT({ size = 36 }: TokenProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="hwt-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2A0D4D" />
          <Stop offset="1" stopColor="#5B21B6" />
        </LinearGradient>
      </Defs>
      <Circle cx={20} cy={20} r={20} fill="url(#hwt-bg)" />
      <SvgText
        x={20}
        y={27}
        fontSize={18}
        fontWeight="800"
        fill="#D9AA43"
        textAnchor="middle"
      >
        H
      </SvgText>
    </Svg>
  );
}

/** Map a symbol to its branded token icon. */
export function TokenIcon({ symbol, size = 36 }: { symbol: string; size?: number }) {
  const s = symbol.toUpperCase();
  if (s === "USDT") return <TokenUSDT size={size} />;
  if (s === "ETH") return <TokenETH size={size} />;
  if (s === "BTC") return <TokenBTC size={size} />;
  if (s === "HWT") return <TokenHWT size={size} />;
  return <TokenETH size={size} />;
}
