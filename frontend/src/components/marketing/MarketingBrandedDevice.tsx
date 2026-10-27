import { VIVI_BRAND } from "../../pages/marketing/marketingBrand";
import { getMarketingProduct } from "../../pages/marketing/marketingProducts";

type Props = {
  productId?: string;
  /** Use pitch-deck hardware panel (dashcam, tracker, branded sensor) */
  usePitchHardware?: boolean;
  className?: string;
  logoVariant?: "light" | "dark";
};

export default function MarketingBrandedDevice({
  productId,
  usePitchHardware = false,
  className = "",
  logoVariant = "dark"
}: Props) {
  const product = productId ? getMarketingProduct(productId) : undefined;
  const src = usePitchHardware ? VIVI_BRAND.hardwarePanelImage : product?.image;
  if (!src) return null;

  const logoSrc = logoVariant === "light" ? VIVI_BRAND.logoOnDark : VIVI_BRAND.logoOnLight;

  return (
    <div
      className={`marketing-branded-device${usePitchHardware ? " marketing-branded-device--pitch-hardware" : ""} ${className}`.trim()}
    >
      <img
        src={src}
        alt={product?.name ?? "VIVI Telematics hardware"}
        className="marketing-branded-device__product"
        loading="lazy"
      />
      {!usePitchHardware ? (
        <img src={logoSrc} alt="" className="marketing-branded-device__logo" aria-hidden />
      ) : null}
    </div>
  );
}
