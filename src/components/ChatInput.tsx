import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "./ui/Button";
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
      <View className="rounded-3xl bg-surface px-3 pt-3 pb-2.5">
        <TextInput
          value={value}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          returnKeyType="send"
          multiline
          className="min-h-7 max-h-32 px-1 text-[19px] text-ink"
        />

        <View className="mt-2 flex-row items-center justify-between">
          <View className="flex-row items-center gap-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="附件"
              className="h-8 w-8 items-center justify-center rounded-full active:bg-bg"
            >
              <PaperclipIcon size={18} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="模式"
              className="flex-row items-center gap-1 rounded-full px-2.5 py-1.5 active:bg-bg"
            >
              <LightbulbIcon size={16} />
              <Text className="text-[16px] text-ink2">Expert</Text>
            </Pressable>
          </View>

          <View className="flex-row items-center gap-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="语音"
              className="h-8 w-8 items-center justify-center rounded-full active:bg-bg"
            >
              <MicIcon size={18} />
            </Pressable>
            <Button
              label={hasText ? "发送" : "开始说话"}
              size="sm"
              variant="primary"
              breathing
              onPress={hasText ? onSubmit : undefined}
              leading={
                hasText ? (
                  <SendIcon size={14} color="#FFFFFF" />
                ) : (
                  <MicIcon size={14} color="#FFFFFF" />
                )
              }
            />
          </View>
        </View>
      </View>
    </View>
  );
}
