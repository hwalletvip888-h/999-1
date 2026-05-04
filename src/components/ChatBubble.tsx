import { StyleSheet, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import type { ChatMessage } from "../types";
import { DolphinLogo, type DolphinMood } from "./DolphinLogo";
import { TransactionCard } from "./TransactionCard";

type ChatBubbleProps = {
  message: ChatMessage;
  avatarMood?: DolphinMood;
  onConfirmCard?: (cardId: string) => void;
  onCancelCard?: (cardId: string) => void;
};

const mdStyles = StyleSheet.create({
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: "#0F0F0F",
    fontFamily: "Inter_400Regular",
  },
  strong: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  heading1: {
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 4,
    color: "#0F0F0F",
  },
  heading2: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 4,
    color: "#0F0F0F",
  },
  heading3: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    marginBottom: 4,
    marginTop: 4,
    color: "#0F0F0F",
  },
  code_inline: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 14,
    backgroundColor: "#F0EDF5",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    color: "#7C3AED",
  },
  fence: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 13,
    backgroundColor: "#1E1E2E",
    color: "#CDD6F4",
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  code_block: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 13,
    backgroundColor: "#1E1E2E",
    color: "#CDD6F4",
    borderRadius: 12,
    padding: 12,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    marginVertical: 2,
  },
  blockquote: {
    backgroundColor: "#F5F3FF",
    borderLeftWidth: 3,
    borderLeftColor: "#7C3AED",
    paddingLeft: 12,
    paddingVertical: 6,
    marginVertical: 6,
    borderRadius: 4,
  },
  link: {
    color: "#7C3AED",
    textDecorationLine: "underline",
  },
  paragraph: {
    marginVertical: 2,
  },
});

export function ChatBubble({
  message,
  avatarMood = "idle",
  onConfirmCard,
  onCancelCard
}: ChatBubbleProps) {
  if (message.kind === "card" && message.card) {
    return <TransactionCard card={message.card} onConfirm={onConfirmCard} onCancel={onCancelCard} />;
  }

  const isUser = message.role === "user";

  if (isUser) {
    return (
      <View className="my-1.5 items-end px-4">
        <View className="max-w-[82%] rounded-3xl bg-surface2 px-4 py-2.5">
          <Text style={{ fontSize: 16, lineHeight: 24, color: "#0F0F0F", fontFamily: "Inter_400Regular" }}>
            {message.text}
          </Text>
        </View>
      </View>
    );
  }

  // AI message with Markdown rendering
  return (
    <View className="my-1.5 flex-row items-end px-4" style={{ gap: 6 }}>
      <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
        <DolphinLogo size={36} compact mood={avatarMood} />
      </View>
      <View
        className="max-w-[82%] rounded-2xl rounded-bl-md px-4 py-2.5"
        style={{
          backgroundColor: "#F7F7F8",
          borderWidth: 1,
          borderColor: "#ECECF1",
          borderLeftWidth: 3,
          borderLeftColor: "#7C3AED"
        }}
      >
        <Markdown style={mdStyles}>{message.text || ""}</Markdown>
      </View>
    </View>
  );
}
