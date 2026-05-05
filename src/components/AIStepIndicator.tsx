/**
 * AIStepIndicator — AI 步骤实时动画组件
 * 工作中：展开显示每一步进度
 * 完成后：自动折叠成一行摘要，用户可点击展开查看
 */
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  FadeInDown,
  Layout,
} from "react-native-reanimated";
import type { AIStep } from "../types";
import { DolphinLogo } from "./DolphinLogo";

type Props = {
  steps: AIStep[];
};

// ─── 子组件 ───

function StepSpinner() {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${rotation.value}deg` }],
  }));
  return (
    <Animated.View style={[{ width: 14, height: 14, alignItems: "center", justifyContent: "center" }, animStyle]}>
      <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#E5E7EB", borderTopColor: "#7C3AED" }} />
    </Animated.View>
  );
}

function StepDone() {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 9, color: "#FFF", fontWeight: "700" }}>✓</Text>
    </Animated.View>
  );
}

function StepPending() {
  return <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#F3F4F6", borderWidth: 1.5, borderColor: "#D1D5DB" }} />;
}

function StepError() {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 9, color: "#FFF", fontWeight: "700" }}>✗</Text>
    </Animated.View>
  );
}

function StepIcon({ step }: { step: AIStep }) {
  switch (step.status) {
    case "active": return <StepSpinner />;
    case "done": return <StepDone />;
    case "error": return <StepError />;
    default: return <StepPending />;
  }
}

function PulsingDot() {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 600 }), withTiming(0.3, { duration: 600 })),
      -1, false
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#7C3AED", marginLeft: 2 }, animStyle]} />;
}

function StepRow({ step, index, animate }: { step: AIStep; index: number; animate: boolean }) {
  const isActive = step.status === "active";
  const isDone = step.status === "done";

  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 }}>
      <StepIcon step={step} />
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        {step.icon ? <Text style={{ fontSize: 12, marginRight: 3 }}>{step.icon}</Text> : null}
        <Text
          style={{
            fontSize: 12,
            lineHeight: 16,
            color: isDone ? "#9CA3AF" : isActive ? "#0F0F0F" : "#D1D5DB",
            fontFamily: isActive ? "Inter_600SemiBold" : "Inter_400Regular",
          }}
        >
          {step.label}
        </Text>
        {isActive && (
          <View style={{ flexDirection: "row", marginLeft: 3 }}>
            <PulsingDot /><PulsingDot /><PulsingDot />
          </View>
        )}
      </View>
    </View>
  );

  if (animate) {
    return (
      <Animated.View entering={FadeInDown.delay(index * 100).duration(250).springify()}>
        {content}
      </Animated.View>
    );
  }
  return content;
}

// ─── 主组件 ───

export function AIStepIndicator({ steps }: Props) {
  const doneCount = steps.filter((s) => s.status === "done").length;
  const total = steps.length;
  const allDone = doneCount === total;
  const hasError = steps.some((s) => s.status === "error");

  // 完成后自动折叠
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    if (allDone || hasError) {
      // 完成后 800ms 自动折叠
      const timer = setTimeout(() => setExpanded(false), 800);
      return () => clearTimeout(timer);
    }
  }, [allDone, hasError]);

  // 折叠状态 — 一行摘要
  if (!expanded) {
    return (
      <View className="my-1 px-4" style={{ paddingLeft: 46 }}>
        <Pressable
          onPress={() => setExpanded(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#F9FAFB",
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: "#F3F4F6",
          }}
        >
          {/* 状态图标 */}
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: hasError ? "#FEE2E2" : "#ECFDF5", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
            <Text style={{ fontSize: 9, color: hasError ? "#EF4444" : "#10B981", fontWeight: "700" }}>
              {hasError ? "!" : "✓"}
            </Text>
          </View>
          {/* 摘要文字 */}
          <Text style={{ fontSize: 12, color: "#6B7280", fontFamily: "Inter_400Regular", flex: 1 }}>
            {hasError ? `执行中断（${doneCount}/${total} 步完成）` : `已完成 ${total} 个步骤`}
          </Text>
          {/* 展开箭头 */}
          <Text style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 4 }}>▼</Text>
        </Pressable>
      </View>
    );
  }

  // 展开状态 — 完整步骤列表
  return (
    <View className="my-1.5 flex-row items-end px-4" style={{ gap: 6 }}>
      <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
        <DolphinLogo size={36} compact mood={allDone ? "celebrating" : "thinking"} />
      </View>
      <Pressable
        onPress={() => { if (allDone || hasError) setExpanded(false); }}
        className="max-w-[82%] rounded-2xl rounded-bl-md px-3 py-2.5"
        style={{
          backgroundColor: "#FAFAFA",
          borderWidth: 1,
          borderColor: "#ECECF1",
          borderLeftWidth: 3,
          borderLeftColor: allDone ? "#10B981" : hasError ? "#EF4444" : "#7C3AED",
          minWidth: 180,
        }}
      >
        {/* 标题行 */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <Text style={{ fontSize: 10, color: allDone ? "#10B981" : "#7C3AED", fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase" }}>
            {allDone ? "H Agent 完成" : "H Agent 工作中"}
          </Text>
          <View style={{ marginLeft: 6, backgroundColor: allDone ? "#ECFDF5" : "#EDE9FE", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
            <Text style={{ fontSize: 9, color: allDone ? "#10B981" : "#7C3AED", fontFamily: "Inter_600SemiBold" }}>
              {doneCount}/{total}
            </Text>
          </View>
          {/* 折叠提示 */}
          {(allDone || hasError) && (
            <Text style={{ fontSize: 9, color: "#9CA3AF", marginLeft: "auto" }}>▲ 收起</Text>
          )}
        </View>

        {/* 步骤列表 */}
        {steps.map((step, i) => (
          <StepRow key={step.id} step={step} index={i} animate={!allDone} />
        ))}

        {/* 底部进度条 */}
        <View style={{ marginTop: 6, height: 2, backgroundColor: "#F3F4F6", borderRadius: 1, overflow: "hidden" }}>
          <View style={{ height: 2, borderRadius: 1, backgroundColor: allDone ? "#10B981" : "#7C3AED", width: `${(doneCount / total) * 100}%` }} />
        </View>
      </Pressable>
    </View>
  );
}
