import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export function GradientBackground({ children }: PropsWithChildren) {
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={["#FFFFFF", "#F8F4FF", "#F2EBFF"]}
        locations={[0, 0.5, 1]}
        style={{ flex: 1 }}
      >
        {children}
      </LinearGradient>
    </View>
  );
}
