import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Markdown from "react-native-markdown-display";
import type { ChatMessage } from "../types";
import { DolphinLogo, type DolphinMood } from "./DolphinLogo";
import { TransactionCard } from "./TransactionCard";
import { AIStepIndicator } from "./AIStepIndicator";
import { uiShadow } from "../theme/uiSystem";

type ChatBubbleProps = {
  message: ChatMessage;
  avatarMood?: DolphinMood;
  onConfirmCard?: (cardId: string) => void;
  onCancelCard?: (cardId: string) => void;
  onConfirmTransferSelect?: (cardId: string, address: string, amount: number, symbol: string) => void;
};

/**
 * Markdown 样式 — 专业、美观、有层次
 * 配合结构化 replyText 使用
 */
const mdStyles = StyleSheet.create({
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#1A1A1A",
    fontFamily: "Inter_400Regular",
  },
  strong: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#0F0F0F",
  },
  heading1: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 6,
    color: "#0F0F0F",
  },
  heading2: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 4,
    color: "#0F0F0F",
  },
  heading3: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    marginBottom: 4,
    marginTop: 4,
    color: "#1A1A1A",
  },
  code_inline: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 13,
    backgroundColor: "#F0EDF5",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    color: "#7C3AED",
  },
  fence: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12,
    backgroundColor: "#1E1E2E",
    color: "#CDD6F4",
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  code_block: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12,
    backgroundColor: "#1E1E2E",
    color: "#CDD6F4",
    borderRadius: 10,
    padding: 12,
  },
  bullet_list: {
    marginVertical: 4,
    paddingLeft: 2,
  },
  ordered_list: {
    marginVertical: 4,
    paddingLeft: 2,
  },
  list_item: {
    marginVertical: 3,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  blockquote: {
    backgroundColor: "#F5F3FF",
    borderLeftWidth: 3,
    borderLeftColor: "#7C3AED",
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 8,
    borderRadius: 6,
  },
  link: {
    color: "#7C3AED",
    textDecorationLine: "underline",
  },
  paragraph: {
    marginVertical: 3,
    lineHeight: 22,
  },
  hr: {
    backgroundColor: "#E5E7EB",
    height: 1,
    marginVertical: 10,
  },
  em: {
    fontStyle: "italic",
    color: "#6B7280",
  },
});

export function ChatBubble({
  message,
  avatarMood = "idle",
  onConfirmCard,
  onCancelCard,
  onConfirmTransferSelect,
}: ChatBubbleProps) {
  if (message.kind === "card" && message.card) {
    return (
      <TransactionCard
        card={message.card}
        onConfirm={onConfirmCard}
        onCancel={onCancelCard}
        onConfirmTransferSelect={onConfirmTransferSelect}
      />
    );
  }

  // AI 步骤进度展示
  if (message.kind === "steps" && message.steps) {
    return <AIStepIndicator steps={message.steps} />;
  }

  const isUser = message.role === "user";

  if (isUser) {
    return (
      <View className="my-1.5 items-end px-4">
        <LinearGradient
          colors={["#9B6DFF", "#6C3FC5"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            {
              maxWidth: "82%",
              borderRadius: 20,
              borderBottomRightRadius: 6,
              paddingHorizontal: 16,
              paddingVertical: 10,
            },
            uiShadow.float,
          ]}
        >
          <Text style={{ fontSize: 15, lineHeight: 22, color: "#FFFFFF", fontFamily: "Inter_500Medium" }}>
            {message.text}
          </Text>
        </LinearGradient>
      </View>
    );
  }

  // AI message — 玻璃化气泡（白色半透 + 紫色左边 + 柔阴影）
  return (
    <View className="my-2 flex-row items-end px-4" style={{ gap: 6 }}>
      <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
        <DolphinLogo size={36} compact mood={avatarMood} />
      </View>
      <View
        className="max-w-[82%]"
        style={[
          {
            backgroundColor: "rgba(255,255,255,0.92)",
            borderWidth: 1,
            borderColor: "rgba(108,63,197,0.14)",
            borderLeftWidth: 3,
            borderLeftColor: "#9B6DFF",
            borderRadius: 18,
            borderBottomLeftRadius: 6,
            paddingHorizontal: 14,
            paddingVertical: 10,
          },
          uiShadow.cardSoft,
        ]}
      >
        <Markdown style={mdStyles}>{message.text || ""}</Markdown>
      </View>
    </View>
  );
}
