import { Pressable, Text, View } from "react-native";
import { Surface } from "./ui/Surface";
import type { MarketQuote } from "../types";

type MarketCardProps = {
  quote: MarketQuote;
  onDetail?: () => void;
  onTrade?: () => void;
};

function MiniSpark({ data, up }: { data: number[]; up: boolean }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = Math.max(max - min, 0.0001);
  const color = up ? "#10B981" : "#EF4444";
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 1, height: 24 }}>
      {data.map((v, i) => {
        const h = Math.max(2, Math.round(((v - min) / span) * 22));
        return (
          <View
            key={i}
            style={{ width: 3, height: h, backgroundColor: color, opacity: 0.5 + (i / data.length) * 0.5, borderRadius: 1 }}
          />
        );
      })}
    </View>
  );
}

export function MarketCard({ quote, onDetail, onTrade }: MarketCardProps) {
  const up = quote.trend === "up";
  return (
    <Surface padded={false} className="w-full">
      <View className="px-3.5 py-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="h-6 w-6 items-center justify-center rounded-full bg-surface">
              <Text className="text-[19px] font-semibold text-ink">{quote.icon}</Text>
            </View>
            <Text className="text-[16px] font-semibold text-ink">{quote.pair}</Text>
          </View>
          <MiniSpark data={quote.spark} up={up} />
        </View>
        <View className="mt-2 flex-row items-baseline">
          <Text className="text-[20px] font-semibold text-ink">{quote.price}</Text>
          <Text className={`ml-2 text-[16px] ${up ? "text-emerald-600" : "text-red-500"}`}>
            {up ? "↗" : "↘"} {quote.change24h}
          </Text>
        </View>
        <View className="mt-2.5 flex-row gap-2">
          <Pressable onPress={onDetail} className="flex-1 items-center rounded-full border border-line py-1.5 active:bg-surface">
            <Text className="text-[16px] text-ink2">查看详情</Text>
          </Pressable>
          <Pressable onPress={onTrade} className="flex-1 items-center rounded-full bg-ink py-1.5">
            <Text className="text-[16px] font-semibold text-bg">立即交易</Text>
          </Pressable>
        </View>
      </View>
    </Surface>
  );
}
