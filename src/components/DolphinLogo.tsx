import { useEffect, useRef } from "react";
import { Image, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated";

export type DolphinMood = "idle" | "thinking" | "speaking" | "celebrating";

type DolphinLogoProps = {
  size?: number;
  animated?: boolean;
  /** 紧凑模式：去掉水面/涟漪。 */
  compact?: boolean;
  mood?: DolphinMood;
  /**
   * 头部追踪点（屏幕 pageX/pageY 坐标）。
   * 传 null 时回到默认朝向。
   */
  gaze?: { x: number; y: number } | null;
};

// 紫金色 H+海豚 Logo
const LOGO_SOURCE = require("../../assets/logo.png");

/**
 * 🐬 H Wallet AI 灵魂头像 —— 使用紫金色 H+海豚 Logo
 * 保留动画效果：
 * - 跃出水面（translateY + 倾头）
 * - thinking 时倾头
 * - speaking 时身体弹性"说话"晃动
 * - celebrating 时跳更高 + 金色光点
 */
export function DolphinLogo({
  size = 140,
  animated = true,
  compact = false,
  mood = "idle",
  gaze = null
}: DolphinLogoProps) {
  const lift = useSharedValue(0);
  const tilt = useSharedValue(0);
  const pulse = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const gazeTilt = useSharedValue(0);
  const containerRef = useRef<View | null>(null);
  const selfCenter = useRef<{ x: number; y: number } | null>(null);

  // 当 gaze 变化时，根据自身屏幕中心计算转向角度
  useEffect(() => {
    if (!gaze || !selfCenter.current) {
      gazeTilt.value = withTiming(0, { duration: 420 });
      return;
    }
    const dx = gaze.x - selfCenter.current.x;
    const dy = gaze.y - selfCenter.current.y;
    const raw = Math.atan2(dx, Math.max(160, Math.abs(dy) + 120)) * (180 / Math.PI);
    const clamped = Math.max(-18, Math.min(18, raw));
    gazeTilt.value = withTiming(clamped, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [gaze, gazeTilt]);

  useEffect(() => {
    if (!animated) return;

    const liftAmp = mood === "celebrating" ? -size * 0.15 : mood === "thinking" ? -size * 0.03 : -size * 0.08;
    const liftUp = mood === "celebrating" ? 900 : 1400;
    const liftDn = mood === "celebrating" ? 700 : 1100;
    lift.value = withRepeat(
      withSequence(
        withTiming(liftAmp, { duration: liftUp, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: liftDn, easing: Easing.in(Easing.cubic) })
      ),
      -1,
      false
    );

    const tiltTo = mood === "thinking" ? -8 : mood === "celebrating" ? -6 : -3;
    tilt.value = withRepeat(
      withSequence(
        withTiming(tiltTo, { duration: liftUp, easing: Easing.out(Easing.cubic) }),
        withTiming(mood === "thinking" ? -5 : 0, {
          duration: liftDn,
          easing: Easing.in(Easing.cubic)
        })
      ),
      -1,
      false
    );

    if (mood === "speaking") {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 220, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 220, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      );
    } else {
      pulse.value = withTiming(0, { duration: 200 });
    }

    if (mood === "celebrating") {
      sparkle.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 100 })
        ),
        -1,
        false
      );
    } else {
      sparkle.value = withTiming(0, { duration: 200 });
    }
  }, [animated, mood, compact, size, lift, tilt, pulse, sparkle]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: lift.value },
      { rotate: `${tilt.value + gazeTilt.value}deg` },
      { scale: 1 + pulse.value * 0.04 }
    ]
  }));

  return (
    <View
      ref={containerRef}
      onLayout={() => {
        const node = containerRef.current;
        if (!node) return;
        node.measureInWindow?.((x: number, y: number, w: number, h: number) => {
          selfCenter.current = { x: x + w / 2, y: y + h / 2 };
        });
      }}
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible"
      }}
    >
      {/* 庆祝粒子 */}
      {mood === "celebrating" ? <CelebrateBurst size={size} progress={sparkle} /> : null}

      {/* Logo 本体 */}
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center"
          },
          logoStyle
        ]}
      >
        <Image
          source={LOGO_SOURCE}
          style={{
            width: size * 0.9,
            height: size * 0.9,
            borderRadius: size * 0.15
          }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

/* 庆祝粒子：4 颗金色光点向上扇形飞溅 */
import type { SharedValue } from "react-native-reanimated";

function CelebrateBurst({
  size,
  progress
}: {
  size: number;
  progress: SharedValue<number>;
}) {
  const particles = [
    { angle: -Math.PI / 2, dist: size * 0.5, delay: 0, color: "#FDE68A" },
    { angle: -Math.PI / 2 - 0.6, dist: size * 0.45, delay: 0.25, color: "#FCD34D" },
    { angle: -Math.PI / 2 + 0.6, dist: size * 0.45, delay: 0.5, color: "#FBBF24" },
    { angle: -Math.PI / 2 - 1.0, dist: size * 0.4, delay: 0.75, color: "#F59E0B" }
  ];
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: size / 2 - 4,
        left: size / 2 - 4,
        width: 8,
        height: 8
      }}
    >
      {particles.map((p, i) => (
        <Particle key={i} progress={progress} {...p} />
      ))}
    </View>
  );
}

function Particle({
  progress,
  angle,
  dist,
  delay,
  color
}: {
  progress: SharedValue<number>;
  angle: number;
  dist: number;
  delay: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const t = (progress.value + delay) % 1;
    const r = dist * t;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    return {
      opacity: t < 0.1 ? t * 10 : 1 - t,
      transform: [{ translateX: x }, { translateY: y }, { scale: 0.6 + (1 - t) * 0.6 }]
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.7,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 }
        },
        style
      ]}
    />
  );
}
