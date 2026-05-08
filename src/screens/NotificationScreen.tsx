import { Pressable, ScrollView, Text, View } from "react-native";
import { ArrowLeftIcon, BellIcon } from "../components/ui/Icons";
import { Surface } from "../components/ui/Surface";
import type { AppView } from "../types";
import { uiColors, uiSpace } from "../theme/uiSystem";

type NotificationScreenProps = {
  onChangeView: (view: AppView) => void;
};

const platformMessages = [
  { id: "p1", title: "系统升级通知", desc: "今晚 23:30-23:45 将进行短时维护。", time: "刚刚" },
  { id: "p2", title: "新功能上线", desc: "Agent 运营位支持轮播与跳转。", time: "18 分钟前" }
];

const tradeMessages = [
  { id: "t1", title: "BTC 网格 Agent 已启动", desc: "策略已进入运行态，可在 Agent 中心查看。", time: "2 分钟前" },
  { id: "t2", title: "链上赚币信号触发", desc: "发现 Aave 稳健机会，预估年化 5.8%。", time: "14 分钟前" }
];

export function NotificationScreen({ onChangeView }: NotificationScreenProps) {
  return (
    <View style={{ flex: 1, backgroundColor: uiColors.appBg }}>
      <View className="flex-row items-center justify-between px-3 pb-2 pt-1">
        <Pressable
          accessibilityRole="button"
          onPress={() => onChangeView("wallet")}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface"
        >
          <ArrowLeftIcon size={22} />
        </Pressable>
        <Text className="text-[17px] font-semibold text-ink">消息通知</Text>
        <View className="h-10 w-10 items-center justify-center rounded-full">
          <BellIcon size={20} />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 8 }}>
          <Text className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-muted">平台消息</Text>
          <Surface padded={false} elevation={1}>
            {platformMessages.map((m, idx) => (
              <View key={m.id} className={`px-4 py-3.5 ${idx > 0 ? "border-t border-line" : ""}`}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[14px] font-semibold text-ink">{m.title}</Text>
                  <Text className="text-[11px] text-muted">{m.time}</Text>
                </View>
                <Text className="mt-1 text-[12px] text-ink2">{m.desc}</Text>
              </View>
            ))}
          </Surface>
        </View>

        <View style={{ paddingHorizontal: uiSpace.pageX, marginTop: 14 }}>
          <Text className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-muted">重要交易通知</Text>
          <Surface padded={false} elevation={1}>
            {tradeMessages.map((m, idx) => (
              <View key={m.id} className={`px-4 py-3.5 ${idx > 0 ? "border-t border-line" : ""}`}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[14px] font-semibold text-ink">{m.title}</Text>
                  <Text className="text-[11px] text-muted">{m.time}</Text>
                </View>
                <Text className="mt-1 text-[12px] text-ink2">{m.desc}</Text>
              </View>
            ))}
          </Surface>
        </View>
      </ScrollView>
    </View>
  );
}

