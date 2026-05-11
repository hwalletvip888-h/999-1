import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { uiLevelColors, uiShadow } from "../../theme/uiSystem";

type AvatarProps = {
  label?: string;
  emoji?: string;
  size?: number;
  tone?: "neutral" | "ink" | "accent";
  /** 1-5 等级；提供后忽略 tone，使用 H 字母 + 5 级渐变色系统 */
  level?: 1 | 2 | 3 | 4 | 5;
  /** 是否显示右下角小色块标签（仅 level 模式生效） */
  showBadge?: boolean;
};

export function Avatar({ label, emoji, size = 36, tone = "neutral", level, showBadge = true }: AvatarProps) {
  // ── 等级模式（H 字母 + 5 级渐变）
  if (level && level >= 1 && level <= 5) {
    const lv = uiLevelColors[level - 1];
    const badgeSize = Math.max(12, Math.round(size * 0.32));
    return (
      <View style={{ width: size, height: size, position: "relative" }}>
        <LinearGradient
          colors={lv.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1.5,
              borderColor: lv.border,
            },
            uiShadow.float,
          ]}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: size * 0.5,
              fontFamily: "Inter_800ExtraBold",
              fontWeight: "800",
              letterSpacing: -0.5,
              textShadowColor: "rgba(0,0,0,0.18)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2,
            }}
          >
            H
          </Text>
        </LinearGradient>
        {showBadge ? (
          <View
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: lv.border,
              borderWidth: 1.5,
              borderColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: badgeSize * 0.6,
                fontFamily: "Inter_700Bold",
                fontWeight: "700",
              }}
            >
              {level}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  // ── 老版兼容（tone）
  const bg =
    tone === "ink" ? "bg-ink" : tone === "accent" ? "bg-hPurple" : "bg-surface";
  const fg =
    tone === "ink" ? "text-bg" : tone === "accent" ? "text-bg" : "text-ink";

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className={`items-center justify-center ${bg}`}
    >
      <Text className={`${fg} text-sm font-semibold`}>{emoji ?? label ?? ""}</Text>
    </View>
  );
}
