// Standalone Wishlist tab. Previously lived inside Profile; now a top-level tab
// so users can save & shop without digging into Profile.
//
// Adds: deep-link to product page with size pre-selected (via productLink util).
// Carries: add/delete, "Find best price" via AI estimator, target price, link.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, StyleProfile, WishlistItem } from "@/src/api";
import {
  ctxFromProfile,
  describeSizeContext,
  enrichProductUrl,
  openProductWithSize,
} from "@/src/utils/productLink";
import { colors, radii, spacing, typography } from "@/src/theme";

export default function WishlistTab() {
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparingId, setComparingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [wName, setWName] = useState("");
  const [wDesc, setWDesc] = useState("");
  const [wPrice, setWPrice] = useState("");
  const [wLink, setWLink] = useState("");

  const load = useCallback(async () => {
    try {
      const [w, p] = await Promise.all([
        api.listWishlist(),
        api.getProfile().catch(() => null),
      ]);
      setWishlist(w);
      setProfile(p);
    } catch (e: any) {
      console.warn("[wishlist] load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!showAdd) {
      setWName("");
      setWDesc("");
      setWPrice("");
      setWLink("");
    }
  }, [showAdd]);

  const addWish = async () => {
    if (!wName.trim()) return;
    try {
      await api.addWishlist({
        name: wName.trim(),
        description: wDesc.trim() || undefined,
        target_price: wPrice ? parseFloat(wPrice) : undefined,
        link: wLink.trim() || undefined,
      });
      setShowAdd(false);
      load();
    } catch (e: any) {
      console.warn("[wishlist] add failed", e);
    }
  };

  const compare = async (id: string) => {
    setComparingId(id);
    try {
      const updated = await api.compareWishlist(id);
      setWishlist((prev) => prev.map((w) => (w.id === id ? updated : w)));
    } catch (e: any) {
      console.warn("[wishlist] compare failed", e);
    } finally {
      setComparingId(null);
    }
  };

  const deleteWish = async (id: string) => {
    await api.deleteWishlist(id);
    setWishlist((prev) => prev.filter((w) => w.id !== id));
  };

  const sizeCtx = ctxFromProfile(profile);
  const sizeDesc = describeSizeContext(sizeCtx);

  const openLink = async (url: string) => {
    await openProductWithSize(url, sizeCtx);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="wishlist-screen">
      <View style={styles.header}>
        <Text style={styles.kicker}>SHOP</Text>
        <Text style={styles.title}>Wishlist.</Text>
        {sizeDesc && (
          <View style={styles.sizePill} testID="wishlist-size-pill">
            <Ionicons name="resize" size={12} color={colors.primary} />
            <Text style={styles.sizePillText}>Your size: {sizeDesc}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <TouchableOpacity
            testID="wishlist-add-button"
            style={styles.addBtn}
            onPress={() => setShowAdd(true)}
          >
            <Ionicons name="add" size={18} color={colors.primaryFg} />
            <Text style={styles.addBtnText}>Add to Wishlist</Text>
          </TouchableOpacity>

          {wishlist.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="bag-handle-outline" size={48} color={colors.subtle} />
              <Text style={styles.emptyTitle}>Build your wishlist</Text>
              <Text style={styles.emptyText}>
                Save items from any store. We'll track prices and pre-select your size.
              </Text>
            </View>
          ) : (
            wishlist.map((w) => {
              const enriched = w.link ? enrichProductUrl(w.link, sizeCtx) : null;
              return (
                <View key={w.id} style={styles.card} testID={`wishlist-item-${w.id}`}>
                  <View style={styles.cardHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{w.name}</Text>
                      {w.description ? <Text style={styles.cardDesc}>{w.description}</Text> : null}
                      {w.target_price ? (
                        <Text style={styles.cardTarget}>Target ${w.target_price}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => deleteWish(w.id)}
                      testID={`wishlist-delete-${w.id}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.accent} />
                    </TouchableOpacity>
                  </View>

                  {w.link && (
                    <TouchableOpacity
                      testID={`wishlist-open-${w.id}`}
                      style={styles.linkBtn}
                      onPress={() => openLink(w.link!)}
                    >
                      <Ionicons name="open-outline" size={14} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linkBtnText} numberOfLines={1}>
                          Open product
                          {enriched !== w.link ? " · size applied" : ""}
                        </Text>
                        <Text style={styles.linkUrl} numberOfLines={1}>
                          {hostnameOf(w.link)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.subtle} />
                    </TouchableOpacity>
                  )}

                  {w.price_results && w.price_results.length > 0 && (
                    <View style={styles.priceList}>
                      {w.price_results.map((p, i) => (
                        <TouchableOpacity
                          key={`${p.site}-${i}`}
                          style={[styles.priceRow, p.is_best_pick && styles.priceRowBest]}
                          onPress={() => p.url && openLink(p.url)}
                          testID={`wishlist-price-${w.id}-${i}`}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.priceSite, p.is_best_pick && { color: colors.accent }]}>
                              {p.site} {p.is_best_pick ? "★ BEST" : ""}
                            </Text>
                            {p.note ? <Text style={styles.priceNote}>{p.note}</Text> : null}
                          </View>
                          <Text style={styles.priceVal}>
                            ${p.estimated_price_low}–${p.estimated_price_high}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <TouchableOpacity
                    testID={`wishlist-compare-${w.id}`}
                    style={[styles.compareBtn, comparingId === w.id && { opacity: 0.5 }]}
                    onPress={() => compare(w.id)}
                    disabled={comparingId === w.id}
                  >
                    {comparingId === w.id ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <>
                        <Ionicons name="search" size={14} color={colors.primary} />
                        <Text style={styles.compareBtnText}>
                          {w.price_results ? "Re-check prices" : "Find best price"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add Modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalKicker}>ADD TO WISHLIST</Text>
            <Text style={styles.modalLabel}>Item name</Text>
            <TextInput
              testID="wishlist-name-input"
              value={wName}
              onChangeText={setWName}
              placeholder="e.g. Burgundy oversized blazer"
              placeholderTextColor={colors.subtle}
              style={styles.modalInput}
            />
            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <TextInput
              testID="wishlist-desc-input"
              value={wDesc}
              onChangeText={setWDesc}
              placeholder="Brand, color, season…"
              placeholderTextColor={colors.subtle}
              style={styles.modalInput}
            />
            <Text style={styles.modalLabel}>Target price (optional)</Text>
            <TextInput
              testID="wishlist-price-input"
              value={wPrice}
              onChangeText={setWPrice}
              placeholder="49.99"
              placeholderTextColor={colors.subtle}
              keyboardType="decimal-pad"
              style={styles.modalInput}
            />
            <Text style={styles.modalLabel}>Product link (optional)</Text>
            <TextInput
              testID="wishlist-link-input"
              value={wLink}
              onChangeText={setWLink}
              placeholder="https://…"
              placeholderTextColor={colors.subtle}
              autoCapitalize="none"
              style={styles.modalInput}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity testID="wishlist-cancel-add" style={styles.modalGhost} onPress={() => setShowAdd(false)}>
                <Text style={styles.modalGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="wishlist-confirm-add" style={styles.modalPrimary} onPress={addWish}>
                <Text style={styles.modalPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  kicker: { ...typography.label },
  title: { ...typography.display, color: colors.primary, fontSize: 36, marginTop: 2 },
  sizePill: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.muted,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  sizePillText: { fontSize: 11, fontWeight: "700", color: colors.primary, letterSpacing: 0.6 },
  body: { padding: spacing.xl, paddingBottom: 120 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.pill,
    marginBottom: spacing.lg,
  },
  addBtnText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  emptyWrap: { alignItems: "center", paddingVertical: 64 },
  emptyTitle: { ...typography.h2, marginTop: spacing.md },
  emptyText: { ...typography.body, color: colors.mutedFg, textAlign: "center", marginTop: 4, maxWidth: 260 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  cardName: { ...typography.h3, fontSize: 17 },
  cardDesc: { ...typography.body, color: colors.mutedFg, marginTop: 4 },
  cardTarget: { fontSize: 12, fontWeight: "700", color: colors.accent, marginTop: 6 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.muted,
    borderRadius: radii.md,
  },
  linkBtnText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  linkUrl: { fontSize: 11, color: colors.mutedFg, marginTop: 2 },
  priceList: { marginTop: spacing.md, gap: 6 },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  priceRowBest: { borderColor: colors.accent, backgroundColor: "#FBEDEC" },
  priceSite: { fontSize: 12, fontWeight: "700", color: colors.primary },
  priceNote: { fontSize: 10, color: colors.mutedFg, marginTop: 2 },
  priceVal: { fontSize: 12, fontWeight: "800", color: colors.primary },
  compareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.pill,
  },
  compareBtnText: { color: colors.primary, fontWeight: "800", letterSpacing: 1, fontSize: 11 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    paddingBottom: spacing.xl,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  modalKicker: { ...typography.label, marginBottom: spacing.lg },
  modalLabel: { ...typography.label, fontSize: 10, marginTop: spacing.md },
  modalInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.primary,
  },
  modalRow: { flexDirection: "row", gap: 10, marginTop: spacing.xl },
  modalGhost: { flex: 1, paddingVertical: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.primary, alignItems: "center" },
  modalGhostText: { color: colors.primary, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  modalPrimary: { flex: 1, paddingVertical: 14, borderRadius: radii.pill, backgroundColor: colors.primary, alignItems: "center" },
  modalPrimaryText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
});
