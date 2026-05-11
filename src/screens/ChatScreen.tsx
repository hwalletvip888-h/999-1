import { useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
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
// 初始消息为空，用户进入后看到海豚引导页
const initialMessages: import("../types").ChatMessage[] = [];
import { handleUserPrompt } from "../services/core/chatOrchestrator";
import { formatHwalletErrorForUser } from "../services/hwalletErrorUi";
import { updateCardStatus } from "../services/core/cardsApi";
import { loadSession } from "../services/walletApi";
import { callBackend } from "../api/providers/okx/onchain/hwalletBackendFetch";
import { cardLibrary } from "../services/cardLibrary";
import { makeId } from "../utils/id";
import { nowLabel } from "../utils/format";
import type { AIStep, CardStatus, ChatMessage, TradeCard } from "../types";
import { uiColors, uiSpace } from "../theme/uiSystem";
import { saveConversation, saveCard, trackEventQuick } from "../services/core/dataApi";

const TOP_BAR_HEIGHT = 80; // matches TopBar pt-2 + h-14 + pb-4

// Web 平台不需要 KeyboardAvoidingView，用 View 代替
const KAVWrapper = Platform.OS === 'web' ? View : KeyboardAvoidingView;

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
  const confirmedAddressesRef = useRef<Set<string>>(new Set());
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
  /** 取消上一次尚未完成的编排请求（意图 + 闲聊 fetch） */
  const promptAbortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      promptAbortRef.current?.abort();
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

    const priorMessages = messages;
    const chatHistory = priorMessages
      .filter(
        (m) =>
          m.kind === "text" &&
          Boolean(m.text?.trim()) &&
          (m.role === "user" || m.role === "assistant"),
      )
      .slice(-20)
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: (m.text || "").trim(),
      }));

    promptAbortRef.current?.abort();
    promptAbortRef.current = new AbortController();
    const abortSignal = promptAbortRef.current.signal;

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

    // 步骤指示器消息 ID
    const stepsMessageId = makeId("msg_ai_steps");

    // 插入步骤指示器消息
    setMessages((current) => [
      ...current,
      {
        id: stepsMessageId,
        role: "assistant",
        kind: "steps",
        steps: [{ id: 's1', label: '理解你的意图', icon: '🧠', status: 'active' as const }],
        createdAt: nowLabel()
      }
    ]);
    scrollToEndSoon();

    // 步骤回调 — 实时更新步骤指示器
    const onStep = (updatedSteps: AIStep[]) => {
      setMessages((current) =>
        current.map((m) =>
          m.id === stepsMessageId
            ? { ...m, steps: updatedSteps }
            : m
        )
      );
      scrollToEndSoon();
    };

    try {
      const result = await handleUserPrompt(trimmed, onStep, { chatHistory, abortSignal, confirmedAddresses: [...confirmedAddressesRef.current] });

      if (!result.ok || !result.data) {
        const errLine = result.errorMsg
          ? formatHwalletErrorForUser(new Error(result.errorMsg))
          : !result.data
          ? "服务暂时不可用，请稍后重试。"
          : "处理失败，请稍后重试。";
        setMessages((current) =>
          current.map((m) =>
            m.id === stepsMessageId && m.kind === "steps"
              ? {
                  ...m,
                  steps: (m.steps ?? []).map((s) =>
                    s.status === "active" || s.status === "pending"
                      ? { ...s, status: "error" as const }
                      : s,
                  ),
                }
              : m,
          ),
        );
        setMessages((current) => [
          ...current,
          {
            id: makeId("msg_ai_err"),
            role: "assistant",
            kind: "text",
            text: `⚠️ ${errLine}`,
            createdAt: nowLabel(),
          },
        ]);
        setHeroMood("idle");
        scrollToEndSoon();
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

    // ─── 数据持久化：自动保存对话、卡片、事件 ───
    // 静默执行，不阻塞 UI
    (async () => {
      try {
        // 1. 保存对话
        const convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        saveConversation({
          id: convId,
          title: trimmed.slice(0, 40),
          messages: [
            { role: "user", content: trimmed, createdAt: new Date().toISOString() },
            ...(replyText ? [{ role: "assistant" as const, content: replyText, createdAt: new Date().toISOString() }] : []),
          ],
        });

        // 2. 保存卡片（如果有）
        if (card) {
          saveCard({
            id: card.id,
            actionType: card.module || card.cardType || "unknown",
            symbol: card.symbol,
            amount: card.amount,
            cardData: card,
            conversationId: convId,
          });
        }

        // 3. 追踪事件
        trackEventQuick("user_message_sent", {
          action: card?.module || "chat",
          symbol: card?.symbol,
        });
      } catch {
        // 持久化失败不阻塞用户
      }
    })();
    } catch (e) {
      const errLine = formatHwalletErrorForUser(e);
      setMessages((current) =>
        current.map((m) =>
          m.id === stepsMessageId && m.kind === "steps"
            ? {
                ...m,
                steps: (m.steps ?? []).map((s) =>
                  s.status === "active" || s.status === "pending"
                    ? { ...s, status: "error" as const }
                    : s,
                ),
              }
            : m,
        ),
      );
      setMessages((current) => [
        ...current,
        {
          id: makeId("msg_ai_err"),
          role: "assistant",
          kind: "text",
          text: `⚠️ ${formatHwalletErrorForUser(e)}`,
          createdAt: nowLabel(),
        },
      ]);
      setHeroMood("idle");
      scrollToEndSoon();
    } finally {
      setAiTyping(false);
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

  /**
   * 不同卡类型，确认后落到不同的「最终态」并入库。
   * 优先看 productLine + module（V5/V6 协议），向后兼容老的 category 字段。
   */
  function statusOnConfirm(card: TradeCard): CardStatus {
    // V5：合约即时成交；网格 → 持续运行
    if (card.productLine === "v5") {
      if (card.module === "perpetual") return "executed";
      if (card.module === "grid") return "running";
    }
    // V6：链上 swap 即时成交；赚币持续运行
    if (card.productLine === "v6") {
      if (card.module === "swap") return "executed";
      if (card.module === "earn") return "running";
      if (card.module === "wallet") return "executed";
    }
    // 兼容旧 category 字段
    switch (card.category) {
      case "agent": return "running";
      case "perpetual": return "executed";
      case "swap": return "executed";
      case "stake": return "running";
      case "earn": return "running";
      case "grid": return "running";
      default: return "confirmed";
    }
  }

  /** 根据卡片产品线/类型给个文案，让 AI 反馈更准 */
  function executionReplyFor(card: TradeCard, status: CardStatus): string {
    if (status === "running") {
      if (card.productLine === "v6") return "✅ 已上链并启动，策略将持续生息，可在 Agent 中心查看。";
      return "✅ 策略已启动，正在运行中，可在 Agent 中心查看实时数据。";
    }
    if (status === "executed") {
      if (card.productLine === "v6") return "✅ 链上交易已确认，卡片已保存到卡库。";
      return "✅ 已成交，卡片已保存到卡库。";
    }
    return "✅ 已确认，卡片已保存到卡库。";
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

    // 找到当前卡片
    const targetCard = messages.find((m) => m.card?.id === cardId)?.card;

    // ─── Swap 卡片：调真实 BFF 执行兑换 ───
    if (targetCard?.module === 'swap' && targetCard?.fromSymbol && targetCard?.toSymbol) {
      setMessages((current) => [
        ...current,
        { id: makeId("msg_ai_executing"), role: "assistant", kind: "text", text: "兑换中，等待链上确认...", createdAt: nowLabel() }
      ]);
      scrollToEndSoon();

      (async () => {
        try {
          const session = await loadSession();
          if (!session?.token) throw new Error("未登录，请先在钱包页面完成登录");

          const execRes = await callBackend<any>('/api/v6/dex/swap-execute', {
            token: session.token,
            body: {
              fromChain: targetCard.swapChain || 'eth',
              fromSymbol: targetCard.fromSymbol,
              fromAmount: String(targetCard.fromAmount ?? 0),
              toChain: targetCard.swapChain || 'eth',
              toSymbol: targetCard.toSymbol,
              slippageBps: 50,
            },
          });

          if (!execRes?.ok) throw new Error(execRes?.error || '兑换提交失败');

          const txHash: string = execRes?.txHash ?? '';
          const finalStatus: import("../types/card").CardStatus = 'executed';

          setMessages((current) =>
            current.map((m) =>
              m.card?.id === cardId ? { ...m, card: { ...m.card!, status: finalStatus } } : m
            )
          );
          updateCardStatus(cardId, finalStatus);
          if (targetCard) {
            const auditTrail = [
              ...(targetCard.auditTrail ?? []),
              { ts: Date.now(), actor: "user" as const, action: "confirm", detail: targetCard.aiSummary }
            ];
            cardLibrary.add({ ...targetCard, status: finalStatus, auditTrail });
          }
          setMessages((current) => [
            ...current,
            {
              id: makeId("msg_ai_executed"),
              role: "assistant",
              kind: "text",
              text: `✅ **兑换成功！**\n\n已将 **${targetCard.fromAmount} ${targetCard.fromSymbol}** 兑换为 **${targetCard.toAmount?.toFixed ? targetCard.toAmount.toFixed(6) : targetCard.toAmount} ${targetCard.toSymbol}**${txHash ? `\n交易哈希：\`${txHash.slice(0, 12)}...\`` : ''}`,
              createdAt: nowLabel()
            }
          ]);
        } catch (e: any) {
          setMessages((current) =>
            current.map((m) =>
              m.card?.id === cardId ? { ...m, card: { ...m.card!, status: 'failed' as import("../types/card").CardStatus } } : m
            )
          );
          setMessages((current) => [
            ...current,
            { id: makeId("msg_ai_err"), role: "assistant", kind: "text", text: `⚠️ ${formatHwalletErrorForUser(e)}`, createdAt: nowLabel() }
          ]);
        }
        setHeroMood("celebrating");
        scheduleMood(setHeroMood, "idle", 1500);
        scrollToEndSoon();
      })();
      return;
    }

    // ─── 转账卡片：真实调用 BFF 发送 ───
    if (targetCard?.toAddress && targetCard?.transferChain) {      setMessages((current) => [
        ...current,
        { id: makeId("msg_ai_executing"), role: "assistant", kind: "text", text: "发送中...", createdAt: nowLabel() }
      ]);
      scrollToEndSoon();

      (async () => {
        try {
          const session = await loadSession();
          if (!session?.token) throw new Error("未登录，请先在钱包页面完成登录");

          const sendRes = await callBackend<any>('/api/v6/wallet/send', {
            token: session.token,
            body: {
              chain: targetCard.transferChain,
              symbol: targetCard.symbol ?? 'USDT',
              toAddress: targetCard.toAddress,
              amount: targetCard.amount ?? 0,
            },
          });

          const txHash: string = sendRes?.txHash ?? sendRes?.orderId ?? '';
          const finalStatus: import("../types/card").CardStatus = 'executed';

          // 记录该地址为已确认
          confirmedAddressesRef.current.add(targetCard.toAddress!);

          setMessages((current) =>
            current.map((m) =>
              m.card?.id === cardId ? { ...m, card: { ...m.card!, status: finalStatus } } : m
            )
          );
          updateCardStatus(cardId, finalStatus);
          if (targetCard) {
            const auditTrail = [
              ...(targetCard.auditTrail ?? []),
              { ts: Date.now(), actor: "user" as const, action: "confirm", detail: targetCard.aiSummary }
            ];
            cardLibrary.add({ ...targetCard, status: finalStatus, auditTrail });
          }
          setMessages((current) => [
            ...current,
            {
              id: makeId("msg_ai_executed"),
              role: "assistant",
              kind: "text",
              text: `✅ 转账成功！已向 \`${targetCard.toAddress!.slice(0, 6)}...${targetCard.toAddress!.slice(-4)}\` 转出 **${targetCard.amount ?? ''} ${targetCard.symbol ?? ''}**${txHash ? `\n交易哈希：\`${txHash.slice(0, 12)}...\`` : ''}`,
              createdAt: nowLabel()
            }
          ]);
        } catch (e: any) {
          setMessages((current) =>
            current.map((m) =>
              m.card?.id === cardId ? { ...m, card: { ...m.card!, status: 'cancelled' as import("../types/card").CardStatus } } : m
            )
          );
          setMessages((current) => [
            ...current,
            { id: makeId("msg_ai_err"), role: "assistant", kind: "text", text: `⚠️ ${formatHwalletErrorForUser(e)}`, createdAt: nowLabel() }
          ]);
        }
        setHeroMood("celebrating");
        scheduleMood(setHeroMood, "idle", 1500);
        scrollToEndSoon();
      })();
      return;
    }

    // 2) 普通卡片：显示"模拟执行中..."
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
    // 3) 约 1 秒后，根据卡片类型决定最终状态，归档到卡库
    setTimeout(() => {
      const finalStatus: import("../types/card").CardStatus = targetCard ? statusOnConfirm(targetCard) : "executed";
      setMessages((current) =>
        current.map((message) =>
          message.card?.id === cardId
            ? { ...message, card: { ...message.card, status: finalStatus } }
            : message
        )
      );
      updateCardStatus(cardId, finalStatus);
      // 保存到卡库（带审计日志，第五锁）
      if (targetCard) {
        const auditTrail = [
          ...(targetCard.auditTrail ?? []),
          { ts: Date.now(), actor: "user" as const, action: "confirm", detail: targetCard.aiSummary }
        ];
        cardLibrary.add({ ...targetCard, status: finalStatus, auditTrail });
      }
      setMessages((current) => [
        ...current,
        {
          id: makeId("msg_ai_executed"),
          role: "assistant",
          kind: "text",
          text: targetCard ? executionReplyFor(targetCard, finalStatus) : "✅ 已确认，卡片已保存到卡库。",
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
    <KAVWrapper
      className="flex-1"
      style={{ backgroundColor: uiColors.appBg }}
      {...(Platform.OS !== 'web' ? {
        behavior: Platform.OS === 'ios' ? 'padding' as const : 'padding' as const,
        keyboardVerticalOffset: Platform.OS === 'ios' ? insets.top + TOP_BAR_HEIGHT : TOP_BAR_HEIGHT + 24,
      } : {})}
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
          <View style={{ paddingHorizontal: uiSpace.pageX, paddingBottom: 12 }}>
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
          keyboardDismissMode="interactive"
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
                  onConfirmTransferSelect={(cardId, address, amount, symbol) => {
                    cancelCard(cardId);
                    const text = `转 ${amount} ${symbol} 到 ${address}`;
                    sendMessage(text);
                  }}
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
    </KAVWrapper>
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
