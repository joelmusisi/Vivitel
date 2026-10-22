import { Link } from "react-router-dom";
import type { MarketingPromoCard } from "../../pages/marketing/marketingSiteStructure";
import { marketingImagePosition, marketingImageSize, marketingImageSrc } from "../../pages/marketing/marketingContent";
import { productImageForHero } from "../../pages/marketing/marketingProducts";

type Props = {
  card: MarketingPromoCard;
  variant?: "hero" | "grid";
};

export default function MarketingPromoTile({ card, variant = "grid" }: Props) {
  const crop = card.image;
  const productSrc =
    card.productImage ?? (card.productId ? productImageForHero(card.productId) : undefined);
  return (
    <Link to={card.to} className={`marketing-promo-tile marketing-promo-tile--${variant}`}>
      {productSrc ? (
        <div className="marketing-promo-tile__media marketing-promo-tile__media--product">
          <img src={productSrc} alt="" loading="lazy" />
        </div>
      ) : (
        <div
          className="marketing-promo-tile__media"
          style={{
            backgroundImage: `url(${marketingImageSrc(crop)})`,
            backgroundSize: marketingImageSize(crop),
            backgroundPosition: marketingImagePosition(crop)
          }}
          aria-hidden
        />
      )}
      <div className="marketing-promo-tile__copy">
        <div className="marketing-promo-tile__kicker">{card.kicker}</div>
        <h3>{card.title}</h3>
        <p>{card.subtitle}</p>
      </div>
    </Link>
  );
}
