import { cardLibrary } from "../cardLibrary";
// 会员进度统计（mock：executed 卡片数量）
export function getProfileStats() {
  // mock: 统计 executed 状态卡片数量
  let executedCount = 0;
  try {
    executedCount = cardLibrary.list().filter(c => c.status === "executed").length;
  } catch {}
  return [
    { id: "profit", value: "+$952", label: "本月盈利", color: "#15803D" },
    { id: "trades", value: executedCount === 0 ? "0 / 1" : "1 / 1", label: "总交易笔数", color: "#0F0F0F" },
    { id: "win", value: "62%", label: "胜率", color: "#4338CA" }
  ];
}
// Mock 用户资料接口
import type { ApiResponse } from "../../types/api";

export interface UserProfile {
  nickname: string;
  email: string;
  vipLevel: number;
  simulationMode: boolean;
  vipProgress: number; // 0-100
}

export function getUserProfile(): ApiResponse<UserProfile> {
  return {
    ok: true,
    simulationMode: true,
    data: {
      nickname: "小明",
      email: "xiaoming@example.com",
      vipLevel: 2,
      simulationMode: true,
      vipProgress: 45
    }
  };
}
