import { useState } from "react";
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

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) {
      setError("Enter your email and password");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)/wardrobe");
    } catch (e: any) {
      setError(e.message || "Login failed");
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
          <Text style={styles.title}>Welcome{"\n"}back.</Text>
          <Text style={styles.sub}>Your wardrobe, smarter.</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email-input"
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
              testID="login-password-input"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.subtle}
            />

            {error && (
              <Text style={styles.error} testID="login-error">
                {error}
              </Text>
            )}

            <TouchableOpacity
              testID="login-submit-button"
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? "Signing in…" : "Sign In"}</Text>
            </TouchableOpacity>

            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity testID="go-to-signup-link" style={styles.linkBtn}>
                <Text style={styles.linkText}>
                  No account? <Text style={styles.linkAccent}>Create one →</Text>
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
  container: { padding: spacing.xl, paddingTop: spacing.xxl },
  kicker: { ...typography.label, marginBottom: spacing.lg },
  title: { fontSize: 44, fontWeight: "900", letterSpacing: -1.5, color: colors.primary, lineHeight: 48 },
  sub: { ...typography.body, color: colors.mutedFg, marginTop: spacing.sm },
  form: { marginTop: spacing.xxl },
  label: { ...typography.label, marginBottom: spacing.sm },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: spacing.md,
    fontSize: 17,
    color: colors.primary,
  },
  error: { color: colors.accent, marginTop: spacing.md, fontSize: 13 },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    marginTop: spacing.xxl,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.primaryFg, fontWeight: "800", letterSpacing: 1, fontSize: 14 },
  linkBtn: { marginTop: spacing.xl, alignItems: "center" },
  linkText: { color: colors.mutedFg, fontSize: 14 },
  linkAccent: { color: colors.primary, fontWeight: "700" },
});
