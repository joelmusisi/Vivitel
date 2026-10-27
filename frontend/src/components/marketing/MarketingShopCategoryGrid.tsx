import { Link } from "react-router-dom";
import { MARKETING_SHOP_CATEGORY_TILES } from "../../pages/marketing/marketingGarminExperience";

export default function MarketingShopCategoryGrid() {
  return (
    <section className="marketing-shop-categories" aria-labelledby="shop-by-category-heading">
      <h2 id="shop-by-category-heading" className="marketing-shop-categories__heading">
        Explore by area
      </h2>
      <div className="marketing-shop-categories__grid">
        {MARKETING_SHOP_CATEGORY_TILES.map((tile) => (
          <Link key={tile.slug} to={tile.to} className="marketing-shop-categories__tile">
            <img src={tile.image} alt="" loading="lazy" />
            <div className="marketing-shop-categories__shade" />
            <div className="marketing-shop-categories__label">
              <span>{tile.label}</span>
              <span className="marketing-shop-categories__shop">View</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
