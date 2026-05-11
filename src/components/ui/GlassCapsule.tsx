import type { PropsWithChildren } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

type GlassCapsuleProps = PropsWithChildren<{
  /** "pill" = full rounded; number = custom radius */
  radius?: number | "pill";
  intensity?: number;
  tint?: "light" | "dark" | "default" | "purple";
  className?: string;
  style?: ViewStyle | ViewStyle[];
}>;

/** Liquid-glass capsule: frosted blur + translucent fill + thin highlight rim + inner gloss. */
export function GlassCapsule({
  children,
  radius = "pill",
  intensity = 32,
  tint = "light",
  className = "",
  style
}: GlassCapsuleProps) {
  const r = radius === "pill" ? 999 : radius;
  const isPurple = tint === "purple";
  const baseTint = isPurple ? "light" : tint;

  return (
    <View
      style={[
        styles.shadow,
        { borderRadius: r },
        style
      ]}
      className={className}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: "hidden" }]}>
        {Platform.OS === "ios" || Platform.OS === "android" ? (
          <BlurView
            intensity={intensity}
            tint={baseTint as "light" | "dark" | "default"}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {/* 玻璃底色 */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isPurple
                ? "rgba(108,63,197,0.10)"
                : tint === "dark"
                  ? "rgba(15,15,15,0.55)"
                  : "rgba(255,255,255,0.65)"
            }
          ]}
        />
        {/* 顶部高光 */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "45%",
            backgroundColor: isPurple
              ? "rgba(255,255,255,0.35)"
              : tint === "dark"
                ? "rgba(255,255,255,0.06)"
                : "rgba(255,255,255,0.45)"
          }}
        />
        {/* 内边光晕 */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: r,
              borderWidth: 1,
              borderColor: isPurple
                ? "rgba(255,255,255,0.6)"
                : tint === "dark"
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(255,255,255,0.7)"
            }
          ]}
        />
        {/* 外层细描边 */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: r,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: isPurple
                ? "rgba(108,63,197,0.28)"
                : tint === "dark"
                  ? "rgba(0,0,0,0.4)"
                  : "rgba(15,15,15,0.08)"
            }
          ]}
        />
      </View>
      <View style={{ borderRadius: r }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: "#6C3FC5",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4
  }
});
