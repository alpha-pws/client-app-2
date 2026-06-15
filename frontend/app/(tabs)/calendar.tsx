import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { api, EventItem, Reminder, WardrobeItem } from "@/src/api";
import { cancelReminder, scheduleReminder } from "@/src/notifications";
import { colors, spacing, typography } from "@/src/theme";

type ViewMode = "month" | "list" | "reminders";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const REMINDER_TYPES = [
  { id: "laundry", label: "Laundry", icon: "water-outline" as const },
  { id: "outfit_prep", label: "Outfit Prep", icon: "shirt-outline" as const },
  { id: "shopping", label: "Shopping", icon: "bag-outline" as const },
  { id: "other", label: "Other", icon: "alarm-outline" as const },
];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export default function Calendar() {
  const [mode, setMode] = useState<ViewMode>("month");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [wardrobeMap, setWardrobeMap] = useState<Record<string, WardrobeItem>>({});
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // YYYY-MM-DD

  // event modal
  const [showEvent, setShowEvent] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evDate, setEvDate] = useState<Date>(new Date());
  const [evLocation, setEvLocation] = useState("");
  const [evWeather, setEvWeather] = useState("");
  const [showDatePick, setShowDatePick] = useState(false);
  const [suggestingId, setSuggestingId] = useState<string | null>(null);

  // reminder modal
  const [showReminder, setShowReminder] = useState(false);
  const [rmTitle, setRmTitle] = useState("");
  const [rmType, setRmType] = useState<"laundry" | "outfit_prep" | "shopping" | "other">("laundry");
  const [rmAt, setRmAt] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });
  const [rmNotes, setRmNotes] = useState("");
  const [showRmDatePick, setShowRmDatePick] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ev, rm, wd] = await Promise.all([api.listEvents(), api.listReminders(), api.listWardrobe()]);
      setEvents(ev);
      setReminders(rm);
      const map: Record<string, WardrobeItem> = {};
      wd.forEach((i) => (map[i.id] = i));
      setWardrobeMap(map);
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

  // Build month grid
  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const lead = first.getDay(); // 0=Sun
    const total = daysInMonth(cursor);
    const cells: { date: Date | null; key: string }[] = [];
    for (let i = 0; i < lead; i++) cells.push({ date: null, key: `lead-${i}` });
    for (let d = 1; d <= total; d++) {
      cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), d), key: `d-${d}` });
    }
    return cells;
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, EventItem[]> = {};
    events.forEach((e) => {
      const key = e.date.slice(0, 10);
      (map[key] ||= []).push(e);
    });
    return map;
  }, [events]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return events
      .map((e) => ({ ...e, ts: new Date(e.date).getTime() }))
      .filter((e) => e.ts >= now - 24 * 3600 * 1000)
      .sort((a, b) => a.ts - b.ts);
  }, [events]);

  const daysLeft = (iso: string) => {
    const ms = new Date(iso).getTime() - Date.now();
    const d = Math.ceil(ms / (1000 * 60 * 60 * 24));
    return d;
  };

  const eventsForSelectedDay = selectedDay ? eventsByDay[selectedDay] || [] : [];

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const saveEvent = async () => {
    if (!evTitle) {
      Alert.alert("Title required");
      return;
    }
    try {
      await api.addEvent({
        title: evTitle,
        date: evDate.toISOString(),
        location: evLocation || undefined,
        weather: evWeather || undefined,
      });
      setEvTitle("");
      setEvLocation("");
      setEvWeather("");
      setEvDate(new Date());
      setShowEvent(false);
      load();
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
  };

  const removeEvent = async (id: string) => {
    await api.deleteEvent(id);
    setEvents((p) => p.filter((e) => e.id !== id));
  };

  const suggest = async (id: string) => {
    setSuggestingId(id);
    try {
      const ev = await api.suggestEventOutfit(id);
      setEvents((prev) => prev.map((e) => (e.id === id ? ev : e)));
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally {
      setSuggestingId(null);
    }
  };

  const saveReminder = async () => {
    if (!rmTitle) {
      Alert.alert("Title required");
      return;
    }
    if (rmAt.getTime() <= Date.now()) {
      Alert.alert("Pick a future time");
      return;
    }
    try {
      const notifId = await scheduleReminder({
        title: rmTitle,
        body: rmNotes || `ClosetAI · ${REMINDER_TYPES.find((t) => t.id === rmType)?.label}`,
        date: rmAt,
      });
      await api.addReminder({
        title: rmTitle,
        type: rmType,
        remind_at: rmAt.toISOString(),
        notes: rmNotes || undefined,
        notification_id: notifId || undefined,
      });
      setRmTitle("");
      setRmNotes("");
      setShowReminder(false);
      load();
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
  };

  const toggleReminderDone = async (r: Reminder) => {
    const updated = await api.updateReminder(r.id, { done: !r.done });
    setReminders((p) => p.map((x) => (x.id === r.id ? updated : x)));
    if (!r.done) {
      // marked done → cancel notification
      await cancelReminder(r.notification_id);
    }
  };

  const removeReminder = async (r: Reminder) => {
    await cancelReminder(r.notification_id);
    await api.deleteReminder(r.id);
    setReminders((p) => p.filter((x) => x.id !== r.id));
  };

  const openDatePickerEvent = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: evDate,
        mode: "date",
        minimumDate: new Date(),
        onChange: (_, d) => {
          if (d) {
            const merged = new Date(d);
            DateTimePickerAndroid.open({
              value: merged,
              mode: "time",
              onChange: (_2, t) => {
                if (t) {
                  merged.setHours(t.getHours(), t.getMinutes(), 0, 0);
                  setEvDate(merged);
                }
              },
            });
          }
        },
      });
    } else {
      setShowDatePick(true);
    }
  };

  const openDatePickerReminder = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: rmAt,
        mode: "date",
        minimumDate: new Date(),
        onChange: (_, d) => {
          if (d) {
            const merged = new Date(d);
            DateTimePickerAndroid.open({
              value: merged,
              mode: "time",
              onChange: (_2, t) => {
                if (t) {
                  merged.setHours(t.getHours(), t.getMinutes(), 0, 0);
                  setRmAt(merged);
                }
              },
            });
          }
        },
      });
    } else {
      setShowRmDatePick(true);
    }
  };

  const formatLong = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="calendar-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>YOUR PLAN</Text>
          <Text style={styles.title}>Calendar.</Text>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity
            testID="add-reminder-button"
            style={[styles.addBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary }]}
            onPress={() => setShowReminder(true)}
          >
            <Ionicons name="alarm" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="add-event-button"
            style={styles.addBtn}
            onPress={() => setShowEvent(true)}
          >
            <Ionicons name="add" size={20} color={colors.primaryFg} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.modeRow}>
        {(["month", "list", "reminders"] as const).map((m) => {
          const active = mode === m;
          return (
            <TouchableOpacity
              key={m}
              testID={`mode-${m}`}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeText, active && styles.modeTextActive]}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {mode === "month" && (
            <View style={{ padding: spacing.xl, paddingTop: spacing.md }}>
              <View style={styles.monthNav}>
                <TouchableOpacity
                  testID="month-prev"
                  onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                >
                  <Ionicons name="chevron-back" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.monthLabel}>{monthLabel.toUpperCase()}</Text>
                <TouchableOpacity
                  testID="month-next"
                  onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                >
                  <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.weekRow}>
                {DAYS.map((d, i) => (
                  <Text key={i} style={styles.weekDay}>
                    {d}
                  </Text>
                ))}
              </View>

              <View style={styles.gridWrap}>
                {grid.map((cell) => {
                  if (!cell.date) return <View key={cell.key} style={styles.cell} />;
                  const key = cell.date.toISOString().slice(0, 10);
                  const today = new Date().toISOString().slice(0, 10) === key;
                  const dayEvents = eventsByDay[key] || [];
                  const isSelected = selectedDay === key;
                  return (
                    <TouchableOpacity
                      key={cell.key}
                      testID={`day-${key}`}
                      style={[styles.cell, isSelected && styles.cellSelected]}
                      onPress={() => setSelectedDay(key)}
                    >
                      <Text
                        style={[
                          styles.cellNum,
                          today && styles.cellToday,
                          isSelected && { color: colors.primaryFg },
                        ]}
                      >
                        {cell.date.getDate()}
                      </Text>
                      <View style={styles.dotRow}>
                        {dayEvents.slice(0, 3).map((_, i) => (
                          <View
                            key={i}
                            style={[
                              styles.dot,
                              { backgroundColor: isSelected ? colors.primaryFg : colors.accent },
                            ]}
                          />
                        ))}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Selected day events */}
              {selectedDay && (
                <View style={styles.dayPanel}>
                  <Text style={styles.dayPanelTitle}>
                    {new Date(selectedDay).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </Text>
                  {eventsForSelectedDay.length === 0 ? (
                    <Text style={styles.emptySub}>No events on this day.</Text>
                  ) : (
                    eventsForSelectedDay.map((e) => (
                      <EventCard
                        key={e.id}
                        ev={e}
                        wardrobeMap={wardrobeMap}
                        onSuggest={suggest}
                        onDelete={removeEvent}
                        suggesting={suggestingId === e.id}
                      />
                    ))
                  )}
                </View>
              )}

              {/* Next event countdown */}
              {upcomingEvents.length > 0 && (
                <View style={styles.countdown}>
                  <Text style={styles.countdownKicker}>NEXT UP</Text>
                  <Text style={styles.countdownTitle}>{upcomingEvents[0].title}</Text>
                  <Text style={styles.countdownDays}>
                    {(() => {
                      const d = daysLeft(upcomingEvents[0].date);
                      if (d <= 0) return "Today";
                      if (d === 1) return "Tomorrow · 1 day";
                      return `${d} days left`;
                    })()}
                  </Text>
                </View>
              )}
            </View>
          )}

          {mode === "list" && (
            <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
              {events.length === 0 ? (
                <View style={styles.center}>
                  <Ionicons name="calendar-outline" size={56} color={colors.subtle} />
                  <Text style={styles.emptyTitle}>No events yet</Text>
                </View>
              ) : (
                events
                  .slice()
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map((e) => (
                    <EventCard
                      key={e.id}
                      ev={e}
                      wardrobeMap={wardrobeMap}
                      onSuggest={suggest}
                      onDelete={removeEvent}
                      suggesting={suggestingId === e.id}
                      showCountdown
                    />
                  ))
              )}
            </View>
          )}

          {mode === "reminders" && (
            <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
              {reminders.length === 0 ? (
                <View style={styles.center}>
                  <Ionicons name="alarm-outline" size={56} color={colors.subtle} />
                  <Text style={styles.emptyTitle}>No reminders yet</Text>
                  <Text style={styles.emptySub}>
                    Schedule a laundry day, outfit prep, or shopping nudge.
                  </Text>
                </View>
              ) : (
                reminders.map((r) => {
                  const t = REMINDER_TYPES.find((x) => x.id === r.type);
                  return (
                    <View key={r.id} style={styles.reminderRow} testID={`reminder-${r.id}`}>
                      <TouchableOpacity
                        testID={`reminder-toggle-${r.id}`}
                        style={[styles.checkbox, r.done && styles.checkboxOn]}
                        onPress={() => toggleReminderDone(r)}
                      >
                        {r.done && <Ionicons name="checkmark" size={14} color={colors.primaryFg} />}
                      </TouchableOpacity>
                      <Ionicons name={t?.icon || "alarm-outline"} size={18} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.reminderTitle, r.done && styles.reminderDone]}>
                          {r.title}
                        </Text>
                        <Text style={styles.reminderTime}>
                          {t?.label} · {formatLong(r.remind_at)}
                        </Text>
                        {r.notes ? <Text style={styles.reminderNotes}>{r.notes}</Text> : null}
                      </View>
                      <TouchableOpacity testID={`reminder-del-${r.id}`} onPress={() => removeReminder(r)}>
                        <Ionicons name="close" size={18} color={colors.mutedFg} />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Event modal */}
      <Modal visible={showEvent} animationType="slide" transparent onRequestClose={() => setShowEvent(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Event</Text>
            <Text style={styles.fieldLabel}>TITLE</Text>
            <TextInput
              testID="event-title-input"
              value={evTitle}
              onChangeText={setEvTitle}
              placeholder="Friend's wedding"
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>DATE & TIME</Text>
            <TouchableOpacity testID="event-date-button" onPress={openDatePickerEvent} style={styles.dateBtn}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={styles.dateBtnText}>{formatLong(evDate.toISOString())}</Text>
            </TouchableOpacity>
            {showDatePick && Platform.OS === "ios" && (
              <DateTimePicker
                value={evDate}
                mode="datetime"
                display="spinner"
                onChange={(_, d) => d && setEvDate(d)}
              />
            )}
            <Text style={styles.fieldLabel}>LOCATION</Text>
            <TextInput
              testID="event-location-input"
              value={evLocation}
              onChangeText={setEvLocation}
              placeholder="Optional"
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>WEATHER</Text>
            <TextInput
              testID="event-weather-input"
              value={evWeather}
              onChangeText={setEvWeather}
              placeholder="Expected (optional)"
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <TouchableOpacity style={[styles.modalBtnGhost, { flex: 1 }]} onPress={() => setShowEvent(false)}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="event-save-button" style={[styles.modalBtn, { flex: 1 }]} onPress={saveEvent}>
                <Text style={styles.modalBtnText}>Save Event</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reminder modal */}
      <Modal
        visible={showReminder}
        animationType="slide"
        transparent
        onRequestClose={() => setShowReminder(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Reminder</Text>
            <Text style={styles.helper}>We&apos;ll buzz your phone at the set time.</Text>

            <Text style={styles.fieldLabel}>TYPE</Text>
            <View style={styles.chipsRow}>
              {REMINDER_TYPES.map((t) => {
                const active = rmType === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    testID={`reminder-type-${t.id}`}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => setRmType(t.id as any)}
                  >
                    <Ionicons name={t.icon} size={14} color={active ? colors.primaryFg : colors.primary} />
                    <Text style={[styles.typeChipText, active && { color: colors.primaryFg }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>TITLE</Text>
            <TextInput
              testID="reminder-title-input"
              value={rmTitle}
              onChangeText={setRmTitle}
              placeholder={
                rmType === "laundry"
                  ? "Wash gym clothes"
                  : rmType === "outfit_prep"
                  ? "Lay out tomorrow's outfit"
                  : "Reminder title"
              }
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>WHEN</Text>
            <TouchableOpacity testID="reminder-date-button" onPress={openDatePickerReminder} style={styles.dateBtn}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <Text style={styles.dateBtnText}>{formatLong(rmAt.toISOString())}</Text>
            </TouchableOpacity>
            {showRmDatePick && Platform.OS === "ios" && (
              <DateTimePicker
                value={rmAt}
                mode="datetime"
                display="spinner"
                onChange={(_, d) => d && setRmAt(d)}
              />
            )}

            <Text style={styles.fieldLabel}>NOTES</Text>
            <TextInput
              testID="reminder-notes-input"
              value={rmNotes}
              onChangeText={setRmNotes}
              placeholder="Optional"
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <TouchableOpacity style={[styles.modalBtnGhost, { flex: 1 }]} onPress={() => setShowReminder(false)}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="reminder-save-button" style={[styles.modalBtn, { flex: 1 }]} onPress={saveReminder}>
                <Text style={styles.modalBtnText}>Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function EventCard({
  ev,
  wardrobeMap,
  onSuggest,
  onDelete,
  suggesting,
  showCountdown,
}: {
  ev: EventItem;
  wardrobeMap: Record<string, WardrobeItem>;
  onSuggest: (id: string) => void;
  onDelete: (id: string) => void;
  suggesting: boolean;
  showCountdown?: boolean;
}) {
  const dl = Math.ceil((new Date(ev.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return (
    <View style={styles.eventCard} testID={`event-card-${ev.id}`}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eventDate}>
            {new Date(ev.date).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
          <Text style={styles.eventTitle}>{ev.title}</Text>
          {ev.location ? <Text style={styles.eventMeta}>{ev.location}</Text> : null}
        </View>
        {showCountdown && (
          <View style={styles.daysPill}>
            <Text style={styles.daysPillNum}>{dl <= 0 ? "0" : dl}</Text>
            <Text style={styles.daysPillLabel}>{dl === 1 ? "DAY" : "DAYS"}</Text>
          </View>
        )}
      </View>
      {ev.suggestion_note ? (
        <View style={styles.suggestionBox}>
          <Text style={styles.suggestionLabel}>STYLIST&apos;S NOTE</Text>
          <Text style={styles.suggestionText}>
            {ev.suggestion_note.replace(/ITEM:[0-9a-fA-F-]{36}/g, "").trim()}
          </Text>
          {ev.suggested_item_ids.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              {ev.suggested_item_ids.map((id) => {
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
          testID={`event-suggest-${ev.id}`}
          style={styles.actionBtn}
          onPress={() => onSuggest(ev.id)}
          disabled={suggesting}
        >
          {suggesting ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <>
              <Ionicons name="sparkles" size={14} color={colors.primary} />
              <Text style={styles.actionText}>{ev.suggestion_note ? "Re-suggest" : "Suggest Outfit"}</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          testID={`event-delete-${ev.id}`}
          style={styles.actionBtnGhost}
          onPress={() => onDelete(ev.id)}
        >
          <Ionicons name="trash-outline" size={14} color={colors.accent} />
        </TouchableOpacity>
      </View>
    </View>
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
  modeRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  modeBtn: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  modeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.primary },
  modeTextActive: { color: colors.primaryFg },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  monthLabel: { fontSize: 13, fontWeight: "800", letterSpacing: 2, color: colors.primary },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekDay: { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "700", color: colors.mutedFg, letterSpacing: 1 },
  gridWrap: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  cellSelected: { backgroundColor: colors.primary },
  cellNum: { fontSize: 14, fontWeight: "600", color: colors.primary },
  cellToday: { color: colors.accent, fontWeight: "900" },
  dotRow: { flexDirection: "row", gap: 2, marginTop: 2, height: 6 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dayPanel: { marginTop: spacing.lg, paddingTop: spacing.md },
  dayPanelTitle: { ...typography.h2, marginBottom: spacing.md },
  countdown: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.primary,
  },
  countdownKicker: { ...typography.label, color: "#fff", opacity: 0.7 },
  countdownTitle: { fontSize: 24, fontWeight: "900", color: colors.primaryFg, marginTop: 6 },
  countdownDays: { fontSize: 14, color: colors.primaryFg, marginTop: 6, fontWeight: "600" },
  daysPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    minWidth: 56,
  },
  daysPillNum: { color: colors.primaryFg, fontSize: 22, fontWeight: "900" },
  daysPillLabel: { color: colors.primaryFg, fontSize: 9, letterSpacing: 1, fontWeight: "700" },
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
  suggestionBox: { marginTop: spacing.md, padding: spacing.sm, backgroundColor: colors.muted },
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
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { ...typography.h2, marginTop: spacing.md },
  emptySub: { ...typography.body, color: colors.mutedFg, textAlign: "center", marginTop: spacing.sm },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.primary },
  reminderTitle: { fontSize: 14.5, fontWeight: "700", color: colors.primary },
  reminderDone: { textDecorationLine: "line-through", color: colors.mutedFg },
  reminderTime: { fontSize: 11, color: colors.mutedFg, marginTop: 2 },
  reminderNotes: { fontSize: 12, color: colors.primary, marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: { ...typography.h1 },
  helper: { ...typography.body, color: colors.mutedFg, marginTop: 4 },
  fieldLabel: { ...typography.label, marginTop: spacing.md, marginBottom: 6 },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.primary,
  },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.muted,
  },
  dateBtnText: { fontSize: 14, fontWeight: "600", color: colors.primary },
  modalBtn: { backgroundColor: colors.primary, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  modalBtnGhost: { borderWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: "center" },
  modalBtnGhostText: { color: colors.primary, fontWeight: "700", letterSpacing: 1, fontSize: 12 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: 12, fontWeight: "700", color: colors.primary },
});
