import { useEffect, useMemo, useState } from "react";
import { getTraccarLive, type TraccarLiveRow } from "../utils/api";
import { TELTONIKA_AVL_IO } from "../utils/teltonikaProtocol";
import { TELTONIKA_ANALOG_INPUT_MAX } from "../data/teltonikaAnalogInputs";

type IoAsset = {
  registration?: string;
  assetDescription?: string;
  imei?: string;
  traccarDeviceId?: number | string;
};

type IoRow = {
  key: string;
  name: string;
  avlId: string;
  kind: "Analogue" | "Power" | "Digital / other";
  value: string;
  mv: string;
};

const REFRESH_MS = 5000;
const blank = "—";

const KNOWN_NAMES: Record<number, string> = {
  [TELTONIKA_AVL_IO.DIGITAL_INPUT_1]: "Digital Input 1",
  [TELTONIKA_AVL_IO.DIGITAL_INPUT_2]: "Digital Input 2",
  [TELTONIKA_AVL_IO.DIGITAL_INPUT_3]: "Digital Input 3",
  [TELTONIKA_AVL_IO.ANALOG_INPUT_1]: "Analogue Input 1 (AI1)",
  [TELTONIKA_AVL_IO.ANALOG_INPUT_2]: "Analogue Input 2 (AI2)",
  [TELTONIKA_AVL_IO.GSM_SIGNAL]: "GSM Signal",
  [TELTONIKA_AVL_IO.EXTERNAL_VOLTAGE]: "External Voltage",
  [TELTONIKA_AVL_IO.BATTERY_VOLTAGE]: "Battery Voltage",
  [TELTONIKA_AVL_IO.IGNITION]: "Ignition",
  [TELTONIKA_AVL_IO.MOVEMENT]: "Movement",
  [TELTONIKA_AVL_IO.LLS_1_FUEL_LEVEL]: "LLS 1 Fuel Level",
  [TELTONIKA_AVL_IO.LLS_1_TEMPERATURE]: "LLS 1 Temperature",
  [TELTONIKA_AVL_IO.LLS_2_FUEL_LEVEL]: "LLS 2 Fuel Level",
  [TELTONIKA_AVL_IO.LLS_2_TEMPERATURE]: "LLS 2 Temperature"
};

const scalar = (value: unknown): string | null => {
  if (value == null || typeof value === "object") return null;
  const text = String(value).trim();
  return text ? text : null;
};

const ioChannel = (key: string): number | null => {
  const match = key.match(/^io_?(\d+)$/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
};

const isAnalogueChannel = (id: number) =>
  id === TELTONIKA_AVL_IO.ANALOG_INPUT_1 ||
  id === TELTONIKA_AVL_IO.ANALOG_INPUT_2 ||
  (id >= 1 && id <= TELTONIKA_ANALOG_INPUT_MAX && id > 3);

export const buildIoRows = (attributes: Record<string, unknown> | null | undefined): IoRow[] => {
  const attrs: Record<string, unknown> = { ...(attributes ?? {}) };
  const nested = attrs.io;
  if (nested && typeof nested === "object") {
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      const id = /^\d+$/.test(key) ? `io${key}` : key;
      if (!(id in attrs)) attrs[id] = value;
    }
  }

  const byId = new Map<number, IoRow>();
  const put = (id: number, value: string | null) => {
    const analogue = isAnalogueChannel(id);
    const power = id === TELTONIKA_AVL_IO.EXTERNAL_VOLTAGE || id === TELTONIKA_AVL_IO.BATTERY_VOLTAGE;
    const numeric = value != null && Number.isFinite(Number(value)) ? Number(value) : null;
    byId.set(id, {
      key: `io${id}`,
      name: KNOWN_NAMES[id] ?? `IO${id}`,
      avlId: String(id),
      kind: analogue ? "Analogue" : power ? "Power" : "Digital / other",
      value: value ?? blank,
      mv: (analogue || power) && numeric != null ? String(Math.round(numeric)) : blank
    });
  };

  for (const [key, raw] of Object.entries(attrs)) {
    const id = ioChannel(key);
    if (id == null) continue;
    const text = scalar(raw);
    if (text == null) continue;
    if (!byId.has(id) || byId.get(id)?.value === blank) put(id, text);
  }

  // Traccar promotes AVL 9 / 6 to adc1 / adc2 as well.
  const adc: Array<[string, number]> = [
    ["adc1", TELTONIKA_AVL_IO.ANALOG_INPUT_1],
    ["adc2", TELTONIKA_AVL_IO.ANALOG_INPUT_2]
  ];
  for (const [key, id] of adc) {
    const text = scalar(attrs[key]);
    if (text != null && !byId.has(id)) put(id, text);
  }

  // Power attributes are promoted in volts with a matching *Mv value.
  const power: Array<[string, number]> = [
    ["powerMv", TELTONIKA_AVL_IO.EXTERNAL_VOLTAGE],
    ["batteryMv", TELTONIKA_AVL_IO.BATTERY_VOLTAGE]
  ];
  for (const [key, id] of power) {
    const text = scalar(attrs[key]);
    if (text != null && !byId.has(id)) put(id, text);
  }

  // The two physical analogue inputs are always listed, even before the first packet carries them.
  for (const id of [TELTONIKA_AVL_IO.ANALOG_INPUT_1, TELTONIKA_AVL_IO.ANALOG_INPUT_2]) {
    if (!byId.has(id)) put(id, null);
  }

  const rank = (row: IoRow) => (row.kind === "Analogue" ? 0 : row.kind === "Power" ? 1 : 2);
  return [...byId.values()].sort((a, b) => rank(a) - rank(b) || Number(a.avlId) - Number(b.avlId));
};

