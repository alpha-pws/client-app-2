import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { colors, spacing, typography } from "@/src/theme";

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
});
