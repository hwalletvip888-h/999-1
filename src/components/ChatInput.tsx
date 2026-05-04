import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LightbulbIcon, MicIcon, PaperclipIcon, SendIcon } from "./ui/Icons";

type ChatInputProps = {
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
};

export function ChatInput({ value, placeholder, onChangeText, onSubmit }: ChatInputProps) {
  const insets = useSafeAreaInsets();
  const hasText = value.trim().length > 0;

  return (
    <View
      className="border-t border-line bg-bg px-3 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
    >
      <View
        style={{
          borderRadius: 24,
          backgroundColor: "#F7F7F8",
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 10,
          borderWidth: 1,
          borderColor: hasText ? "#E0D4F5" : "#ECECF1",
        }}
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
              style={{ height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 16 }}
            >
              <PaperclipIcon size={18} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="模式"
              hitSlop={6}
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
                backgroundColor: hasText ? "#7C3AED" : "#E5E5EA",
                shadowColor: hasText ? "#7C3AED" : "transparent",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: hasText ? 0.3 : 0,
                shadowRadius: 8,
                elevation: hasText ? 4 : 0,
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
