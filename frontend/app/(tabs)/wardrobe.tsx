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
import { useAuth } from "@/src/useAuth";
import { colors, radii, shadows, spacing, typography } from "@/src/theme";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "tops", label: "Tops" },
  { id: "bottoms", label: "Bottoms" },
  { id: "outerwear", label: "Outerwear" },
  { id: "dresses", label: "Dresses" },
  { id: "shoes", label: "Shoes" },
  { id: "accessories", label: "Accessories" },
];

const EMPTY_IMG =
  "https://images.unsplash.com/photo-1509319117193-57bab727e09d?crop=entropy&cs=srgb&fm=jpg&w=800&q=80";

const { width } = Dimensions.get("window");
const COL_GAP = 12;
const SIDE = 20;
const COL_W = (width - SIDE * 2 - COL_GAP) / 2;
// Pinterest-style varied heights
const HEIGHTS = [COL_W * 1.05, COL_W * 1.35, COL_W * 1.2, COL_W * 1.5, COL_W * 1.15, COL_W * 1.4];

function splitColumns<T>(items: T[]): [T[], T[]] {
  const left: T[] = [];
  const right: T[] = [];
  let lh = 0;
  let rh = 0;
  items.forEach((it, i) => {
    const h = HEIGHTS[i % HEIGHTS.length];
    if (lh <= rh) {
      left.push(it);
      lh += h;
    } else {
      right.push(it);
      rh += h;
    }
  });
  return [left, right];
}

export default function Wardrobe() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [cat, setCat] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.listWardrobe(cat === "all" ? undefined : cat);
      setItems(data);
    } catch (e: any) {
      console.warn(e.message);
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

  const [colA, colB] = splitColumns(items);

  const renderCard = (item: WardrobeItem, idx: number) => {
    const h = HEIGHTS[idx % HEIGHTS.length];
    return (
      <TouchableOpacity
        testID={`wardrobe-item-${item.id}`}
        key={item.id}
        style={[styles.card, { width: COL_W, height: h + 56 }]}
        activeOpacity={0.92}
        onPress={() => router.push(`/wardrobe/${item.id}`)}
      >
        <Image
          source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
          style={[styles.cardImg, { width: COL_W, height: h }]}
        />
        <View style={styles.heartBadge}>
          <Ionicons name="heart" size={12} color={colors.primary} />
          <Text style={styles.heartText}>{item.rating}</Text>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardCat}>{item.category}</Text>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name || "Untitled piece"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const firstName = (user?.name || "").split(" ")[0] || "you";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="wardrobe-screen">
      <FlatList
        data={[0]}
        keyExtractor={() => "page"}
        renderItem={() => (
          <View>
            {/* Editorial header */}
            <View style={styles.header}>
              <Text style={styles.kicker} testID="wardrobe-kicker">
                {firstName.toUpperCase()}&apos;S CLOSET
              </Text>
              <Text style={styles.heroTitle}>The Closet.</Text>
              <Text style={styles.heroSub}>
                {items.length} {items.length === 1 ? "piece" : "pieces"} curated · tap any item to edit
              </Text>
            </View>

            {/* Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsRowWrap}
              contentContainerStyle={styles.chipsRow}
            >
              {CATEGORIES.map((c) => {
                const active = cat === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    testID={`filter-chip-${c.id}`}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setCat(c.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Grid */}
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : items.length === 0 ? (
              <View style={styles.empty} testID="wardrobe-empty">
                <Image source={{ uri: EMPTY_IMG }} style={styles.emptyImg} />
                <Text style={styles.emptyTitle}>A blank canvas.</Text>
                <Text style={styles.emptySub}>
                  Snap your favorite piece and let ClosetAI style it with you.
                </Text>
                <TouchableOpacity
                  testID="wardrobe-empty-add-button"
                  style={styles.pillCta}
                  onPress={() => router.push("/wardrobe/add")}
                >
                  <Ionicons name="camera" size={16} color={colors.primaryFg} />
                  <Text style={styles.pillCtaText}>Add First Piece</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View
                style={styles.masonry}
                testID="wardrobe-masonry-grid"
              >
                <View style={{ width: COL_W, gap: COL_GAP }}>
                  {colA.map((it, i) => renderCard(it, i * 2))}
                </View>
                <View style={{ width: COL_W, gap: COL_GAP }}>
                  {colB.map((it, i) => renderCard(it, i * 2 + 1))}
                </View>
              </View>
            )}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 160 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      />

      {/* Floating FAB */}
      <TouchableOpacity
        testID="wardrobe-fab-add"
        style={styles.fab}
        activeOpacity={0.88}
        onPress={() => router.push("/wardrobe/add")}
      >
        <Ionicons name="add" size={28} color={colors.primaryFg} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: SIDE, paddingTop: spacing.lg, paddingBottom: spacing.md },
  kicker: { ...typography.label, color: colors.primary },
  heroTitle: { ...typography.display, marginTop: 8, color: colors.text },
  heroSub: { ...typography.body, color: colors.textSoft, marginTop: 6 },
  chipsRowWrap: { maxHeight: 56, flexGrow: 0, marginBottom: spacing.md },
  chipsRow: {
    paddingHorizontal: SIDE,
    gap: 8,
    alignItems: "center",
    height: 56,
  },
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  chipTextActive: { color: colors.primaryFg },
  masonry: {
    flexDirection: "row",
    paddingHorizontal: SIDE,
    gap: COL_GAP,
  },
  card: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...shadows.soft,
  },
  cardImg: { backgroundColor: colors.surfaceSoft },
  heartBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: radii.pill,
  },
  heartText: { fontSize: 11, fontWeight: "700", color: colors.primary },
  cardFooter: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardCat: { ...typography.label, fontSize: 9, color: colors.textSoft },
  cardName: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 2, fontFamily: undefined },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xl, height: 240 },
  empty: { alignItems: "center", padding: spacing.xl, paddingTop: spacing.md },
  emptyImg: {
    width: "100%",
    height: 240,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceSoft,
  },
  emptyTitle: { ...typography.h1, marginTop: spacing.lg, textAlign: "center" },
  emptySub: {
    ...typography.bodyLarge,
    color: colors.textSoft,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: spacing.lg,
  },
  pillCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: radii.pill,
    marginTop: spacing.lg,
    ...shadows.soft,
  },
  pillCtaText: {
    color: colors.primaryFg,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 100,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.lift,
  },
});
