import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { uiColors, uiRadius, uiShadow } from "../../theme/uiSystem";

type Elevation = 0 | 1 | 2 | 3;
type SurfaceVariant = "default" | "glass" | "glassPurple";

type SurfaceProps = PropsWithChildren<
  ViewProps & {
    className?: string;
    padded?: boolean;
    elevation?: Elevation;
    variant?: SurfaceVariant;
  }
>;

const shadows = StyleSheet.create({
  e0: {},
  e1: uiShadow.cardSoft,
  e2: uiShadow.card,
  e3: uiShadow.deep,
});

export function Surface({
  children,
  className = "",
  padded = true,
  elevation = 1,
  variant = "default",
  style,
  ...rest
}: SurfaceProps) {
  const eStyle =
    elevation === 0 ? shadows.e0 : elevation === 1 ? shadows.e1 : elevation === 2 ? shadows.e2 : shadows.e3;

  const variantStyle =
    variant === "glass"
      ? {
          backgroundColor: uiColors.glassBg,
          borderColor: uiColors.glassBorder,
        }
      : variant === "glassPurple"
        ? {
            backgroundColor: uiColors.glassPurpleBg,
            borderColor: uiColors.glassPurpleBorder,
          }
        : {
            backgroundColor: uiColors.cardBg,
            borderColor: uiColors.cardBorder,
          };

  return (
    <View
      {...rest}
      className={`${padded ? "px-4 py-3.5" : ""} ${className}`}
      style={[
        eStyle,
        {
          borderRadius: uiRadius.card,
          borderWidth: 1,
        },
        variantStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}
