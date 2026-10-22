import MarketingBrandLockup from "../../components/marketing/MarketingBrandLockup";
import MarketingProductLineup from "../../components/marketing/MarketingProductLineup";
import MarketingPromoBannerGrid from "../../components/marketing/MarketingPromoBannerGrid";
import MarketingShopCategoryGrid from "../../components/marketing/MarketingShopCategoryGrid";
import MarketingStoryboardGrid from "../../components/marketing/MarketingStoryboardGrid";
import MarketingWelcomeCarousel from "../../components/marketing/MarketingWelcomeCarousel";
import { MARKETING_TRUST_STATS } from "./marketingContent";

export default function MarketingHome() {
  return (
    <>
      <MarketingWelcomeCarousel />

      <section className="marketing-home-brand">
        <MarketingBrandLockup variant="light" showSlogan showTagline />
      </section>

      <MarketingStoryboardGrid />

      <MarketingShopCategoryGrid />

      <MarketingPromoBannerGrid />

      <MarketingProductLineup />

      <section className="marketing-trust" aria-label="Platform highlights">
        <div className="marketing-trust__inner">
          {MARKETING_TRUST_STATS.map((item) => (
            <div key={item.label} className="marketing-trust__item">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
