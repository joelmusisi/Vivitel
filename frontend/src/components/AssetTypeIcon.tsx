import type { ReactElement } from "react";

export type AssetIconKind =
  | "articulated" | "heavy" | "truck" | "lightTruck" | "pickup" | "van" | "bus" | "car" | "suv"
  | "motorcycle" | "trailer" | "tanker" | "reefer" | "tipper" | "flatbed" | "container" | "forklift"
  | "generator" | "construction" | "agri" | "marine" | "generic";

export function assetIconKind(assetType?: string): AssetIconKind {
  const t = String(assetType ?? "").toLowerCase();
  if (!t) return "generic";
  if (t.includes("articulated") && !t.includes("non")) return "articulated";
  if (t.includes("heavy")) return "heavy";
  if (t.includes("refrigerat")) return "reefer";
  if (t.includes("tanker")) return "tanker";
  if (t.includes("tipper")) return "tipper";
  if (t.includes("flatbed")) return "flatbed";
  if (t.includes("light truck") || t.includes("light delivery")) return "lightTruck";
  if (t.includes("truck")) return "truck";
  if (t.includes("pickup")) return "pickup";
  if (t.includes("van")) return "van";
  if (t.includes("bus") || t.includes("coach")) return "bus";
  if (t.includes("suv")) return "suv";
  if (t.includes("car")) return "car";
  if (t.includes("motor")) return "motorcycle";
  if (t.includes("trailer")) return "trailer";
  if (t.includes("container")) return "container";
  if (t.includes("fork")) return "forklift";
  if (t.includes("generator")) return "generator";
  if (t.includes("construction")) return "construction";
  if (t.includes("agri")) return "agri";
  if (t.includes("marine") || t.includes("vessel") || t.includes("boat")) return "marine";
  return "generic";
}

const WHEEL = (cx: number, cy = 36) => (
  <g key={cx}>
    <circle cx={cx} cy={cy} r="4.6" fill="#1f2937" />
    <circle cx={cx} cy={cy} r="1.8" fill="#cbd5e1" />
  </g>
);

const GLASS = "#bfdbfe";

