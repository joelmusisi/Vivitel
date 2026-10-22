import { Link } from "react-router-dom";
import { productImageForHero } from "../../pages/marketing/marketingProducts";

type Hero = {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  to: string;
  productId: string;
};

export default function MarketingProductHero({ hero }: { hero: Hero }) {
  const image = productImageForHero(hero.productId);
  return (
    <Link to={hero.to} className="marketing-product-hero">
      <div className="marketing-product-hero__photo">
        <img src={image} alt="" loading="lazy" />
      </div>
      <div className="marketing-product-hero__copy">
        <div className="marketing-product-hero__kicker">{hero.kicker}</div>
        <h3>{hero.title}</h3>
        <p>{hero.subtitle}</p>
      </div>
    </Link>
  );
}
