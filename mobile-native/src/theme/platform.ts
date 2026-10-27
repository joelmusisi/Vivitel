import { Platform, Vibration, type PressableProps, type ViewStyle } from "react-native";

/** Shared palette (matches the web app's dark theme). */
export const colors = {
  bg: "#0b1220",
  surface: "#111827",
  border: "#1f2937",
  borderStrong: "#334155",
  text: "#f8fafc",
  textMuted: "#94a3b8",
  textFaint: "#64748b",
  accent: "#38bdf8",
  danger: "#f87171"
} as const;

export const isIOS = Platform.OS === "ios";

/**
 * Press feedback per platform convention: Material ripple on Android,
 * opacity dim on iOS. Spread onto a Pressable and pass `pressedStyle` to `style`.
 */
export const pressFeedback: Pick<PressableProps, "android_ripple"> = isIOS
  ? {}
  : { android_ripple: { color: "rgba(56, 189, 248, 0.18)", borderless: false } };

export const pressedStyle = (pressed: boolean): ViewStyle | null =>
  isIOS && pressed ? { opacity: 0.6 } : null;

/** Card depth: iOS uses a soft shadow, Android uses elevation. */
export const cardElevation: ViewStyle =
  Platform.select<ViewStyle>({
    ios: { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 3 }
  }) ?? {};

/** Platform font family for numerals/IDs. */
export const monoFont = isIOS ? "Menlo" : "monospace";

/** Light tap feedback for primary actions (Android only — iOS needs a haptics lib for a proper tap). */
export function tapFeedback(): void {
  if (!isIOS) Vibration.vibrate(10);
}
