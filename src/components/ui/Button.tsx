import type { ReactNode } from "react";
import { useEffect } from "react";
import { Pressable, Text, type PressableProps } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming
} from "react-native-reanimated";

type Variant = "primary" | "secondary" | "ghost";
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
};

const base = "flex-row items-center justify-center rounded-full";

const sizeMap: Record<Size, { wrap: string; text: string }> = {
  sm: { wrap: "px-3.5 py-1.5", text: "text-[15px]" },
  md: { wrap: "px-5 py-2.5", text: "text-[16px]" },
  lg: { wrap: "px-6 py-3", text: "text-[17px]" }
};

const variantMap: Record<Variant, { wrap: string; text: string }> = {
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
  onPressIn,
  onPressOut,
  ...rest
}: ButtonProps) {
  const v = variantMap[variant];
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
    shadowOpacity: breathing ? 0.18 + pulse.value * 0.18 : 0,
    shadowRadius: breathing ? 8 + pulse.value * 10 : 0
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={(e) => {
        press.value = withSpring(0.96, { mass: 0.4, damping: 12 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        press.value = withSpring(1, { mass: 0.4, damping: 12 });
        onPressOut?.(e);
      }}
      {...rest}
      style={[
        aStyle,
        {
          shadowColor: "#0F0F0F",
          shadowOffset: { width: 0, height: 4 }
        }
      ]}
      className={`${base} ${s.wrap} ${v.wrap} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {leading}
      <Text className={`${v.text} ${s.text} ${leading || trailing ? "mx-1.5" : ""}`}>{label}</Text>
      {trailing}
    </AnimatedPressable>
  );
}
