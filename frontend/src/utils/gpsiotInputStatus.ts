/** Frontend helpers for GPS IoT GetClientAssetsStatus → Diagnostics Input status. */

export type GpsIotAssetInput = {
  name: string;
  status: string;
  value: string | number | boolean | null;
  kind: "digital" | "analogue" | "unknown";
};

export type GpsIotAssetInputStatus = {
  assetId: string;
  assetName: string;
  imei: string;
  registration: string;
  inputs: GpsIotAssetInput[];
  attributes: Record<string, unknown>;
};

export function formatGpsIotInputStatusLabel(input: GpsIotAssetInput): string {
  const status = String(input.status ?? "").trim();
  if (status) return status;
  if (input.value == null || input.value === "") return "—";
  return String(input.value);
}

export function sortGpsIotInputs(inputs: GpsIotAssetInput[]): GpsIotAssetInput[] {
  const rank = (name: string) => {
    const match = String(name).match(/(\d+)/);
    return match ? Number(match[1]) : 9999;
  };
  return [...inputs].sort((a, b) => {
    const kindOrder = (a.kind === "digital" ? 0 : a.kind === "analogue" ? 1 : 2)
      - (b.kind === "digital" ? 0 : b.kind === "analogue" ? 1 : 2);
    if (kindOrder !== 0) return kindOrder;
    const byIndex = rank(a.name) - rank(b.name);
    if (byIndex !== 0) return byIndex;
    return a.name.localeCompare(b.name);
  });
}
