import { assetDotStatusLabel, resolveAssetDotStatus, shouldShowAssetStatusDot, type AssetDotStatus } from "../utils/assetStatus";

type AssetStatusDotProps = {
  asset: Record<string, unknown>;
  status?: AssetDotStatus;
};

export function AssetStatusDot({ asset, status }: AssetStatusDotProps) {
  if (!shouldShowAssetStatusDot(asset)) return null;
  const resolvedStatus = status ?? resolveAssetDotStatus(asset);
  const label = assetDotStatusLabel(resolvedStatus);
  return (
    <span
      className={`status-dot status-${resolvedStatus} status-dot-tooltip`}
      data-tooltip={label}
      aria-label={label}
      role="img"
    />
  );
}
