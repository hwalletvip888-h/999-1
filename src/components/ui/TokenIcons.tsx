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

export function TokenSOL({ size = 36 }: TokenProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="sol-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0B0B15" />
          <Stop offset="1" stopColor="#1E1B4B" />
        </LinearGradient>
        <LinearGradient id="sol-g1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#22D3EE" />
          <Stop offset="1" stopColor="#A855F7" />
        </LinearGradient>
      </Defs>
      <Circle cx={20} cy={20} r={20} fill="url(#sol-bg)" />
      <Path d="M10 12.5h18l-3.2 3.6H6.8z" fill="url(#sol-g1)" />
      <Path d="M13.2 18.2h18l-3.2 3.6H10z" fill="url(#sol-g1)" opacity={0.9} />
      <Path d="M10 24h18l-3.2 3.6H6.8z" fill="url(#sol-g1)" opacity={0.8} />
    </Svg>
  );
}

export function TokenBNB({ size = 36 }: TokenProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="bnb-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FCD34D" />
          <Stop offset="1" stopColor="#F59E0B" />
        </LinearGradient>
      </Defs>
      <Circle cx={20} cy={20} r={20} fill="url(#bnb-bg)" />
      <Path d="M20 10l3.5 3.5-3.5 3.5-3.5-3.5z" fill="#fff" />
      <Path d="M13.5 16.5l3.5 3.5-3.5 3.5-3.5-3.5zM26.5 16.5l3.5 3.5-3.5 3.5-3.5-3.5z" fill="#fff" />
      <Path d="M20 23l4.8 4.8-4.8 4.8-4.8-4.8z" fill="#fff" />
      <Path d="M20 16.8l3.2 3.2-3.2 3.2-3.2-3.2z" fill="#F59E0B" />
    </Svg>
  );
}

export function TokenOKB({ size = 36 }: TokenProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="okb-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#111827" />
          <Stop offset="1" stopColor="#000000" />
        </LinearGradient>
      </Defs>
      <Circle cx={20} cy={20} r={20} fill="url(#okb-bg)" />
      <Path d="M14 14h5v5h-5zM21 14h5v5h-5zM14 21h5v5h-5zM21 21h5v5h-5z" fill="#fff" />
    </Svg>
  );
}

function TokenFallback({ symbol, size = 36 }: { symbol: string; size?: number }) {
  const label = symbol.slice(0, 1).toUpperCase() || "?";
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="fallback-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6366F1" />
          <Stop offset="1" stopColor="#8B5CF6" />
        </LinearGradient>
      </Defs>
      <Circle cx={20} cy={20} r={20} fill="url(#fallback-bg)" />
      <SvgText x={20} y={26} fontSize={18} fontWeight="800" fill="#FFFFFF" textAnchor="middle">
        {label}
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
  if (s === "SOL") return <TokenSOL size={size} />;
  if (s === "BNB") return <TokenBNB size={size} />;
  if (s === "OKB") return <TokenOKB size={size} />;
  if (s === "HWT") return <TokenHWT size={size} />;
  return <TokenFallback symbol={s} size={size} />;
}
