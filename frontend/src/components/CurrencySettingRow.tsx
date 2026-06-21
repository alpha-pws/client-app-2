// Tappable row + modal for choosing the user's preferred display currency.
// Drop into Profile → Account. Persists via useCurrency hook.

import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCurrency } from "@/src/hooks/useCurrency";
import { colors, radii, spacing, typography } from "@/src/theme";

export function CurrencySettingRow() {
  const { code, setCurrency, CURRENCIES, rates } = useCurrency();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const current = CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q),
    );
  }, [query, CURRENCIES]);

  return (
    <>
      <TouchableOpacity
        testID="currency-setting-row"
        style={styles.row}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="cash-outline" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Display currency</Text>
          <Text style={styles.rowSub}>
            {current.name} · {current.symbol} {current.code}
            {rates?.date ? ` · ECB ${rates.date}` : ""}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity testID="currency-close" onPress={() => setOpen(false)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="close" size={26} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Choose currency</Text>
            <View style={{ width: 26 }} />
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={colors.subtle} />
            <TextInput
              testID="currency-search-input"
              value={query}
              onChangeText={setQuery}
              placeholder="Search by code or name (e.g. INR, Euro)"
              placeholderTextColor={colors.subtle}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="characters"
            />
            {!!query && (
              <Pressable testID="currency-search-clear" onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={16} color={colors.subtle} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(c) => c.code}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            renderItem={({ item }) => {
              const selected = item.code === code;
              return (
                <TouchableOpacity
                  testID={`currency-option-${item.code}`}
                  style={styles.option}
                  onPress={async () => {
                    await setCurrency(item.code);
                    setOpen(false);
                  }}
                >
                  <View style={[styles.flag, selected && styles.flagActive]}>
                    <Text style={[styles.flagText, selected && { color: colors.primaryFg }]}>{item.symbol}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optName}>{item.name}</Text>
                    <Text style={styles.optCode}>{item.code}</Text>
                  </View>
                  {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>No currencies matching “{query}”.</Text>
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 13, fontWeight: "700", color: colors.primary },
  rowSub: { fontSize: 12, color: colors.mutedFg, marginTop: 2 },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { ...typography.h2, fontSize: 18 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 10,
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 76 },
  flag: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  flagActive: { backgroundColor: colors.primary },
  flagText: { fontSize: 14, fontWeight: "800", color: colors.primary },
  optName: { fontSize: 14, fontWeight: "700", color: colors.primary },
  optCode: { fontSize: 11, color: colors.mutedFg, marginTop: 2, letterSpacing: 1 },
  empty: { textAlign: "center", padding: 24, color: colors.mutedFg, fontSize: 13 },
});
