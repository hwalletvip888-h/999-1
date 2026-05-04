import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatBubble } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { DolphinLogo, type DolphinMood } from "../components/DolphinLogo";
import { CoinsIcon, SparkIcon, TrendUpIcon } from "../components/ui/Icons";
import type { FunctionComponent } from "react";
import { initialMessages } from "../data/mockData";
import { handleUserPrompt } from "../services/core/chatOrchestrator";
import { updateCardStatus } from "../services/core/cardsApi";
import { makeId } from "../utils/id";
import { nowLabel } from "../utils/format";
import type { CardStatus, ChatMessage, TradeCard } from "../types";

const TOP_BAR_HEIGHT = 80; // matches TopBar pt-2 + h-14 + pb-4

const easterTips = [
  "🐬 嗨～别戳我啦",
  "💡 试试问我：BTC 现在能开多吗？",
  "🚀 我会跳更高的哦！",
  "🤖 想让我跑个 Agent 帮你赚钱吗？",
  "🌊 戳够 100 次解锁隐藏成就",
  "✨ 你比 K 线更能看穿趋势",
  "🎯 给我一句话，我变出一张卡"
];

const quickPrompts: {
  text: string;
  Icon: FunctionComponent<{ size?: number; color?: string }>;
  bg: string;
  ring: string;
  iconColor: string;
}[] = [
  {
    text: "100U 开 BTC 永续做空",
    Icon: TrendUpIcon,
    bg: "#FEE2E2",
    ring: "#FECACA",
    iconColor: "#DC2626"
  },
  {
    text: "100U 兑换成 ETH",
    Icon: SparkIcon,
    bg: "#EEF2FF",
    ring: "#C7D2FE",
    iconColor: "#4338CA"
  },
  {
    text: "100U 质押到 Aave",
    Icon: CoinsIcon,
    bg: "#DCFCE7",
    ring: "#BBF7D0",
    iconColor: "#15803D"
  },
  {
    text: "跑一个 BTC 网格 Agent",
    Icon: SparkIcon,
    bg: "#F3E8FF",
    ring: "#E9D5FF",
    iconColor: "#7C3AED"
  }
];

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const [heroMood, setHeroMood] = useState<DolphinMood>("idle");
  const [easterTip, setEasterTip] = useState(0);
  const [easterShow, setEasterShow] = useState(false);
  const easterHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  const gazeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moodTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // 逐字输入：记录每条 AI 文本消息当前已露出的字符数
  const [revealLens, setRevealLens] = useState<Record<string, number>>({});
  const revealTimers = useRef<ReturnType<typeof setInterval>[]>([]);
  useEffect(
    () => () => {
      moodTimers.current.forEach(clearTimeout);
      revealTimers.current.forEach(clearInterval);
      if (easterHideTimer.current) clearTimeout(easterHideTimer.current);
      if (gazeTimer.current) clearTimeout(gazeTimer.current);
    },
    []
  );

  function scheduleMood(setter: (m: DolphinMood) => void, m: DolphinMood, after: number) {
    const t = setTimeout(() => setter(m), after);
    moodTimers.current.push(t);
  }

  function scrollToEndSoon() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }

  async function sendMessage(text = input) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: makeId("msg_user"),
      role: "user",
      kind: "text",
      text: trimmed,
      createdAt: nowLabel()
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setAiTyping(true);
    setHeroMood("thinking");
    scrollToEndSoon();

    // 加载节奏
    const loadingSteps = [
      "正在理解你的指令...",
      "正在检查参数与风险等级...",
      "正在生成卡片..."
    ];
    for (let i = 0; i < loadingSteps.length; i++) {
      await new Promise((res) => setTimeout(res, 500));
      setMessages((current) => [
        ...current,
        {
          id: makeId("msg_ai_loading"),
          role: "assistant",
          kind: "text",
          text: loadingSteps[i],
          createdAt: nowLabel()
        }
      ]);
      scrollToEndSoon();
    }

    // 业务主流程
    const result = await handleUserPrompt(trimmed);
    setAiTyping(false);
    // 移除 loading 气泡
    setMessages((current) => current.filter((m) => !m.id.startsWith("msg_ai_loading")));

    // clarify
    if (!result.ok || !result.data) {
      return;
    }
    const { replyText, card, clarifyQuestion } = result.data;
    if (clarifyQuestion) {
      setMessages((current) => [
        ...current,
        {
          id: makeId("msg_ai_clarify"),
          role: "assistant",
          kind: "text",
          text: clarifyQuestion ?? "",
          createdAt: nowLabel()
        }
      ]);
      setHeroMood("speaking");
      scheduleMood(setHeroMood, "idle", 800);
      scrollToEndSoon();
      return;
    }
    // replyText
    if (replyText) {
      setMessages((current) => [
        ...current,
        {
          id: makeId("msg_ai_reply"),
          role: "assistant",
          kind: "text",
          text: replyText,
          createdAt: nowLabel()
        }
      ]);
      setHeroMood("speaking");
      scheduleMood(setHeroMood, "idle", 800);
      scrollToEndSoon();
    }
    // 卡片
    if (card) {
      setMessages((current) => [
        ...current,
        {
          id: makeId("msg_ai_card"),
          role: "assistant",
          kind: "card",
          card: card,
          createdAt: nowLabel()
        }
      ]);
      setHeroMood("speaking");
      scheduleMood(setHeroMood, "idle", 800);
      scrollToEndSoon();
    }
  }

  function updateCardStatus(cardId: string, status: CardStatus) {
    setMessages((current) =>
      current.map((message) => {
        if (message.card?.id !== cardId) return message;
        return {
          ...message,
          card: {
            ...message.card,
            status
          }
        };
      })
    );
  }

  /** 不同卡类型，确认后落到不同的「最终态」并入库。 */
  function statusOnConfirm(card: TradeCard): CardStatus {
    switch (card.category) {
      case "agent":
        return "running"; // Agent → 进入运行中
      case "perpetual":
        return "executed"; // 合约 → 已成交
      case "swap":
        return "executed";
      case "stake":
        return "running"; // 质押 → 持续生息
      default:
        return "confirmed";
    }
  }

  function confirmCard(cardId: string) {
    // 1) 先将卡片状态设为 confirming
    setMessages((current) =>
      current.map((message) =>
        message.card?.id === cardId
          ? { ...message, card: { ...message.card, status: 'confirming' as import("../types/card").CardStatus } }
          : message
      )
    );
    setHeroMood("thinking");
    // 2) 显示“模拟执行中...”
    setMessages((current) => [
      ...current,
      {
        id: makeId("msg_ai_executing"),
        role: "assistant",
        kind: "text",
        text: "模拟执行中...",
        createdAt: nowLabel()
      }
    ]);
    scrollToEndSoon();
    // 3) 约 1 秒后，设为 executed，显示“已模拟执行成功”
    setTimeout(() => {
      setMessages((current) =>
        current.map((message) =>
          message.card?.id === cardId
            ? { ...message, card: { ...message.card, status: 'executed' as import("../types/card").CardStatus } }
            : message
        )
      );
      updateCardStatus(cardId, 'executed');
      setMessages((current) => [
        ...current,
        {
          id: makeId("msg_ai_executed"),
          role: "assistant",
          kind: "text",
          text: "已模拟执行成功。",
          createdAt: nowLabel()
        }
      ]);
      setHeroMood("celebrating");
      scheduleMood(setHeroMood, "idle", 1500);
      scrollToEndSoon();
    }, 1000);
  }

  function cancelCard(cardId: string) {
    setMessages((current) =>
      current.map((message) =>
        message.card?.id === cardId
          ? { ...message, card: { ...message.card, status: 'cancelled' as import("../types/card").CardStatus } }
          : message
      )
    );
    updateCardStatus(cardId, 'cancelled');
    setMessages((current) => [
      ...current,
      {
        id: makeId("msg_ai_cancel"),
        role: "assistant",
        kind: "text",
        text: "已取消。",
        createdAt: nowLabel()
      }
    ]);
    scrollToEndSoon();
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + TOP_BAR_HEIGHT : 0}
    >
      {messages.length === 0 ? (
        <View
          className="flex-1"
          onTouchStart={(e) => {
            // 让海豚把头转向用户最近一次触摸的位置
            const x = e.nativeEvent.pageX;
            const y = e.nativeEvent.pageY;
            setGaze({ x, y });
            if (gazeTimer.current) clearTimeout(gazeTimer.current);
            gazeTimer.current = setTimeout(() => setGaze(null), 1800);
          }}
        >
          {/* 中间品牌 — 跃出水面的海豚（可点彩蛋） */}
          <View className="flex-1 items-center justify-center">
            <Pressable
              onPress={() => {
                // 随机切 celebrating / speaking，1.5s 回 idle
                const next: DolphinMood = Math.random() < 0.6 ? "celebrating" : "speaking";
                setHeroMood(next);
                scheduleMood(setHeroMood, "idle", next === "celebrating" ? 1500 : 1100);
                setEasterTip((t) => (t + 1) % easterTips.length);
                if (easterHideTimer.current) clearTimeout(easterHideTimer.current);
                setEasterShow(true);
                easterHideTimer.current = setTimeout(() => setEasterShow(false), 1800);
              }}
              hitSlop={20}
            >
              <DolphinLogo size={200} mood={heroMood} gaze={gaze} />
            </Pressable>
            <Text
              className="mt-4 text-ink"
              style={{ fontSize: 24, fontWeight: "800", letterSpacing: -0.5, fontFamily: "Inter_800ExtraBold" }}
            >
              你好，我是 H
            </Text>
            <Text
              className="mt-1 text-muted"
              style={{ fontSize: 14, fontWeight: "500", fontFamily: "Inter_500Medium", letterSpacing: -0.2 }}
            >
              说一句话，我帮你下单 · 兑换 · 跑 Agent
            </Text>
            {/* 彩蛋提示气泡 */}
            {easterShow ? (
              <View
                style={{
                  marginTop: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 18,
                  backgroundColor: "rgba(124,58,237,0.10)",
                  borderWidth: 1,
                  borderColor: "rgba(124,58,237,0.25)"
                }}
              >
                <Text style={{ color: "#6D28D9", fontSize: 12, fontWeight: "700" }}>
                  {easterTips[easterTip]}
                </Text>
              </View>
            ) : null}
          </View>

          {/* 底部引导 + 能力卡 */}
          <View className="px-4 pb-3">
            {/* 今日机会 — 自动轮播 */}
            <OpportunityCarousel onPick={(prompt) => sendMessage(prompt)} />
            <Text className="mb-2.5 mt-3 px-1 text-[13px] font-medium text-muted">试试这些</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 8 }}
            >
              {quickPrompts.map(({ text, Icon, bg, ring, iconColor }) => (
                <Pressable
                  key={text}
                  accessibilityRole="button"
                  onPress={() => sendMessage(text)}
                  className="flex-row items-center rounded-2xl border bg-bg pl-2.5 pr-4 py-2.5 active:opacity-80"
                  style={{
                    borderColor: ring,
                    shadowColor: iconColor,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.08,
                    shadowRadius: 8
                  }}
                >
                  <View
                    style={{ backgroundColor: bg }}
                    className="mr-2.5 h-8 w-8 items-center justify-center rounded-xl"
                  >
                    <Icon size={18} color={iconColor} />
                  </View>
                  <Text className="text-[15px] font-medium text-ink">{text}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
        >
          {(() => {
            // 找到最后一条 AI 文本消息（卡片消息不算）
            let lastAiTextIdx = -1;
            for (let i = messages.length - 1; i >= 0; i--) {
              const m = messages[i];
              if (m.role === "assistant" && m.kind !== "card") {
                lastAiTextIdx = i;
                break;
              }
            }
            return messages.map((message, i) => {
              // AI 文本消息逐字露出
              let displayMsg = message;
              if (
                message.role === "assistant" &&
                message.kind === "text" &&
                message.text &&
                message.id in revealLens
              ) {
                const len = revealLens[message.id];
                if (len < message.text.length) {
                  displayMsg = { ...message, text: message.text.slice(0, len) };
                }
              }
              return (
                <ChatBubble
                  key={message.id}
                  message={displayMsg}
                  avatarMood={i === lastAiTextIdx ? heroMood : "idle"}
                  onConfirmCard={confirmCard}
                  onCancelCard={cancelCard}
                />
              );
            });
          })()}
          {aiTyping ? <TypingBubble /> : null}
        </ScrollView>
      )}

      <ChatInput
        value={input}
        placeholder="畅所欲问"
        onChangeText={setInput}
        onSubmit={() => sendMessage()}
      />
    </KeyboardAvoidingView>
  );
}

