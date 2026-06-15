// Local notification helper using expo-notifications.
// Local-scheduled notifications work in Expo Go (push does not).
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

let configured = false;

async function configure() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "ClosetAI Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#000000",
    });
  }
}

export async function ensureNotifPermission(): Promise<boolean> {
  await configure();
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  if (canAskAgain) {
    const res = await Notifications.requestPermissionsAsync();
    return res.status === "granted";
  }
  return false;
}

export async function scheduleReminder(opts: {
  title: string;
  body?: string;
  date: Date;
}): Promise<string | null> {
  if (!(await ensureNotifPermission())) return null;
  if (opts.date.getTime() <= Date.now()) return null;
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: opts.title,
      body: opts.body || "",
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: opts.date,
    } as Notifications.DateTriggerInput,
  });
  return id;
}

export async function cancelReminder(notificationId: string | null | undefined) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {}
}
