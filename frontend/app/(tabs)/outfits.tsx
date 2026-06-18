import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, WardrobeItem, Weather } from "@/src/api";
import { getCurrentCoords } from "@/src/location";
import { useAuth } from "@/src/useAuth";
import { colors, radii, shadows, spacing, typography } from "@/src/theme";

type ChatMsg = {
  id: string;
  role: "user" | "ai";
  text: string;
  recommended_item_ids?: string[];
};

const STYLIST_HERO =
  "https://images.unsplash.com/photo-1634921276069-c24ba5d6b35c?crop=entropy&cs=srgb&fm=jpg&w=900&q=80";

export default function Outfits() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [weather, setWeather] = useState("");
  const [occasion, setOccasion] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<string | undefined>(undefined);
  const [wardrobeMap, setWardrobeMap] = useState<Record<string, WardrobeItem>>({});
  const [autoWeather, setAutoWeather] = useState<Weather | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const listRef = useRef<FlatList<ChatMsg>>(null);

  const loadWardrobe = useCallback(async () => {
    try {
      const items = await api.listWardrobe();
      const map: Record<string, WardrobeItem> = {};
      items.forEach((i) => (map[i.id] = i));
      setWardrobeMap(map);
    } catch {}
  }, []);

  const loadWeather = useCallback(async () => {
    try {
      const profile = await api.getProfile();
      let lat = profile.home_lat ?? null;
      let lon = profile.home_lon ?? null;
      if (lat == null || lon == null) {
        const c = await getCurrentCoords();
        if (c) {
          lat = c.lat;
          lon = c.lon;
        }
      }
      if (lat != null && lon != null) {
        setCoords({ lat, lon });
        const w = await api.getWeather(lat, lon);
        setAutoWeather(w);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadWardrobe();
    loadWeather();
  }, [loadWardrobe, loadWeather]);

  const send = async (preset?: string) => {
    const msgText = (preset ?? input).trim();
    if (!msgText || loading) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text: msgText };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await api.outfitChat({
        message: msgText,
        session_id: session,
        weather: weather || undefined,
        occasion: occasion || undefined,
        lat: coords?.lat,
        lon: coords?.lon,
      });
      setSession(res.session_id);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "ai",
          text: res.reply,
          recommended_item_ids: res.recommended_item_ids,
        },
      ]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "ai", text: `Hmm, something went wrong: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const runGenerator = async (occ: string, label: string) => {
    if (loading) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text: `Outfit Generator · ${label}` };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await api.outfitGenerator({ occasion: occ, lat: coords?.lat, lon: coords?.lon });
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "ai", text: res.reply, recommended_item_ids: res.recommended_item_ids },
      ]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "ai", text: `Error: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const cleanText = (t: string) => t.replace(/ITEM:[0-9a-fA-F-]{36}/g, "").replace(/\s{2,}/g, " ").trim();

  const renderItem = ({ item }: { item: ChatMsg }) => {
    const isUser = item.role === "user";
    if (isUser) {
      return (
        <View style={styles.userWrap} testID={`chat-msg-${item.id}`}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{cleanText(item.text)}</Text>
          </View>
        </View>
      );
    }
    // AI reply — render as a visual "Outfit Board" card
    const recs = (item.recommended_item_ids || [])
      .map((id) => wardrobeMap[id])
      .filter(Boolean) as WardrobeItem[];
    const hero = recs[0];
    const thumbs = recs.slice(1, 4);
    return (
      <View style={styles.aiWrap} testID={`chat-msg-${item.id}`}>
        <View style={styles.aiAvatarRow}>
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={12} color={colors.primaryFg} />
          </View>
          <Text style={styles.aiName}>ClosetAI</Text>
        </View>

        <View style={styles.boardCard} testID="ai-stylist-outfit-card">
          {recs.length > 0 ? (
            <View style={styles.boardMedia}>
              {hero && (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${hero.image_base64}` }}
                  style={styles.boardHero}
                />
              )}
              {thumbs.length > 0 && (
                <View style={styles.boardThumbs}>
                  {thumbs.map((t) => (
                    <Image
                      key={t.id}
                      source={{ uri: `data:image/jpeg;base64,${t.image_base64}` }}
                      style={styles.boardThumb}
                    />
                  ))}
                  {thumbs.length < 3 &&
                    [...Array(3 - thumbs.length)].map((_, i) => (
                      <View key={`ph-${i}`} style={[styles.boardThumb, styles.boardThumbEmpty]} />
                    ))}
                </View>
              )}
            </View>
          ) : null}

          <View style={styles.boardBody}>
            <Text style={styles.boardTitle}>The Look</Text>
            <Text style={styles.boardText}>{cleanText(item.text)}</Text>

            {recs.length > 0 && (
              <View style={styles.boardPills}>
                {recs.map((r) => (
                  <View key={r.id} style={styles.itemPill}>
                    <View style={styles.itemPillDot} />
                    <Text style={styles.itemPillText} numberOfLines={1}>
                      {r.name || r.category}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const quickPrompts = [
    { text: "What should I wear today?", icon: "sunny-outline" as const },
    { text: "A brunch outfit", icon: "cafe-outline" as const },
    { text: "First-date look", icon: "wine-outline" as const },
    { text: "Workout fit", icon: "barbell-outline" as const },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="outfits-screen">
      <View style={styles.header}>
        <Text style={styles.kicker}>YOUR STYLIST</Text>
        <Text style={styles.heroTitle}>Style me.</Text>
      </View>

      {/* Live weather pill */}
      {autoWeather && (
        <View style={styles.weatherPill} testID="auto-weather-pill">
          <Ionicons name="partly-sunny-outline" size={14} color={colors.primary} />
          <Text style={styles.weatherPillText}>
            {autoWeather.place ? `${autoWeather.place} · ` : ""}
            {Math.round(autoWeather.temp_c)}°C · {autoWeather.condition}
          </Text>
        </View>
      )}

      {/* Outfit generator presets */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.genRowWrap}
        contentContainerStyle={styles.genRow}
      >
        {[
          { id: "work", label: "Work" },
          { id: "weekend", label: "Weekend" },
          { id: "date_night", label: "Date Night" },
          { id: "travel", label: "Travel" },
          { id: "wedding", label: "Wedding" },
          { id: "casual", label: "Casual" },
          { id: "formal", label: "Formal" },
          { id: "hot_weather", label: "Hot" },
          { id: "cold_weather", label: "Cold" },
        ].map((g) => (
          <TouchableOpacity
            key={g.id}
            testID={`outfit-gen-${g.id}`}
            style={styles.genChip}
            onPress={() => runGenerator(g.id, g.label)}
            disabled={loading}
          >
            <Ionicons name="sparkles" size={12} color={colors.primary} />
            <Text style={styles.genChipText}>{g.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Context inputs */}
      <View style={styles.contextRow}>
        <View style={styles.contextInputWrap}>
          <Ionicons name="cloud-outline" size={14} color={colors.textSoft} />
          <TextInput
            testID="weather-input"
            value={weather}
            onChangeText={setWeather}
            placeholder="Weather"
            placeholderTextColor={colors.subtle}
            style={styles.contextInput}
          />
        </View>
        <View style={styles.contextInputWrap}>
          <Ionicons name="calendar-outline" size={14} color={colors.textSoft} />
          <TextInput
            testID="occasion-input"
            value={occasion}
            onChangeText={setOccasion}
            placeholder="Occasion"
            placeholderTextColor={colors.subtle}
            style={styles.contextInput}
          />
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={120}
      >
        {messages.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyWrap}
            keyboardShouldPersistTaps="handled"
            testID="outfits-empty"
          >
            <View style={styles.emptyHeroCard}>
              <Image source={{ uri: STYLIST_HERO }} style={styles.emptyHeroImg} />
              <View style={styles.emptyHeroVeil} />
              <View style={styles.emptyHeroText}>
                <Text style={styles.emptyHeroKicker}>HELLO {((user?.name || "").split(" ")[0] || "").toUpperCase()}</Text>
                <Text style={styles.emptyHeroTitle}>What&apos;s on the agenda?</Text>
                <Text style={styles.emptyHeroSub}>
                  Tell me the weather + the vibe. I&apos;ll pull from your closet.
                </Text>
              </View>
            </View>

            <Text style={styles.suggestionsLabel}>QUICK PROMPTS</Text>
            <View style={styles.suggestionsGrid}>
              {quickPrompts.map((p) => (
                <TouchableOpacity
                  key={p.text}
                  testID={`quick-prompt-${p.text.slice(0, 8)}`}
                  style={styles.suggestionCard}
                  onPress={() => send(p.text)}
                  activeOpacity={0.9}
                >
                  <View style={styles.suggestionIconWrap}>
                    <Ionicons name={p.icon} size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.suggestionText}>{p.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            testID="chat-input"
            value={input}
            onChangeText={setInput}
            placeholder="Describe your day…"
            placeholderTextColor={colors.subtle}
            style={styles.chatInput}
            multiline
          />
          <TouchableOpacity
            testID="chat-send"
            style={[styles.sendBtn, (loading || !input.trim()) && { opacity: 0.45 }]}
            onPress={() => send()}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryFg} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={colors.primaryFg} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  kicker: { ...typography.label, color: colors.primary },
  heroTitle: { ...typography.display, marginTop: 8 },
  weatherPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginHorizontal: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  weatherPillText: { fontSize: 12, fontWeight: "600", color: colors.text },
  genRowWrap: { maxHeight: 52, flexGrow: 0 },
  genRow: { paddingHorizontal: 20, gap: 8, alignItems: "center", height: 52 },
  genChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  genChipText: { fontSize: 12, fontWeight: "700", color: colors.text },

  contextRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: spacing.md, marginBottom: spacing.sm },
  contextInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  contextInput: { flex: 1, fontSize: 13, color: colors.text, paddingVertical: 0 },

  emptyWrap: { padding: 20, paddingBottom: 40 },
  emptyHeroCard: {
    borderRadius: radii.xl,
    overflow: "hidden",
    height: 240,
    ...shadows.soft,
  },
  emptyHeroImg: { width: "100%", height: "100%" },
  emptyHeroVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 26, 26, 0.35)",
  },
  emptyHeroText: { position: "absolute", left: 20, right: 20, bottom: 20 },
  emptyHeroKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    color: "#fff",
    opacity: 0.85,
  },
  emptyHeroTitle: {
    fontFamily: typography.hero.fontFamily,
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
    marginTop: 8,
    lineHeight: 34,
  },
  emptyHeroSub: { fontSize: 13, color: "#fff", opacity: 0.85, marginTop: 6 },

  suggestionsLabel: { ...typography.label, marginTop: spacing.xl, marginBottom: spacing.md },
  suggestionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  suggestionCard: {
    flexBasis: "48%",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  suggestionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  suggestionText: { fontSize: 13, fontWeight: "600", color: colors.text },

  chatList: { padding: 20, paddingBottom: 100 },

  userWrap: { alignItems: "flex-end", marginVertical: 6 },
  userBubble: {
    maxWidth: "80%",
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
    borderBottomRightRadius: 6,
  },
  userText: { color: colors.primaryFg, fontSize: 14.5, lineHeight: 21 },

  aiWrap: { marginVertical: 10 },
  aiAvatarRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, marginLeft: 4 },
  aiAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  aiName: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, color: colors.primary },

  boardCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  boardMedia: { flexDirection: "row", height: 240, padding: 8, gap: 8 },
  boardHero: {
    flex: 1.4,
    height: "100%",
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSoft,
  },
  boardThumbs: { flex: 1, gap: 8 },
  boardThumb: { flex: 1, borderRadius: radii.md, backgroundColor: colors.surfaceSoft },
  boardThumbEmpty: { backgroundColor: colors.surfaceSoft, opacity: 0.6 },

  boardBody: { padding: 16 },
  boardTitle: { ...typography.h2, fontSize: 20, color: colors.primary },
  boardText: { fontSize: 14.5, lineHeight: 22, color: colors.text, marginTop: 6 },
  boardPills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  itemPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  itemPillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  itemPillText: { fontSize: 11, fontWeight: "600", color: colors.text, maxWidth: 140 },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
  },
  chatInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
});