/* ─────────────────────────────────────────────
   TypingBubble — 海豚思考态 + 三点涟漪
   ───────────────────────────────────────────── */

function TypingBubble() {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);
  useEffect(() => {
    const cfg = { duration: 480, easing: Easing.inOut(Easing.quad) };
    const wave = (delay: number) =>
      withDelay(
        delay,
        withRepeat(
          withSequence(withTiming(1, cfg), withTiming(0, cfg)),
          -1,
          false
        )
      );
    dot1.value = wave(0);
    dot2.value = wave(160);
    dot3.value = wave(320);
  }, [dot1, dot2, dot3]);

  const s1 = useAnimatedStyle(() => ({
    opacity: 0.3 + dot1.value * 0.7,
    transform: [{ translateY: -dot1.value * 3 }]
  }));
  const s2 = useAnimatedStyle(() => ({
    opacity: 0.3 + dot2.value * 0.7,
    transform: [{ translateY: -dot2.value * 3 }]
  }));
  const s3 = useAnimatedStyle(() => ({
    opacity: 0.3 + dot3.value * 0.7,
    transform: [{ translateY: -dot3.value * 3 }]
  }));
  const dotStyles = [s1, s2, s3];

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
        <DolphinLogo size={36} compact mood="thinking" />
      </View>
      <View
        className="rounded-2xl rounded-bl-md px-4 py-3"
        style={{
          backgroundColor: "#F7F7F8",
          borderWidth: 1,
          borderColor: "#ECECF1",
          borderLeftWidth: 3,
          borderLeftColor: "#7C3AED",
          flexDirection: "row",
          alignItems: "center",
          gap: 4
        }}
      >
        {dotStyles.map((style, i) => (
          <Animated.View
            key={i}
            style={[
              {
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "#7C3AED"
              },
              style
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────
   OpportunityCarousel — 今日机会自动轮播
   ───────────────────────────────────────────── */

const opportunities = [
  {
    id: "btc-grid",
    tag: "震荡机会",
    tagColor: "#0E7490",
    tagBg: "#ECFEFF",
    emoji: "🔲",
    title: "BTC 在 78k 附近震荡 3 天",
    sub: "适合挂网格，区间套利",
    cta: "跑一个 BTC 网格 Agent",
    accent: "#0E7490"
  },
  {
    id: "eth-stake",
    tag: "稳健生息",
    tagColor: "#047857",
    tagBg: "#ECFDF5",
    emoji: "🌱",
    title: "Aave 上 USDC 年化 5.8%",
    sub: "比放 USDT 钱包香",
    cta: "100U 质押到 Aave",
    accent: "#047857"
  },
  {
    id: "sol-momentum",
    tag: "动量信号",
    tagColor: "#B91C1C",
    tagBg: "#FEF2F2",
    emoji: "📈",
    title: "SOL 突破前高 + 放量",
    sub: "短线追多机会，注意止损",
    cta: "100U 开 SOL 永续做多",
    accent: "#B91C1C"
  },
  {
    id: "btc-eth-rotation",
    tag: "结构机会",
    tagColor: "#4338CA",
    tagBg: "#EEF2FF",
    emoji: "🔄",
    title: "ETH/BTC 跌到 0.052 关键位",
    sub: "可考虑轮动到 ETH",
    cta: "100U 兑换成 ETH",
    accent: "#4338CA"
  }
];

function OpportunityCarousel({ onPick }: { onPick: (prompt: string) => void }) {
  const [idx, setIdx] = useState(0);
  const fade = useSharedValue(1);
  useEffect(() => {
    const t = setInterval(() => {
      fade.value = withTiming(0, { duration: 220 }, (done) => {
        if (done) {
          fade.value = withTiming(1, { duration: 360 });
        }
      });
      // 在淡出过半时切下一张
      setTimeout(() => setIdx((i) => (i + 1) % opportunities.length), 220);
    }, 4200);
    return () => clearInterval(t);
  }, [fade]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 6 }]
  }));

  const op = opportunities[idx];

  return (
    <View>
      <View className="mb-2 flex-row items-center justify-between px-1">
        <Text className="text-[13px] font-medium text-muted">今日机会</Text>
        <View className="flex-row" style={{ gap: 4 }}>
          {opportunities.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === idx ? 14 : 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: i === idx ? "#0F0F0F" : "#D1D5DB"
              }}
            />
          ))}
        </View>
      </View>
      <Animated.View style={fadeStyle}>
        <Pressable
          onPress={() => onPick(op.cta)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#FFFFFF",
            borderRadius: 18,
            padding: 12,
            borderWidth: 1,
            borderColor: "#F1F3F5",
            shadowColor: op.accent,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.16,
            shadowRadius: 14,
            elevation: 4,
            gap: 12
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: op.tagBg,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Text style={{ fontSize: 22 }}>{op.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                  borderRadius: 6,
                  backgroundColor: op.tagBg
                }}
              >
                <Text style={{ color: op.tagColor, fontSize: 9.5, fontWeight: "800" }}>
                  {op.tag}
                </Text>
              </View>
              <Text className="text-[10px] text-muted">5/3 实时分析</Text>
            </View>
            <Text className="mt-1 text-[14px] font-bold text-ink" numberOfLines={1}>
              {op.title}
            </Text>
            <Text className="mt-0.5 text-[11.5px] text-muted" numberOfLines={1}>
              {op.sub}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 12,
              backgroundColor: op.accent
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "800" }}>问 H</Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}
