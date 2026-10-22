import { resolveAssetDotStatus, type AssetDotStatus } from "../utils/assetStatus";
import { trailNotificationStatusColor } from "../utils/trailNotificationMarker";
import { AssetStatusDot } from "./AssetStatusDot";

type AssetStatusIndicatorProps = {
  asset: Record<string, unknown>;
  hasActiveNotification?: boolean;
  status?: AssetDotStatus;
};

function NotificationAlertTriangle({ status }: { status: AssetDotStatus }) {
  const color = trailNotificationStatusColor(status);
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      className="status-alert-triangle"
      aria-hidden="true"
    >
      <path d="M12 3 L21 20 H3 Z" fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
      <rect x="11" y="9" width="2" height="5" rx="0.6" fill={color} />
      <circle cx="12" cy="17" r="1.2" fill={color} />
    </svg>
  );
}

export function AssetStatusIndicator({ asset, hasActiveNotification = false, status }: AssetStatusIndicatorProps) {
  if (hasActiveNotification) {
    const resolvedStatus = status ?? resolveAssetDotStatus(asset);
    return (
      <span
        className={`status-alert-triangle-wrap status-${resolvedStatus} status-dot-tooltip`}
        data-tooltip="Event occurred"
        aria-label="Event occurred"
        role="img"
      >
        <NotificationAlertTriangle status={resolvedStatus} />
      </span>
    );
  }
  return <AssetStatusDot asset={asset} status={status} />;
}
