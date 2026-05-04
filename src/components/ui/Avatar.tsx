import { Text, View } from "react-native";

type AvatarProps = {
  label?: string;
  emoji?: string;
  size?: number;
  tone?: "neutral" | "ink" | "accent";
};

export function Avatar({ label, emoji, size = 36, tone = "neutral" }: AvatarProps) {
  const bg =
    tone === "ink" ? "bg-ink" : tone === "accent" ? "bg-hPurple" : "bg-surface";
  const fg =
    tone === "ink" ? "text-bg" : tone === "accent" ? "text-bg" : "text-ink";

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className={`items-center justify-center ${bg}`}
    >
      <Text className={`${fg} text-sm font-semibold`}>{emoji ?? label ?? ""}</Text>
    </View>
  );
}
