import type { PropsWithChildren } from "react";
import { View } from "react-native";

export function GradientBackground({ children }: PropsWithChildren) {
  return <View className="flex-1 bg-bg">{children}</View>;
}
