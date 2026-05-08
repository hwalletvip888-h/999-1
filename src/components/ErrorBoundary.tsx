/**
 * 全局 ErrorBoundary — 把 React 渲染异常拦下来变成可见错误页
 *
 * 没这个的话，任何渲染 throw 都会让 Android 直接闪退；有了这个，
 * 用户至少能看到「哪一段代码崩了 + stack trace」并选择「重试」。
 */
import { Component, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // 把详情打到 console，pm2 不一定收集到，但 Android logcat / Expo 控制台能看见
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error?.message, "\n", info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <View style={{ flex: 1, backgroundColor: "#0F0F0F", padding: 24, paddingTop: 80 }}>
        <Text style={{ color: "#F87171", fontSize: 22, fontWeight: "700", marginBottom: 8 }}>
          出了点小问题
        </Text>
        <Text style={{ color: "#E5E7EB", fontSize: 14, marginBottom: 16 }}>
          App 渲染时遇到异常，已被拦截，没崩溃。点击「重试」回到主界面。
        </Text>
        <ScrollView
          style={{
            flex: 1,
            backgroundColor: "#1F2937",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16
          }}
        >
          <Text style={{ color: "#FCA5A5", fontSize: 12, fontFamily: "monospace" }}>
            {String(e?.message || e)}
          </Text>
          {e?.stack ? (
            <Text style={{ color: "#9CA3AF", fontSize: 11, marginTop: 8, fontFamily: "monospace" }}>
              {String(e.stack)}
            </Text>
          ) : null}
        </ScrollView>
        <Pressable
          onPress={this.reset}
          style={{
            backgroundColor: "#7C3AED",
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center"
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>重试</Text>
        </Pressable>
      </View>
    );
  }
}
