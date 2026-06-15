// Shared theme tokens for ClosetAI (Swiss & High-Contrast).
export const colors = {
  background: "#FAFAFA",
  surface: "#FFFFFF",
  primary: "#0A0A0A",
  primaryFg: "#FFFFFF",
  secondary: "#E5E5E5",
  accent: "#FF3B30",
  muted: "#F5F5F5",
  mutedFg: "#737373",
  border: "#E5E5E5",
  subtle: "#A3A3A3",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 16,
  full: 999,
};

export const typography = {
  hero: { fontSize: 38, fontWeight: "900" as const, letterSpacing: -1, color: colors.primary },
  h1: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.5, color: colors.primary },
  h2: { fontSize: 20, fontWeight: "700" as const, color: colors.primary },
  h3: { fontSize: 16, fontWeight: "600" as const, color: colors.primary },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.primary },
  small: { fontSize: 12, fontWeight: "500" as const, color: colors.mutedFg },
  label: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: colors.mutedFg,
  },
};
