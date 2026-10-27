import express from "express";

// Global state/constants - initialized by vps_server.ts
declare let APP_BASE_URL: string;
declare let MAIL_FROM: string;
declare let MAIL_FROM_NAME: string;
declare let RESEND_API_KEY: string;

export function escapeHtml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendResendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | string[];
}) {
  const from = MAIL_FROM_NAME ? `${MAIL_FROM_NAME} <${MAIL_FROM}>` : MAIL_FROM;
  const replyTo = Array.isArray(input.replyTo)
    ? input.replyTo.map((v) => String(v ?? "").trim()).filter(Boolean)
    : String(input.replyTo ?? "").trim()
      ? [String(input.replyTo).trim()]
      : [];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(replyTo.length ? { reply_to: replyTo } : {})
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Resend failed (${response.status}): ${text || response.statusText}`);
  }
}

export async function sendRbacInviteEmail(req: express.Request, user: { email: string; name?: string }) {
  const email = String(user.email ?? "").trim().toLowerCase();
  const displayName = String(user.name ?? "").trim() || email;
  if (!email) return { requested: true, attempted: false, sent: false, error: "User email missing" };

  const origin = String(req.header("origin") ?? "").trim().replace(/\/$/, "");
  const base = APP_BASE_URL || origin;
  const resetUrl = base ? `${base}/reset-password` : "";
  if (!MAIL_FROM || !RESEND_API_KEY || !resetUrl) {
    return { requested: true, attempted: false, sent: false, error: "MAIL_FROM / RESEND_API_KEY / APP_BASE_URL not configured" };
  }

  const subject = "Reset your Vivi Telematics access";
  const text =
    `Hello ${displayName},\n\n` +
    `An administrator requested an access reset for your account (${email}).\n\n` +
    `Use this link to continue:\n${resetUrl}\n\n` +
    `If you did not request this, please contact your administrator.\n`;
  const html =
    `<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827\">` +
    `<h2 style=\"margin:0 0 16px\">Account access reset</h2>` +
    `<p>Hello <strong>${escapeHtml(displayName)}</strong>,</p>` +
    `<p>An administrator requested an access reset for your account (${escapeHtml(email)}).</p>` +
    `<p><a href=\"${escapeHtml(resetUrl)}\" style=\"display:inline-block;padding:12px 18px;background:#111827;color:#fff;text-decoration:none;border-radius:6px\">Open reset page</a></p>` +
    `<p>If you did not request this, please contact your administrator.</p>` +
    `</div>`;

  try {
    await sendResendEmail({ to: email, subject, text, html });
    return { requested: true, attempted: true, sent: true as const };
  } catch (error: any) {
    return { requested: true, attempted: true, sent: false as const, error: String(error?.message ?? error ?? "Email send failed") };
  }
}
