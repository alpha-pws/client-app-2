// ClosetAI — Warm Editorial theme (Pinterest-style redesign).
import { Platform } from "react-native";

export const colors = {
  // Surfaces
  background: "#FAF9F6", // warm cream off-white
  surface: "#FFFFFF",
  surfaceSoft: "#F5F2EA",
  muted: "#F5F2EA",
  overlay: "rgba(255, 255, 255, 0.78)",
  overlayDark: "rgba(26, 26, 26, 0.55)",

  // Brand / accents
  primary: "#6A1E2F", // deep burgundy / wine
  primaryFg: "#FFFFFF",
  secondary: "#E8A598", // peach
  highlight: "#D6C3A7", // sand

  // Text
  text: "#1A1A1A",
  textSoft: "#6B655E",
  textInverse: "#FFFFFF",
  subtle: "#9C958C",

  // Status
  success: "#2D6A4F",
  warning: "#D4A373",
  error: "#9D0208",
  accent: "#9D0208", // alias used in older screens

  // Borders
  border: "#EAE4D9",
  borderFocus: "#6A1E2F",

  // Aliases for backwards compatibility
  mutedFg: "#6B655E",
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
  full: 999,
};

export const shadows = {
  soft: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  lift: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
  pill: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 10,
  },
};

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });

export const fonts = {
  serif: SERIF,
};

export const typography = {
  display: {
    fontFamily: SERIF,
    fontSize: 44,
    fontWeight: "700" as const,
    letterSpacing: -1,
    color: colors.text,
    lineHeight: 48,
  },
  hero: {
    fontFamily: SERIF,
    fontSize: 38,
    fontWeight: "700" as const,
    letterSpacing: -0.8,
    color: colors.text,
    lineHeight: 42,
  },
  h1: {
    fontFamily: SERIF,
    fontSize: 30,
    fontWeight: "700" as const,
    letterSpacing: -0.4,
    color: colors.text,
  },
  h2: {
    fontFamily: SERIF,
    fontSize: 22,
    fontWeight: "600" as const,
    color: colors.text,
  },
  h3: { fontSize: 17, fontWeight: "700" as const, color: colors.text },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.text, lineHeight: 22 },
  bodyLarge: { fontSize: 17, fontWeight: "400" as const, color: colors.text, lineHeight: 26 },
  small: { fontSize: 12, fontWeight: "500" as const, color: colors.textSoft },
  label: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1.8,
    textTransform: "uppercase" as const,
    color: colors.textSoft,
  },
};
