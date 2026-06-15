import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtle,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1,
          textTransform: "uppercase",
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="wardrobe"
        options={{
          title: "Closet",
          tabBarIcon: ({ color }) => <Ionicons name="shirt-outline" color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="outfits"
        options={{
          title: "Stylist",
          tabBarIcon: ({ color }) => <Ionicons name="sparkles-outline" color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: "Social",
          tabBarIcon: ({ color }) => <Ionicons name="people-outline" color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}
