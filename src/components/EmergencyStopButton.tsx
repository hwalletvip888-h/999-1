/**
 * EmergencyStopButton — 全局浮动红按钮（PRD 第四锁）
 *
 * 行为：
 *   - 仅在卡库中有「running / executed / confirmed」卡片时显示
 *   - 长按 1.2s 才触发（防误点）
 *   - 触发后调用 emergencyStop.trigger()
 *   - 触发期间显示「平仓中…」呼吸动画
 */
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated";
import { emergencyStop, useEmergencyState } from "../services/emergencyStop";
import { useCardLibrary } from "../services/cardLibrary";

const HOLD_DURATION_MS = 1200;

export function EmergencyStopButton() {
  const state = useEmergencyState();
  const cards = useCardLibrary();
  const hasRunning = cards.some((c) => c.status === "running" || c.status === "executed" || c.status === "confirmed");

  const [holding, setHolding] = useState(false);
  const progress = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (state.active) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 600, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) })
        ),
        -1
      );
    } else {
      pulse.value = withTiming(1);
    }
  }, [state.active]);

  function startHold() {
    setHolding(true);
    progress.value = withTiming(1, { duration: HOLD_DURATION_MS, easing: Easing.linear }, (finished) => {
      if (finished) {
        // 长按完成 → 触发
        progress.value = 0;
      }
    });
    // 用 setTimeout 触发逻辑（withTiming 回调里调 trigger 会跨线程）
    holdTimer = setTimeout(() => {
      emergencyStop.trigger("用户长按红按钮触发");
      setHolding(false);
    }, HOLD_DURATION_MS);
  }

  function cancelHold() {
    setHolding(false);
    progress.value = withTiming(0, { duration: 200 });
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  let holdTimer: ReturnType<typeof setTimeout> | null = null;

  const ringStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }]
  }));

  // 仅在有可停止策略时显示，紧急状态期间也显示（用于"已触发"反馈）
  if (!hasRunning && !state.active) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        right: 16,
        bottom: 96,
        zIndex: 50
      }}
    >
      {state.active ? (
        <Animated.View style={[
          {
            backgroundColor: "#DC2626",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            flexDirection: "row",
            alignItems: "center",
            shadowColor: "#DC2626",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.45,
            shadowRadius: 16,
            elevation: 12
          },
          pulseStyle
        ]}>
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_700Bold", marginRight: 8 }}>
            🛑 紧急停止中
          </Text>
          <Pressable
            onPress={() => emergencyStop.clear()}
            hitSlop={6}
            style={{ backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>解除</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <Pressable
          onPressIn={startHold}
          onPressOut={cancelHold}
          accessibilityRole="button"
          accessibilityLabel="紧急停止所有策略，长按 1.2 秒触发"
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: holding ? "#B91C1C" : "#DC2626",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#DC2626",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.32,
            shadowRadius: 14,
            elevation: 10,
            overflow: "hidden"
          }}
        >
          {/* 长按进度环 */}
          <Animated.View
            style={[
              {
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                backgroundColor: "rgba(255,255,255,0.22)"
              },
              ringStyle
            ]}
          />
          <Text style={{ color: "#FFFFFF", fontSize: 22 }}>🛑</Text>
        </Pressable>
      )}
    </View>
  );
}
