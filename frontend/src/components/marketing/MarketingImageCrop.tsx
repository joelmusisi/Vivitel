import {
  marketingImagePosition,
  marketingImageSize,
  marketingImageSrc,
  type MarketingImageCrop,
} from "../../pages/marketing/marketingContent";

type MarketingImageCropProps = {
  crop: MarketingImageCrop;
  className?: string;
  alt?: string;
};

const MARKETING_PANEL_GRADIENTS = [
  "linear-gradient(135deg, #0f172a 0%, #1e3a5f 45%, #5fa828 100%)",
  "linear-gradient(135deg, #1e293b 0%, #2563eb 50%, #5fa828 100%)",
  "linear-gradient(135deg, #134e4a 0%, #0f766e 55%, #5fa828 100%)",
  "linear-gradient(135deg, #312e81 0%, #4338ca 50%, #5fa828 100%)"
];

function marketingPanelGradient(crop: MarketingImageCrop): string {
  const index = crop.row * crop.cols + crop.col;
  return MARKETING_PANEL_GRADIENTS[index % MARKETING_PANEL_GRADIENTS.length];
}

export function MarketingCropBackground({ crop, className }: MarketingImageCropProps) {
  const gradient = marketingPanelGradient(crop);
  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        backgroundImage: `${gradient}, url(${marketingImageSrc(crop)})`,
        backgroundSize: `cover, ${marketingImageSize(crop)}`,
        backgroundPosition: `center, ${marketingImagePosition(crop)}`,
        backgroundRepeat: "no-repeat",
      }}
      aria-hidden="true"
    />
  );
}

export default function MarketingImageCrop({ crop, className, alt = "" }: MarketingImageCropProps) {
  return (
    <div className={className} style={{ width: "100%", height: "100%" }} role="img" aria-label={alt || undefined}>
      <MarketingCropBackground crop={crop} />
    </div>
  );
}
