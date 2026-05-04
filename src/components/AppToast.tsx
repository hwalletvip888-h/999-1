import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toastBus, type ToastPayload, type ToastTone } from "../services/toastBus";

const toneStyles: Record<ToastTone, { bg: string; border: string; accent: string }> = {
  success: { bg: "rgba(16,185,129,0.96)", border: "#34D399", accent: "#FFFFFF" },
  info: { bg: "rgba(15,15,30,0.94)", border: "rgba(124,58,237,0.55)", accent: "#FDE68A" },
  warn: { bg: "rgba(180,83,9,0.96)", border: "#F59E0B", accent: "#FFFFFF" }
};

/**
 * 顶部下拉横幅。监听 toastBus，依次显示，每条自动消失。
 * 挂在 App 顶层，覆盖整屏。
 */
export function AppToast() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastPayload | null>(null);
  const queue = useRef<ToastPayload[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const y = useSharedValue(-120);

  useEffect(() => {
    return toastBus.subscribe((t) => {
      queue.current.push(t);
      if (!current) showNext();
    });
    // 注意：showNext 用 ref 闭包，无需依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  function showNext() {
    const next = queue.current.shift();
    if (!next) return;
    setCurrent(next);
    y.value = withSequence(
      withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) })
    );
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => dismiss(), next.duration ?? 2400);
  }

  function dismiss() {
    y.value = withTiming(-160, { duration: 260, easing: Easing.in(Easing.cubic) });
    setTimeout(() => {
      setCurrent(null);
      // 让下一条进来
      setTimeout(showNext, 80);
    }, 260);
  }

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }]
  }));

  if (!current) return null;
  const tone = toneStyles[current.tone ?? "success"];

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          top: insets.top + 6,
          left: 12,
          right: 12,
          zIndex: 999
        },
        aStyle
      ]}
    >
      <Pressable
        onPress={dismiss}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
          borderRadius: 18,
          backgroundColor: tone.bg,
          borderWidth: 1,
          borderColor: tone.border,
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.28,
          shadowRadius: 20,
          elevation: 10,
          gap: 10
        }}
      >
        {current.emoji ? (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Text style={{ fontSize: 20 }}>{current.emoji}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 13.5, fontWeight: "800" }}>
            {current.title}
          </Text>
          {current.subtitle ? (
            <Text
              style={{
                color: tone.accent,
                fontSize: 11.5,
                fontWeight: "600",
                marginTop: 2
              }}
              numberOfLines={1}
            >
              {current.subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
