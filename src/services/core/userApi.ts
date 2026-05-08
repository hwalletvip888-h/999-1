import { cardLibrary } from "../cardLibrary";

/** 仅从本地卡库推导可验证数字；无盈利/胜率等捏造指标 */
export function getProfileStats() {
  let executedCount = 0;
  try {
    executedCount = cardLibrary.list().filter((c) => c.status === "executed").length;
  } catch {
    /* ignore */
  }
  return [
    { id: "profit", value: "—", label: "本期盈亏（待接入账户）", color: "#64748B" },
    { id: "trades", value: String(executedCount), label: "已执行策略卡", color: "#0F0F0F" },
    { id: "win", value: "—", label: "胜率（待接入订单）", color: "#64748B" },
  ];
}
