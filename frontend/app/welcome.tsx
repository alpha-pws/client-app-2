import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View, Image } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/useAuth";
import { colors, spacing, typography, shadows } from "@/src/theme";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1509319117193-57bab727e09d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2ODl8MHwxfHNlYXJjaHwxfHx3YXJkcm9iZSUyMGNsb3NldCUyMGNsb3RoZXMlMjBoYW5naW5nfGVufDB8fHx8MTc4MTY2MTY2Nnww&ixlib=rb-4.1.0&q=85";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}

export default function Welcome() {
  const router = useRouter();
  const { user } = useAuth();
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(24)).current;
  const heroFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroFade, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 1,
        duration: 800,
        delay: 250,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 800,
        delay: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const t = setTimeout(() => {
      router.replace("/(tabs)/wardrobe");
    }, 2800);
    return () => clearTimeout(t);
  }, [router, fade, rise, heroFade]);

  const firstName = (user?.name || "").split(" ")[0] || "Friend";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="welcome-screen">
      <Animated.View style={[styles.heroWrap, { opacity: heroFade }]}>
        <Image source={{ uri: HERO_IMAGE }} style={styles.hero} />
        <View style={styles.heroVeil} />
      </Animated.View>

      <Animated.View
        style={[
          styles.content,
          { opacity: fade, transform: [{ translateY: rise }] },
        ]}
      >
        <Text style={styles.kicker} testID="welcome-kicker">
          CLOSET·AI
        </Text>
        <Text style={styles.greeting} testID="welcome-greeting">
          {getGreeting()},
        </Text>
        <Text style={styles.name} testID="welcome-name">
          {firstName}.
        </Text>
        <Text style={styles.sub} testID="welcome-sub">
          Your closet is ready.
        </Text>

        <TouchableOpacity
          testID="welcome-enter-button"
          style={styles.cta}
          onPress={() => router.replace("/(tabs)/wardrobe")}
        >
          <Text style={styles.ctaText}>Enter Closet</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  heroWrap: { height: "55%", width: "100%", position: "relative" },
  hero: { width: "100%", height: "100%" },
  heroVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(106, 30, 47, 0.18)",
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    justifyContent: "flex-start",
  },
  kicker: { ...typography.label, color: colors.primary, marginBottom: spacing.md },
  greeting: { ...typography.hero, color: colors.text },
  name: { ...typography.display, color: colors.primary, marginTop: -8 },
  sub: { ...typography.bodyLarge, color: colors.textSoft, marginTop: spacing.md },
  cta: {
    marginTop: spacing.xxl,
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 999,
    ...shadows.soft,
  },
  ctaText: {
    color: colors.primaryFg,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});
