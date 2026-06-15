import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, EventItem, WardrobeItem } from "@/src/api";
import { colors, spacing, typography } from "@/src/theme";

export default function Calendar() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [weather, setWeather] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const [wardrobeMap, setWardrobeMap] = useState<Record<string, WardrobeItem>>({});

  const load = useCallback(async () => {
    try {
      const [ev, wd] = await Promise.all([api.listEvents(), api.listWardrobe()]);
      setEvents(ev);
      const map: Record<string, WardrobeItem> = {};
      wd.forEach((i) => (map[i.id] = i));
      setWardrobeMap(map);
    } catch (e: any) {
      console.warn("calendar load failed", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const createEvent = async () => {
    if (!title || !date) return;
    setSaving(true);
    try {
      // accept formats like 2025-12-31 or 2025-12-31T18:00
      const iso = date.includes("T") ? date : `${date}T12:00:00Z`;
      await api.addEvent({ title, date: iso, location, weather });
      setTitle("");
      setDate("");
      setLocation("");
      setWeather("");
      setShowForm(false);
      load();
    } catch (e: any) {
      console.warn(e.message);
    } finally {
      setSaving(false);
    }
  };

  const suggest = async (id: string) => {
    setSuggestingId(id);
    try {
      const ev = await api.suggestEventOutfit(id);
      setEvents((prev) => prev.map((e) => (e.id === id ? ev : e)));
    } catch (e: any) {
      console.warn(e.message);
    } finally {
      setSuggestingId(null);
    }
  };

  const remove = async (id: string) => {
    await api.deleteEvent(id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="calendar-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>UPCOMING</Text>
          <Text style={styles.title}>Calendar.</Text>
        </View>
        <TouchableOpacity
          testID="calendar-add-button"
          style={styles.addBtn}
          onPress={() => setShowForm((s) => !s)}
        >
          <Ionicons name={showForm ? "close" : "add"} size={20} color={colors.primaryFg} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {showForm && (
          <View style={styles.form} testID="event-form">
            <TextInput
              testID="event-title-input"
              value={title}
              onChangeText={setTitle}
              placeholder="Event title"
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />
            <TextInput
              testID="event-date-input"
              value={date}
              onChangeText={setDate}
              placeholder="Date YYYY-MM-DD (e.g. 2026-03-15)"
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />
            <TextInput
              testID="event-location-input"
              value={location}
              onChangeText={setLocation}
              placeholder="Location (optional)"
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />
            <TextInput
              testID="event-weather-input"
              value={weather}
              onChangeText={setWeather}
              placeholder="Expected weather (optional)"
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />
            <TouchableOpacity
              testID="event-save-button"
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
              onPress={createEvent}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Event"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : events.length === 0 ? (
          <View style={styles.center} testID="calendar-empty">
            <Ionicons name="calendar-outline" size={64} color={colors.subtle} />
            <Text style={styles.emptyTitle}>No events yet</Text>
            <Text style={styles.emptySub}>Add an event and let ClosetAI suggest the perfect outfit.</Text>
          </View>
        ) : (
          <FlatList
            data={events}
            keyExtractor={(e) => e.id}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 120, paddingTop: spacing.md }}
            renderItem={({ item }) => (
              <View style={styles.eventCard} testID={`event-card-${item.id}`}>
                <Text style={styles.eventDate}>{formatDate(item.date)}</Text>
                <Text style={styles.eventTitle}>{item.title}</Text>
                {item.location ? <Text style={styles.eventMeta}>{item.location}</Text> : null}
                {item.weather ? <Text style={styles.eventMeta}>Weather: {item.weather}</Text> : null}

                {item.suggestion_note ? (
                  <View style={styles.suggestionBox}>
                    <Text style={styles.suggestionLabel}>STYLIST&apos;S NOTE</Text>
                    <Text style={styles.suggestionText}>
                      {item.suggestion_note.replace(/ITEM:[0-9a-fA-F-]{36}/g, "").trim()}
                    </Text>
                    {item.suggested_item_ids.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                        {item.suggested_item_ids.map((id) => {
                          const w = wardrobeMap[id];
                          if (!w) return null;
                          return (
                            <View key={id} style={styles.miniCard}>
                              <Image
                                source={{ uri: `data:image/jpeg;base64,${w.image_base64}` }}
                                style={styles.miniImg}
                              />
                              <Text style={styles.miniName} numberOfLines={1}>
                                {w.name || w.category}
                              </Text>
                            </View>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                ) : null}

                <View style={styles.eventActions}>
                  <TouchableOpacity
                    testID={`event-suggest-${item.id}`}
                    style={styles.actionBtn}
                    onPress={() => suggest(item.id)}
                    disabled={suggestingId === item.id}
                  >
                    {suggestingId === item.id ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={14} color={colors.primary} />
                        <Text style={styles.actionText}>
                          {item.suggestion_note ? "Re-suggest" : "Suggest Outfit"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`event-delete-${item.id}`}
                    style={styles.actionBtnGhost}
                    onPress={() => remove(item.id)}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  kicker: { ...typography.label },
  title: { ...typography.hero, marginTop: 4 },
  addBtn: {
    width: 44,
    height: 44,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  form: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.primary,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  saveBtnText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { ...typography.h2, marginTop: spacing.md },
  emptySub: { ...typography.body, color: colors.mutedFg, marginTop: spacing.sm, textAlign: "center" },
  eventCard: {
    backgroundColor: colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  eventDate: { ...typography.label },
  eventTitle: { ...typography.h2, marginTop: 4 },
  eventMeta: { ...typography.small, marginTop: 4 },
  suggestionBox: {
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.muted,
  },
  suggestionLabel: { ...typography.label, fontSize: 9 },
  suggestionText: { fontSize: 13, color: colors.primary, marginTop: 4, lineHeight: 19 },
  miniCard: { width: 80, marginRight: 8 },
  miniImg: { width: 80, height: 90, backgroundColor: colors.surface },
  miniName: { fontSize: 10, fontWeight: "600", color: colors.primary, marginTop: 2 },
  eventActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionBtnGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionText: { fontSize: 12, fontWeight: "700", color: colors.primary },
});
