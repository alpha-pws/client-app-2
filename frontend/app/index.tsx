import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/useAuth";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace("/(tabs)/wardrobe");
    } else {
      router.replace("/(auth)/login");
    }
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
