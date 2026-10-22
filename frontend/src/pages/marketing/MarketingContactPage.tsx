import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { submitMarketingContactRequest } from "../../utils/api";
import { MARKETING_HOW_IT_WORKS } from "./marketingContent";

export const MARKETING_CONTACT_EMAIL = "care@vivitelematics.com";

const CONTACT_TOPICS = [
  "General enquiry",
  "Platform demo",
  "New fleet rollout",
  "Technical support",
  "Partnership"
] as const;

const CONTACT_CHANNELS = [
  {
    title: "Email",
    description: "Send a detailed request and our team will respond from the operations inbox.",
    label: MARKETING_CONTACT_EMAIL,
    href: `mailto:${MARKETING_CONTACT_EMAIL}`
  },
  {
    title: "Phone",
    description: "Speak with fleet support for urgent operational questions.",
    label: "+27 76 405 2278",
    href: "tel:+27764052278"
  },
  {
    title: "Existing customers",
    description: "Sign in to your telematics workspace for live maps, video, alerts, and reports.",
    label: "Use header sign-in",
    href: "/login",
    internal: true
  }
] as const;

export default function MarketingContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState<string>(CONTACT_TOPICS[0]);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackMailto, setFallbackMailto] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFallbackMailto(null);
    setBusy(true);
    try {
      const result = await submitMarketingContactRequest({
        name,
        email,
        company,
        phone,
        topic,
        message,
        website
      });
      if (!result.ok) {
        setError(result.error ?? "Could not send your message.");
        if (result.fallbackMailto) setFallbackMailto(result.fallbackMailto);
        return;
      }
      setNotice(result.message ?? `Thank you. Your request was sent to ${MARKETING_CONTACT_EMAIL}.`);
      setName("");
      setEmail("");
      setCompany("");
      setPhone("");
      setTopic(CONTACT_TOPICS[0]);
      setMessage("");
      setWebsite("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="marketing-section marketing-section--contact-hero">
        <div className="marketing-section__head">
          <div className="marketing-kicker">Contact VIVI Telematics</div>
          <h1 className="marketing-title" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)" }}>
            Send us your request
          </h1>
          <p className="marketing-subtitle" style={{ margin: "0 auto", textAlign: "center" }}>
            Complete the form below and we will deliver your message to{" "}
            <a href={`mailto:${MARKETING_CONTACT_EMAIL}`} className="marketing-contact-link">
              {MARKETING_CONTACT_EMAIL}
            </a>
            . Our team typically responds within one business day.
          </p>
        </div>
      </section>

      <section className="marketing-section" style={{ paddingTop: 0 }}>
        <div className="marketing-contact-layout">
          <form className="marketing-contact-form" onSubmit={onSubmit} noValidate>
            <div className="marketing-contact-form__grid">
              <label className="marketing-field">
                <span className="marketing-field__label">Full name *</span>
                <input
                  className="marketing-field__input"
                  type="text"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                  placeholder="Your name"
                />
              </label>
              <label className="marketing-field">
                <span className="marketing-field__label">Work email *</span>
                <input
                  className="marketing-field__input"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="name@company.com"
                />
              </label>
              <label className="marketing-field">
                <span className="marketing-field__label">Company</span>
                <input
                  className="marketing-field__input"
                  type="text"
                  name="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  autoComplete="organization"
                  placeholder="Fleet or organisation"
                />
              </label>
              <label className="marketing-field">
                <span className="marketing-field__label">Phone</span>
                <input
                  className="marketing-field__input"
                  type="tel"
                  name="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="+27 …"
                />
              </label>
            </div>

            <label className="marketing-field">
              <span className="marketing-field__label">Topic *</span>
              <select
                className="marketing-field__input"
                name="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                required
              >
                {CONTACT_TOPICS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="marketing-field">
              <span className="marketing-field__label">How can we help? *</span>
              <textarea
                className="marketing-field__input marketing-field__textarea"
                name="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={6}
                placeholder="Tell us about your fleet size, locations, and what you need from the platform."
              />
            </label>

            <label className="marketing-field marketing-field--honeypot" aria-hidden="true">
              <span className="marketing-field__label">Website</span>
              <input
                className="marketing-field__input"
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </label>

            {error && (
              <div className="marketing-form-alert marketing-form-alert--error" role="alert">
                {error}
                {fallbackMailto && (
                  <p style={{ margin: "10px 0 0" }}>
                    <a href={fallbackMailto} className="marketing-contact-link">
                      Open your email app to send manually
                    </a>
                  </p>
                )}
              </div>
            )}
            {notice && (
              <div className="marketing-form-alert marketing-form-alert--success" role="status">
                {notice}
              </div>
            )}

            <button type="submit" className="marketing-btn marketing-btn--primary" disabled={busy}>
              {busy ? "Sending…" : "Send request"}
            </button>
            <p className="marketing-form-footnote">
              By submitting, you agree that we may contact you about your enquiry. Messages are delivered to{" "}
              {MARKETING_CONTACT_EMAIL}.
            </p>
          </form>

          <aside className="marketing-contact-aside">
            <h2>Other ways to reach us</h2>
            <div className="marketing-contact-grid marketing-contact-grid--stacked">
              {CONTACT_CHANNELS.map((channel) => (
                <article key={channel.title} className="marketing-contact-card">
                  <h3>{channel.title}</h3>
                  <p>{channel.description}</p>
                  {"internal" in channel && channel.internal ? (
                    <Link to={channel.href} className="marketing-contact-link">
                      {channel.label}
                    </Link>
                  ) : (
                    <a href={channel.href} className="marketing-contact-link">
                      {channel.label}
                    </a>
                  )}
                </article>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-section__head">
          <h2>Typical rollout path</h2>
        </div>
        <div className="marketing-steps">
          {MARKETING_HOW_IT_WORKS.map((step) => (
            <article key={step.step} className="marketing-step">
              <div className="marketing-step__num">{step.step}</div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
