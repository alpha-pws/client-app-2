import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Friend, WardrobeItem } from "@/src/api";
import { colors, spacing, typography } from "@/src/theme";

const { width } = Dimensions.get("window");
const ITEM_W = (width - spacing.xl * 2 - 12) / 2;

const ACCESS = [
  { id: "none", label: "None" },
  { id: "limited", label: "Limited" },
  { id: "full", label: "Full" },
] as const;

export default function FriendCloset() {
  const router = useRouter();
  const { id, name, friendshipId, access } = useLocalSearchParams<{
    id: string;
    name: string;
    friendshipId?: string;
    access?: string;
  }>();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [selected, setSelected] = useState<WardrobeItem | null>(null);
  const [recMsg, setRecMsg] = useState("I think this would look great on you!");
  const [sending, setSending] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [currentAccess, setCurrentAccess] = useState<string>(access || "limited");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setDenied(false);
    try {
      const list = await api.viewFriendWardrobe(id);
      setItems(list);
    } catch (e: any) {
      if (e.message?.toLowerCase().includes("no access")) setDenied(true);
      else console.warn(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sendRecommendation = async () => {
    if (!selected || !id) return;
    setSending(true);
    try {
      await api.sendMessage({
        to_user_id: id,
        text: recMsg,
        recommended_item_id: selected.id,
      });
      setSelected(null);
      Alert.alert("Sent", "Your recommendation was sent.");
      router.push({ pathname: "/social/chat/[friendId]", params: { friendId: id, name } });
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally {
      setSending(false);
    }
  };

  const updateAccess = async (level: "none" | "limited" | "full") => {
    if (!friendshipId) return;
    try {
      await api.updateFriendAccess(friendshipId, level);
      setCurrentAccess(level);
      setShowAccessModal(false);
      Alert.alert("Updated", `${name} now has ${level} access to your wardrobe.`);
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="friend-closet-screen">
      <View style={styles.headerBar}>
        <TouchableOpacity testID="friend-back" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.headerKicker}>{name?.toUpperCase()}&apos;S CLOSET</Text>
        </View>
        <TouchableOpacity
          testID="open-chat"
          onPress={() => router.push({ pathname: "/social/chat/[friendId]", params: { friendId: id, name } })}
        >
          <Ionicons name="chatbubble-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {friendshipId && (
        <TouchableOpacity
          testID="access-banner"
          style={styles.accessBanner}
          onPress={() => setShowAccessModal(true)}
        >
          <Ionicons name="lock-closed-outline" size={14} color={colors.mutedFg} />
          <Text style={styles.accessBannerText}>
            Your wardrobe access for {name}: <Text style={{ fontWeight: "800" }}>{currentAccess}</Text> · Tap to change
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : denied ? (
        <View style={styles.center} testID="friend-closet-denied">
          <Ionicons name="lock-closed" size={56} color={colors.subtle} />
          <Text style={styles.emptyTitle}>No access</Text>
          <Text style={styles.emptySub}>This user hasn&apos;t shared their wardrobe with you.</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Nothing shared yet</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: spacing.xl }}
          contentContainerStyle={{ gap: 12, paddingBottom: 120, paddingTop: spacing.md }}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`friend-item-${item.id}`}
              style={styles.card}
              onPress={() => setSelected(item)}
            >
              <Image
                source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
                style={[styles.cardImg, { width: ITEM_W, height: ITEM_W * 1.2 }]}
              />
              <View style={styles.cardFooter}>
                <Text style={styles.cardCat}>{item.category}</Text>
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.name || "Untitled"}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Recommend modal */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Recommend this</Text>
            {selected && (
              <View style={styles.modalItemRow}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${selected.image_base64}` }}
                  style={styles.modalImg}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalCat}>{selected.category}</Text>
                  <Text style={styles.modalName}>{selected.name || "Untitled"}</Text>
                </View>
              </View>
            )}
            <Text style={styles.sectionLabel}>YOUR MESSAGE</Text>
            <TextInput
              testID="rec-message-input"
              value={recMsg}
              onChangeText={setRecMsg}
              style={styles.modalInput}
              multiline
            />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <TouchableOpacity style={[styles.modalBtnGhost, { flex: 1 }]} onPress={() => setSelected(null)}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="rec-send-button"
                style={[styles.modalBtn, { flex: 1 }, sending && { opacity: 0.5 }]}
                onPress={sendRecommendation}
                disabled={sending}
              >
                <Text style={styles.modalBtnText}>{sending ? "Sending…" : "Send"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Access modal */}
      <Modal
        visible={showAccessModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAccessModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Wardrobe access</Text>
            <Text style={styles.helper}>How much of YOUR closet can {name} see?</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {ACCESS.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  testID={`access-option-${a.id}`}
                  style={[
                    styles.accessOption,
                    currentAccess === a.id && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => updateAccess(a.id)}
                >
                  <Text
                    style={[
                      styles.accessOptionText,
                      currentAccess === a.id && { color: colors.primaryFg },
                    ]}
                  >
                    {a.label}
                  </Text>
                  <Text
                    style={[
                      styles.accessHelper,
                      currentAccess === a.id && { color: colors.primaryFg },
                    ]}
                  >
                    {a.id === "none" && "Nothing visible"}
                    {a.id === "limited" && "Only items rated 4★ or higher"}
                    {a.id === "full" && "All public + friend-visible items"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalBtnGhost} onPress={() => setShowAccessModal(false)}>
              <Text style={styles.modalBtnGhostText}>Close</Text>
            </TouchableOpacity>
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
  headerKicker: { ...typography.label },
  accessBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.muted,
  },
  accessBannerText: { fontSize: 12, color: colors.mutedFg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { ...typography.h2, marginTop: spacing.md },
  emptySub: { ...typography.body, color: colors.mutedFg, textAlign: "center", marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cardImg: { backgroundColor: colors.muted },
  cardFooter: { padding: 10 },
  cardCat: { ...typography.label, fontSize: 9 },
  cardName: { fontSize: 13, fontWeight: "700", color: colors.primary, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: { ...typography.h1 },
  helper: { ...typography.body, color: colors.mutedFg, marginTop: 4 },
  modalItemRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.muted,
  },
  modalImg: { width: 70, height: 80, backgroundColor: colors.surface },
  modalCat: { ...typography.label, fontSize: 10 },
  modalName: { fontSize: 15, fontWeight: "700", color: colors.primary, marginTop: 2 },
  sectionLabel: { ...typography.label, marginTop: spacing.md, marginBottom: spacing.sm },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 14,
    color: colors.primary,
    minHeight: 80,
    textAlignVertical: "top",
  },
  modalBtn: { backgroundColor: colors.primary, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  modalBtnGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  modalBtnGhostText: { color: colors.primary, fontWeight: "700", letterSpacing: 1, fontSize: 12 },
  accessOption: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  accessOptionText: { fontSize: 16, fontWeight: "800", color: colors.primary },
  accessHelper: { fontSize: 12, color: colors.mutedFg, marginTop: 4 },
});

// ScrollView is imported but currently unused; keep types valid
void ScrollView;
