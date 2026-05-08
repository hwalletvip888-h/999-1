import Svg, { Path, Circle } from "react-native-svg";

type IconProps = { size?: number; color?: string };

export function MenuIcon({ size = 22, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M4 12h16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M4 17h16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function UserIcon({ size = 22, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.6} stroke={color} strokeWidth={1.8} />
      <Path
        d="M4.5 19.5c1.4-3.4 4.4-5 7.5-5s6.1 1.6 7.5 5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ArrowLeftIcon({ size = 22, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PlusIcon({ size = 18, color = "#6B7280" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function MicIcon({ size = 18, color = "#6B7280" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M5 11a7 7 0 0014 0M12 18v3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SendIcon({ size = 18, color = "#FFFFFF" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 19V5M5 12l7-7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 18, color = "#9CA3AF" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function WalletIcon({ size = 22, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 8.5A2.5 2.5 0 015.5 6h12A2.5 2.5 0 0120 8.5V17a2 2 0 01-2 2H5.5A2.5 2.5 0 013 16.5v-8z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M16.5 13.5h.01" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function LightbulbIcon({ size = 16, color = "#6B7280" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.4 1-1.9A6 6 0 0012 3z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PaperclipIcon({ size = 16, color = "#6B7280" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.5l-8.5 8.5a5 5 0 01-7-7L14.5 5a3.5 3.5 0 015 5L11 18.5a2 2 0 01-3-3L16.5 7"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TrendUpIcon({ size = 18, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 17l6-6 4 4 8-8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M14 7h7v7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CoinsIcon({ size = 18, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={9} r={5.5} stroke={color} strokeWidth={1.7} />
      <Circle cx={15} cy={15} r={5.5} stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}

export function SparkIcon({ size = 18, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ArrowDownIcon({ size = 22, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4v15M6 13l6 6 6-6" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ArrowUpIcon({ size = 22, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 20V5M6 11l6-6 6 6" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SwapIcon({ size = 22, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 7h13M16 3l4 4-4 4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 17H4M8 13l-4 4 4 4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ScanIcon({ size = 22, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M4 12h16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function BellIcon({ size = 22, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.5 17h13l-1.35-1.9a3.2 3.2 0 01-.58-1.85V9.9a4.55 4.55 0 10-9.1 0v3.35a3.2 3.2 0 01-.58 1.85L5.5 17z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M9.7 19a2.3 2.3 0 004.6 0" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CardStackIcon({ size = 18, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke={color} strokeWidth={1.7} />
      <Path d="M3 12h18" stroke={color} strokeWidth={1.7} />
      <Path d="M6 4h12" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function LockIcon({ size = 18, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 11h14v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
      <Path d="M8 11V8a4 4 0 018 0v3" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function LeafIcon({ size = 18, color = "#0F0F0F" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15-1 0-1-1-1-1z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path d="M5 19L13 11" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function EyeIcon({ size = 18, color = "#FFFFFF" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke={color} strokeWidth={1.6} />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

export function SearchIcon({ size = 18, color = "#9CA3AF" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={1.8} />
      <Path d="M20 20l-3.5-3.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
