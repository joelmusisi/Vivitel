import { brandLogoSrc, type BrandLogoVariant } from "../utils/brandLogo";

type ViviLogoProps = {
  variant?: Exclude<BrandLogoVariant, "raster">;
  className?: string;
  /** Horizontal alignment. Kept for callers; CSS object-position handles it on the img. */
  align?: "start" | "center";
};

export default function ViviLogo({
  variant = "default",
  className = "brand-logo",
  align = "start"
}: ViviLogoProps) {
  return (
    <img
      src={brandLogoSrc(variant)}
      alt="VIVI Telematics"
      className={className}
      style={{ objectPosition: align === "center" ? "center" : "left center" }}
    />
  );
}

export function ViviLogoImage({ variant = "default", className = "brand-logo" }: ViviLogoProps) {
  return <img src={brandLogoSrc(variant)} alt="VIVI Telematics" className={className} />;
}
