import { Link } from "react-router-dom";
import { MARKETING_SUPPORT_SECTIONS } from "./marketingSiteStructure";

export default function MarketingSupportHubPage() {
  return (
    <>
      <section className="marketing-page-hero">
        <div className="marketing-page-hero__inner">
          <div className="marketing-kicker">Support</div>
          <h1 className="marketing-title">VIVI Telematics support center</h1>
          <p className="marketing-subtitle">
            Fleet specialist assistance, product guides, and business programme contacts — all within the VIVI platform
            ecosystem.
          </p>
          <div className="marketing-hero__actions">
            <Link to="/login" className="marketing-btn marketing-btn--primary">
              Access telematics
            </Link>
            <Link to="/solutions/platform" className="marketing-btn marketing-btn--ghost">
              Platform overview
            </Link>
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-support-grid">
        {MARKETING_SUPPORT_SECTIONS.map((section) => (
          <article key={section.title} className="marketing-support-card">
            <h2>{section.title}</h2>
            <p>{section.blurb}</p>
            {section.links.map((link) => (
              <p key={link.to}>
                <Link to={link.to}>{link.label}</Link>
              </p>
            ))}
          </article>
        ))}
      </section>
    </>
  );
}
