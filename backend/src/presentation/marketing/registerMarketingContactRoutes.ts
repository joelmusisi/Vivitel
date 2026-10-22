import type { Express, Request } from "express";
import { escapeHtml, sendResendEmail } from "../../shared/mail";

const DEFAULT_CONTACT_TO = "care@vivitelematics.com";

export type MarketingContactPayload = {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  topic: string;
  message: string;
};

interface RegisterMarketingContactRoutesDeps {
  app: Express;
  db: any;
  randomHex: (bytes: number) => string;
  contactTo?: string;
}

function ensureMarketingContactTable(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketing_contact_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT,
      phone TEXT,
      topic TEXT NOT NULL,
      message TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      email_sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function registerMarketingContactRoutes(deps: RegisterMarketingContactRoutesDeps): void {
  const { app, db, randomHex } = deps;
  const contactTo = normalizeEmail(deps.contactTo ?? process.env.MARKETING_CONTACT_TO ?? DEFAULT_CONTACT_TO)
    || DEFAULT_CONTACT_TO;

  try {
    ensureMarketingContactTable(db);
  } catch {
    // Table may already exist with a compatible schema.
  }

  app.post("/marketing/contact", async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const honeypot = String(body.website ?? "").trim();
      if (honeypot) {
        return res.json({
          ok: true,
          message: "Thank you. Our team will respond to your request shortly."
        });
      }

      const name = String(body.name ?? "").trim();
      const email = normalizeEmail(body.email);
      const company = String(body.company ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const topic = String(body.topic ?? "General enquiry").trim() || "General enquiry";
      const message = String(body.message ?? "").trim();

      if (!name) return res.status(400).json({ error: "Name is required." });
      if (!email || !isValidEmail(email)) return res.status(400).json({ error: "A valid email address is required." });
      if (message.length < 10) return res.status(400).json({ error: "Please enter a message of at least 10 characters." });
      if (message.length > 8000) return res.status(400).json({ error: "Message is too long." });

      const id = randomHex(16);
      const createdAt = new Date().toISOString();
      const ip = String(req.header("cf-connecting-ip") ?? req.header("x-forwarded-for") ?? req.ip ?? "");
      const userAgent = String(req.header("user-agent") ?? "");

      try {
        db.prepare(
          `INSERT INTO marketing_contact_requests
            (id, name, email, company, phone, topic, message, ip, user_agent, email_sent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
        ).run(id, name, email, company, phone, topic, message, ip, userAgent, createdAt);
      } catch {
        // Continue even if persistence fails — email delivery is primary.
      }

      const subject = `Website contact: ${topic} — ${name}`;
      const text = [
        "New contact request from the VIVI Telematics website",
        "",
        `Name: ${name}`,
        `Email: ${email}`,
        `Company: ${company || "—"}`,
        `Phone: ${phone || "—"}`,
        `Topic: ${topic}`,
        `Submitted: ${createdAt}`,
        `Request ID: ${id}`,
        "",
        "Message:",
        message
      ].join("\n");

      const html =
        `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:640px">` +
        `<h2 style="margin:0 0 12px">New website contact request</h2>` +
        `<p><strong>Name:</strong> ${escapeHtml(name)}</p>` +
        `<p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>` +
        `<p><strong>Company:</strong> ${escapeHtml(company || "—")}</p>` +
        `<p><strong>Phone:</strong> ${escapeHtml(phone || "—")}</p>` +
        `<p><strong>Topic:</strong> ${escapeHtml(topic)}</p>` +
        `<p><strong>Submitted:</strong> ${escapeHtml(createdAt)}</p>` +
        `<p style="white-space:pre-wrap;margin-top:16px"><strong>Message</strong><br>${escapeHtml(message)}</p>` +
        `</div>`;

      let emailSent = false;
      let emailError = "";
      try {
        await sendResendEmail({
          to: contactTo,
          subject,
          text,
          html,
          replyTo: email
        });
        emailSent = true;
        try {
          db.prepare("UPDATE marketing_contact_requests SET email_sent = 1 WHERE id = ?").run(id);
        } catch {
          // ignore
        }
      } catch (error: any) {
        emailError = String(error?.message ?? error ?? "Email delivery failed");
      }

      if (!emailSent) {
        return res.status(503).json({
          ok: false,
          error:
            emailError ||
            "We could not deliver your message right now. Please email care@vivitelematics.com directly.",
          fallbackMailto: `mailto:${contactTo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
        });
      }

      return res.json({
        ok: true,
        message: "Thank you. Your request was sent to our team at care@vivitelematics.com. We will respond shortly."
      });
    } catch {
      return res.status(400).json({ error: "Invalid request." });
    }
  });
}
