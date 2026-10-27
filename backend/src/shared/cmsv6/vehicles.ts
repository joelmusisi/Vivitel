export type Cmsv6VehicleDevice = {
  vehiIdno: string;
  vehicleId: string;
  company: string;
  companyId: string;
  devIdno: string;
  deviceId: string;
  channels: number;
  channelNames: string[];
  installedAt?: string;
  gbCode?: string;
};

const textOf = (value: unknown) => String(value ?? "").trim();

const channelNamesOf = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => textOf(item)).filter(Boolean);
  return textOf(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

function flattenOne(vehicle: Record<string, unknown>, device?: Record<string, unknown>): Cmsv6VehicleDevice {
  const source = device || {};
  const names = channelNamesOf(source.cn ?? source.chnName ?? vehicle.cn ?? vehicle.chnName);
  const channels = Number(source.cc ?? source.chnCount ?? names.length ?? 0);
  return {
    vehiIdno: textOf(vehicle.nm ?? vehicle.vehiIdno ?? vehicle.vid ?? vehicle.id ?? source.vehiIdno),
    vehicleId: textOf(vehicle.id ?? vehicle.vid ?? source.vehicleId),
    company: textOf(vehicle.pnm ?? vehicle.company ?? source.pnm),
    companyId: textOf(vehicle.pid ?? vehicle.parentId ?? source.pid),
    devIdno: textOf(source.id ?? source.did ?? source.idno ?? source.devIdno ?? vehicle.did ?? vehicle.devIdno),
    deviceId: textOf(source.did ?? source.id ?? source.deviceId),
    channels: Number.isFinite(channels) && channels > 0 ? Math.floor(channels) : names.length,
    channelNames: names,
    installedAt: textOf(source.ist ?? source.installedAt) || undefined,
    gbCode: textOf(source.gbCode ?? source.gbcode) || undefined
  };
}

export function flattenCmsv6Vehicles(data: unknown): Cmsv6VehicleDevice[] {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const incoming = Array.isArray(root.vehicles)
    ? root.vehicles
    : Array.isArray(root.infos)
      ? root.infos
      : Array.isArray(data)
        ? data
        : [];
  const out: Cmsv6VehicleDevice[] = [];
  for (const row of incoming) {
    if (!row || typeof row !== "object") continue;
    const vehicle = row as Record<string, unknown>;
    if (textOf(vehicle.devIdno) && !Array.isArray(vehicle.dl) && !Array.isArray(vehicle.devices)) {
      const item = flattenOne(vehicle, vehicle);
      if (item.devIdno || item.vehiIdno) out.push(item);
      continue;
    }
    const devices = Array.isArray(vehicle.dl)
      ? vehicle.dl
      : Array.isArray(vehicle.devices)
        ? vehicle.devices
        : [];
    if (!devices.length) {
      const item = flattenOne(vehicle);
      if (item.devIdno || item.vehiIdno) out.push(item);
      continue;
    }
    for (const device of devices) {
      if (!device || typeof device !== "object") continue;
      const item = flattenOne(vehicle, device as Record<string, unknown>);
      if (item.devIdno || item.vehiIdno) out.push(item);
    }
  }
  const seen = new Set<string>();
  return out.filter((item) => {
    const key = `${item.devIdno}::${item.vehiIdno}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
