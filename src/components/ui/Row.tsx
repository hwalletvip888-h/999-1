import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type RowProps = {
  title: string;
  description?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
};

/** A list row used in Wallet/Profile/Community settings. Manus-like clean row. */
export function Row({ title, description, leading, trailing, showChevron, onPress }: RowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      className="flex-row items-center border-b border-line bg-bg px-4 py-3.5 active:bg-surface"
    >
      {leading ? <View className="mr-3">{leading}</View> : null}
      <View className="flex-1">
        <Text className="text-[19px] font-medium text-ink">{title}</Text>
        {description ? <Text className="mt-0.5 text-[16px] text-muted">{description}</Text> : null}
      </View>
      {trailing}
      {showChevron ? <Text className="ml-2 text-[20px] text-muted">›</Text> : null}
    </Pressable>
  );
}
