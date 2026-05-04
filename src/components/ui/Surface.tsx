import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

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
      style={[eStyle, style]}
      className={`rounded-2xl border border-line bg-bg ${padded ? "px-4 py-3.5" : ""} ${className}`}
    >
      {children}
    </View>
  );
}
