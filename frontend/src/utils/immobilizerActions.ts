import { kickAvlSocket, pushDeviceSettings } from "./api";

export type ImmobilizerAction = "cutOff" | "turnOn";

export const immobilizerActionLabel = (action: ImmobilizerAction): string => {
  return action === "cutOff" ? "Cut Off" : "Turn On";
};

export const immobilizerActionDescription = (action: ImmobilizerAction): string => {
  return action === "cutOff"
    ? "Turn relay 1 ON to cut power to the vehicle."
    : "Turn relay 1 OFF to restore power to the vehicle.";
};

export function buildImmobilizerSettingsOverride(action: ImmobilizerAction): Record<string, unknown> {
  const relayOn = action === "cutOff";
  return {
    viviImmobilizer: {
      action,
      relay: 1,
      relayState: relayOn ? "ON" : "OFF",
      activeControl: relayOn ? "relay drive 1 ON" : "relay drive 1 OFF",
      requestedAt: new Date().toISOString()
    },
    remoteActions: {
      relayOne: {
        enabled: true,
        delay: { hours: "0", minutes: "0", seconds: "0" },
        duration: relayOn ? "Turn the relay drive on" : "Turn the relay drive off",
        override: true
      }
    }
  };
}

export async function saveAndCompileImmobilizerAction(
  imei: string,
  action: ImmobilizerAction
): Promise<{
  ok: boolean;
  settingsId?: string;
  kickQueued?: boolean;
  kickError?: string;
  error?: string;
}> {
  const needle = String(imei ?? "").trim();
  if (!needle) return { ok: false, error: "IMEI is required." };

  const push = await pushDeviceSettings(needle, buildImmobilizerSettingsOverride(action));
  if (!push.queued) {
    return { ok: false, error: push.error ?? "Failed to queue settings." };
  }

  let kickQueued: boolean | undefined;
  let kickError: string | undefined;
  try {
    const kick = await kickAvlSocket(needle);
    kickQueued = Boolean(kick.queued);
    if (!kick.queued && kick.error) kickError = kick.error;
  } catch (error: any) {
    kickQueued = false;
    kickError = String(error?.message ?? error);
  }

  return { ok: true, settingsId: push.id, kickQueued, kickError };
}
