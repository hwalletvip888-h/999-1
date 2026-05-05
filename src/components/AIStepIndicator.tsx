/**
 * AIStepIndicator — AI 步骤实时动画组件
 * 展示 AI 正在执行的每一步，带动画效果
 */
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  FadeInDown,
  SlideInLeft,
} from "react-native-reanimated";
import type { AIStep } from "../types";
import { DolphinLogo } from "./DolphinLogo";

type Props = {
  steps: AIStep[];
};

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
    <Animated.View
      style={[{ width: 16, height: 16, alignItems: "center", justifyContent: "center" }, animStyle]}
    >
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: "#E5E7EB",
          borderTopColor: "#7C3AED",
        }}
      />
    </Animated.View>
  );
}

function StepDone() {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: "#10B981",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 10, color: "#FFFFFF", fontWeight: "700" }}>✓</Text>
    </Animated.View>
  );
}

function StepPending() {
  return (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: "#F3F4F6",
        borderWidth: 1.5,
        borderColor: "#D1D5DB",
      }}
    />
  );
}

function StepError() {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: "#EF4444",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 10, color: "#FFFFFF", fontWeight: "700" }}>✗</Text>
    </Animated.View>
  );
}

function StepIcon({ step }: { step: AIStep }) {
  switch (step.status) {
    case "active":
      return <StepSpinner />;
    case "done":
      return <StepDone />;
    case "error":
      return <StepError />;
    default:
      return <StepPending />;
  }
}

function PulsingDot() {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600 }),
        withTiming(0.3, { duration: 600 })
      ),
      -1,
      false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: "#7C3AED",
          marginLeft: 2,
        },
        animStyle,
      ]}
    />
  );
}

function StepRow({ step, index }: { step: AIStep; index: number }) {
  const isActive = step.status === "active";
  const isDone = step.status === "done";

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 120).duration(300).springify()}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 5,
      }}
    >
      <StepIcon step={step} />
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        {step.icon ? (
          <Text style={{ fontSize: 13, marginRight: 4 }}>{step.icon}</Text>
        ) : null}
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: isDone ? "#6B7280" : isActive ? "#0F0F0F" : "#9CA3AF",
            fontFamily: isActive ? "Inter_600SemiBold" : "Inter_400Regular",
            textDecorationLine: isDone ? "line-through" : "none",
          }}
        >
          {step.label}
        </Text>
        {isActive && (
          <View style={{ flexDirection: "row", marginLeft: 4 }}>
            <PulsingDot />
            <PulsingDot />
            <PulsingDot />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

export function AIStepIndicator({ steps }: Props) {
  const activeStep = steps.find((s) => s.status === "active");
  const doneCount = steps.filter((s) => s.status === "done").length;
  const total = steps.length;

  return (
    <View className="my-1.5 flex-row items-end px-4" style={{ gap: 6 }}>
      <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
        <DolphinLogo size={36} compact mood="thinking" />
      </View>
      <View
        className="max-w-[82%] rounded-2xl rounded-bl-md px-4 py-3"
        style={{
          backgroundColor: "#FAFAFA",
          borderWidth: 1,
          borderColor: "#ECECF1",
          borderLeftWidth: 3,
          borderLeftColor: "#7C3AED",
          minWidth: 200,
        }}
      >
        {/* 进度标题 */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Text
            style={{
              fontSize: 11,
              color: "#7C3AED",
              fontFamily: "Inter_600SemiBold",
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            H Agent 工作中
          </Text>
          <View
            style={{
              marginLeft: 8,
              backgroundColor: "#EDE9FE",
              borderRadius: 8,
              paddingHorizontal: 6,
              paddingVertical: 1,
            }}
          >
            <Text style={{ fontSize: 10, color: "#7C3AED", fontFamily: "Inter_600SemiBold" }}>
              {doneCount}/{total}
            </Text>
          </View>
        </View>

        {/* 步骤列表 */}
        {steps.map((step, i) => (
          <StepRow key={step.id} step={step} index={i} />
        ))}

        {/* 底部进度条 */}
        <View
          style={{
            marginTop: 8,
            height: 3,
            backgroundColor: "#F3F4F6",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <Animated.View
            style={{
              height: 3,
              borderRadius: 2,
              backgroundColor: "#7C3AED",
              width: `${(doneCount / total) * 100}%`,
            }}
          />
        </View>
      </View>
    </View>
  );
}
