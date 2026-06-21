import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api, Message } from "@/src/api";
import { compressImage } from "@/src/upload";
import { useAuth } from "@/src/useAuth";
import { colors, spacing, typography } from "@/src/theme";

export default function Chat() {
  const router = useRouter();
  const { friendId, name } = useLocalSearchParams<{ friendId: string; name: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    if (!friendId) return;
    try {
      const msgs = await api.getMessages(friendId);
      setMessages(msgs);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (e: any) {
      console.warn(e.message);
    } finally {
      setLoading(false);
    }
  }, [friendId]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Auto-refresh every 5s while focused
      const t = setInterval(load, 5000);
      return () => clearInterval(t);
    }, [load]),
  );

  const send = async () => {
    if (!input.trim() || !friendId) return;
    setSending(true);
    try {
      const m = await api.sendMessage({ to_user_id: friendId, text: input.trim() });
      setMessages((prev) => [...prev, m]);
      setInput("");
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      console.warn(e.message);
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (source: "camera" | "gallery") => {
    if (!friendId || sending) return;
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const r =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 1,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 1,
            });
      if (r.canceled || !r.assets[0]?.uri) return;
      setSending(true);
      const compressed = await compressImage(r.assets[0].uri);
      const m = await api.sendMessage({
        to_user_id: friendId,
        image_base64: compressed.base64,
        text: "",
      });
      setMessages((prev) => [...prev, m]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      console.warn("[chat] sendImage failed", e?.message || e);
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const mine = item.from_user_id === user?.id;
    return (
      <View
        testID={`chat-msg-${item.id}`}
        style={[styles.bubbleWrap, mine ? styles.userWrap : styles.aiWrap]}
      >
        <View style={[styles.bubble, mine ? styles.userBubble : styles.aiBubble]}>
          {item.recommended_item_snapshot && (
            <View style={styles.snapshot}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${item.recommended_item_snapshot.image_base64}` }}
                style={styles.snapImg}
              />
              <Text style={styles.snapLabel}>
                Recommended: {item.recommended_item_snapshot.name || item.recommended_item_snapshot.category}
              </Text>
            </View>
          )}
          {item.image_base64 && (
            <Image
              source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
              style={styles.chatPhoto}
              testID={`chat-image-${item.id}`}
            />
          )}
          {!!item.text && (
            <Text style={[styles.bubbleText, mine && { color: colors.primaryFg }]}>{item.text}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="chat-screen">
      <View style={styles.headerBar}>
        <TouchableOpacity testID="chat-back" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{name || "Chat"}</Text>
        <TouchableOpacity
          testID="view-friend-closet"
          onPress={() =>
            router.push({ pathname: "/social/friend/[id]", params: { id: friendId, name } })
          }
        >
          <Ionicons name="shirt-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={20}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : messages.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubble-ellipses-outline" size={56} color={colors.subtle} />
            <Text style={styles.emptyText}>Start the conversation with {name}.</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
          />
        )}
        <View style={styles.inputBar}>
          <TouchableOpacity
            testID="chat-camera-button"
            style={styles.iconBtn}
            onPress={() => sendImage("camera")}
            disabled={sending}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="camera" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="chat-gallery-button"
            style={styles.iconBtn}
            onPress={() => sendImage("gallery")}
            disabled={sending}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="image" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TextInput
            testID="chat-msg-input"
            value={input}
            onChangeText={setInput}
            placeholder="Message…"
            placeholderTextColor={colors.subtle}
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            testID="chat-msg-send"
            style={[styles.sendBtn, (sending || !input.trim()) && { opacity: 0.4 }]}
            onPress={send}
            disabled={sending || !input.trim()}
          >
            {sending ? (
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
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h2, fontSize: 18 },
  list: { padding: spacing.md, paddingBottom: 24 },
  bubbleWrap: { marginVertical: 4 },
  userWrap: { alignItems: "flex-end" },
  aiWrap: { alignItems: "flex-start" },
  bubble: { maxWidth: "80%", padding: 12 },
  userBubble: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 16,
  },
  bubbleText: { fontSize: 14.5, lineHeight: 20, color: colors.primary },
  snapshot: { marginBottom: 8 },
  snapImg: { width: 140, height: 160, backgroundColor: colors.muted },
  snapLabel: { fontSize: 11, fontWeight: "700", marginTop: 4, color: colors.mutedFg },
  chatPhoto: {
    width: 200,
    height: 220,
    borderRadius: 12,
    backgroundColor: colors.muted,
    marginBottom: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
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
  input: {
    flex: 1,
    fontSize: 14.5,
    color: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyText: { ...typography.body, color: colors.mutedFg, marginTop: spacing.md, textAlign: "center" },
});
