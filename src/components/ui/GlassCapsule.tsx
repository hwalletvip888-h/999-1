import type { PropsWithChildren } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

type GlassCapsuleProps = PropsWithChildren<{
  /** "pill" = full rounded; number = custom radius */
  radius?: number | "pill";
  intensity?: number;
  tint?: "light" | "dark" | "default";
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
            tint={tint}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {/* 玻璃底色 */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: tint === "dark" ? "rgba(15,15,15,0.55)" : "rgba(255,255,255,0.55)" }
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
            backgroundColor: tint === "dark" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.45)"
          }}
        />
        {/* 内边光晕 */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: r,
              borderWidth: 1,
              borderColor: tint === "dark" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.7)"
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
              borderColor: tint === "dark" ? "rgba(0,0,0,0.4)" : "rgba(15,15,15,0.08)"
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
    shadowColor: "#0F0F0F",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4
  }
});
