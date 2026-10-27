import { useCallback, useEffect, useState } from "react";
import { callCmsv6 } from "../utils/api";

type ControlAction = { id: string; label: string; indexed: "channel" | "disk" | null; destructive: boolean };

type SettingsResponse = {
  ok?: boolean;
  online?: boolean | null;
  statusRow?: Record<string, unknown> | null;
  info?: Record<string, unknown> | null;
  infoMessage?: string;
  actions?: ControlAction[];
  message?: string;
  error?: string;
};

const FALLBACK_ACTIONS: ControlAction[] = [
  { id: "restart", label: "Restart device", indexed: null, destructive: true },
  { id: "sleep", label: "Sleep", indexed: null, destructive: true },
  { id: "wake", label: "Wake", indexed: null, destructive: false },
  { id: "record-start", label: "Start recording", indexed: "channel", destructive: false },
  { id: "record-stop", label: "Stop recording", indexed: "channel", destructive: false },
  { id: "mirror", label: "Mirror channel", indexed: "channel", destructive: false },
  { id: "flip", label: "Flip channel", indexed: "channel", destructive: false },
  { id: "format-disk", label: "Format disk", indexed: "disk", destructive: true },
  { id: "clear-mileage", label: "Clear mileage", indexed: null, destructive: true },
  { id: "clear-alarm", label: "Clear alarm", indexed: null, destructive: false },
  { id: "factory-reset", label: "Restore factory settings", indexed: null, destructive: true }
];

const text = (value: unknown) => String(value ?? "").trim();

function flattenInfo(info: Record<string, unknown> | null | undefined) {
  const rows: Array<[string, string]> = [];
  const walk = (value: unknown, prefix: string, depth: number) => {
    if (!value || typeof value !== "object" || depth > 2) return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "result" || key === "cmsserver") continue;
      if (item && typeof item === "object") walk(item, `${prefix}${key}.`, depth + 1);
      else if (item !== null && item !== "") rows.push([`${prefix}${key}`, String(item)]);
    }
  };
  walk(info, "", 0);
  return rows.slice(0, 40);
}

export default function Cms808DeviceSettings({ deviceId, plate }: { deviceId: string; plate?: string }) {
  const device = text(deviceId);
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [interval, setIntervalSeconds] = useState("10");
  const [channel, setChannel] = useState("0");
  const [disk, setDisk] = useState("0");

  const load = useCallback(async () => {
    if (!device) {
      setStatus("Select a device with a serial / device id.");
      return;
    }
    setBusy(true);
    setStatus("Loading device settings…");
    try {
      const result = (await callCmsv6<SettingsResponse>(`/cmsv6/device-settings?devIdno=${encodeURIComponent(device)}`)) as SettingsResponse;
      setData(result);
      setStatus(
        result?.ok
          ? result.online === false
            ? "Device is offline. Commands will not reach it until it reconnects."
            : result.infoMessage
              ? `Device status loaded. Detailed device info: ${result.infoMessage}`
              : "Device settings loaded."
          : result?.error || result?.message || "Could not load device settings."
      );
    } catch (error: any) {
      setStatus(text(error?.message) || "Could not load device settings.");
    } finally {
      setBusy(false);
    }
  }, [device]);

  useEffect(() => {
    setData(null);
    setStatus("");
    if (device) void load();
  }, [device, load]);

  const send = async (body: Record<string, unknown>, label: string) => {
    if (!device) {
      setStatus("Select a device with a serial / device id.");
      return;
    }
    setBusy(true);
    setStatus(`${label}…`);
    try {
      const result: any = await callCmsv6("/cmsv6/device-control", {
        method: "POST",
        body: JSON.stringify({ devIdno: device, ...body })
      });
      setStatus(result?.ok ? `${label}: sent.` : `${label}: ${result?.message || result?.error || "failed."}`);
    } catch (error: any) {
      setStatus(`${label}: ${text(error?.message) || "failed."}`);
    } finally {
      setBusy(false);
    }
  };

  const runAction = (action: ControlAction) => {
    if (action.destructive && !window.confirm(`${action.label} on ${plate || device}? This cannot be undone.`)) return;
    void send(
      { action: action.id, confirm: action.destructive, channel: Number(channel), disk: Number(disk) },
      action.label
    );
  };

  const applyInterval = () => {
    const seconds = Number(interval);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
      setStatus("GPS report interval must be a whole number of seconds from 0 to 3600.");
      return;
    }
    void send({ action: "gps-interval", time: seconds }, "GPS report interval");
  };

  const row = data?.statusRow ?? null;
  const actions = data?.actions?.length ? data.actions : FALLBACK_ACTIONS;
  const infoRows = flattenInfo(data?.info);

  return (
    <div className="cms808-device-settings">
      <div className="cms808-actions">
        <strong>{plate || device || "No device selected"}</strong>
        <span>{data?.online === true ? "Online" : data?.online === false ? "Offline" : "Status unknown"}</span>
        <button type="button" className="remote-access-action" disabled={busy} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {row ? (
        <p>
          Last fix {text(row.gt) || "n/a"} · {text(row.mlat)},{text(row.mlng)} · speed {Number(row.sp ?? 0) / 10} km/h
        </p>
      ) : null}

      <h4>GPS reporting</h4>
      <div className="cms808-actions">
        <label>
          Interval (seconds, 0–3600)
          <input type="number" min={0} max={3600} value={interval} onChange={(event) => setIntervalSeconds(event.target.value)} />
        </label>
        <button type="button" className="remote-access-action primary" disabled={busy} onClick={applyInterval}>
          Apply
        </button>
      </div>

      <h4>Device control</h4>
      <div className="cms808-actions">
        <label>
          Channel
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            {[0, 1, 2, 3].map((index) => (
              <option key={index} value={index}>{`CH${index + 1}`}</option>
            ))}
          </select>
        </label>
        <label>
          Disk
          <select value={disk} onChange={(event) => setDisk(event.target.value)}>
            <option value="0">Disk 1</option>
            <option value="1">Disk 2</option>
          </select>
        </label>
      </div>
      <div className="cms808-actions">
        {actions.map((action) => (
          <button key={action.id} type="button" className="remote-access-action" disabled={busy} onClick={() => runAction(action)}>
            {action.label}
          </button>
        ))}
      </div>

      {infoRows.length ? (
        <>
          <h4>Device information</h4>
          <table className="cms808-info-table">
            <tbody>
              {infoRows.map(([key, value]) => (
                <tr key={key}>
                  <th>{key}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <div className="cms808-note">
        <strong>APN and roaming:</strong> the 808 platform has no remote call for these, so they cannot be set from here. Set them once on the MR700 locally:
        join the device Wi-Fi, open 192.168.100.1, sign in as admin, then Network → 3G/4G Settings. Enable 4G, set Network mode to Hybrid (this lets the SIM pick the roaming network),
        and enter the APN, user and password from the SIM operator. Roaming itself must also be enabled on the SIM by the operator.
      </div>
      <p className="cms808-note">
        Recording, network, alarm, AI and other MR700 parameters are only editable locally (device Wi-Fi, 192.168.100.1). The 808 platform exposes the actions above for remote use.
      </p>
      {status ? <div className={`cms808-status ${busy ? "busy" : ""}`}>{status}</div> : null}
    </div>
  );
}
