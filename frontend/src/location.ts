import * as Location from "expo-location";
import { Alert, Linking } from "react-native";

export type Coords = { lat: number; lon: number };

export async function ensureLocationPermission(): Promise<boolean> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.status === "granted") return true;
  if (cur.canAskAgain) {
    const r = await Location.requestForegroundPermissionsAsync();
    if (r.status === "granted") return true;
  }
  Alert.alert(
    "Location",
    "Allow location access for weather-aware outfit recommendations.",
    [
      { text: "Open Settings", onPress: () => Linking.openSettings() },
      { text: "Not now", style: "cancel" },
    ],
  );
  return false;
}

export async function getCurrentCoords(): Promise<Coords | null> {
  try {
    const ok = await ensureLocationPermission();
    if (!ok) return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return null;
  }
}
