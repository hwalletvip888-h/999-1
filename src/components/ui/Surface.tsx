import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { uiColors, uiRadius } from "../../theme/uiSystem";

type Elevation = 0 | 1 | 2 | 3;

type SurfaceProps = PropsWithChildren<
  ViewProps & {
    className?: string;
    padded?: boolean;
    elevation?: Elevation;
  }
>;

const shadows = StyleSheet.create({
  e0: {},
  e1: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1
  },
  e2: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3
  },
  e3: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8
  }
});

export function Surface({
  children,
  className = "",
  padded = true,
  elevation = 1,
  style,
  ...rest
}: SurfaceProps) {
  const eStyle =
    elevation === 0 ? shadows.e0 : elevation === 1 ? shadows.e1 : elevation === 2 ? shadows.e2 : shadows.e3;
  return (
    <View
      {...rest}
      className={`${padded ? "px-4 py-3.5" : ""} ${className}`}
      // 全局 Surface 视觉基线：统一圆角/边框/底色
      // 让不同页面的卡片质感保持一致
      style={[
        eStyle,
        {
          borderRadius: uiRadius.card,
          borderWidth: 1,
          borderColor: uiColors.cardBorder,
          backgroundColor: uiColors.cardBg
        },
        style
      ]}
    >
      {children}
    </View>
  );
}
