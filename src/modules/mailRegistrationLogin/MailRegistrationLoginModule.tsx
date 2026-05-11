/**
 * 【模块】邮件注册与登录 — 止于「会话建立成功」
 *
 * 产品顺序（唯一主路径）：
 * 用户安装 App → 本界面完成邮箱 OTP（新邮箱即注册、老邮箱即登录）→ onAuthSuccess 交给壳层写入 session。
 *
 * HTTP 能力与类型见 walletApi（与 OKX Agent 后端约定）。
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from "react-native-reanimated";
import { DolphinLogo } from "../../components/DolphinLogo";
import { sendOtp, verifyOtp, type Session } from "../../services/walletApi";
import { toastBus } from "../../services/toastBus";

export type MailRegistrationLoginModuleProps = {
  onRegistrationLoginSuccess: (session: Session) => void | Promise<void>;
};

type Step = "email" | "otp";

export function MailRegistrationLoginModule({ onRegistrationLoginSuccess }: MailRegistrationLoginModuleProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === "otp") {
      const t = setTimeout(() => otpInputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [step]);

  const handleSendOtp = async () => {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(true);
    try {
      const r = await sendOtp(email);
      if (!r.ok) {
        const errMsg = r.error || "发送失败，请稍后重试";
        const friendlyMsg = /too frequent|rate.?limit|too many/i.test(errMsg)
          ? "验证码发送太频繁，请等 10 分钟后再试"
          : errMsg.length < 80 ? errMsg : "发送失败，请检查网络后重试";
        toastBus.push({
          emoji: "⚠️",
          title: "发送失败",
          subtitle: friendlyMsg,
          tone: "warn",
          duration: 4000
        });
        return;
      }
      setCode("");
      setStep("otp");
      setResendIn(60);
      toastBus.push({
        emoji: "📮",
        title: "验证码已发送",
        subtitle: `请到 ${email} 收件箱查收验证码`,
        tone: "success",
        duration: 2600
      });
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || busy) return;
    await handleSendOtp();
  };

  const handleVerify = async () => {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(true);
    try {
      const r = await verifyOtp(email, code);
      if (!r.ok || !r.session) {
        toastBus.push({
          emoji: "❌",
          title: "验证失败",
          subtitle: r.error,
          tone: "warn",
          duration: 3000
        });
        return;
      }
      toastBus.push({
        emoji: r.session.isNew ? "🎉" : "👋",
        title: r.session.isNew ? "钱包已创建" : "欢迎回来",
        subtitle: maskAddress(r.session.accountId),
        tone: "success",
        duration: 2400
      });
      await onRegistrationLoginSuccess(r.session);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6 pt-10">
          <View className="items-center pt-6">
            <DolphinLogo size={120} mood="idle" />
            <Text
              style={{
                marginTop: 16,
                fontSize: 28,
                fontWeight: "800",
                fontFamily: "Inter_800ExtraBold",
                color: "#0F0F0F",
                letterSpacing: -0.5
              }}
            >
              H Wallet
            </Text>
            <Text className="mt-1 text-[13px] text-muted">你的 AI 链上助手</Text>
          </View>

          <View
            style={{
              marginTop: 28,
              borderRadius: 24,
              overflow: "hidden",
              shadowColor: "#2A0D4D",
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.18,
              shadowRadius: 22,
              elevation: 6
            }}
          >
            <LinearGradient
              colors={["#FFFFFF", "#F8F4FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 22 }}
            >
              {step === "email" ? (
                <EmailStep email={email} setEmail={setEmail} busy={busy} onSubmit={handleSendOtp} />
              ) : (
                <OtpStep
                  email={email}
                  code={code}
                  setCode={setCode}
                  busy={busy}
                  resendIn={resendIn}
                  onSubmit={handleVerify}
                  onResend={handleResend}
                  onChangeEmail={() => {
                    setStep("email");
                    setCode("");
                  }}
                  inputRef={otpInputRef}
                />
              )}
            </LinearGradient>
          </View>

          <View className="mt-6 px-2">
            <Text className="text-center text-[11px] leading-[16px] text-muted">
              基于 OKX Agentic Wallet · TEE 安全签名{"\n"}私钥永不离开可信执行环境
            </Text>
          </View>

          <View style={{ flex: 1 }} />

          <Text className="mb-6 mt-8 text-center text-[11px] text-muted">
            继续即表示同意《用户协议》与《隐私政策》
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function EmailStep({
  email,
  setEmail,
  busy,
  onSubmit
}: {
  email: string;
  setEmail: (s: string) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  const trimmed = email.trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  /** 发送中不要把 Pressable 设为 disabled（部分 Android 上会导致状态异常）；用 busy 防重复点击 */
  return (
    <View>
      <Text className="text-[18px] font-bold text-ink">邮箱登录 / 注册</Text>
      <Text className="mt-1 text-[12px] text-muted">新邮箱将自动创建你的 Agent Wallet</Text>

      <View className="mt-5">
        <Text className="mb-1.5 text-[12px] font-semibold text-muted">邮箱地址</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#B5ABC4"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={() => emailOk && !busy && onSubmit()}
          editable={!busy}
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#E6DCF7",
            backgroundColor: "#FFFFFF",
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 15,
            color: "#1B0636"
          }}
        />
      </View>

      <PrimaryButton label={busy ? "发送中…" : "发送验证码"} onPress={() => !busy && emailOk && onSubmit()} disabled={!emailOk} busy={busy} />
    </View>
  );
}

