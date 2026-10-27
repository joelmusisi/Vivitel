import { Link, Navigate, useParams } from "react-router-dom";
import MarketingBrandLockup from "../../components/marketing/MarketingBrandLockup";
import MarketingBrandedDevice from "../../components/marketing/MarketingBrandedDevice";
import { VIVI_BRAND_PRINT } from "./marketingBrand";
import { FEATURE_TO_SOLUTION, getSolutionPage } from "./marketingSolutions";

/** Standalone solution page — one topic only, pitch-deck visuals, text links elsewhere */
export default function MarketingFeaturePage() {
  const { slug = "" } = useParams();
  const solutionSlug = FEATURE_TO_SOLUTION[slug] ?? slug;
  const page = getSolutionPage(solutionSlug);

  if (!page) {
    return <Navigate to="/" replace />;
  }

  return (
    <article className="marketing-standalone">
      <header
        className="marketing-standalone__hero"
        style={{ backgroundImage: `url(${page.panelImage})` }}
      >
        <div className="marketing-standalone__hero-overlay" />
        <div className="marketing-standalone__hero-inner">
          <MarketingBrandLockup variant="dark" showSlogan={false} className="marketing-standalone__logo" />
          <p className="marketing-standalone__eyebrow">{page.eyebrow}</p>
          <h1 className="marketing-standalone__title">{page.title}</h1>
          <p className="marketing-standalone__subtitle">{page.subtitle}</p>
        </div>
      </header>

      <div className="marketing-standalone__body">
        <div className="marketing-standalone__main">
          <p className="marketing-prose marketing-prose--lead">{page.description}</p>
          <ul className="marketing-bullets">
            {page.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <div className="marketing-hero__actions">
            <Link to={page.ctaTo} className="marketing-btn marketing-btn--primary">
              {page.ctaLabel}
            </Link>
            <Link to="/login" className="marketing-btn marketing-btn--ghost">
              Access telematics
            </Link>
          </div>
        </div>

        <aside className="marketing-standalone__aside">
          {page.usePitchHardware ? (
            <>
              <MarketingBrandedDevice usePitchHardware />
              <p className="marketing-brand-print-note">{VIVI_BRAND_PRINT.device}</p>
            </>
          ) : (
            <div className="marketing-standalone__panel-shot">
              <img src={page.panelImage} alt="" loading="lazy" />
            </div>
          )}
        </aside>
      </div>

      {page.exploreLinks.length > 0 ? (
        <footer className="marketing-standalone__footer">
          <span className="marketing-standalone__footer-label">Open a separate topic</span>
          <nav className="marketing-standalone__footer-links" aria-label="Related topics">
            {page.exploreLinks.map((link) => (
              <Link key={link.to} to={link.to}>
                {link.label}
              </Link>
            ))}
          </nav>
        </footer>
      ) : null}
    </article>
  );
}
