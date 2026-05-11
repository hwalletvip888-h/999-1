import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LightbulbIcon, MicIcon, PaperclipIcon, SendIcon } from "./ui/Icons";
import { QuickActionBar } from "./QuickActionBar";
import { uiShadow } from "../theme/uiSystem";
import { toastBus } from "../services/toastBus";

type ChatInputProps = {
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  onQuickAction?: (message: string) => void;
};

export function ChatInput({ value, placeholder, onChangeText, onSubmit, onQuickAction }: ChatInputProps) {
  const insets = useSafeAreaInsets();
  const hasText = value.trim().length > 0;
  const showQuickBar = onQuickAction && !hasText;

  return (
    <View
      style={{
        backgroundColor: "rgba(255,255,255,0.85)",
        borderTopWidth: 1,
        borderTopColor: "rgba(108,63,197,0.12)",
        paddingHorizontal: 12,
        paddingTop: showQuickBar ? 4 : 8,
        paddingBottom: Math.max(insets.bottom, 10),
      }}
    >
      {showQuickBar ? <QuickActionBar onAction={onQuickAction} /> : null}
      <View
        style={[
          {
            borderRadius: 24,
            backgroundColor: "rgba(255,255,255,0.92)",
            paddingHorizontal: 14,
            paddingTop: 12,
            paddingBottom: 10,
            borderWidth: 1,
            borderColor: hasText ? "rgba(108,63,197,0.32)" : "rgba(108,63,197,0.14)",
            marginTop: showQuickBar ? 4 : 0,
          },
          hasText ? uiShadow.float : uiShadow.cardSoft,
        ]}
      >
        <TextInput
          value={value}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          returnKeyType="send"
          multiline
          style={{
            minHeight: 28,
            maxHeight: 128,
            paddingHorizontal: 4,
            fontSize: 17,
            fontFamily: "Inter_400Regular",
            color: "#0F0F0F",
            letterSpacing: -0.2,
          }}
        />
        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="附件"
              hitSlop={8}
              onPress={() => toastBus.push({ emoji: "📎", title: "图片/文件", subtitle: "文件上传功能即将上线", tone: "info", duration: 2000 })}
              style={{ height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 16 }}
            >
              <PaperclipIcon size={18} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="模式"
              hitSlop={6}
              onPress={() => toastBus.push({ emoji: "🧠", title: "Expert 模式", subtitle: "深度分析模式即将上线", tone: "info", duration: 2000 })}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <LightbulbIcon size={16} />
              <Text style={{ fontSize: 14, color: "#6B7280", fontFamily: "Inter_500Medium" }}>Expert</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="语音"
              hitSlop={8}
              onPress={() => toastBus.push({ emoji: "🎙️", title: "语音输入", subtitle: "语音识别功能即将上线", tone: "info", duration: 2000 })}
              style={{ height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 16 }}
            >
              <MicIcon size={18} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="发送"
              onPress={onSubmit}
              disabled={!hasText}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{
                height: 36,
                width: 36,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 18,
                backgroundColor: hasText ? "#6C3FC5" : "#E5E5EA",
                shadowColor: hasText ? "#6C3FC5" : "transparent",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: hasText ? 0.35 : 0,
                shadowRadius: 10,
                elevation: hasText ? 6 : 0,
              }}
            >
              <SendIcon size={18} color={hasText ? "#FFFFFF" : "#9CA3AF"} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
