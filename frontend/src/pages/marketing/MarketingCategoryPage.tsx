import { Link, Navigate, useParams } from "react-router-dom";
import MarketingProductCard from "../../components/marketing/MarketingProductCard";
import MarketingPromoTile from "../../components/marketing/MarketingPromoTile";
import { getShopCategoryImage } from "./marketingGarminExperience";
import { getMarketingProduct, getProductsForCategory } from "./marketingProducts";
import { getMarketingCategory } from "./marketingSiteStructure";
import MarketingBrandedDevice from "../../components/marketing/MarketingBrandedDevice";

export default function MarketingCategoryPage() {
  const { categorySlug = "" } = useParams();
  const category = getMarketingCategory(categorySlug);

  if (!category) return <Navigate to="/" replace />;

  const categoryImage = getShopCategoryImage(category.slug);
  const categoryProducts = getProductsForCategory(category.slug);
  const spotlight = category.spotlightProductId
    ? getMarketingProduct(category.spotlightProductId)
    : undefined;

  return (
    <>
      <section
        className={`marketing-catalog-hero${categoryImage ? " marketing-catalog-hero--photo" : ""}`}
        style={categoryImage ? { backgroundImage: `url(${categoryImage})` } : undefined}
      >
        {categoryImage ? <div className="marketing-catalog-hero__overlay" aria-hidden /> : null}
        <div className="marketing-catalog-hero__inner">
          <div className="marketing-kicker">VIVI Telematics · {category.navLabel}</div>
          <h1 className="marketing-title">{category.headline}</h1>
          <p className="marketing-subtitle">{category.description}</p>
          {spotlight ? (
            <div className="marketing-catalog-hero__device">
              <MarketingBrandedDevice productId={spotlight.id} logoVariant="light" />
            </div>
          ) : null}
        </div>
      </section>

      {categoryProducts.length > 0 ? (
        <section className="marketing-section">
          <div className="marketing-section__head">
            <h2>Shop {category.navLabel}</h2>
            <p>Product photography and specifications — in the page, not the navigation menu.</p>
          </div>
          <div className="marketing-product-grid">
            {categoryProducts.map((product) => (
              <MarketingProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="marketing-section">
        <div className="marketing-promo-grid marketing-promo-grid--category">
          {category.promos.map((card) => (
            <MarketingPromoTile key={card.id} card={card} variant="hero" />
          ))}
        </div>
      </section>

      {spotlight ? (
        <section className="marketing-section marketing-category-spotlight">
          <Link to={spotlight.to} className="marketing-category-spotlight__inner">
            <MarketingBrandedDevice productId={spotlight.id} />
            <div>
              <h2>{spotlight.name}</h2>
              <p>{spotlight.tagline}</p>
            </div>
          </Link>
        </section>
      ) : null}

      <section className="marketing-section marketing-catalog-columns">
        <div className="marketing-catalog-col">
          <h2>Products</h2>
          {category.products.map((link) => (
            <p key={link.to}>
              <Link to={link.to}>{link.label}</Link>
            </p>
          ))}
        </div>
        <div className="marketing-catalog-col">
          <h2>Maps & zones</h2>
          {category.maps.map((link) => (
            <p key={link.to}>
              <Link to={link.to}>{link.label}</Link>
            </p>
          ))}
        </div>
        <div className="marketing-catalog-col">
          <h2>Hardware & apps</h2>
          {category.accessories.map((link) => (
            <p key={link.to}>
              <Link to={link.to}>{link.label}</Link>
            </p>
          ))}
        </div>
        <div className="marketing-catalog-col">
          <h2>Discover</h2>
          {category.discover.map((link) => (
            <p key={link.to}>
              <Link to={link.to}>{link.label}</Link>
            </p>
          ))}
        </div>
      </section>
    </>
  );
}
