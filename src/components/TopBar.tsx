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
  const isAgent = activeView === "agent";

  return (
    <View style={{ backgroundColor: "transparent" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8 }}>
        {/* 左:钱包入口 — 玻璃胶囊 */}
        <GlassCapsule>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="打开钱包"
            onPress={() => onChangeView("wallet")}
            hitSlop={6}
            style={{ height: 44, width: 44, alignItems: "center", justifyContent: "center" }}
          >
            <MenuIcon size={22} />
          </Pressable>
        </GlassCapsule>

        {/* 中:对话 / 社区 / Agent — 三段玻璃胶囊 */}
        <GlassCapsule>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 4 }}>
            <SegmentTab label="对话" active={isChat} onPress={() => onChangeView("chat")} />
            <SegmentTab label="社区" active={isCommunity} onPress={() => onChangeView("community")} />
            <SegmentTab label="Agent" active={isAgent} onPress={() => onChangeView("agent")} />
          </View>
        </GlassCapsule>

        {/* 右:个人中心入口 — 玻璃胶囊 */}
        <GlassCapsule>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="打开我的页面"
            onPress={() => onChangeView("profile")}
            hitSlop={6}
            style={{ height: 44, width: 44, alignItems: "center", justifyContent: "center" }}
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
      hitSlop={4}
      style={{
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: active ? "#0F0F0F" : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontFamily: "Inter_600SemiBold",
          fontWeight: "600",
          color: active ? "#FFFFFF" : "#6B7280",
          letterSpacing: -0.3,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
