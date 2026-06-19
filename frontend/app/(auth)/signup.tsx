import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/useAuth";
import { colors, spacing, typography } from "@/src/theme";

const MIN_AGE = 13;
const CURRENT_YEAR = new Date().getFullYear();

export default function Signup() {
  const router = useRouter();
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const age = useMemo(() => {
    const yr = parseInt(birthYear, 10);
    if (!yr || yr < 1900 || yr > CURRENT_YEAR) return null;
    return CURRENT_YEAR - yr;
  }, [birthYear]);

  const needsGuardian = age !== null && age >= MIN_AGE && age < 18;
  const tooYoung = age !== null && age < MIN_AGE;

  const onSubmit = async () => {
    if (!name || !email || password.length < 6) {
      setError("Name, valid email, and 6+ char password required");
      return;
    }
    if (!birthYear) {
      setError("Please enter your year of birth so we can confirm you're old enough.");
      return;
    }
    if (tooYoung) {
      setError(`Sorry — Closet AI is for ages ${MIN_AGE} and up.`);
      return;
    }
    if (needsGuardian && !guardianEmail) {
      setError("Under 18? We need a parent or guardian's email to confirm permission.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signup(email.trim(), password, name.trim(), {
        birth_year: parseInt(birthYear, 10),
        guardian_email: needsGuardian ? guardianEmail.trim() : undefined,
      });
      router.replace("/onboarding" as any);
    } catch (e: any) {
      setError(e.message?.replace(/^HTTP\s+\d+:\s*/, "") || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>CLOSET·AI</Text>
          <Text style={styles.title}>Start your{"\n"}closet.</Text>
          <Text style={styles.sub}>Save outfits. Get styled. Shop smarter.</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              testID="signup-name-input"
              value={name}
              onChangeText={setName}
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.subtle}
            />

            <Text style={[styles.label, { marginTop: spacing.lg }]}>Email</Text>
            <TextInput
              testID="signup-email-input"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.subtle}
            />

            <Text style={[styles.label, { marginTop: spacing.lg }]}>Password</Text>
            <TextInput
              testID="signup-password-input"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.subtle}
            />

            <Text style={[styles.label, { marginTop: spacing.lg }]}>Year of birth</Text>
            <TextInput
              testID="signup-birth-year-input"
              keyboardType="number-pad"
              maxLength={4}
              value={birthYear}
              onChangeText={(t) => setBirthYear(t.replace(/[^0-9]/g, ""))}
              style={styles.input}
              placeholder={`e.g. ${CURRENT_YEAR - 20}`}
              placeholderTextColor={colors.subtle}
            />
            {age !== null && !tooYoung && (
              <Text style={styles.helperText} testID="signup-age-display">
                You are {age} years old.
              </Text>
            )}
            {tooYoung && (
              <Text style={[styles.helperText, { color: colors.accent }]} testID="signup-age-display">
                You are {age} years old. You must be at least {MIN_AGE} to use Closet AI.
              </Text>
            )}

            {needsGuardian && (
              <View testID="signup-guardian-section" style={styles.guardianCard}>
                <Text style={styles.guardianTitle}>Parent or guardian permission</Text>
                <Text style={styles.guardianBody}>
                  Since you're under 18, we'll send a permission notice to your parent or guardian.
                </Text>
                <TextInput
                  testID="signup-guardian-email-input"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={guardianEmail}
                  onChangeText={setGuardianEmail}
                  style={[styles.input, { marginTop: spacing.md }]}
                  placeholder="parent@example.com"
                  placeholderTextColor={colors.subtle}
                />
              </View>
            )}

            {error && (
              <Text style={styles.error} testID="signup-error">
                {error}
              </Text>
            )}

            <TouchableOpacity
              testID="signup-submit-button"
              style={[styles.button, (loading || tooYoung) && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={loading || tooYoung}
            >
              <Text style={styles.buttonText}>{loading ? "Creating…" : "Create Account"}</Text>
            </TouchableOpacity>

            <Link href="/(auth)/login" asChild>
              <TouchableOpacity testID="go-to-login-link" style={styles.linkBtn}>
                <Text style={styles.linkText}>
                  Already have an account?{" "}
                  <Text style={styles.linkAccent}>Sign in →</Text>
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl * 2 },
  kicker: { ...typography.label, marginBottom: spacing.lg },
  title: { fontSize: 44, fontWeight: "900", letterSpacing: -1.5, color: colors.primary, lineHeight: 48 },
  sub: { ...typography.body, color: colors.mutedFg, marginTop: spacing.sm },
  form: { marginTop: spacing.xl },
  label: { ...typography.label, marginBottom: spacing.sm },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: spacing.md,
    fontSize: 17,
    color: colors.primary,
  },
  helperText: { color: colors.mutedFg, marginTop: spacing.sm, fontSize: 12 },
  guardianCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.muted,
  },
  guardianTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 1, color: colors.primary },
  guardianBody: { fontSize: 12, color: colors.mutedFg, marginTop: 6, lineHeight: 17 },
  error: { color: colors.accent, marginTop: spacing.md, fontSize: 13 },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    marginTop: spacing.xl,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 14 },
  linkBtn: { marginTop: spacing.xl, alignItems: "center" },
  linkText: { color: colors.mutedFg, fontSize: 14 },
  linkAccent: { color: colors.primary, fontWeight: "700" },
});