const ART: Record<AssetIconKind, () => ReactElement> = {
  articulated: () => (
    <>
      <rect x="2" y="10" width="34" height="20" rx="2" fill="#2563eb" />
      <rect x="36" y="16" width="14" height="14" rx="2" fill="#1d4ed8" />
      <rect x="40" y="18" width="8" height="6" rx="1" fill={GLASS} />
      <rect x="2" y="30" width="48" height="3" fill="#334155" />
      {[8, 16, 30, 44].map((x) => WHEEL(x))}
    </>
  ),
  heavy: () => (
    <>
      <rect x="3" y="12" width="32" height="18" rx="2" fill="#0ea5e9" />
      <path d="M35 18h9l5 7v5H35z" fill="#0284c7" />
      <path d="M38 20h5l3 4h-8z" fill={GLASS} />
      <rect x="3" y="30" width="46" height="3" fill="#334155" />
      {[10, 22, 42].map((x) => WHEEL(x))}
    </>
  ),
  truck: () => (
    <>
      <rect x="4" y="13" width="28" height="17" rx="2" fill="#f59e0b" />
      <path d="M32 18h9l6 7v5H32z" fill="#d97706" />
      <path d="M35 20h4l3 4h-7z" fill={GLASS} />
      <rect x="4" y="30" width="43" height="3" fill="#334155" />
      {[12, 40].map((x) => WHEEL(x))}
    </>
  ),
  lightTruck: () => (
    <>
      <rect x="5" y="15" width="25" height="15" rx="2" fill="#10b981" />
      <path d="M30 19h8l6 6v5H30z" fill="#059669" />
      <path d="M33 21h4l3 4h-7z" fill={GLASS} />
      <rect x="5" y="30" width="39" height="3" fill="#334155" />
      {[13, 37].map((x) => WHEEL(x))}
    </>
  ),
  pickup: () => (
    <>
      <path d="M4 30v-9h14v-6h10l6 7h10v8z" fill="#ef4444" />
      <path d="M21 17h6l4 5h-10z" fill={GLASS} />
      <rect x="4" y="21" width="14" height="2" fill="#b91c1c" />
      {[13, 38].map((x) => WHEEL(x))}
    </>
  ),
  van: () => (
    <>
      <path d="M4 30V15a3 3 0 0 1 3-3h24l11 10v8z" fill="#8b5cf6" />
      <path d="M33 15h4l6 7H33z" fill={GLASS} />
      <rect x="9" y="16" width="14" height="7" rx="1" fill="#a78bfa" />
      {[13, 36].map((x) => WHEEL(x))}
    </>
  ),
  bus: () => (
    <>
      <rect x="3" y="9" width="46" height="22" rx="4" fill="#f97316" />
      {[7, 17, 27, 37].map((x) => <rect key={x} x={x} y="13" width="7" height="7" rx="1" fill={GLASS} />)}
      <rect x="3" y="24" width="46" height="2" fill="#c2410c" />
      {[12, 40].map((x) => WHEEL(x))}
    </>
  ),
  car: () => (
    <>
      <path d="M3 30v-6l6-2 7-8h18l8 8 6 2v6z" fill="#3b82f6" />
      <path d="M18 16h7v6h-12zM27 16h7l5 6H27z" fill={GLASS} />
      {[14, 40].map((x) => WHEEL(x))}
    </>
  ),
  suv: () => (
    <>
      <path d="M3 30v-8l5-2 5-8h26l6 9 4 2v7z" fill="#14b8a6" />
      <path d="M15 15h10v6H11zM27 15h11l4 6H27z" fill={GLASS} />
      {[13, 40].map((x) => WHEEL(x))}
    </>
  ),
  motorcycle: () => (
    <>
      <circle cx="12" cy="31" r="7" fill="none" stroke="#1f2937" strokeWidth="3" />
      <circle cx="42" cy="31" r="7" fill="none" stroke="#1f2937" strokeWidth="3" />
      <path d="M12 31l10-12h10l10 12M22 19l-4-5h-5M32 19l4-7h6" stroke="#dc2626" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="20" y="17" width="14" height="5" rx="2" fill="#7f1d1d" />
    </>
  ),
  trailer: () => (
    <>
      <rect x="3" y="12" width="42" height="18" rx="2" fill="#64748b" />
      <rect x="3" y="12" width="42" height="4" fill="#475569" />
      <rect x="45" y="27" width="5" height="3" fill="#334155" />
      {[14, 26, 36].map((x) => WHEEL(x))}
    </>
  ),
  tanker: () => (
    <>
      <rect x="3" y="12" width="34" height="18" rx="9" fill="#94a3b8" />
      <rect x="15" y="9" width="8" height="4" rx="1" fill="#475569" />
      <path d="M37 18h7l6 7v5H37z" fill="#dc2626" />
      <path d="M40 20h3l3 4h-6z" fill={GLASS} />
      {[11, 28, 44].map((x) => WHEEL(x))}
    </>
  ),
  reefer: () => (
    <>
      <rect x="3" y="11" width="32" height="19" rx="2" fill="#e0f2fe" stroke="#0284c7" strokeWidth="1.5" />
      <path d="M19 15v11M14 17l10 7M24 17l-10 7" stroke="#0284c7" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M35 18h8l6 7v5H35z" fill="#0ea5e9" />
      <path d="M38 20h4l3 4h-7z" fill={GLASS} />
      {[11, 40].map((x) => WHEEL(x))}
    </>
  ),
  tipper: () => (
    <>
      <path d="M3 28l5-16h24l2 16z" fill="#eab308" />
      <path d="M34 18h8l6 7v5H34z" fill="#ca8a04" />
      <path d="M37 20h4l3 4h-7z" fill={GLASS} />
      <rect x="3" y="28" width="45" height="3" fill="#334155" />
      {[12, 40].map((x) => WHEEL(x))}
    </>
  ),
  flatbed: () => (
    <>
      <rect x="3" y="22" width="32" height="5" fill="#78716c" />
      <rect x="8" y="14" width="14" height="8" fill="#a16207" />
      <path d="M35 17h8l6 8v5H35z" fill="#16a34a" />
      <path d="M38 19h4l3 4h-7z" fill={GLASS} />
      {[11, 40].map((x) => WHEEL(x))}
    </>
  ),
  container: () => (
    <>
      <rect x="4" y="10" width="44" height="22" rx="1" fill="#0891b2" />
      {[10, 16, 22, 28, 34, 40].map((x) => <rect key={x} x={x} y="12" width="2" height="18" fill="#0e7490" />)}
    </>
  ),
  forklift: () => (
    <>
      <rect x="12" y="14" width="18" height="14" rx="2" fill="#f59e0b" />
      <path d="M14 14l3-6h8l2 6" fill="none" stroke="#475569" strokeWidth="2.4" />
      <rect x="35" y="6" width="3" height="28" fill="#475569" />
      <rect x="38" y="30" width="10" height="3" fill="#475569" />
      <circle cx="18" cy="33" r="4.5" fill="#1f2937" />
      <circle cx="30" cy="33" r="4.5" fill="#1f2937" />
    </>
  ),
  generator: () => (
    <>
      <rect x="5" y="12" width="42" height="21" rx="3" fill="#16a34a" />
      <rect x="10" y="17" width="16" height="11" rx="1" fill="#15803d" />
      <path d="M36 15l-5 9h5l-3 7 8-11h-5l3-5z" fill="#fde047" />
    </>
  ),
  construction: () => (
    <>
      <rect x="6" y="22" width="26" height="10" rx="5" fill="#334155" />
      <rect x="9" y="14" width="14" height="8" rx="1" fill="#f59e0b" />
      <path d="M22 18l14-9 8 8M44 17l-4 8h8z" stroke="#d97706" strokeWidth="3" fill="#f59e0b" strokeLinejoin="round" />
    </>
  ),
  agri: () => (
    <>
      <circle cx="14" cy="29" r="8" fill="#1f2937" />
      <circle cx="14" cy="29" r="3" fill="#cbd5e1" />
      <circle cx="40" cy="32" r="5" fill="#1f2937" />
      <circle cx="40" cy="32" r="2" fill="#cbd5e1" />
      <path d="M8 24V12h16l4 8h14v8H22z" fill="#22c55e" />
      <rect x="12" y="14" width="9" height="7" fill={GLASS} />
    </>
  ),
  marine: () => (
    <>
      <path d="M3 26h46l-7 9H10z" fill="#0369a1" />
      <rect x="18" y="14" width="16" height="12" rx="1" fill="#f8fafc" stroke="#94a3b8" />
      <rect x="22" y="9" width="8" height="5" fill="#ef4444" />
      <path d="M2 38q6-3 12 0t12 0 12 0 12 0" stroke="#38bdf8" strokeWidth="2" fill="none" />
    </>
  ),
  generic: () => (
    <>
      <rect x="4" y="12" width="30" height="18" rx="2" fill="#64748b" />
      <path d="M34 18h8l6 7v5H34z" fill="#475569" />
      {[12, 40].map((x) => WHEEL(x))}
    </>
  )
};

export function AssetTypeIcon({ assetType, size = 40, title }: { assetType?: string; size?: number; title?: string }) {
  const kind = assetIconKind(assetType);
  return (
    <svg
      viewBox="0 0 52 42"
      width={size * 1.24}
      height={size}
      role="img"
      aria-label={title || assetType || "Asset"}
      className={`asset-type-icon asset-type-icon--${kind}`}
    >
      {ART[kind]()}
    </svg>
  );
}
