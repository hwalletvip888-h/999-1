import type { ReactNode } from "react";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

type Variant = "primary" | "secondary" | "ghost" | "gradient";
type Size = "sm" | "md" | "lg";

type ButtonProps = Omit<PressableProps, "children"> & {
  label: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  fullWidth?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Add subtle pulsing glow on the primary button to draw attention. */
  breathing?: boolean;
  /** Custom gradient colors; only used when variant="gradient" */
  gradientColors?: [string, string];
};

const base = "flex-row items-center justify-center rounded-full";

const sizeMap: Record<Size, { wrap: string; text: string; h: number; px: number }> = {
  sm: { wrap: "px-3.5 py-1.5", text: "text-[15px]", h: 34, px: 14 },
  md: { wrap: "px-5 py-2.5", text: "text-[16px]", h: 42, px: 20 },
  lg: { wrap: "px-6 py-3", text: "text-[17px]", h: 50, px: 24 }
};

const variantMap: Record<Exclude<Variant, "gradient">, { wrap: string; text: string }> = {
  primary: { wrap: "bg-ink", text: "text-bg font-semibold" },
  secondary: { wrap: "border border-line bg-bg", text: "text-ink font-medium" },
  ghost: { wrap: "bg-surface", text: "text-ink2 font-medium" }
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  variant = "primary",
  size = "md",
  className = "",
  fullWidth,
  leading,
  trailing,
  breathing,
  gradientColors = ["#6C3FC5", "#9B6DFF"],
  onPressIn,
  onPressOut,
  style,
  ...rest
}: ButtonProps) {
  const s = sizeMap[size];
  const press = useSharedValue(1);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!breathing) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [breathing, pulse]);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value * (1 + pulse.value * 0.025) }],
    shadowOpacity: breathing ? 0.18 + pulse.value * 0.18 : variant === "gradient" ? 0.32 : 0,
    shadowRadius: breathing ? 8 + pulse.value * 10 : variant === "gradient" ? 12 : 0
  }));

  const handlePressIn = (e: any) => {
    press.value = withSpring(0.96, { mass: 0.4, damping: 12 });
    onPressIn?.(e);
  };
  const handlePressOut = (e: any) => {
    press.value = withSpring(1, { mass: 0.4, damping: 12 });
    onPressOut?.(e);
  };

  if (variant === "gradient") {
    return (
      <AnimatedPressable
        accessibilityRole="button"
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...rest}
        style={[
          aStyle,
          {
            shadowColor: gradientColors[0],
            shadowOffset: { width: 0, height: 6 },
            borderRadius: 999,
            overflow: "hidden",
            alignSelf: fullWidth ? "stretch" : "auto",
          },
          style,
        ]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.gradientInner,
            { paddingHorizontal: s.px, minHeight: s.h },
          ]}
        >
          {leading}
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: size === "sm" ? 15 : size === "lg" ? 17 : 16,
              fontFamily: "Inter_600SemiBold",
              fontWeight: "600",
              marginHorizontal: leading || trailing ? 6 : 0,
            }}
          >
            {label}
          </Text>
          {trailing}
        </LinearGradient>
      </AnimatedPressable>
    );
  }

  const v = variantMap[variant as Exclude<Variant, "gradient">];
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...rest}
      style={[
        aStyle,
        {
          shadowColor: "#0F0F0F",
          shadowOffset: { width: 0, height: 4 }
        },
        style,
      ]}
      className={`${base} ${s.wrap} ${v.wrap} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {leading}
      <Text className={`${v.text} ${s.text} ${leading || trailing ? "mx-1.5" : ""}`}>{label}</Text>
      {trailing}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  gradientInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