const matchRow = (rows: TraccarLiveRow[], asset: IoAsset): TraccarLiveRow | null => {
  const imei = String(asset.imei ?? "").trim();
  const deviceId = String(asset.traccarDeviceId ?? "").trim();
  return (
    rows.find((row) => imei && String(row.imei ?? "").trim() === imei) ??
    rows.find((row) => deviceId && String(row.deviceId ?? "") === deviceId) ??
    null
  );
};

export default function AssetIoListModal({ asset, onClose }: { asset: IoAsset; onClose: () => void }) {
  const [live, setLive] = useState<TraccarLiveRow | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await getTraccarLive();
        if (cancelled) return;
        setLive(matchRow(rows, asset));
        setUpdatedAt(Date.now());
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [asset.imei, asset.traccarDeviceId]);

  const rows = useMemo(() => buildIoRows(live?.position?.attributes), [live]);
  const packetTime = live?.position?.deviceTime || live?.position?.fixTime || live?.lastUpdate || "";
  const title = asset.registration || asset.assetDescription || asset.imei || "Asset";

  return (
    <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="IOs List">
      <div className="assets-add-card diagnostics-modal-card">
        <div className="assets-add-header">
          <div className="assets-add-title">IOs List — {title}</div>
          <div className="assets-add-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="assets-add-body diagnostics-modal-body">
          <div className="diagnostics-row">
            <span>Device</span>
            <span>{asset.imei || blank}</span>
          </div>
          <div className="diagnostics-row">
            <span>Last packet</span>
            <span>{packetTime ? new Date(packetTime).toLocaleString() : blank}</span>
          </div>
          <div className="diagnostics-row">
            <span>Refreshed</span>
            <span>{updatedAt ? `${new Date(updatedAt).toLocaleTimeString()} (every ${REFRESH_MS / 1000}s)` : blank}</span>
          </div>
          {status === "loading" && <div className="diagnostics-row"><span>Loading live IO data…</span></div>}
          {status === "error" && <div className="diagnostics-row"><span>Unable to load live IO data.</span></div>}
          {status === "ready" && !live && (
            <div className="diagnostics-row"><span>No live data found for this asset yet.</span></div>
          )}
          <div style={{ overflow: "auto", maxHeight: "60vh" }}>
            <table className="fuel-analysis-table">
              <thead>
                <tr>
                  <th>IO</th>
                  <th>AVL ID</th>
                  <th>Type</th>
                  <th>Raw value</th>
                  <th>Voltage (mV)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.name}</td>
                    <td>{row.avlId}</td>
                    <td>{row.kind}</td>
                    <td>{row.value}</td>
                    <td>{row.mv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