function OtpStep({
  email,
  code,
  setCode,
  busy,
  resendIn,
  onSubmit,
  onResend,
  onChangeEmail,
  inputRef
}: {
  email: string;
  code: string;
  setCode: (s: string) => void;
  busy: boolean;
  resendIn: number;
  onSubmit: () => void;
  onResend: () => void;
  onChangeEmail: () => void;
  inputRef: React.RefObject<TextInput | null>;
}) {
  const codeOk = /^\d{6}$/.test(code);

  useEffect(() => {
    if (codeOk && !busy) {
      const t = setTimeout(onSubmit, 200);
      return () => clearTimeout(t);
    }
  }, [code, busy, onSubmit, codeOk]);

  return (
    <View>
      <Text className="text-[18px] font-bold text-ink">输入验证码</Text>
      <Text className="mt-1 text-[12px] text-muted">
        已发送至 <Text className="font-semibold text-ink">{email}</Text>
      </Text>

      <View className="mt-5">
        <Pressable onPress={() => inputRef.current?.focus()}>
          <View className="flex-row justify-between">
            {Array.from({ length: 6 }).map((_, i) => {
              const ch = code[i] ?? "";
              const active = code.length === i;
              return (
                <View
                  key={i}
                  style={{
                    width: 44,
                    height: 52,
                    borderRadius: 12,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? "#7B5BC7" : "#E6DCF7",
                    backgroundColor: "#FFFFFF",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Text style={{ fontSize: 22, fontWeight: "700", fontFamily: "JetBrainsMono_700Bold", color: "#0F0F0F" }}>
                    {ch}
                  </Text>
                </View>
              );
            })}
          </View>
        </Pressable>

        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          editable={!busy}
          style={{
            position: "absolute",
            opacity: 0,
            height: 1,
            width: 1
          }}
        />
      </View>

      <PrimaryButton label={busy ? "验证中…" : "确认"} onPress={() => !busy && codeOk && onSubmit()} disabled={!codeOk} busy={busy} />

      <View className="mt-4 flex-row items-center justify-between">
        <Pressable onPress={onChangeEmail} disabled={busy}>
          <Text className="text-[12px] text-muted">← 换邮箱</Text>
        </Pressable>
        <Pressable onPress={onResend} disabled={resendIn > 0 || busy}>
          <Text className="text-[12px] font-semibold" style={{ color: resendIn > 0 ? "#B5ABC4" : "#7B5BC7" }}>
            {resendIn > 0 ? `${resendIn}s 后重发` : "重新发送"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  busy
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);
  const glow = useAnimatedStyle(() => ({
    opacity: 0.3 + pulse.value * 0.25
  }));

  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ marginTop: 22 }} accessibilityRole="button">
      <View style={{ borderRadius: 16, overflow: "hidden", opacity: disabled ? 0.55 : 1 }}>
        <LinearGradient
          colors={["#2A0D4D", "#5B21B6", "#7B5BC7"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingVertical: 14,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 10
          }}
        >
          {!disabled && (
            <Animated.View
              style={[
                {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "#D9AA43"
                },
                glow
              ]}
              pointerEvents="none"
            />
          )}
          {busy && <ActivityIndicator color="#FFFFFF" />}
          <Text className="text-[15px] font-bold text-white">{label}</Text>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

function maskAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
