import { Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { uiCategoryColors, uiShadow } from "../theme/uiSystem";

type QuickAction = {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  category: keyof typeof uiCategoryColors;
  message: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "deposit",
    label: "充值",
    sublabel: "获取收款地址",
    icon: "⬇️",
    category: "deposit",
    message: "充值地址",
  },
  {
    id: "transfer",
    label: "提现",
    sublabel: "转账到外部地址",
    icon: "⬆️",
    category: "transfer",
    message: "我要提现",
  },
  {
    id: "swap",
    label: "兑换",
    sublabel: "链上代币互换",
    icon: "🔄",
    category: "swap",
    message: "我要兑换",
  },
];

type QuickActionBarProps = {
  onAction: (message: string) => void;
};

export function QuickActionBar({ onAction }: QuickActionBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 8, flexDirection: "row" }}
    >
      {QUICK_ACTIONS.map((action) => {
        const colors = uiCategoryColors[action.category];
        return (
          <Pressable
            key={action.id}
            accessibilityRole="button"
            onPress={() => onAction(action.message)}
            style={({ pressed }) => [
              uiShadow.float,
              {
                borderRadius: 16,
                overflow: "hidden",
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            <LinearGradient
              colors={colors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 110,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 16,
              }}
            >
              <Text style={{ fontSize: 22, marginBottom: 4 }}>{action.icon}</Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: "#FFFFFF",
                  fontFamily: "Inter_700Bold",
                  letterSpacing: -0.3,
                }}
              >
                {action.label}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.80)",
                  fontFamily: "Inter_400Regular",
                  marginTop: 1,
                }}
              >
                {action.sublabel}
              </Text>
            </LinearGradient>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
