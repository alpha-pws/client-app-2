import { useEffect, useRef, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, radii, shadows, spacing, typography } from "@/src/theme";

type Step = "email" | "otp" | "password";

export default function Forgot() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0 && tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, [cooldown]);

  const startCooldown = (secs: number) => {
    setCooldown(secs);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
  };

  const sendCode = async (resending = false) => {
    if (!email.trim()) {
      setError("Enter your email");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api.forgotPassword(email.trim());
      if (res.cooldown_seconds && res.cooldown_seconds > 0) {
        setInfo(`A code was already sent. Try again in ${res.cooldown_seconds}s.`);
        startCooldown(res.cooldown_seconds);
      } else {
        setInfo(
          resending
            ? "New code sent. Check your inbox."
            : "If that email is registered, a 6-digit code has been sent.",
        );
        startCooldown(45);
      }
      if (!resending) setStep("otp");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (otp.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const r = await api.verifyOtp(email.trim(), otp);
      setResetToken(r.reset_token);
      setStep("password");
    } catch (e: any) {
      setError(e.message || "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async () => {
    if (newPwd.length < 6) {
      setError("Password must be 6+ characters");
      return;
    }
    if (newPwd !== confirmPwd) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.resetPassword(resetToken, newPwd);
      setInfo("Password updated. Sign in with your new password.");
      setTimeout(() => router.replace("/(auth)/login"), 1200);
    } catch (e: any) {
      setError(e.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="forgot-screen">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            testID="forgot-back"
            onPress={() => (step === "email" ? router.back() : setStep(step === "otp" ? "email" : "otp"))}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </TouchableOpacity>

          <Text style={styles.kicker}>CLOSET·AI</Text>
          <Text style={styles.title}>
            {step === "email" && "Forgot it?"}
            {step === "otp" && "Check your inbox."}
            {step === "password" && "Almost there."}
          </Text>
          <Text style={styles.sub}>
            {step === "email" && "Enter your email — we'll send a 6-digit code."}
            {step === "otp" && `Enter the code we sent to ${email}.`}
            {step === "password" && "Choose a new password (6+ characters)."}
          </Text>

          {step === "email" && (
            <View style={styles.form}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <TextInput
                testID="forgot-email-input"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.subtle}
              />
              <TouchableOpacity
                testID="forgot-send-button"
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={() => sendCode(false)}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.primaryFg} />
                ) : (
                  <Text style={styles.buttonText}>Send Code</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === "otp" && (
            <View style={styles.form}>
              <Text style={styles.fieldLabel}>6-DIGIT CODE</Text>
              <TextInput
                testID="forgot-otp-input"
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.otpInput]}
                placeholder="••••••"
                placeholderTextColor={colors.subtle}
              />
              <TouchableOpacity
                testID="forgot-verify-button"
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={verifyCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.primaryFg} />
                ) : (
                  <Text style={styles.buttonText}>Verify Code</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                testID="forgot-resend-button"
                style={styles.linkBtn}
                onPress={() => sendCode(true)}
                disabled={cooldown > 0 || loading}
              >
                <Text style={[styles.linkText, cooldown > 0 && { opacity: 0.5 }]}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Didn't get it? Resend code"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === "password" && (
            <View style={styles.form}>
              <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
              <TextInput
                testID="forgot-new-password-input"
                value={newPwd}
                onChangeText={setNewPwd}
                secureTextEntry
                style={styles.input}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.subtle}
              />
              <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>CONFIRM</Text>
              <TextInput
                testID="forgot-confirm-password-input"
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                secureTextEntry
                style={styles.input}
                placeholder="Re-enter password"
                placeholderTextColor={colors.subtle}
              />
              <TouchableOpacity
                testID="forgot-submit-button"
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={submitPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.primaryFg} />
                ) : (
                  <Text style={styles.buttonText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {error && (
            <Text style={styles.error} testID="forgot-error">
              {error}
            </Text>
          )}
          {info && (
            <Text style={styles.info} testID="forgot-info">
              {info}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, paddingTop: spacing.lg },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  kicker: { ...typography.label, color: colors.primary, marginTop: spacing.md },
  title: { ...typography.display, marginTop: 6, color: colors.text },
  sub: { ...typography.bodyLarge, color: colors.textSoft, marginTop: spacing.sm },
  form: { marginTop: spacing.xl },
  fieldLabel: { ...typography.label, marginBottom: spacing.sm },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.text,
  },
  otpInput: { fontSize: 28, letterSpacing: 14, fontWeight: "700", textAlign: "center" },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.pill,
    alignItems: "center",
    marginTop: spacing.xl,
    ...shadows.soft,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.primaryFg, fontWeight: "700", letterSpacing: 1.4, fontSize: 13, textTransform: "uppercase" },
  linkBtn: { marginTop: spacing.lg, alignItems: "center", paddingVertical: 8 },
  linkText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.md, textAlign: "center" },
  info: { color: colors.success, fontSize: 13, marginTop: spacing.md, textAlign: "center" },
});
