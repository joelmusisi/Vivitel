/**
 * Alert SMS through Africa's Talking (https://developers.africastalking.com/docs/sms/sending).
 * Secrets: AFRICASTALKING_USERNAME, AFRICASTALKING_API_KEY; optional AFRICASTALKING_SENDER_ID.
 * Username "sandbox" uses the sandbox API. One SMS per event per number, like email.
 */

export type AlertSmsEnv = {
  ViviTEL: KVNamespace;
  AFRICASTALKING_USERNAME?: string;
  AFRICASTALKING_API_KEY?: string;
  AFRICASTALKING_SENDER_ID?: string;
};

const SENT_TTL_SEC = 60 * 60 * 24 * 14;
/** SMS bodies are cut to two segments. */
const MAX_SMS_CHARS = 306;

export function isAlertSmsConfigured(env: AlertSmsEnv): boolean {
  return Boolean(String(env.AFRICASTALKING_USERNAME ?? "").trim() && String(env.AFRICASTALKING_API_KEY ?? "").trim());
}

/** "0772 123 456" → "+256772123456" (Uganda default); keeps numbers already in +international form. */
export function normalizePhoneNumber(raw: unknown, defaultCountryCode = "256"): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const digits = text.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return /^\+\d{8,15}$/.test(digits) ? digits : "";
  if (digits.startsWith("00")) return /^\d{10,17}$/.test(digits) ? `+${digits.slice(2)}` : "";
  if (digits.startsWith("0") && digits.length >= 9) return `+${defaultCountryCode}${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return "";
}

export function buildAlertSmsText(input: {
  notificationName: string;
  assetLabel: string;
  eventTime: string;
  location?: string;
  speedKph?: number;
}): string {
  const parts = [
    `VIVI alert: ${input.notificationName}`,
    input.assetLabel,
    input.eventTime,
    input.location ? `at ${input.location}` : "",
    Number.isFinite(input.speedKph) ? `${Math.round(Number(input.speedKph))} km/h` : ""
  ].filter(Boolean);
  const text = parts.join(" | ");
  return text.length > MAX_SMS_CHARS ? `${text.slice(0, MAX_SMS_CHARS - 1)}…` : text;
}

const sentKey = (tenantId: string, eventKey: string, phone: string) => `vivi:alert-sms:${tenantId}:${eventKey}:${phone}`;

export async function sendAlertSmsOnce(
  env: AlertSmsEnv,
  input: { tenantId: string; eventKey: string; to: string; message: string }
): Promise<"sent" | "already-sent" | "not-configured" | "failed"> {
  const phone = normalizePhoneNumber(input.to);
  if (!phone) return "failed";
  if (!isAlertSmsConfigured(env)) return "not-configured";
  const key = sentKey(input.tenantId, input.eventKey, phone);
  if (await env.ViviTEL.get(key)) return "already-sent";

  const username = String(env.AFRICASTALKING_USERNAME).trim();
  const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
  const form = new URLSearchParams({ username, to: phone, message: input.message });
  const sender = String(env.AFRICASTALKING_SENDER_ID ?? "").trim();
  if (sender) form.set("from", sender);
  try {
    const response = await fetch(`https://${host}/version1/messaging`, {
      method: "POST",
      headers: {
        apiKey: String(env.AFRICASTALKING_API_KEY).trim(),
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });
    const body = (await response.json().catch(() => null)) as {
      SMSMessageData?: { Recipients?: Array<{ status?: string; statusCode?: number }> };
    } | null;
    const recipient = body?.SMSMessageData?.Recipients?.[0];
    const accepted = response.ok && (recipient?.statusCode === 101 || /success/i.test(String(recipient?.status ?? "")));
    if (!accepted) {
      console.warn("Alert SMS not accepted:", { phone, status: response.status, recipient });
      return "failed";
    }
    await env.ViviTEL.put(key, "sent", { expirationTtl: SENT_TTL_SEC });
    return "sent";
  } catch (error) {
    console.warn("Alert SMS failed:", phone, error);
    return "failed";
  }
}
