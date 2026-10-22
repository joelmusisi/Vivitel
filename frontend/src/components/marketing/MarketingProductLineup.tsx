import { Link } from "react-router-dom";
import MarketingBrandedDevice from "./MarketingBrandedDevice";
import { MARKETING_PRODUCT_LINEUPS } from "../../pages/marketing/marketingGarminExperience";

export default function MarketingProductLineup() {
  return (
    <section className="marketing-lineup" aria-label="Product lineups">
      <div className="marketing-lineup__grid">
        {MARKETING_PRODUCT_LINEUPS.map((card) => (
          <Link key={card.id} to={card.to} className="marketing-lineup-card">
            <div className="marketing-lineup-card__lifestyle">
              <img src={card.lifestyle} alt="" loading="lazy" />
            </div>
            <div className="marketing-lineup-card__products">
              {card.productIds.map((id) => (
                <MarketingBrandedDevice
                  key={id}
                  productId={id}
                  usePitchHardware={id === "dashcam-ai"}
                />
              ))}
            </div>
            <div className="marketing-lineup-card__footer">
              <div>
                <h3>{card.title}</h3>
                <p>{card.subtitle}</p>
              </div>
              <span className="marketing-lineup-card__shop">View</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
