// ─── H Wallet Design Tokens ───────────────────────────────────────────────────
// 白底 · 多彩紫主题 · 玻璃液态风格

export const uiColors = {
  // 页面背景
  appBg: "#FAFBFF",
  cardBg: "#FFFFFF",
  cardBorder: "rgba(108,63,197,0.10)",

  // 主色
  purple: "#6C3FC5",
  purpleLight: "#9B6DFF",
  purpleDark: "#3D1A78",
  gold: "#F0B429",

  // 文字
  textPrimary: "#0F172A",
  textSecondary: "#5B6478",
  textMuted: "#94A3B8",

  // 玻璃
  glassBg: "rgba(255,255,255,0.72)",
  glassBorder: "rgba(255,255,255,0.55)",
  glassPurpleBg: "rgba(108,63,197,0.07)",
  glassPurpleBorder: "rgba(108,63,197,0.18)",

  // 终端沙盒
  terminalBg: "#0F0A1E",
  terminalText: "#4ADE80",
  terminalMuted: "#22C55E",
  terminalAccent: "#A78BFA",
} as const;

// 每种操作/卡片独立渐变配色
export const uiCategoryColors = {
  swap: {
    gradient: ["#7B2FBE", "#4F46E5"] as [string, string],
    accent: "#6366F1",
    soft: "rgba(99,102,241,0.10)",
  },
  transfer: {
    gradient: ["#F59E0B", "#EF4444"] as [string, string],
    accent: "#F59E0B",
    soft: "rgba(245,158,11,0.10)",
  },
  deposit: {
    gradient: ["#10B981", "#0EA5E9"] as [string, string],
    accent: "#10B981",
    soft: "rgba(16,185,129,0.10)",
  },
  earn: {
    gradient: ["#06B6D4", "#8B5CF6"] as [string, string],
    accent: "#06B6D4",
    soft: "rgba(6,182,212,0.10)",
  },
  strategy: {
    gradient: ["#F97316", "#FBBF24"] as [string, string],
    accent: "#F97316",
    soft: "rgba(249,115,22,0.10)",
  },
  position: {
    gradient: ["#F43F5E", "#EC4899"] as [string, string],
    accent: "#F43F5E",
    soft: "rgba(244,63,94,0.10)",
  },
} as const;

// H 头像等级配色
export const uiLevelColors = [
  { name: "青铜", gradient: ["#CD7F32", "#E8A96A"] as [string, string], border: "#C17A3A" },
  { name: "白银", gradient: ["#9BA4B4", "#D1D8E8"] as [string, string], border: "#B0BCC8" },
  { name: "黄金", gradient: ["#F7C948", "#FFA500"] as [string, string], border: "#E6A817" },
  { name: "铂金", gradient: ["#A8C0D6", "#E2EEF6"] as [string, string], border: "#90AFCB" },
  { name: "钻石", gradient: ["#7DF9FF", "#B9F2FF"] as [string, string], border: "#5CE0FF" },
] as const;

export const uiRadius = {
  card: 20,
  hero: 28,
  chip: 12,
  pill: 999,
} as const;

export const uiSpace = {
  pageX: 16,
  sectionGap: 14,
  cardPadX: 16,
  cardPadY: 14,
} as const;

// 悬浮感阴影 — 紫色调
export const uiShadow = {
  float: {
    shadowColor: "#6C3FC5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  card: {
    shadowColor: "#6C3FC5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  deep: {
    shadowColor: "#3D1A78",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
    elevation: 16,
  },
  cardSoft: {
    shadowColor: "#6C3FC5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLift: {
    shadowColor: "#6C3FC5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
} as const;
