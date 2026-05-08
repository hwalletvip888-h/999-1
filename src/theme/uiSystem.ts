export const uiColors = {
  appBg: "#F6F7FB",
  cardBg: "#FFFFFF",
  cardBorder: "#E9ECF2",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8"
} as const;

export const uiRadius = {
  card: 16,
  hero: 24,
  chip: 12,
  pill: 999
} as const;

export const uiSpace = {
  pageX: 16,
  sectionGap: 14,
  cardPadX: 14,
  cardPadY: 12
} as const;

export const uiShadow = {
  cardSoft: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  cardLift: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6
  }
} as const;

