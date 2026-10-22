import { Link } from "react-router-dom";
import type { MarketingProduct } from "../../pages/marketing/marketingProducts";
import MarketingBrandedDevice from "./MarketingBrandedDevice";

type Props = {
  product: MarketingProduct;
  variant?: "tile" | "compact" | "spotlight";
};

export default function MarketingProductCard({ product, variant = "tile" }: Props) {
  const productId = product.id;
  return (
    <Link to={product.to} className={`marketing-product-card marketing-product-card--${variant}`}>
      <div className="marketing-product-card__photo">
        <MarketingBrandedDevice productId={productId} />
      </div>
      <div className="marketing-product-card__copy">
        <div className="marketing-product-card__name">{product.name}</div>
        <p className="marketing-product-card__tagline">{product.tagline}</p>
      </div>
    </Link>
  );
}
