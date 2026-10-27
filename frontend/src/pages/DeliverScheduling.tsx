import { useCallback, useEffect, useState } from "react";
import SortableColumnHeader from "../components/SortableColumnHeader";
import { useColumnSort } from "../hooks/useColumnSort";
import ScheduleDateTimePicker from "../components/ScheduleDateTimePicker";
import { buildApiUrl, getApiKey, getTenantId } from "../utils/api";
import "react-datepicker/dist/react-datepicker.css";
import "../index.css";

type Schedule = {
  id: string;
  clientName: string;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledAt: string;
  status: string;
  updatedAt?: string;
};

async function apiSchedules(path: string, init: RequestInit) {
  const apiKey = getApiKey();
  const tenantId = getTenantId();
  if (!apiKey) throw new Error("Not logged in");
  if (!tenantId) throw new Error("Select organisation first");
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "x-tenant-id": tenantId,
      ...(init.headers ?? {})
    }
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = (body && (body.error || body.message)) || text || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return body;
}

const toDateTimeLocalValue = (value: Date): string => {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

const formatScheduledLabel = (value: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function DeliverScheduling() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const [draft, setDraft] = useState<Omit<Schedule, "id"> & { id?: string }>({
    clientName: "",
    pickupAddress: "",
    dropoffAddress: "",
    scheduledAt: "",
    status: "scheduled"
  });
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [schedulePickerDate, setSchedulePickerDate] = useState(() => new Date());
  const [schedulePickerTime, setSchedulePickerTime] = useState("00:00");
  const [schedulePickerMode, setSchedulePickerMode] = useState<"date" | "time">("date");

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = await apiSchedules("/deliver/schedules", { method: "GET" });
      setSchedules(Array.isArray(body?.schedules) ? (body.schedules as Schedule[]) : []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getScheduleSortValue = useCallback((row: Schedule, key: string) => {
    if (key === "client") return row.clientName;
    if (key === "pickup") return row.pickupAddress;
    if (key === "dropoff") return row.dropoffAddress;
    if (key === "scheduled") return row.scheduledAt;
    if (key === "status") return row.status;
    return "";
  }, []);
  const scheduleSort = useColumnSort({ rows: schedules, getValue: getScheduleSortValue });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiSchedules("/deliver/schedules", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setDraft({ clientName: "", pickupAddress: "", dropoffAddress: "", scheduledAt: "", status: "scheduled" });
      await refresh();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const openSchedulePicker = () => {
    const parsed = new Date(draft.scheduledAt || new Date().toISOString());
    const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    setSchedulePickerDate(safeDate);
    setSchedulePickerTime(`${safeDate.getHours().toString().padStart(2, "0")}:${safeDate.getMinutes().toString().padStart(2, "0")}`);
    setSchedulePickerMode("date");
    setShowSchedulePicker(true);
  };

  const applySchedulePicker = () => {
    const [hours, minutes] = schedulePickerTime.split(":").map((value) => Number(value));
    const next = new Date(schedulePickerDate);
    next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    setDraft((current) => ({ ...current, scheduledAt: toDateTimeLocalValue(next) }));
    setShowSchedulePicker(false);
  };

  const del = async (id: string) => {
    const ok = window.confirm("Delete this scheduled delivery?");
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await apiSchedules(`/deliver/schedules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="overview-header">
        <div>
          <div className="overview-title">Scheduling</div>
          <div className="overview-subtitle">Schedule deliveries by client, route and time.</div>
        </div>
      </div>

      {error && <div className="admin-empty">{error}</div>}

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <div className="admin-panel-title">Create scheduled delivery</div>
            <div className="admin-panel-sub">Saves per organisation (tenant).</div>
          </div>
          <div className="admin-actions">
            <button type="button" className="admin-btn ghost" onClick={() => void refresh()} disabled={busy}>
              Refresh
            </button>
          </div>
        </div>

        <div className="admin-modal-body" style={{ padding: 0 }}>
          <ScheduleDateTimePicker
            open={showSchedulePicker}
            date={schedulePickerDate}
            time={schedulePickerTime}
            mode={schedulePickerMode}
            onClose={() => setShowSchedulePicker(false)}
            onConfirm={applySchedulePicker}
            onDateChange={setSchedulePickerDate}
            onTimeChange={setSchedulePickerTime}
            onModeChange={setSchedulePickerMode}
          />
          <label className="admin-modal-field">
            Client name
            <input value={draft.clientName} onChange={(e) => setDraft((c) => ({ ...c, clientName: e.target.value }))} />
          </label>
          <label className="admin-modal-field">
            Pickup address
            <input value={draft.pickupAddress} onChange={(e) => setDraft((c) => ({ ...c, pickupAddress: e.target.value }))} />
          </label>
          <label className="admin-modal-field">
            Dropoff address
            <input value={draft.dropoffAddress} onChange={(e) => setDraft((c) => ({ ...c, dropoffAddress: e.target.value }))} />
          </label>
          <label className="admin-modal-field">
            Scheduled time
            <button type="button" className="admin-date-button" onClick={openSchedulePicker}>
              {draft.scheduledAt ? formatScheduledLabel(draft.scheduledAt) : "Select scheduled time"}
            </button>
          </label>
          <label className="admin-modal-field">
            Status
            <select value={draft.status} onChange={(e) => setDraft((c) => ({ ...c, status: e.target.value }))}>
              <option value="scheduled">scheduled</option>
              <option value="dispatched">dispatched</option>
              <option value="cancelled">cancelled</option>
              <option value="completed">completed</option>
            </select>
          </label>

          <div className="admin-modal-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="admin-btn" onClick={() => void save()} disabled={busy}>
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <div>
            <div className="admin-panel-title">Scheduled deliveries</div>
            <div className="admin-panel-sub">{busy ? "Working…" : ""}</div>
          </div>
        </div>

        <div className="admin-table">
          <div className="admin-row admin-row-head">
            <SortableColumnHeader as="span" label="Client" {...scheduleSort.getHeaderProps("client")} />
            <SortableColumnHeader as="span" label="Pickup" {...scheduleSort.getHeaderProps("pickup")} />
            <SortableColumnHeader as="span" label="Dropoff" {...scheduleSort.getHeaderProps("dropoff")} />
            <SortableColumnHeader as="span" label="Scheduled" {...scheduleSort.getHeaderProps("scheduled")} />
            <SortableColumnHeader as="span" label="Status" {...scheduleSort.getHeaderProps("status")} />
            <span>Actions</span>
          </div>
          {scheduleSort.sortedRows.map((s) => (
            <div key={s.id} className="admin-row">
              <span>{s.clientName}</span>
              <span>{s.pickupAddress}</span>
              <span>{s.dropoffAddress}</span>
              <span>{s.scheduledAt}</span>
              <span className={`admin-pill ${String(s.status ?? "").toLowerCase()}`}>{s.status}</span>
              <span className="admin-actions-col">
                <button type="button" className="admin-action ghost" onClick={() => void del(s.id)}>
                  Delete
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
