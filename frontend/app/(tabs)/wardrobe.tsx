import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, WardrobeItem } from "@/src/api";
import { colors, spacing, typography } from "@/src/theme";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "tops", label: "Tops" },
  { id: "bottoms", label: "Bottoms" },
  { id: "outerwear", label: "Outerwear" },
  { id: "dresses", label: "Dresses" },
  { id: "shoes", label: "Shoes" },
  { id: "accessories", label: "Accessories" },
];

const { width } = Dimensions.get("window");
const GRID_GAP = 12;
const ITEM_W = (width - spacing.xl * 2 - GRID_GAP) / 2;

export default function Wardrobe() {
  const router = useRouter();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [cat, setCat] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.listWardrobe(cat === "all" ? undefined : cat);
      setItems(data);
    } catch (e: any) {
      console.warn("wardrobe load failed", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cat]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="wardrobe-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>YOUR WARDROBE</Text>
          <Text style={styles.title}>Closet.</Text>
        </View>
        <View style={styles.headerCount}>
          <Text style={styles.countNum}>{items.length}</Text>
          <Text style={styles.countLabel}>items</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsRowWrap}
      >
        {CATEGORIES.map((c) => {
          const active = cat === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              testID={`wardrobe-chip-${c.id}`}
              onPress={() => setCat(c.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center} testID="wardrobe-empty">
          <Ionicons name="shirt-outline" size={72} color={colors.subtle} />
          <Text style={styles.emptyTitle}>Your closet is empty</Text>
          <Text style={styles.emptySub}>Snap a photo of your first item to begin.</Text>
          <TouchableOpacity
            testID="wardrobe-empty-add-button"
            style={styles.primaryBtn}
            onPress={() => router.push("/wardrobe/add")}
          >
            <Text style={styles.primaryBtnText}>+ Add First Item</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          numColumns={2}
          columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: spacing.xl }}
          contentContainerStyle={{ gap: GRID_GAP, paddingBottom: 120, paddingTop: spacing.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`wardrobe-item-${item.id}`}
              style={styles.card}
              onPress={() => router.push(`/wardrobe/${item.id}`)}
            >
              <Image
                source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
                style={[styles.cardImg, { width: ITEM_W, height: ITEM_W * 1.2 }]}
              />
              <View style={styles.cardFooter}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardCat} numberOfLines={1}>
                    {item.category}
                  </Text>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name || "Untitled"}
                  </Text>
                </View>
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={10} color={colors.primary} />
                  <Text style={styles.ratingText}>{item.rating}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        testID="wardrobe-fab-add"
        style={styles.fab}
        onPress={() => router.push("/wardrobe/add")}
      >
        <Ionicons name="camera" size={24} color={colors.primaryFg} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  kicker: { ...typography.label },
  title: { ...typography.hero, marginTop: 4 },
  headerCount: { alignItems: "flex-end" },
  countNum: { fontSize: 28, fontWeight: "900", color: colors.primary },
  countLabel: { ...typography.small, textTransform: "uppercase", letterSpacing: 1 },
  chipsRowWrap: { maxHeight: 56, flexGrow: 0 },
  chipsRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, alignItems: "center", height: 56 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.primary, letterSpacing: 0.5 },
  chipTextActive: { color: colors.primaryFg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { ...typography.h2, marginTop: spacing.lg },
  emptySub: { ...typography.body, color: colors.mutedFg, marginTop: spacing.sm, textAlign: "center" },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  primaryBtnText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cardImg: { backgroundColor: colors.muted },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 6,
  },
  cardCat: { ...typography.small, textTransform: "uppercase", letterSpacing: 1, fontSize: 10 },
  cardName: { ...typography.h3, fontSize: 14, marginTop: 2 },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.muted,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  ratingText: { fontSize: 11, fontWeight: "700", color: colors.primary },
  fab: {
    position: "absolute",
    right: spacing.xl,
    bottom: 80,
    width: 56,
    height: 56,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
