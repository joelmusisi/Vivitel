import { Alert, PermissionsAndroid, Platform } from "react-native";
import {
  AuthorizationStatus,
  deleteToken,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  setBackgroundMessageHandler,
  type Messaging,
  type RemoteMessage
} from "@react-native-firebase/messaging";
import { apiFetch, ApiError } from "../api/client";
import { deepLinkForScreen } from "../navigation/linking";

/**
 * Push notifications for fleet alerts.
 *
 * Android delivers through Firebase Cloud Messaging (FCM); iOS delivers through APNs, with
 * Firebase relaying so the backend sends to a single FCM token per device either way.
 *
 * Firebase only works once the platform config files are present
 * (android/app/google-services.json, ios/VivitelMobile/GoogleService-Info.plist).
 * Until then every call here is a quiet no-op so the rest of the app keeps working.
 */

/** Backend route that stores this device's token against the signed-in user. */
const PUSH_TOKEN_PATH = "/api/mobile/push-tokens";

function messagingOrNull(): Messaging | null {
  try {
    return getMessaging();
  } catch {
    return null;
  }
}

async function ensurePermission(messaging: Messaging): Promise<boolean> {
  if (Platform.OS === "android") {
    // Android 13+ (API 33) needs the runtime POST_NOTIFICATIONS grant.
    if (Number(Platform.Version) < 33) return true;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  const status = await requestPermission(messaging);
  return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL;
}

async function sendTokenToBackend(token: string): Promise<void> {
  try {
    await apiFetch(PUSH_TOKEN_PATH, {
      method: "POST",
      body: JSON.stringify({ token, platform: Platform.OS })
    });
  } catch (error) {
    // 404 = backend route not deployed yet; keep the app usable and retry on next launch.
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
}

/**
 * Ask for notification permission, fetch the FCM token and register it for the signed-in user.
 * Returns an unsubscribe function for the token-refresh and foreground listeners.
 */
export async function registerForPush(): Promise<() => void> {
  const messaging = messagingOrNull();
  if (!messaging) return () => {};
  try {
    if (!(await ensurePermission(messaging))) return () => {};
    await sendTokenToBackend(await getToken(messaging));
  } catch {
    return () => {};
  }

  const offRefresh = onTokenRefresh(messaging, (token) => {
    sendTokenToBackend(token).catch(() => {});
  });
  // FCM does not draw a banner while the app is open, so surface foreground alerts ourselves.
  const offForeground = onMessage(messaging, async (message) => {
    const title = message.notification?.title ?? "VIVI alert";
    const body = message.notification?.body ?? "";
    Alert.alert(title, body);
  });
  return () => {
    offRefresh();
    offForeground();
  };
}

/** Remove this device's token on sign-out so the next user doesn't receive the last user's alerts. */
export async function unregisterFromPush(): Promise<void> {
  const messaging = messagingOrNull();
  if (!messaging) return;
  try {
    const token = await getToken(messaging);
    await apiFetch(PUSH_TOKEN_PATH, {
      method: "DELETE",
      body: JSON.stringify({ token, platform: Platform.OS })
    }).catch(() => {});
    await deleteToken(messaging);
  } catch {
    // Firebase not configured or offline — nothing to clean up.
  }
}

/**
 * Deep link carried by a notification: `data.url` (a us.vivitelematics.ca or vivimobile:// link)
 * or `data.screen` ("home" | "map" | "assets" | "profile").
 */
export function linkFromNotification(message: RemoteMessage | null): string | null {
  const data = message?.data ?? {};
  const url = typeof data.url === "string" ? data.url.trim() : "";
  if (url) return url;
  return typeof data.screen === "string" ? deepLinkForScreen(data.screen) : null;
}

/** Link from the notification that cold-started the app, if any. */
export async function initialNotificationLink(): Promise<string | null> {
  const messaging = messagingOrNull();
  if (!messaging) return null;
  try {
    return linkFromNotification(await getInitialNotification(messaging));
  } catch {
    return null;
  }
}

/** Calls `listener` with the link when a notification is tapped while the app is in the background. */
export function onNotificationLink(listener: (url: string) => void): () => void {
  const messaging = messagingOrNull();
  if (!messaging) return () => {};
  return onNotificationOpenedApp(messaging, (message) => {
    const url = linkFromNotification(message);
    if (url) listener(url);
  });
}

/** Must run at module load (index.js), before the app registers, for background delivery. */
export function registerBackgroundHandler(): void {
  const messaging = messagingOrNull();
  if (!messaging) return;
  // The OS draws background notifications itself; nothing extra to do with the payload yet.
  setBackgroundMessageHandler(messaging, async () => {});
}
