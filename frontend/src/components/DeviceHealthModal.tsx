import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEVICE_HEALTH_COLUMNS,
  DEVICE_HEALTH_REFRESH_MS,
  mergeDeviceHealthRows,
  summarizeDeviceHealth,
  type DeviceHealthResponse,
  type DeviceHealthRow
} from "../utils/deviceHealth";
import { loadDeviceHealth } from "../utils/deviceHealthApi";
import "./DeviceHealthModal.css";

type Props = {
  assetLabel: string;
  deviceId?: number | string;
  imei?: string;
  onClose: () => void;
};

const formatTime = (value: string | undefined) => {
  const ms = Date.parse(String(value ?? ""));
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" });
};

const formatAge = (ms: number | null) => {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
};

/**
 * Live raw telemetry for one device, refreshed every 30 s from the backend's push feed
 * (Traccar socket / forwarding), not from per-call Traccar API reports.
 */
export default function DeviceHealthModal({ assetLabel, deviceId, imei, onClose }: Props) {
  const [rows, setRows] = useState<DeviceHealthRow[]>([]);
  const [meta, setMeta] = useState<Pick<DeviceHealthResponse, "device" | "feed" | "via"> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [nextRefreshAt, setNextRefreshAt] = useState(Date.now() + DEVICE_HEALTH_REFRESH_MS);
  const [now, setNow] = useState(Date.now());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await loadDeviceHealth({ deviceId, imei });
      if (result.ok === false) {
        setStatus("error");
        setError(String(result.error ?? "").trim() || "Live telemetry could not be loaded. Try Refresh now.");
        return;
      }
      setMeta({ device: result.device, feed: result.feed, via: result.via });
      setRows((current) => mergeDeviceHealthRows(current, result.history ?? []));
      setStatus("ready");
      setError("");
    } finally {
      inFlight.current = false;
      setNextRefreshAt(Date.now() + DEVICE_HEALTH_REFRESH_MS);
    }
  }, [deviceId, imei]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load();
    }, DEVICE_HEALTH_REFRESH_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const summary = useMemo(() => summarizeDeviceHealth(rows, meta, now), [rows, meta, now]);
  const secondsToRefresh = Math.max(0, Math.ceil((nextRefreshAt - now) / 1000));

  return (
    <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Device Health">
      <div className="assets-add-card device-health-card">
        <div className="assets-add-header">
          <div className="assets-add-title">Device Health · {assetLabel}</div>
          <div className="assets-add-actions">
            <span className="device-health-refresh">
              {status === "loading" && !rows.length ? "Loading…" : `Next refresh in ${secondsToRefresh}s`}
            </span>
            <button type="button" className="btn ghost" onClick={() => void load()}>
              Refresh now
            </button>
            <button type="button" className="btn ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="assets-add-body device-health-body">
          {error && <div className="device-health-error">⚠ {error}</div>}

          <div className="device-health-summary">
            {summary.cards.map((card) => (
              <div className={`device-health-stat device-health-${card.tone}`} key={card.label}>
                <span className="device-health-stat-label">{card.label}</span>
                <strong>{card.value}</strong>
                {card.hint && <span className="device-health-stat-hint">{card.hint}</span>}
              </div>
            ))}
          </div>

          <div className="device-health-feed">
            Feed: {summary.feedLabel} · Last report {formatAge(summary.lastReportAgeMs)}
          </div>

          {rows.length === 0 && status !== "error" ? (
            <div className="device-health-empty">
              {status === "loading"
                ? "Waiting for telemetry…"
                : "No reports from this device in the last 30 minutes. New reports appear here as they arrive."}
            </div>
          ) : (
            <div className="device-health-table-wrap">
              <table className="device-health-table">
                <thead>
                  <tr>
                    {DEVICE_HEALTH_COLUMNS.map((column) => (
                      <th key={column.key} title={column.help}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Fragment key={row.key}>
                      <tr
                        className={expandedRow === row.key ? "is-expanded" : ""}
                        onClick={() => setExpandedRow((current) => (current === row.key ? null : row.key))}
                        title="Show all attributes"
                      >
                        {DEVICE_HEALTH_COLUMNS.map((column) => (
                          <td key={column.key} className={column.numeric ? "is-num" : ""}>
                            {column.key === "fixTime" || column.key === "serverTime"
                              ? formatTime(row[column.key] as string | undefined)
                              : column.format(row)}
                          </td>
                        ))}
                      </tr>
                      {expandedRow === row.key && (
                        <tr className="device-health-raw">
                          <td colSpan={DEVICE_HEALTH_COLUMNS.length}>
                            <pre>{JSON.stringify(row.attributes ?? {}, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
