import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/useAuth";
import { api } from "@/src/api";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/(auth)/login");
      return;
    }
    // Check if onboarded — if not, send to onboarding.
    (async () => {
      try {
        const p = await api.getProfile();
        if (!p.onboarded) {
          router.replace("/onboarding" as any);
        } else {
          router.replace("/welcome");
        }
      } catch {
        router.replace("/welcome");
      }
    })();
  }, [user, loading, router]);

  return (
    <View style={styles.center} testID="root-loader">
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
});
