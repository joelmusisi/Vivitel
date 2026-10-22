import { Link } from "react-router-dom";
import { MARKETING_PROMO_BANNERS } from "../../pages/marketing/marketingGarminExperience";

export default function MarketingPromoBannerGrid() {
  const normal = MARKETING_PROMO_BANNERS.filter((row) => row.span !== "wide");
  const wide = MARKETING_PROMO_BANNERS.filter((row) => row.span === "wide");

  return (
    <section className="marketing-banner-grid" aria-label="Promotional collections">
      <div className="marketing-banner-grid__row marketing-banner-grid__row--triple">
        {normal.slice(0, 3).map((banner) => (
          <Link key={banner.id} to={banner.to} className="marketing-banner-tile">
            <img src={banner.image} alt="" loading="lazy" />
            <div className="marketing-banner-tile__shade" />
            <div className="marketing-banner-tile__copy">
              <h3>{banner.title}</h3>
              <span className="marketing-banner-tile__cta">{banner.cta}</span>
            </div>
          </Link>
        ))}
      </div>
      {wide.map((banner) => (
        <div key={banner.id} className="marketing-banner-grid__row marketing-banner-grid__row--wide">
          <Link to={banner.to} className="marketing-banner-tile marketing-banner-tile--wide">
            <img src={banner.image} alt="" loading="lazy" />
            <div className="marketing-banner-tile__shade" />
            <div className="marketing-banner-tile__copy">
              <h3>{banner.title}</h3>
              <span className="marketing-banner-tile__cta">{banner.cta}</span>
            </div>
          </Link>
        </div>
      ))}
    </section>
  );
}
