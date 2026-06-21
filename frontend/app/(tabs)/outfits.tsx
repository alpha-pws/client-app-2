import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { api, WardrobeItem, Weather } from "@/src/api";
import { getCurrentCoords } from "@/src/location";
import { colors, radii, shadows, spacing, typography } from "@/src/theme";

const RECENT_KEY = "@closetai/stylist_recent_v1";
const MAX_RECENT = 8;

const TRENDING: { text: string; icon: keyof typeof import("@expo/vector-icons/build/Ionicons").default.glyphMap }[] = [
  { text: "Wedding guest outfit", icon: "rose-outline" },
  { text: "Rainy day commute", icon: "rainy-outline" },
  { text: "Beach vacation pack", icon: "sunny-outline" },
  { text: "Office to dinner", icon: "wine-outline" },
  { text: "Weekend brunch", icon: "cafe-outline" },
  { text: "Gym to coffee", icon: "barbell-outline" },
  { text: "Festival fit", icon: "musical-notes-outline" },
  { text: "Job interview", icon: "briefcase-outline" },
];

type ChatMsg = {
  id: string;
  role: "user" | "ai";
  text: string;
  recommended_item_ids?: string[];
};

export default function Outfits() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<string | undefined>(undefined);
  const [wardrobeMap, setWardrobeMap] = useState<Record<string, WardrobeItem>>({});
  const [autoWeather, setAutoWeather] = useState<Weather | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [kbVisible, setKbVisible] = useState(false);
  const listRef = useRef<FlatList<ChatMsg>>(null);
  const inputRef = useRef<TextInput>(null);

  // Load recent searches from disk on mount.
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const arr = JSON.parse(raw) as string[];
            if (Array.isArray(arr)) setRecent(arr.filter((x) => typeof x === "string").slice(0, MAX_RECENT));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Keyboard visibility tracking so we can render a dedicated dismiss bar.
  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () =>
      setKbVisible(true),
    );
    const hideSub = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () =>
      setKbVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const pushRecent = useCallback(async (text: string) => {
    const cleaned = text.trim();
    if (!cleaned || cleaned.length < 2) return;
    setRecent((prev) => {
      const next = [cleaned, ...prev.filter((x) => x.toLowerCase() !== cleaned.toLowerCase())].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearRecent = useCallback(async () => {
    setRecent([]);
    await AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
  }, []);

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
    // Only persist user-typed prompts (not preset chips).
    if (!preset) pushRecent(msgText);
    Keyboard.dismiss();
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text: msgText };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await api.outfitChat({
        message: msgText,
        session_id: session,
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="outfits-screen">
      <View style={styles.header}>
        <Text style={styles.kicker}>YOUR STYLIST</Text>
        <Text style={styles.heroTitle}>Style me.</Text>
      </View>

      {/* Sticky search bar (always at top, like Instagram/Amazon/ChatGPT) */}
      <View style={styles.stickySearch} testID="stylist-sticky-search">
        <View style={styles.searchBarWrap}>
          <Ionicons name="search" size={16} color={colors.subtle} />
          <TextInput
            ref={inputRef}
            testID="chat-input"
            value={input}
            onChangeText={setInput}
            placeholder="Ask your stylist anything…"
            placeholderTextColor={colors.subtle}
            style={styles.searchBarInput}
            returnKeyType="send"
            onSubmitEditing={() => send()}
            blurOnSubmit
          />
          {!!input && (
            <TouchableOpacity
              testID="chat-clear"
              onPress={() => setInput("")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.subtle} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            testID="chat-send"
            style={[styles.sendBtn, (loading || !input.trim()) && { opacity: 0.4 }]}
            onPress={() => send()}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryFg} size="small" />
            ) : (
              <Ionicons name="arrow-up" size={18} color={colors.primaryFg} />
            )}
          </TouchableOpacity>
        </View>

        {/* Keyboard-dismiss bar */}
        {kbVisible && (
          <View style={styles.kbDismissBar}>
            <TouchableOpacity
              testID="dismiss-keyboard"
              onPress={Keyboard.dismiss}
              style={styles.kbDismissBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="chevron-down" size={14} color={colors.primary} />
              <Text style={styles.kbDismissText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
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

      <Pressable
        style={{ flex: 1 }}
        onPress={Keyboard.dismiss}
        accessible={false}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={120}
        >
          {messages.length === 0 ? (
            <ScrollView
              contentContainerStyle={styles.emptyWrap}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              testID="outfits-empty"
            >
              {/* Recent */}
              {recent.length > 0 && (
                <View style={{ marginBottom: spacing.lg }} testID="recent-searches">
                  <View style={styles.chipsHeaderRow}>
                    <Text style={styles.suggestionsLabel}>RECENT</Text>
                    <TouchableOpacity testID="clear-recent" onPress={clearRecent} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Text style={styles.clearLink}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.chipsWrap}>
                    {recent.map((r) => (
                      <TouchableOpacity
                        key={r}
                        testID={`recent-chip-${r.slice(0, 12)}`}
                        style={styles.softChip}
                        onPress={() => send(r)}
                      >
                        <Ionicons name="time-outline" size={12} color={colors.text} />
                        <Text style={styles.softChipText} numberOfLines={1}>
                          {r}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Trending */}
              <Text style={styles.suggestionsLabel}>TRENDING NOW</Text>
              <View style={styles.chipsWrap}>
                {TRENDING.map((t) => (
                  <TouchableOpacity
                    key={t.text}
                    testID={`trending-chip-${t.text.slice(0, 12)}`}
                    style={styles.softChip}
                    onPress={() => send(t.text)}
                  >
                    <Ionicons name={t.icon} size={12} color={colors.text} />
                    <Text style={styles.softChipText}>{t.text}</Text>
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
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            />
          )}
        </KeyboardAvoidingView>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  kicker: { ...typography.label, color: colors.primary },
  heroTitle: { ...typography.display, marginTop: 8 },

  stickySearch: {
    paddingHorizontal: 20,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 10,
  },
  kbDismissBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 6,
  },
  kbDismissBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  kbDismissText: { fontSize: 12, fontWeight: "700", color: colors.primary },

  chipsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  clearLink: { fontSize: 11, fontWeight: "700", color: colors.subtle, letterSpacing: 0.6 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  softChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 220,
  },
  softChipText: { fontSize: 12, fontWeight: "600", color: colors.text },

  weatherPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginHorizontal: 20,
    marginTop: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weatherPillText: { fontSize: 12, fontWeight: "600", color: colors.text },
  genRowWrap: { maxHeight: 60, flexGrow: 0, marginTop: spacing.sm },
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

  emptyWrap: { padding: 20, paddingBottom: 40 },
  suggestionsLabel: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.md },

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

  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
