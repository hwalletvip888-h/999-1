import { Text, View } from "react-native";
import type { ChatMessage } from "../types";
import { DolphinLogo, type DolphinMood } from "./DolphinLogo";
import { TransactionCard } from "./TransactionCard";

type ChatBubbleProps = {
  message: ChatMessage;
  /** 海豚头像的情绪 — 通常只有"最新一条 AI 消息"会传 speaking/celebrating，其他保持 idle。 */
  avatarMood?: DolphinMood;
  onConfirmCard?: (cardId: string) => void;
  onCancelCard?: (cardId: string) => void;
};

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
          <Text className="text-[19px] leading-6 text-ink">{message.text}</Text>
        </View>
      </View>
    );
  }

  // AI: 海豚头像（裸） + 柔和气泡
  return (
    <View className="my-1.5 flex-row items-end px-4" style={{ gap: 6 }}>
      <View
        style={{
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
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
        <Text className="text-[16px] leading-6 text-ink">{message.text}</Text>
      </View>
    </View>
  );
}

