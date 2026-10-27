import ViviLogo from "../ViviLogo";
import { VIVI_BRAND } from "../../pages/marketing/marketingBrand";

type Props = {
  variant?: "dark" | "light";
  showSlogan?: boolean;
  showTagline?: boolean;
  className?: string;
};

/** Official logo lockup — green location-pin tittle on the last I */
export default function MarketingBrandLockup({
  variant = "dark",
  showSlogan = true,
  showTagline = false,
  className = ""
}: Props) {
  const logoVariant = variant === "light" ? "light" : "default";

  return (
    <div className={`marketing-brand-lockup marketing-brand-lockup--${variant} ${className}`.trim()}>
      <ViviLogo variant={logoVariant} className="marketing-brand-lockup__logo brand-logo" align="start" />
      {showSlogan ? <p className="marketing-brand-lockup__slogan">{VIVI_BRAND.slogan}</p> : null}
      {showTagline ? (
        <p className="marketing-brand-lockup__tagline">
          Drive <span>smarter</span>. Operate <span>safer</span>. Grow <span>faster</span>.
        </p>
      ) : null}
    </div>
  );
}
