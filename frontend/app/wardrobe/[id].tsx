import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, WardrobeItem } from "@/src/api";
import { getCurrentCoords } from "@/src/location";
import { colors, radii, shadows, spacing, typography } from "@/src/theme";

const PRIVACY = [
  { id: "public", label: "Public" },
  { id: "friends", label: "Friends" },
  { id: "private", label: "Private" },
];

export default function WardrobeDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<WardrobeItem | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [rating, setRating] = useState(3);
  const [privacy, setPrivacy] = useState("friends");
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildModal, setBuildModal] = useState(false);
  const [buildReply, setBuildReply] = useState<string>("");
  const [buildRecs, setBuildRecs] = useState<WardrobeItem[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const it = await api.getWardrobeItem(id);
      setItem(it);
      setName(it.name || "");
      setColor(it.color || "");
      setRating(it.rating);
      setPrivacy(it.privacy);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await api.updateWardrobeItem(id, { name, color, rating, privacy });
      setItem(updated);
      Alert.alert("Saved", "Item updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    Alert.alert("Delete item?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.deleteWardrobeItem(id);
          router.back();
        },
      },
    ]);
  };

  const buildAround = async () => {
    if (!id) return;
    setBuilding(true);
    setBuildModal(true);
    setBuildReply("");
    setBuildRecs([]);
    try {
      let lat: number | undefined;
      let lon: number | undefined;
      try {
        const profile = await api.getProfile();
        if (profile.home_lat != null && profile.home_lon != null) {
          lat = profile.home_lat;
          lon = profile.home_lon;
        } else {
          const c = await getCurrentCoords();
          if (c) {
            lat = c.lat;
            lon = c.lon;
          }
        }
      } catch {}
      const res = await api.buildAround(id, { lat, lon });
      setBuildReply(res.reply);
      // resolve recommended items
      const all = await api.listWardrobe();
      const map: Record<string, WardrobeItem> = {};
      all.forEach((w) => (map[w.id] = w));
      const recs = (res.recommended_item_ids || [])
        .map((rid) => map[rid])
        .filter(Boolean) as WardrobeItem[];
      setBuildRecs(recs);
    } catch (e: any) {
      setBuildReply(`Couldn't build a look right now: ${e.message}`);
    } finally {
      setBuilding(false);
    }
  };

  if (!item) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="wardrobe-detail-screen">
      <View style={styles.headerBar}>
        <TouchableOpacity testID="detail-back-button" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{item.category}</Text>
        <TouchableOpacity testID="detail-delete-button" onPress={remove}>
          <Ionicons name="trash-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <Image
          source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
          style={styles.image}
        />
        <View style={{ padding: spacing.xl }}>
          <Text style={styles.sectionLabel}>NAME</Text>
          <TextInput
            testID="detail-name-input"
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholder="Item name"
            placeholderTextColor={colors.subtle}
          />

          <Text style={styles.sectionLabel}>COLOR</Text>
          <TextInput
            testID="detail-color-input"
            value={color}
            onChangeText={setColor}
            style={styles.input}
            placeholder="Color"
            placeholderTextColor={colors.subtle}
          />

          <Text style={styles.sectionLabel}>YOUR RATING</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <TouchableOpacity
                key={s}
                testID={`detail-rating-${s}`}
                onPress={() => setRating(s)}
                style={{ padding: 4 }}
              >
                <Ionicons
                  name={s <= rating ? "star" : "star-outline"}
                  size={32}
                  color={s <= rating ? colors.primary : colors.subtle}
                />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>VISIBLE TO</Text>
          <View style={styles.chipsWrap}>
            {PRIVACY.map((p) => {
              const active = privacy === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  testID={`detail-privacy-${p.id}`}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setPrivacy(p.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            testID="build-around-button"
            style={styles.buildBtn}
            onPress={buildAround}
            disabled={building}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles" size={16} color={colors.primary} />
            <Text style={styles.buildBtnText}>Build Around This Item</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="detail-save-button"
            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryFg} />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Build Around Modal */}
      <Modal
        visible={buildModal}
        animationType="slide"
        transparent
        onRequestClose={() => setBuildModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.aiAvatar}>
                <Ionicons name="sparkles" size={12} color={colors.primaryFg} />
              </View>
              <Text style={styles.modalKicker}>CLOSETAI · BUILD AROUND</Text>
              <TouchableOpacity testID="build-modal-close" onPress={() => setBuildModal(false)}>
                <Ionicons name="close" size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              <View style={styles.modalAnchorRow}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
                  style={styles.modalAnchorImg}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalAnchorLabel}>BUILDING AROUND</Text>
                  <Text style={styles.modalAnchorTitle} numberOfLines={2}>
                    {item.name || item.category}
                  </Text>
                </View>
              </View>

              {building ? (
                <View style={styles.modalLoadingWrap}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.modalLoadingText}>Pulling pieces from your closet…</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.modalReply}>
                    {buildReply.replace(/ITEM:[0-9a-fA-F-]{36}/g, "").replace(/\s{2,}/g, " ").trim()}
                  </Text>
                  {buildRecs.length > 0 && (
                    <>
                      <Text style={styles.modalSectionLabel}>THE LOOK</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {buildRecs.map((r) => (
                          <View key={r.id} style={styles.recCard} testID={`build-rec-${r.id}`}>
                            <Image
                              source={{ uri: `data:image/jpeg;base64,${r.image_base64}` }}
                              style={styles.recImg}
                            />
                            <Text style={styles.recName} numberOfLines={1}>
                              {r.name || r.category}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.primary,
  },
  image: { width: "100%", height: 420, backgroundColor: colors.muted },
  sectionLabel: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.primary,
  },
  starRow: { flexDirection: "row", gap: spacing.sm },
  chipsWrap: { flexDirection: "row", gap: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  chipTextActive: { color: colors.primaryFg },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  saveBtnText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 13 },
  buildBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    marginTop: spacing.xl,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  buildBtnText: { color: colors.primary, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl,
    paddingTop: 8,
    paddingBottom: spacing.xl,
    maxHeight: "85%",
    ...shadows.soft,
  },
  modalHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: spacing.md,
  },
  aiAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalKicker: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: colors.primary,
  },
  modalAnchorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  modalAnchorImg: {
    width: 64,
    height: 80,
    borderRadius: radii.md,
    backgroundColor: colors.muted,
  },
  modalAnchorLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 1.6, color: colors.subtle },
  modalAnchorTitle: { ...typography.h2, fontSize: 17, marginTop: 4 },
  modalLoadingWrap: { alignItems: "center", paddingVertical: 32, gap: 12 },
  modalLoadingText: { fontSize: 13, fontWeight: "600", color: colors.subtle, letterSpacing: 0.4 },
  modalReply: { fontSize: 15, lineHeight: 22, color: colors.primary, marginBottom: spacing.md },
  modalSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: colors.primary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  recCard: { width: 110, marginRight: 10 },
  recImg: {
    width: 110,
    height: 130,
    borderRadius: radii.md,
    backgroundColor: colors.muted,
  },
  recName: { fontSize: 12, fontWeight: "600", color: colors.primary, marginTop: 6 },
});
