import { Pressable, Text, View } from "react-native";
import { GlassCapsule } from "./ui/GlassCapsule";
import { MenuIcon, UserIcon } from "./ui/Icons";
import type { AppView } from "../types";

type TopBarProps = {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
};

export function TopBar({ activeView, onChangeView }: TopBarProps) {
  const isChat = activeView === "chat";
  const isCommunity = activeView === "community";

  return (
    <View className="bg-bg">
      <View className="flex-row items-center justify-between px-4 pb-3 pt-2">
        {/* 左:三 — 玻璃胶囊 */}
        <GlassCapsule>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="打开钱包"
            onPress={() => onChangeView("wallet")}
            className="h-11 w-11 items-center justify-center active:opacity-70"
          >
            <MenuIcon size={22} />
          </Pressable>
        </GlassCapsule>

        {/* 中:对话/社区 — 分段玻璃胶囊 */}
        <GlassCapsule>
          <View className="flex-row items-center p-1">
            <SegmentTab label="对话" active={isChat} onPress={() => onChangeView("chat")} />
            <SegmentTab label="社区" active={isCommunity} onPress={() => onChangeView("community")} />
          </View>
        </GlassCapsule>

        {/* 右:人头 — 玻璃胶囊 */}
        <GlassCapsule>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="打开我的页面"
            onPress={() => onChangeView("profile")}
            className="h-11 w-11 items-center justify-center active:opacity-70"
          >
            <UserIcon size={22} />
          </Pressable>
        </GlassCapsule>
      </View>
    </View>
  );
}

function SegmentTab({
  label,
  active,
  onPress
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`rounded-full px-4 py-1.5 ${active ? "bg-ink" : ""}`}
    >
      <Text className={`text-[15px] font-semibold ${active ? "text-bg" : "text-ink2"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
