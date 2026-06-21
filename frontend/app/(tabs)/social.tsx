import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import { api, Friend } from "@/src/api";
import { colors, spacing, typography } from "@/src/theme";

async function hashPhoneClient(phone: string): Promise<string> {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  const tail = digits.slice(-10);
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, tail);
}

type Tab = "friends" | "messages" | "requests";

export default function Social() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [threads, setThreads] = useState<
    {
      partner: { id: string; name: string; email: string; avatar?: string | null };
      last_message: { id: string; text: string; from_user_id: string; created_at: string };
      unread_count: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // contacts
  const [showContacts, setShowContacts] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsMatches, setContactsMatches] = useState<
    { id: string; name: string; email: string; avatar?: string | null; friend_status?: string | null }[]
  >([]);
  const [contactRequesting, setContactRequesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, t] = await Promise.all([api.listFriends(), api.listThreads()]);
      setFriends(f);
      setThreads(t);
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

  const sendRequest = async () => {
    const raw = addEmail.trim();
    if (!raw) return;
    setError(null);
    setAdding(true);
    try {
      if (raw.startsWith("@")) {
        await api.sendFriendRequest({ username: raw.slice(1).toLowerCase() });
      } else if (raw.includes("@")) {
        await api.sendFriendRequest({ email: raw });
      } else {
        // bare text → treat as username
        await api.sendFriendRequest({ username: raw.toLowerCase() });
      }
      setAddEmail("");
      load();
    } catch (e: any) {
      setError(e.message?.replace(/^HTTP\s+\d+:\s*/, "") || "Failed to send request");
    } finally {
      setAdding(false);
    }
  };

  const accept = async (id: string) => {
    await api.acceptFriend(id);
    load();
  };

  const remove = async (id: string) => {
    await api.removeFriend(id);
    load();
  };

  const importContacts = async () => {
    setShowContacts(true);
    setContactsLoading(true);
    setContactsMatches([]);
    try {
      const perm = await Contacts.getPermissionsAsync();
      let granted = perm.status === "granted";
      if (!granted && perm.canAskAgain) {
        const r = await Contacts.requestPermissionsAsync();
        granted = r.status === "granted";
      }
      if (!granted) {
        Alert.alert(
          "Contacts Permission",
          "Enable contacts in Settings to find friends already on ClosetAI.",
          [
            { text: "Open Settings", onPress: () => Linking.openSettings() },
            { text: "Cancel", style: "cancel", onPress: () => setShowContacts(false) },
          ],
        );
        setContactsLoading(false);
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Emails,
          Contacts.Fields.Name,
          Contacts.Fields.Image,
          Contacts.Fields.PhoneNumbers,
        ],
        pageSize: 2000,
      });
      const emails: string[] = [];
      const phones: string[] = [];
      data.forEach((c) => {
        c.emails?.forEach((e) => {
          if (e.email) emails.push(e.email);
        });
        c.phoneNumbers?.forEach((p) => {
          if (p.number) phones.push(p.number);
        });
      });
      if (emails.length === 0 && phones.length === 0) {
        Alert.alert("No contacts", "We couldn't find any contacts with emails or phone numbers.");
        setContactsLoading(false);
        return;
      }
      // Hash phone numbers client-side before sending (privacy preserving).
      const phoneHashes = await Promise.all(phones.map(hashPhoneClient));
      const matches = await api.matchContacts({
        emails: emails.slice(0, 500),
        phone_hashes: phoneHashes.filter(Boolean),
      });
      setContactsMatches(
        matches.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email || "",
          avatar: m.avatar ?? null,
          friend_status: m.friendship?.status || null,
        })),
      );
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally {
      setContactsLoading(false);
    }
  };

  const inviteContact = async (email: string, userId: string) => {
    setContactRequesting(userId);
    try {
      await api.sendFriendRequest({ email });
      setContactsMatches((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, friend_status: "pending" } : m)),
      );
      load();
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally {
      setContactRequesting(null);
    }
  };

  const acceptedFriends = friends.filter((f) => f.status === "accepted");
  const incoming = friends.filter((f) => f.status === "pending" && f.direction === "incoming");
  const outgoing = friends.filter((f) => f.status === "pending" && f.direction === "outgoing");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="social-screen">
      <View style={styles.header}>
        <Text style={styles.kicker}>FRIENDS & CHATS</Text>
        <Text style={styles.title}>Social.</Text>
      </View>

      <View style={styles.tabRow}>
        {(
          [
            { id: "friends" as const, label: "Friends", count: acceptedFriends.length },
            { id: "messages" as const, label: "Messages", count: threads.length },
            { id: "requests" as const, label: "Requests", count: incoming.length },
          ]
        ).map((t) => {
          const active = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              testID={`social-tab-${t.id}`}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setTab(t.id)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label} {t.count > 0 ? `(${t.count})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {tab === "friends" && (
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
            <View style={styles.addBox}>
              <Text style={styles.boxLabel}>ADD FRIEND BY @USERNAME OR EMAIL</Text>
              <View style={styles.addRow}>
                <TextInput
                  testID="add-friend-input"
                  value={addEmail}
                  onChangeText={setAddEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="friend@example.com"
                  placeholderTextColor={colors.subtle}
                  style={styles.addInput}
                />
                <TouchableOpacity
                  testID="add-friend-button"
                  style={[styles.addBtn, adding && { opacity: 0.5 }]}
                  onPress={sendRequest}
                  disabled={adding}
                >
                  <Ionicons name="person-add" size={16} color={colors.primaryFg} />
                </TouchableOpacity>
              </View>
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            <TouchableOpacity
              testID="import-contacts-button"
              style={styles.contactsBtn}
              onPress={importContacts}
            >
              <Ionicons name="people" size={18} color={colors.primary} />
              <Text style={styles.contactsBtnText}>Find friends from contacts</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedFg} />
            </TouchableOpacity>

            {outgoing.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>PENDING SENT</Text>
                {outgoing.map((f) => (
                  <View key={f.id} style={styles.friendRow}>
                    <Avatar name={f.friend_name} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.friendName}>{f.friend_name}</Text>
                      <Text style={styles.friendEmail}>{f.friend_email}</Text>
                    </View>
                    <Text style={styles.pendingTag}>Pending</Text>
                  </View>
                ))}
              </>
            )}

            <Text style={styles.sectionLabel}>YOUR FRIENDS</Text>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : acceptedFriends.length === 0 ? (
              <Text style={styles.emptySub}>No friends yet. Add one above.</Text>
            ) : (
              acceptedFriends.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  testID={`friend-row-${f.id}`}
                  style={styles.friendRow}
                  onPress={() =>
                    router.push({
                      pathname: "/social/friend/[id]",
                      params: { id: f.friend_user_id, name: f.friend_name, friendshipId: f.id, access: f.access_level },
                    })
                  }
                >
                  <Avatar name={f.friend_name} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.friendName}>{f.friend_name}</Text>
                    <Text style={styles.friendEmail}>{f.friend_email}</Text>
                  </View>
                  <View style={styles.accessTag}>
                    <Text style={styles.accessTagText}>{f.access_level}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}

        {tab === "messages" && (
          <View style={{ flex: 1 }}>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : threads.length === 0 ? (
              <View style={styles.center}>
                <Ionicons name="chatbubbles-outline" size={56} color={colors.subtle} />
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySub}>Chat with friends to get outfit feedback.</Text>
              </View>
            ) : (
              <FlatList
                data={threads}
                keyExtractor={(t) => t.partner.id}
                contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 120, paddingTop: spacing.md }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    testID={`thread-${item.partner.id}`}
                    style={styles.threadRow}
                    onPress={() =>
                      router.push({
                        pathname: "/social/chat/[friendId]",
                        params: { friendId: item.partner.id, name: item.partner.name },
                      })
                    }
                  >
                    <Avatar name={item.partner.name} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.friendName}>{item.partner.name}</Text>
                      <Text style={styles.lastMsg} numberOfLines={1}>
                        {item.last_message.text}
                      </Text>
                    </View>
                    {item.unread_count > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{item.unread_count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {tab === "requests" && (
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
            {incoming.length === 0 ? (
              <Text style={styles.emptySub}>No incoming requests.</Text>
            ) : (
              incoming.map((f) => (
                <View key={f.id} style={styles.friendRow}>
                  <Avatar name={f.friend_name} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.friendName}>{f.friend_name}</Text>
                    <Text style={styles.friendEmail}>{f.friend_email}</Text>
                  </View>
                  <TouchableOpacity
                    testID={`accept-friend-${f.id}`}
                    style={styles.acceptBtn}
                    onPress={() => accept(f.id)}
                  >
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID={`reject-friend-${f.id}`} onPress={() => remove(f.id)}>
                    <Ionicons name="close" size={20} color={colors.mutedFg} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Contacts modal */}
      <Modal
        visible={showContacts}
        animationType="slide"
        transparent
        onRequestClose={() => setShowContacts(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.modalTitle}>Contacts on ClosetAI</Text>
              <TouchableOpacity testID="close-contacts-modal" onPress={() => setShowContacts(false)}>
                <Ionicons name="close" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {contactsLoading ? (
              <View style={{ padding: spacing.xl, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.emptySub, { marginTop: spacing.md }]}>Scanning your contacts…</Text>
              </View>
            ) : contactsMatches.length === 0 ? (
              <View style={{ padding: spacing.xl, alignItems: "center" }}>
                <Ionicons name="people-outline" size={56} color={colors.subtle} />
                <Text style={styles.modalTitle}>No matches found</Text>
                <Text style={styles.emptySub}>None of your contacts are on ClosetAI yet.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 480 }}>
                {contactsMatches.map((m) => (
                  <View key={m.id} style={styles.friendRow} testID={`contact-match-${m.id}`}>
                    <Avatar name={m.name} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.friendName}>{m.name}</Text>
                      <Text style={styles.friendEmail}>{m.email}</Text>
                    </View>
                    {m.friend_status === "accepted" ? (
                      <Text style={styles.pendingTag}>Friend</Text>
                    ) : m.friend_status === "pending" ? (
                      <Text style={styles.pendingTag}>Pending</Text>
                    ) : (
                      <TouchableOpacity
                        testID={`contact-invite-${m.id}`}
                        style={[styles.acceptBtn, contactRequesting === m.id && { opacity: 0.5 }]}
                        onPress={() => inviteContact(m.email, m.id)}
                        disabled={contactRequesting === m.id}
                      >
                        <Text style={styles.acceptBtnText}>
                          {contactRequesting === m.id ? "…" : "+ Add"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{(name?.[0] || "?").toUpperCase()}</Text>
    </View>
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
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 11, fontWeight: "700", color: colors.primary, letterSpacing: 1 },
  tabTextActive: { color: colors.primaryFg },
  addBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  boxLabel: { ...typography.label, fontSize: 10, marginBottom: spacing.sm },
  addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  addInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.primary,
  },
  addBtn: {
    width: 40,
    height: 40,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { color: colors.accent, fontSize: 12, marginTop: 6 },
  sectionLabel: { ...typography.label, marginTop: spacing.md, marginBottom: spacing.sm },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  friendName: { fontSize: 15, fontWeight: "700", color: colors.primary },
  friendEmail: { fontSize: 12, color: colors.mutedFg, marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.primaryFg, fontWeight: "900", fontSize: 18 },
  pendingTag: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.mutedFg,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  accessTag: { borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 8, paddingVertical: 4 },
  accessTagText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.primary,
    textTransform: "uppercase",
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastMsg: { fontSize: 13, color: colors.mutedFg, marginTop: 2 },
  unreadBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 22,
    alignItems: "center",
  },
  unreadText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  acceptBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8 },
  acceptBtnText: { color: colors.primaryFg, fontWeight: "700", fontSize: 12, letterSpacing: 1 },
  contactsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.muted,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  contactsBtnText: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.primary },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  modalTitle: { ...typography.h1, fontSize: 22, marginBottom: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { ...typography.h2, marginTop: spacing.md },
  emptySub: { ...typography.body, color: colors.mutedFg, textAlign: "center", marginTop: spacing.sm },
});
