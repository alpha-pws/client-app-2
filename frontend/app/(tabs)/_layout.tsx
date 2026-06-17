import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { colors, radii, shadows } from "@/src/theme";

const ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  wardrobe: { active: "shirt", inactive: "shirt-outline" },
  outfits: { active: "sparkles", inactive: "sparkles-outline" },
  calendar: { active: "calendar", inactive: "calendar-outline" },
  social: { active: "people", inactive: "people-outline" },
  profile: { active: "person", inactive: "person-outline" },
};

const LABELS: Record<string, string> = {
  wardrobe: "Closet",
  outfits: "Stylist",
  calendar: "Calendar",
  social: "Social",
  profile: "Profile",
};

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 12) + 8;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };
          const ic = ICONS[route.name] || { active: "ellipse", inactive: "ellipse-outline" };
          const label = LABELS[route.name] || route.name;
          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel}
              testID={`bottom-tab-${route.name}`}
              onPress={onPress}
              activeOpacity={0.85}
              style={[styles.item, focused && styles.itemActive]}
            >
              <Ionicons
                name={focused ? ic.active : ic.inactive}
                size={20}
                color={focused ? colors.primaryFg : colors.textSoft}
              />
              {focused && <Text style={styles.itemLabel}>{label}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="wardrobe" />
      <Tabs.Screen name="outfits" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="social" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
    borderWidth: Platform.OS === "ios" ? 0 : 1,
    borderColor: colors.border,
    ...shadows.pill,
  },
  item: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  itemActive: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
  },
  itemLabel: {
    color: colors.primaryFg,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
