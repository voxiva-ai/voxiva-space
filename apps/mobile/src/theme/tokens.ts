export type ColorTokens = {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  brand: string;
  brandSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  overlay: string;
  tabBar: string;
};

export const darkColors: ColorTokens = {
  bg: "#090a0c",
  surface: "#101114",
  surface2: "#191a1e",
  border: "rgba(255,255,255,0.085)",
  text: "#f3f3f1",
  textSecondary: "#a2a3a7",
  textTertiary: "#6f7075",
  brand: "#f3f3f1",
  brandSoft: "rgba(255,255,255,0.085)",
  success: "#3fd49a",
  successSoft: "rgba(63,212,154,0.14)",
  danger: "#ff7b7b",
  dangerSoft: "rgba(255,123,123,0.14)",
  warning: "#efc35a",
  warningSoft: "rgba(239,195,90,0.18)",
  overlay: "rgba(0,0,0,0.55)",
  tabBar: "#0d0e10",
};

export const lightColors: ColorTokens = {
  bg: "#f5f5f3",
  surface: "#ffffff",
  surface2: "#ebebe8",
  border: "rgba(16,17,19,0.09)",
  text: "#151618",
  textSecondary: "#65666a",
  textTertiary: "#96979a",
  brand: "#151618",
  brandSoft: "rgba(16,17,19,0.07)",
  success: "#059669",
  successSoft: "rgba(5,150,105,0.12)",
  danger: "#dc2626",
  dangerSoft: "rgba(220,38,38,0.1)",
  warning: "#d97706",
  warningSoft: "rgba(217,119,6,0.12)",
  overlay: "rgba(15,23,42,0.4)",
  tabBar: "#fafaf8",
};

/** @deprecated Prefer useTheme().colors — kept for gradual migration */
export const colors = darkColors;

export const SPACE_SWATCH = [
  "#3dd68c",
  "#5aa6ff",
  "#efc35a",
  "#a78bfa",
  "#22d3ee",
  "#fb7185",
  "#ff6b6b",
] as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;
