import type { AlertMapAttachment } from "./alertMapImage";
import { DEVICE_ALERT_EMAIL_FROM, VIVI_ALERT_EMAIL_FROM_NAME } from "./deviceAlertEmail";

/**
 * One delivery path for alert emails (user alerts and device alerts).
 *
 * - Each (event, recipient) is sent at most once, whichever dispatcher gets there first,
 *   so the two dispatchers never double-email and never block each other.
 * - A temporary failure (network, 429, 5xx) throws AlertEmailRetryableError so the
 *   caller leaves the event open and the next poll retries it.
 * - A permanent rejection (other 4xx: bad address, unverified sender) is logged and
 *   recorded so it is not retried every poll.
 */

export type AlertEmailEnv = {
  ViviTEL: KVNamespace;
  VIVI_D1: D1Database;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_FROM_NAME?: string;
};

export class AlertEmailRetryableError extends Error {}

export type AlertEmailResult = "sent" | "already-sent" | "rejected";

const SENT_TTL_SEC = 60 * 60 * 24 * 14;

const sentKey = (tenantId: string, eventKey: string, email: string) =>
  `vivi:alert-email:${tenantId}:${eventKey}:${email}`;

/** Stable key for one Traccar event; falls back to device + time + type when there is no id. */
export function alertEmailEventKey(event: { id?: number; deviceId?: number; eventTime?: string; type?: string }) {
  const id = Number(event.id);
  if (Number.isFinite(id) && id > 0) return String(id);
  return `${Number(event.deviceId) || 0}:${String(event.eventTime ?? "").trim()}:${String(event.type ?? "").trim()}`;
}

export async function sendAlertEmailOnce(
  env: AlertEmailEnv,
  input: {
    tenantId: string;
    eventKey: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: AlertMapAttachment[];
  }
): Promise<AlertEmailResult> {
  const to = String(input.to ?? "").trim().toLowerCase();
  const key = sentKey(input.tenantId, input.eventKey, to);
  if (await env.ViviTEL.get(key)) return "already-sent";

  const apiKey = String(env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    // Configuration, not the recipient: keep the event open until the key is set.
    throw new AlertEmailRetryableError("RESEND_API_KEY is not configured; alert emails cannot be sent");
  }
  const fromEmail = String(env.MAIL_FROM ?? "").trim() || DEVICE_ALERT_EMAIL_FROM;
  const fromName = String(env.MAIL_FROM_NAME ?? "").trim() || VIVI_ALERT_EMAIL_FROM_NAME;

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments } : {})
      })
    });
  } catch (error) {
    throw new AlertEmailRetryableError(`Resend unreachable for ${to}: ${String((error as Error)?.message ?? error)}`);
  }

  if (response.ok) {
    await env.ViviTEL.put(key, "sent", { expirationTtl: SENT_TTL_SEC });
    return "sent";
  }

  const detail = await response.text().catch(() => "");
  if (response.status === 429 || response.status >= 500) {
    throw new AlertEmailRetryableError(`Resend ${response.status} for ${to}: ${detail || response.statusText}`);
  }
  console.error("Alert email rejected by Resend:", { to, status: response.status, detail, from: fromEmail });
  await env.ViviTEL.put(key, `rejected:${response.status}`, { expirationTtl: SENT_TTL_SEC });
  return "rejected";
}

type RecipientPerson = { id?: string; email?: string };

/**
 * Current email for a person added on an alert. Users picked from the site list are
 * looked up by id, so a changed address in User Admin is used and deactivated users
 * are skipped. Contacts and typed addresses use the email saved on the alert.
 */
export function createRecipientEmailResolver(env: AlertEmailEnv) {
  let users: Promise<Map<string, { email: string; active: boolean }>> | null = null;
  const loadUsers = () => {
    if (!users) {
      users = env.VIVI_D1.prepare("SELECT id, email, status FROM rbac_users")
        .all<{ id?: string; email?: string; status?: string }>()
        .then((result) => {
          const map = new Map<string, { email: string; active: boolean }>();
          for (const row of result.results ?? []) {
            const id = String(row.id ?? "").trim();
            if (!id) continue;
            map.set(id, {
              email: String(row.email ?? "").trim().toLowerCase(),
              active: String(row.status ?? "").trim().toLowerCase() === "active"
            });
          }
          return map;
        })
        .catch(() => new Map());
    }
    return users;
  };

  return async (person: RecipientPerson): Promise<string> => {
    const saved = String(person.email ?? "").trim().toLowerCase();
    const id = String(person.id ?? "").trim();
    if (id && !id.startsWith("contact-") && !id.includes("@")) {
      const user = (await loadUsers()).get(id);
      if (user) return user.active && user.email.includes("@") ? user.email : "";
    }
    return saved.includes("@") ? saved : "";
  };
}
