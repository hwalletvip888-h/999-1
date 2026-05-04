import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
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
   * 头部追踪点（屏幕 pageX/pageY 坐标）。emoji 没有眼睛，所以做"整头转向"。
   * 传 null 时回到默认朝向。
   */
  gaze?: { x: number; y: number } | null;
};

/**
 * 🐬 H Wallet AI 灵魂头像 —— 用系统 emoji 做主体，外加 Reanimated 表演：
 * - 跃出水面（translateY + 倾头）
 * - 涟漪 / 水面线
 * - thinking 时倾头 + 头顶紫色思考气泡
 * - speaking 时身体弹性"说话"晃动
 * - celebrating 时跳更高 + 4 颗金色光点扇形飞溅
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
  const ripple = useSharedValue(0);
  const pulse = useSharedValue(0); // speaking 时身体弹性
  const sparkle = useSharedValue(0); // 庆祝粒子
  const gazeTilt = useSharedValue(0); // 头部转向叠加角
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
    // 转向角：水平分量为主，限制 ±18°
    const raw = Math.atan2(dx, Math.max(160, Math.abs(dy) + 120)) * (180 / Math.PI);
    const clamped = Math.max(-18, Math.min(18, raw));
    gazeTilt.value = withTiming(clamped, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [gaze, gazeTilt]);

  useEffect(() => {
    if (!animated) return;

    const liftAmp = mood === "celebrating" ? -size * 0.22 : mood === "thinking" ? -size * 0.05 : -size * 0.12;
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

    const tiltTo = mood === "thinking" ? -16 : mood === "celebrating" ? -12 : -7;
    tilt.value = withRepeat(
      withSequence(
        withTiming(tiltTo, { duration: liftUp, easing: Easing.out(Easing.cubic) }),
        withTiming(mood === "thinking" ? -10 : 0, {
          duration: liftDn,
          easing: Easing.in(Easing.cubic)
        })
      ),
      -1,
      false
    );

    if (!compact && mood !== "thinking") {
      ripple.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
    } else {
      ripple.value = 0;
    }

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
  }, [animated, mood, compact, size, lift, tilt, ripple, pulse, sparkle]);

  const dolphinStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: lift.value },
      { rotate: `${tilt.value + gazeTilt.value}deg` },
      { scale: 1 + pulse.value * 0.06 }
    ]
  }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: 0.55 - ripple.value * 0.55,
    transform: [{ scale: 0.55 + ripple.value * 0.7 }]
  }));

  const waterY = size * 0.78;
  // 让 emoji 本身贴满容器（emoji 字形会带一些内边距，所以放大一点）
  const emojiSize = size * 0.92;

  return (
    <View
      ref={containerRef}
      onLayout={() => {
        // 记录自己在屏幕上的中心点
        const node = containerRef.current;
        if (!node) return;
        // measureInWindow 是 RN 的 native 方法
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
      {/* 涟漪 */}
      {!compact ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: waterY - size * 0.04,
              width: size * 0.55,
              height: size * 0.08,
              borderRadius: size,
              borderWidth: 1.5,
              borderColor: "#93C5FD"
            },
            rippleStyle
          ]}
        />
      ) : null}

      {/* 庆祝粒子 */}
      {mood === "celebrating" ? <CelebrateBurst size={size} progress={sparkle} /> : null}

      {/* thinking 时左上角紫色思考气泡 */}
      {mood === "thinking" ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: size * 0.04,
            left: size * 0.04,
            alignItems: "center",
            gap: 2
          }}
        >
          <View
            style={{
              width: size * 0.13,
              height: size * 0.13,
              borderRadius: size * 0.07,
              backgroundColor: "#7C3AED"
            }}
          />
          <View
            style={{
              width: size * 0.09,
              height: size * 0.09,
              borderRadius: size * 0.05,
              backgroundColor: "#7C3AED",
              opacity: 0.75
            }}
          />
          <View
            style={{
              width: size * 0.05,
              height: size * 0.05,
              borderRadius: size * 0.03,
              backgroundColor: "#7C3AED",
              opacity: 0.55
            }}
          />
        </View>
      ) : null}

      {/* 海豚本体 — emoji */}
      <Animated.View
        style={[
          {
            position: "absolute",
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center"
          },
          dolphinStyle
        ]}
      >
        <Text
          style={{
            fontSize: emojiSize,
            lineHeight: emojiSize * 1.05,
            // 让海豚水平镜像更"跃起"姿态：原 emoji 朝右上跳，符合 H Wallet logo 朝向
            includeFontPadding: false
          }}
        >
          🐬
        </Text>
      </Animated.View>

      {/* 水面线 */}
      {!compact ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: waterY,
            width: size * 0.7,
            height: 2,
            borderRadius: 2,
            backgroundColor: "#BFDBFE",
            opacity: 0.7
          }}
        />
      ) : null}
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
