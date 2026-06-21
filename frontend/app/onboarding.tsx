import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { ensureLocationPermission, getCurrentCoords } from "@/src/location";
import { makeRange, WheelPicker } from "@/src/components/WheelPicker";
import { colors, radii, shadows, spacing, typography } from "@/src/theme";

const HEIGHTS = makeRange(140, 215, 1, " cm");
const WEIGHTS = makeRange(35, 160, 1, " kg");
const SHOE_SIZES = [
  ...makeRange(3, 14, 0.5, ""),
].map((s) => `US ${s}`);
const CHEST_OPTS = makeRange(70, 140, 1, " cm");
const WAIST_OPTS = makeRange(55, 130, 1, " cm");
const HIPS_OPTS = makeRange(70, 140, 1, " cm");

const STYLES_LIST = [
  { id: "classic", label: "Classic" },
  { id: "luxury", label: "Luxury" },
  { id: "smart_casual", label: "Smart Casual" },
  { id: "business", label: "Business" },
  { id: "minimalist", label: "Minimalist" },
  { id: "streetwear", label: "Streetwear" },
  { id: "athleisure", label: "Athleisure" },
  { id: "contemporary", label: "Contemporary" },
  { id: "trend_driven", label: "Trend Driven" },
];

const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55+"];

const ONBOARD_HERO =
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?crop=entropy&cs=srgb&fm=jpg&w=900&q=80";

type Step = "intro" | "body" | "style" | "color" | "location" | "done";

