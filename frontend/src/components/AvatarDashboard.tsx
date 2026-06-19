// Reusable "My Avatar & Measurements" dashboard.
// - Loads StyleProfile from /api/profile
// - Shows every field with a value or "Not provided"
// - Computes completion %
// - Each row deep-links to /profile-edit?mode=edit&step=<step> for inline editing
// - Refreshes on focus so values reflect latest server state

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, StyleProfile } from "@/src/api";
import { colors, radii, shadows, spacing, typography } from "@/src/theme";

type FieldKey =
  | "height_cm"
  | "weight_kg"
  | "age_range"
  | "gender"
  | "chest_cm"
  | "waist_cm"
  | "hips_cm"
  | "inseam_cm"
  | "shoulder_cm"
  | "shoe_size"
  | "preferred_fits"
  | "styles"
  | "best_colors"
  | "preferred_brands"
  | "skin_tone"
  | "hair_color"
  | "eye_color"
  | "home_label";

type Row = {
  key: FieldKey;
  label: string;
  unit?: string;
  step: "body" | "style" | "color" | "location";
  icon: keyof typeof Ionicons.glyphMap;
};

const ROWS: Row[] = [
  { key: "height_cm", label: "Height", unit: "cm", step: "body", icon: "resize-outline" },
  { key: "weight_kg", label: "Weight", unit: "kg", step: "body", icon: "fitness-outline" },
  { key: "age_range", label: "Age range", step: "body", icon: "person-outline" },
  { key: "gender", label: "Gender", step: "body", icon: "people-outline" },
  { key: "shoe_size", label: "Shoe size", step: "body", icon: "footsteps-outline" },
  { key: "chest_cm", label: "Chest", unit: "cm", step: "body", icon: "shirt-outline" },
  { key: "waist_cm", label: "Waist", unit: "cm", step: "body", icon: "shirt-outline" },
  { key: "hips_cm", label: "Hips", unit: "cm", step: "body", icon: "shirt-outline" },
  { key: "inseam_cm", label: "Inseam", unit: "cm", step: "body", icon: "shirt-outline" },
  { key: "shoulder_cm", label: "Shoulder width", unit: "cm", step: "body", icon: "shirt-outline" },
  { key: "preferred_fits", label: "Preferred fit", step: "style", icon: "shirt-outline" },
  { key: "styles", label: "Style preferences", step: "style", icon: "sparkles-outline" },
  { key: "best_colors", label: "Best colors", step: "color", icon: "color-palette-outline" },
  { key: "preferred_brands", label: "Favorite brands", step: "style", icon: "pricetag-outline" },
  { key: "skin_tone", label: "Skin tone", step: "color", icon: "color-palette-outline" },
  { key: "hair_color", label: "Hair color", step: "color", icon: "color-palette-outline" },
  { key: "eye_color", label: "Eye color", step: "color", icon: "eye-outline" },
  { key: "home_label", label: "Home location", step: "location", icon: "location-outline" },
];

function formatValue(profile: StyleProfile, row: Row): string | null {
  const raw = (profile as any)[row.key];
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return raw.slice(0, 3).join(", ") + (raw.length > 3 ? ` +${raw.length - 3}` : "");
  }
  if (typeof raw === "number") return `${raw}${row.unit ? " " + row.unit : ""}`;
  if (typeof raw === "string") return raw.trim() || null;
  return String(raw);
}

export function AvatarDashboard({ testIDPrefix = "avatar" }: { testIDPrefix?: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const p = await api.getProfile();
      setProfile(p);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const filled = profile
    ? ROWS.reduce((acc, r) => acc + (formatValue(profile, r) ? 1 : 0), 0)
    : 0;
  const completion = Math.round((filled / ROWS.length) * 100);

  const openEditor = (step: Row["step"]) => {
    router.push(`/profile-edit?mode=edit&step=${step}` as any);
  };

  return (
    <View testID={`${testIDPrefix}-dashboard`}>
      {/* Header card with completion meter */}
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <View style={styles.avatarBubble}>
            <Ionicons name="person" size={28} color={colors.primaryFg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerKicker}>YOUR STYLE AVATAR</Text>
            <Text style={styles.headerTitle}>Profile {completion}% complete</Text>
            <Text style={styles.headerSub}>
              {filled} of {ROWS.length} details saved
            </Text>
          </View>
        </View>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { width: `${completion}%` }]} testID={`${testIDPrefix}-completion-bar`} />
        </View>
        {completion < 100 && (
          <TouchableOpacity
            testID={`${testIDPrefix}-complete-missing`}
            style={styles.completeBtn}
            onPress={() => openEditor("body")}
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.primaryFg} />
            <Text style={styles.completeBtnText}>Complete missing info</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Field list */}
      <Text style={styles.sectionLabel}>MEASUREMENTS & PREFERENCES</Text>
      <View style={styles.listCard}>
        {ROWS.map((r, idx) => {
          const val = profile ? formatValue(profile, r) : null;
          const filledRow = !!val;
          return (
            <TouchableOpacity
              key={r.key}
              testID={`${testIDPrefix}-row-${r.key}`}
              style={[styles.row, idx === ROWS.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => openEditor(r.step)}
              activeOpacity={0.7}
            >
              <View style={[styles.rowIconWrap, filledRow ? styles.rowIconFilled : styles.rowIconEmpty]}>
                <Ionicons
                  name={r.icon}
                  size={14}
                  color={filledRow ? colors.primaryFg : colors.subtle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={[styles.rowValue, !filledRow && styles.rowValueEmpty]}>
                  {filledRow ? val : "Not provided · tap to add"}
                </Text>
              </View>
              <Ionicons
                name={filledRow ? "create-outline" : "add-outline"}
                size={18}
                color={colors.subtle}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        testID={`${testIDPrefix}-edit-all`}
        style={styles.editAllBtn}
        onPress={() => openEditor("body")}
      >
        <Ionicons name="create-outline" size={16} color={colors.primary} />
        <Text style={styles.editAllBtnText}>Edit my Style Avatar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { padding: 32, alignItems: "center" },
  headerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.soft,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatarBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerKicker: { ...typography.label, fontSize: 10 },
  headerTitle: { ...typography.h2, fontSize: 19, marginTop: 2 },
  headerSub: { fontSize: 12, color: colors.mutedFg, marginTop: 2 },
  meterTrack: { height: 8, backgroundColor: colors.muted, borderRadius: 4, overflow: "hidden" },
  meterFill: { height: "100%", backgroundColor: colors.primary },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radii.pill,
  },
  completeBtnText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  sectionLabel: {
    ...typography.label,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconFilled: { backgroundColor: colors.primary },
  rowIconEmpty: { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  rowLabel: { fontSize: 13, fontWeight: "700", color: colors.primary },
  rowValue: { fontSize: 12, color: colors.text, marginTop: 2 },
  rowValueEmpty: { color: colors.subtle, fontStyle: "italic" },
  editAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.pill,
  },
  editAllBtnText: { color: colors.primary, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
});
