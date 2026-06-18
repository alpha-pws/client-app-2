import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Brand, WishlistItem } from "@/src/api";
import { useAuth } from "@/src/useAuth";
import { colors, spacing, typography } from "@/src/theme";

type Tab = "wishlist" | "brands" | "account";

export default function Profile() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("wishlist");
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparingId, setComparingId] = useState<string | null>(null);

  // wishlist add modal
  const [showAdd, setShowAdd] = useState(false);
  const [wName, setWName] = useState("");
  const [wDesc, setWDesc] = useState("");
  const [wPrice, setWPrice] = useState("");
  const [wLink, setWLink] = useState("");

  // brand add
  const [showBrandAdd, setShowBrandAdd] = useState(false);
  const [bName, setBName] = useState("");
  const [bUrl, setBUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const [w, b] = await Promise.all([api.listWishlist(), api.listBrands()]);
      setWishlist(w);
      setBrands(b);
    } catch (e: any) {
      console.warn(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const addWish = async () => {
    if (!wName) return;
    try {
      await api.addWishlist({
        name: wName,
        description: wDesc || undefined,
        target_price: wPrice ? parseFloat(wPrice) : undefined,
        link: wLink || undefined,
      });
      setWName("");
      setWDesc("");
      setWPrice("");
      setWLink("");
      setShowAdd(false);
      load();
    } catch (e: any) {
      console.warn(e.message);
    }
  };

  const compare = async (id: string) => {
    setComparingId(id);
    try {
      const updated = await api.compareWishlist(id);
      setWishlist((prev) => prev.map((w) => (w.id === id ? updated : w)));
    } catch (e: any) {
      console.warn(e.message);
    } finally {
      setComparingId(null);
    }
  };

  const deleteWish = async (id: string) => {
    await api.deleteWishlist(id);
    setWishlist((prev) => prev.filter((w) => w.id !== id));
  };

  const addBrand = async () => {
    if (!bName || !bUrl) return;
    try {
      await api.addBrand({ name: bName, url: bUrl });
      setBName("");
      setBUrl("");
      setShowBrandAdd(false);
      load();
    } catch (e: any) {
      console.warn(e.message);
    }
  };

  const removeBrand = async (id: string) => {
    await api.deleteBrand(id);
    setBrands((prev) => prev.filter((b) => b.id !== id));
  };

  const onLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="profile-screen">
      <View style={styles.header}>
        <Text style={styles.kicker}>{user?.email}</Text>
        <Text style={styles.title}>{user?.name || "Profile"}.</Text>
      </View>

      <View style={styles.tabRow}>
        {(
          [
            { id: "wishlist" as const, label: "Wishlist" },
            { id: "brands" as const, label: "Brands" },
            { id: "account" as const, label: "Account" },
          ]
        ).map((t) => {
          const active = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              testID={`profile-tab-${t.id}`}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setTab(t.id)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
          {tab === "wishlist" && (
            <>
              <TouchableOpacity
                testID="wishlist-add-button"
                style={styles.addRowBtn}
                onPress={() => setShowAdd(true)}
              >
                <Ionicons name="add" size={18} color={colors.primaryFg} />
                <Text style={styles.addRowBtnText}>Add to Wishlist</Text>
              </TouchableOpacity>
              {wishlist.length === 0 ? (
                <Text style={styles.emptySub}>Nothing on your wishlist yet.</Text>
              ) : (
                wishlist.map((w) => (
                  <View key={w.id} style={styles.wishCard} testID={`wishlist-item-${w.id}`}>
                    <View style={styles.wishHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.wishName}>{w.name}</Text>
                        {w.description ? <Text style={styles.wishDesc}>{w.description}</Text> : null}
                        {w.target_price ? (
                          <Text style={styles.wishTarget}>Target: ${w.target_price}</Text>
                        ) : null}
                      </View>
                      <TouchableOpacity onPress={() => deleteWish(w.id)} testID={`wishlist-delete-${w.id}`}>
                        <Ionicons name="trash-outline" size={18} color={colors.accent} />
                      </TouchableOpacity>
                    </View>
                    {w.price_results && w.price_results.length > 0 && (
                      <View style={styles.priceList}>
                        {w.price_results.map((p, i) => (
                          <TouchableOpacity
                            key={`${p.site}-${i}`}
                            style={[styles.priceRow, p.is_best_pick && styles.priceRowBest]}
                            onPress={() => p.url && Linking.openURL(p.url)}
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
                ))
              )}
            </>
          )}

          {tab === "brands" && (
            <>
              <TouchableOpacity
                testID="brand-add-button"
                style={styles.addRowBtn}
                onPress={() => setShowBrandAdd(true)}
              >
                <Ionicons name="add" size={18} color={colors.primaryFg} />
                <Text style={styles.addRowBtnText}>Add Custom Site</Text>
              </TouchableOpacity>
              <Text style={styles.sectionLabel}>POPULAR</Text>
              {brands
                .filter((b) => b.popular)
                .map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.brandRow}
                    onPress={() => Linking.openURL(b.url)}
                  >
                    <Text style={styles.brandName}>{b.name}</Text>
                    <Ionicons name="open-outline" size={16} color={colors.mutedFg} />
                  </TouchableOpacity>
                ))}
              {brands.filter((b) => b.user_added).length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>YOUR SITES</Text>
                  {brands
                    .filter((b) => b.user_added)
                    .map((b) => (
                      <View key={b.id} style={styles.brandRow}>
                        <TouchableOpacity style={{ flex: 1 }} onPress={() => Linking.openURL(b.url)}>
                          <Text style={styles.brandName}>{b.name}</Text>
                          <Text style={styles.brandUrl}>{b.url}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeBrand(b.id)} testID={`brand-delete-${b.id}`}>
                          <Ionicons name="trash-outline" size={16} color={colors.accent} />
                        </TouchableOpacity>
                      </View>
                    ))}
                </>
              )}
            </>
          )}

          {tab === "account" && (
            <View>
              <TouchableOpacity
                testID="open-fit-profile"
                style={styles.accountBox}
                onPress={() => router.push("/profile-edit" as any)}
              >
                <Text style={styles.boxLabel}>STYLE AVATAR</Text>
                <Text style={styles.accountName}>My Fit Profile</Text>
                <Text style={styles.accountEmail}>Measurements · style · colors · location</Text>
              </TouchableOpacity>
              <View style={styles.accountBox}>
                <Text style={styles.boxLabel}>SIGNED IN AS</Text>
                <Text style={styles.accountName}>{user?.name}</Text>
                <Text style={styles.accountEmail}>{user?.email}</Text>
              </View>
              <TouchableOpacity testID="logout-button" style={styles.logoutBtn} onPress={onLogout}>
                <Ionicons name="log-out-outline" size={18} color={colors.accent} />
                <Text style={styles.logoutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Wishlist Add Modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Wishlist Item</Text>
            <TextInput
              testID="wishlist-name-input"
              value={wName}
              onChangeText={setWName}
              placeholder="Item name"
              placeholderTextColor={colors.subtle}
              style={styles.modalInput}
            />
            <TextInput
              testID="wishlist-desc-input"
              value={wDesc}
              onChangeText={setWDesc}
              placeholder="Description (color, size)"
              placeholderTextColor={colors.subtle}
              style={styles.modalInput}
            />
            <TextInput
              testID="wishlist-price-input"
              value={wPrice}
              onChangeText={setWPrice}
              keyboardType="numeric"
              placeholder="Target price (USD)"
              placeholderTextColor={colors.subtle}
              style={styles.modalInput}
            />
            <TextInput
              testID="wishlist-link-input"
              value={wLink}
              onChangeText={setWLink}
              autoCapitalize="none"
              placeholder="Link (optional)"
              placeholderTextColor={colors.subtle}
              style={styles.modalInput}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <TouchableOpacity style={[styles.modalBtnGhost, { flex: 1 }]} onPress={() => setShowAdd(false)}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="wishlist-save-button"
                style={[styles.modalBtn, { flex: 1 }]}
                onPress={addWish}
              >
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Brand Add Modal */}
      <Modal
        visible={showBrandAdd}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBrandAdd(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Shopping Site</Text>
            <TextInput
              testID="brand-name-input"
              value={bName}
              onChangeText={setBName}
              placeholder="Brand name"
              placeholderTextColor={colors.subtle}
              style={styles.modalInput}
            />
            <TextInput
              testID="brand-url-input"
              value={bUrl}
              onChangeText={setBUrl}
              autoCapitalize="none"
              placeholder="https://example.com"
              placeholderTextColor={colors.subtle}
              style={styles.modalInput}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <TouchableOpacity
                style={[styles.modalBtnGhost, { flex: 1 }]}
                onPress={() => setShowBrandAdd(false)}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="brand-save-button"
                style={[styles.modalBtn, { flex: 1 }]}
                onPress={addBrand}
              >
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  kicker: { ...typography.label },
  title: { ...typography.hero, marginTop: 4 },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 11, fontWeight: "700", color: colors.primary, letterSpacing: 1 },
  tabTextActive: { color: colors.primaryFg },
  addRowBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  addRowBtnText: { color: colors.primaryFg, fontWeight: "700", letterSpacing: 1, fontSize: 12 },
  wishCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  wishHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  wishName: { fontSize: 17, fontWeight: "800", color: colors.primary },
  wishDesc: { fontSize: 13, color: colors.mutedFg, marginTop: 4 },
  wishTarget: { fontSize: 12, color: colors.accent, fontWeight: "700", marginTop: 4 },
  priceList: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  priceRowBest: { backgroundColor: colors.muted, paddingHorizontal: 8 },
  priceSite: { fontSize: 13, fontWeight: "700", color: colors.primary },
  priceNote: { fontSize: 11, color: colors.mutedFg, marginTop: 2 },
  priceVal: { fontSize: 13, fontWeight: "700", color: colors.primary },
  compareBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 10,
    marginTop: spacing.md,
  },
  compareBtnText: { fontSize: 12, fontWeight: "700", color: colors.primary, letterSpacing: 1 },
  emptySub: { ...typography.body, color: colors.mutedFg, textAlign: "center", marginTop: spacing.lg },
  sectionLabel: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandName: { fontSize: 15, fontWeight: "700", color: colors.primary, flex: 1 },
  brandUrl: { fontSize: 11, color: colors.mutedFg, marginTop: 2 },
  accountBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  boxLabel: { ...typography.label, fontSize: 10 },
  accountName: { fontSize: 22, fontWeight: "800", color: colors.primary, marginTop: spacing.sm },
  accountEmail: { fontSize: 13, color: colors.mutedFg, marginTop: 4 },
  logoutBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 16,
  },
  logoutText: { color: colors.accent, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: { ...typography.h1, marginBottom: spacing.md },
  modalInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
    fontSize: 14.5,
    color: colors.primary,
  },
  modalBtn: { backgroundColor: colors.primary, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  modalBtnGhost: { borderWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: "center" },
  modalBtnGhostText: { color: colors.primary, fontWeight: "700", letterSpacing: 1, fontSize: 12 },
});