export default function Onboarding() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; step?: string }>();
  const isEdit = params.mode === "edit";
  const [step, setStep] = useState<Step>(
    (params.step as Step) || (isEdit ? "body" : "intro"),
  );
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [shoeSize, setShoeSize] = useState("");
  const [chest, setChest] = useState("");
  const [waist, setWaist] = useState("");
  const [hips, setHips] = useState("");
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [skinTone, setSkinTone] = useState("");
  const [hairColor, setHairColor] = useState("");
  const [eyeColor, setEyeColor] = useState("");
  const [bestColors, setBestColors] = useState("");
  const [saving, setSaving] = useState(false);
  const [locStatus, setLocStatus] = useState<"idle" | "loading" | "done" | "denied">("idle");
  const [locLabel, setLocLabel] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Preload existing profile data so users never start over.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingProfile(true);
      try {
        const p = await api.getProfile();
        if (!active) return;
        if (p.height_cm != null) setHeight(String(p.height_cm));
        if (p.weight_kg != null) setWeight(String(p.weight_kg));
        if (p.age_range) setAgeRange(p.age_range);
        if (p.gender) setGender(p.gender);
        if (p.shoe_size) setShoeSize(p.shoe_size);
        if (p.chest_cm != null) setChest(String(p.chest_cm));
        if (p.waist_cm != null) setWaist(String(p.waist_cm));
        if (p.hips_cm != null) setHips(String(p.hips_cm));
        if (p.styles?.length) setSelectedStyles(p.styles);
        if (p.skin_tone) setSkinTone(p.skin_tone);
        if (p.hair_color) setHairColor(p.hair_color);
        if (p.eye_color) setEyeColor(p.eye_color);
        if (p.best_colors?.length) setBestColors(p.best_colors.join(", "));
        if (p.home_label) setLocLabel(p.home_label);
        if (p.home_lat != null && p.home_lon != null) setLocStatus("done");
      } catch {
        // ignore — first-time users have no profile yet
      } finally {
        if (active) setLoadingProfile(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const toggleStyle = (id: string) => {
    setSelectedStyles((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const grabLocation = async () => {
    setLocStatus("loading");
    const ok = await ensureLocationPermission();
    if (!ok) {
      setLocStatus("denied");
      return;
    }
    const c = await getCurrentCoords();
    if (!c) {
      setLocStatus("denied");
      return;
    }
    try {
      const w = await api.getWeather(c.lat, c.lon);
      setLocLabel(w.place || `${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}`);
    } catch {
      setLocLabel(`${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}`);
    }
    try {
      await api.updateProfile({ home_lat: c.lat, home_lon: c.lon, home_label: locLabel || undefined });
    } catch {}
    setLocStatus("done");
  };

  const finish = async () => {
    setSaving(true);
    try {
      const patch: Record<string, any> = { onboarded: true };
      if (height) patch.height_cm = parseFloat(height);
      if (weight) patch.weight_kg = parseFloat(weight);
      if (ageRange) patch.age_range = ageRange;
      if (gender) patch.gender = gender;
      if (shoeSize) patch.shoe_size = shoeSize;
      if (chest) patch.chest_cm = parseFloat(chest);
      if (waist) patch.waist_cm = parseFloat(waist);
      if (hips) patch.hips_cm = parseFloat(hips);
      if (selectedStyles.length) patch.styles = selectedStyles;
      if (skinTone) patch.skin_tone = skinTone;
      if (hairColor) patch.hair_color = hairColor;
      if (eyeColor) patch.eye_color = eyeColor;
      if (bestColors) patch.best_colors = bestColors.split(",").map((s) => s.trim()).filter(Boolean);
      await api.updateProfile(patch);
      if (isEdit) {
        router.back();
      } else {
        router.replace("/welcome");
      }
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally {
      setSaving(false);
    }
  };

  const skipAll = async () => {
    try {
      await api.updateProfile({ onboarded: true });
    } catch {}
    if (isEdit) {
      router.back();
    } else {
      router.replace("/welcome");
    }
  };

  const next = () => {
    const order: Step[] = ["intro", "body", "style", "color", "location", "done"];
    const i = order.indexOf(step);
    if (i < order.length - 1) setStep(order[i + 1]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="onboarding-screen">
      <View style={styles.headerBar}>
        <Text style={styles.kicker}>STYLE AVATAR</Text>
        <TouchableOpacity testID="onboarding-skip-all" onPress={skipAll}>
          <Text style={styles.skipText}>Skip all</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {step === "intro" && (
            <View>
              <View style={styles.heroCard}>
                <Image source={{ uri: ONBOARD_HERO }} style={styles.hero} />
                <View style={styles.heroVeil} />
                <View style={styles.heroText}>
                  <Text style={styles.heroTitle}>Create your{"\n"}Style Avatar.</Text>
                </View>
              </View>
              <Text style={styles.helper}>
                Unlock personalized outfits, fit predictions, packing lists, and shopping suggestions tailored to you.
              </Text>
              <Primary onPress={next} label="Continue" testID="onboarding-continue" />
              <Ghost onPress={skipAll} label="Skip for now" testID="onboarding-intro-skip" />
            </View>
          )}

          {step === "body" && (
            <View>
              <Section title="Body Profile" hint="Two required. Everything else optional." />
              <Field label="Height">
                <WheelPicker
                  testID="onboard-height"
                  items={HEIGHTS}
                  value={height ? `${height} cm` : "175 cm"}
                  onChange={(v) => setHeight(v.replace(/[^0-9]/g, ""))}
                  height={140}
                />
              </Field>
              <Field label="Weight">
                <WheelPicker
                  testID="onboard-weight"
                  items={WEIGHTS}
                  value={weight ? `${weight} kg` : "70 kg"}
                  onChange={(v) => setWeight(v.replace(/[^0-9]/g, ""))}
                  height={140}
                />
              </Field>
              <Field label="Age range">
                <View style={styles.chipsRow}>
                  {AGE_RANGES.map((a) => {
                    const active = ageRange === a;
                    return (
                      <TouchableOpacity
                        key={a}
                        testID={`onboard-age-${a}`}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setAgeRange(active ? null : a)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{a}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Field>
              <Field label="Gender">
                <View style={styles.chipsRow}>
                  {["Female", "Male", "Non-binary", "Prefer not to say"].map((g) => {
                    const active = gender === g;
                    return (
                      <TouchableOpacity
                        key={g}
                        testID={`onboard-gender-${g}`}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setGender(active ? null : g)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{g}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Field>
              <Field label="Shoe size">
                <TextInput
                  testID="onboard-shoe"
                  value={shoeSize}
                  onChangeText={setShoeSize}
                  style={styles.input}
                  placeholder="EU 42 / US 9"
                  placeholderTextColor={colors.subtle}
                />
              </Field>
              <Text style={styles.subHeader}>Advanced (optional)</Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field label="Chest cm">
                    <TextInput
                      testID="onboard-chest"
                      value={chest}
                      onChangeText={setChest}
                      keyboardType="numeric"
                      style={styles.input}
                      placeholder="—"
                      placeholderTextColor={colors.subtle}
                    />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Waist cm">
                    <TextInput
                      testID="onboard-waist"
                      value={waist}
                      onChangeText={setWaist}
                      keyboardType="numeric"
                      style={styles.input}
                      placeholder="—"
                      placeholderTextColor={colors.subtle}
                    />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Hips cm">
                    <TextInput
                      testID="onboard-hips"
                      value={hips}
                      onChangeText={setHips}
                      keyboardType="numeric"
                      style={styles.input}
                      placeholder="—"
                      placeholderTextColor={colors.subtle}
                    />
                  </Field>
                </View>
              </View>
              <Primary onPress={next} label="Continue" testID="onboard-body-continue" />
              <Ghost onPress={next} label="Skip this" testID="onboard-body-skip" />
            </View>
          )}

          {step === "style" && (
            <View>
              <Section title="Style Profile" hint="Select all that apply." />
              <View style={styles.chipsRow}>
                {STYLES_LIST.map((s) => {
                  const active = selectedStyles.includes(s.id);
                  return (
                    <TouchableOpacity
                      key={s.id}
                      testID={`onboard-style-${s.id}`}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggleStyle(s.id)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Primary onPress={next} label="Continue" testID="onboard-style-continue" />
              <Ghost onPress={next} label="Skip this" testID="onboard-style-skip" />
            </View>
          )}

          {step === "color" && (
            <View>
              <Section title="Color Profile" hint="Helps tailor recommendations." />
              <Field label="Skin tone">
                <TextInput
                  testID="onboard-skin"
                  value={skinTone}
                  onChangeText={setSkinTone}
                  style={styles.input}
                  placeholder="warm, neutral, cool…"
                  placeholderTextColor={colors.subtle}
                />
              </Field>
              <Field label="Hair color">
                <TextInput
                  testID="onboard-hair"
                  value={hairColor}
                  onChangeText={setHairColor}
                  style={styles.input}
                  placeholder="brunette, black, blonde…"
                  placeholderTextColor={colors.subtle}
                />
              </Field>
              <Field label="Eye color">
                <TextInput
                  testID="onboard-eye"
                  value={eyeColor}
                  onChangeText={setEyeColor}
                  style={styles.input}
                  placeholder="brown, green, blue…"
                  placeholderTextColor={colors.subtle}
                />
              </Field>
              <Field label="Best colors (comma separated)">
                <TextInput
                  testID="onboard-best-colors"
                  value={bestColors}
                  onChangeText={setBestColors}
                  style={styles.input}
                  placeholder="navy, camel, ivory"
                  placeholderTextColor={colors.subtle}
                />
              </Field>
              <Primary onPress={next} label="Continue" testID="onboard-color-continue" />
              <Ghost onPress={next} label="Skip this" testID="onboard-color-skip" />
            </View>
          )}

          {step === "location" && (
            <View>
              <Section title="Weather Awareness" hint="Allow location for weather-aware outfit suggestions." />
              <View style={styles.locCard}>
                <Ionicons name="location-outline" size={28} color={colors.primary} />
                {locStatus === "done" ? (
                  <>
                    <Text style={styles.locTitle}>You&apos;re set.</Text>
                    <Text style={styles.locSub}>{locLabel || "Location saved"}</Text>
                  </>
                ) : locStatus === "denied" ? (
                  <>
                    <Text style={styles.locTitle}>Permission denied</Text>
                    <Text style={styles.locSub}>You can enable it later from Settings.</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.locTitle}>Weather context.</Text>
                    <Text style={styles.locSub}>
                      Closet AI uses your location to factor weather, season, and forecast into every outfit.
                    </Text>
                  </>
                )}
              </View>
              {locStatus !== "done" && (
                <Primary
                  testID="onboard-grant-location"
                  onPress={grabLocation}
                  label={locStatus === "loading" ? "Requesting…" : "Allow Location"}
                  loading={locStatus === "loading"}
                />
              )}
              <Primary onPress={finish} label="Finish" testID="onboard-finish" loading={saving} />
              <Ghost onPress={finish} label="Skip and finish" testID="onboard-location-skip" />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.helper}>{hint}</Text>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Primary({
  onPress,
  label,
  loading,
  testID,
}: {
  onPress: () => void;
  label: string;
  loading?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.primary, loading && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={loading}
    >
      {loading ? <ActivityIndicator color={colors.primaryFg} /> : <Text style={styles.primaryText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function Ghost({ onPress, label, testID }: { onPress: () => void; label: string; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} style={styles.ghost} onPress={onPress}>
      <Text style={styles.ghostText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  kicker: { ...typography.label, color: colors.primary },
  skipText: { fontSize: 13, color: colors.textSoft, fontWeight: "600" },
  container: { padding: spacing.xl, paddingBottom: 48 },
  heroCard: {
    height: 240,
    borderRadius: radii.xl,
    overflow: "hidden",
    marginBottom: spacing.lg,
    ...shadows.soft,
  },
  hero: { width: "100%", height: "100%" },
  heroVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(106, 30, 47, 0.30)" },
  heroText: { position: "absolute", bottom: 20, left: 20, right: 20 },
  heroTitle: {
    ...typography.display,
    color: "#fff",
    fontSize: 36,
    lineHeight: 38,
  },
  helper: { ...typography.bodyLarge, color: colors.textSoft },
  sectionTitle: { ...typography.h1, color: colors.text },
  subHeader: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  fieldLabel: { ...typography.label, marginBottom: spacing.sm },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.text },
  chipTextActive: { color: colors.primaryFg },
  primary: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.pill,
    alignItems: "center",
    marginTop: spacing.lg,
    ...shadows.soft,
  },
  primaryText: {
    color: colors.primaryFg,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  ghost: { alignItems: "center", paddingVertical: spacing.md },
  ghostText: { color: colors.textSoft, fontSize: 13, fontWeight: "600" },
  locCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  locTitle: { ...typography.h2, color: colors.text },
  locSub: { ...typography.body, color: colors.textSoft },
});
