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
import { api, WardrobeItem } from "@/src/api";
import { colors, spacing, typography } from "@/src/theme";

type ChatMsg = {
  id: string;
  role: "user" | "ai";
  text: string;
  recommended_item_ids?: string[];
};

export default function Outfits() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [weather, setWeather] = useState("");
  const [occasion, setOccasion] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<string | undefined>(undefined);
  const [wardrobeMap, setWardrobeMap] = useState<Record<string, WardrobeItem>>({});
  const listRef = useRef<FlatList<ChatMsg>>(null);

  const loadWardrobe = useCallback(async () => {
    try {
      const items = await api.listWardrobe();
      const map: Record<string, WardrobeItem> = {};
      items.forEach((i) => (map[i.id] = i));
      setWardrobeMap(map);
    } catch {}
  }, []);

  useEffect(() => {
    loadWardrobe();
  }, [loadWardrobe]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    const msgText = input.trim();
    setInput("");
    setLoading(true);
    try {
      const res = await api.outfitChat({
        message: msgText,
        session_id: session,
        weather: weather || undefined,
        occasion: occasion || undefined,
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
        { id: `e-${Date.now()}`, role: "ai", text: `Error: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const cleanText = (t: string) => t.replace(/ITEM:[0-9a-fA-F-]{36}/g, "").replace(/\s{2,}/g, " ").trim();

  const renderItem = ({ item }: { item: ChatMsg }) => {
    const isUser = item.role === "user";
    return (
      <View
        testID={`chat-msg-${item.id}`}
        style={[styles.bubbleWrap, isUser ? styles.userWrap : styles.aiWrap]}
      >
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.bubbleText, isUser && { color: colors.primaryFg }]}>
            {cleanText(item.text)}
          </Text>
        </View>
        {item.recommended_item_ids && item.recommended_item_ids.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recRow}>
            {item.recommended_item_ids.map((id) => {
              const w = wardrobeMap[id];
              if (!w) return null;
              return (
                <View key={id} style={styles.recCard} testID={`rec-item-${id}`}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${w.image_base64}` }}
                    style={styles.recImg}
                  />
                  <Text style={styles.recCat}>{w.category}</Text>
                  <Text style={styles.recName} numberOfLines={1}>
                    {w.name || "Untitled"}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  };

  const quickPrompts = [
    "What should I wear today?",
    "Pair an outfit for brunch",
    "Casual coffee date look",
    "Workout outfit",
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="outfits-screen">
      <View style={styles.header}>
        <Text style={styles.kicker}>AI STYLIST</Text>
        <Text style={styles.title}>Stylist.</Text>
      </View>

      <View style={styles.contextRow}>
        <View style={styles.contextInputWrap}>
          <Ionicons name="cloud-outline" size={14} color={colors.mutedFg} />
          <TextInput
            testID="weather-input"
            value={weather}
            onChangeText={setWeather}
            placeholder="Weather (e.g. 15°C rainy)"
            placeholderTextColor={colors.subtle}
            style={styles.contextInput}
          />
        </View>
        <View style={styles.contextInputWrap}>
          <Ionicons name="calendar-outline" size={14} color={colors.mutedFg} />
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
        keyboardVerticalOffset={80}
      >
        {messages.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyWrap}
            keyboardShouldPersistTaps="handled"
            testID="outfits-empty"
          >
            <Ionicons name="sparkles" size={48} color={colors.primary} />
            <Text style={styles.emptyTitle}>Ask your stylist.</Text>
            <Text style={styles.emptySub}>
              Tell ClosetAI the weather + occasion. It&apos;ll pull from your closet.
            </Text>
            <View style={styles.quickWrap}>
              {quickPrompts.map((p) => (
                <TouchableOpacity
                  key={p}
                  testID={`quick-prompt-${p.slice(0, 8)}`}
                  style={styles.quickChip}
                  onPress={() => setInput(p)}
                >
                  <Text style={styles.quickText}>{p}</Text>
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
            onSubmitEditing={send}
          />
          <TouchableOpacity
            testID="chat-send"
            style={[styles.sendBtn, (loading || !input.trim()) && { opacity: 0.4 }]}
            onPress={send}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryFg} />
            ) : (
              <Ionicons name="arrow-up" size={18} color={colors.primaryFg} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  kicker: { ...typography.label },
  title: { ...typography.hero, marginTop: 4 },
  contextRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  contextInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  contextInput: { flex: 1, fontSize: 13, color: colors.primary, paddingVertical: 0 },
  emptyWrap: { padding: spacing.xl, alignItems: "center", justifyContent: "center", flexGrow: 1 },
  emptyTitle: { ...typography.h1, marginTop: spacing.md },
  emptySub: { ...typography.body, color: colors.mutedFg, marginTop: spacing.sm, textAlign: "center" },
  quickWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xl, justifyContent: "center" },
  quickChip: {
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  quickText: { fontSize: 12, fontWeight: "600", color: colors.primary },
  chatList: { padding: spacing.md, paddingBottom: 24 },
  bubbleWrap: { marginVertical: 6 },
  userWrap: { alignItems: "flex-end" },
  aiWrap: { alignItems: "flex-start" },
  bubble: { maxWidth: "85%", padding: 14 },
  userBubble: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 18,
  },
  bubbleText: { fontSize: 14.5, lineHeight: 21, color: colors.primary },
  recRow: { marginTop: spacing.sm, flexDirection: "row" },
  recCard: {
    width: 110,
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 6,
  },
  recImg: { width: "100%", height: 130, backgroundColor: colors.muted, marginBottom: 6 },
  recCat: { ...typography.small, textTransform: "uppercase", letterSpacing: 1, fontSize: 9 },
  recName: { fontSize: 12, fontWeight: "700", color: colors.primary },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  chatInput: {
    flex: 1,
    fontSize: 14.5,
    color: colors.primary,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colors.muted,
    maxHeight: 120,
    borderRadius: 18,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
