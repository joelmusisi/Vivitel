import { useCallback, useEffect, useMemo, useState } from "react";
import VTLoader from "../../../components/VTLoader";
import { useNavigate } from "react-router-dom";
import JourneyPipelineNav from "../../../components/journey/JourneyPipelineNav";
import { ROUTES_REPORTS_PATH } from "../../../utils/journeyCatalog";
import {
  formatRouteSchedule,
  clearRouteLibraryMemoryCache,
  loadRouteLibrary,
  scheduleRouteInWorkflow,
  workflowDisplayStatus,
  type RouteLibraryRecord
} from "../../../utils/journeyRouteLibraryStore";
import SortableColumnHeader from "../../../components/SortableColumnHeader";
import { useColumnSort } from "../../../hooks/useColumnSort";
import { beginSaving, endSavingDone, endSavingError } from "../../../utils/saveFeedback";
import { showToast } from "../../../utils/toast";
import "../../../index.css";

function toLocalInputValue(isoOrEmpty: string): string {
  const ts = Date.parse(isoOrEmpty);
  const base = Number.isFinite(ts) ? new Date(ts) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
}

export default function Workflow() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<RouteLibraryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showSchedule, setShowSchedule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    routeId: "",
    owner: "Dispatch",
    scheduledFor: toLocalInputValue("")
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRoutes(await loadRouteLibrary());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onContextChange = () => {
      clearRouteLibraryMemoryCache();
      setRoutes([]);
      void refresh();
    };
    window.addEventListener("vivi:orgchange", onContextChange);
    window.addEventListener("vivi:contextchange", onContextChange);
    return () => {
      window.removeEventListener("vivi:orgchange", onContextChange);
      window.removeEventListener("vivi:contextchange", onContextChange);
    };
  }, [refresh]);

  const workflowRows = useMemo(
    () =>
      routes
        .filter((row) => row.status !== "closed")
        .map((row) => ({
          row,
          displayStatus: workflowDisplayStatus(row)
        })),
    [routes]
  );

  const filtered = useMemo(() => {
    return workflowRows.filter(({ row, displayStatus }) => {
      const haystack = `${row.name} ${row.origin} ${row.destination} ${row.owner}`.toLowerCase();
      const matchesSearch = haystack.includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || displayStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [workflowRows, search, statusFilter]);

  type WorkflowRow = { row: RouteLibraryRecord; displayStatus: string };

  const getWorkflowSortValue = useCallback((entry: WorkflowRow, key: string) => {
    const { row, displayStatus } = entry;
    if (key === "routes") return row.name;
    if (key === "owner") return row.owner ?? "";
    if (key === "route") return `${row.origin ?? ""} ${row.destination ?? ""}`;
    if (key === "stops") return row.stops.length;
    if (key === "scheduled") return row.scheduledFor ?? "";
    if (key === "status") return displayStatus;
    return "";
  }, []);
  const workflowSort = useColumnSort({ rows: filtered, getValue: getWorkflowSortValue });

  const openSchedule = (route?: RouteLibraryRecord) => {
    const target =
      route ??
      routes.find((row) => row.status === "open") ??
      routes.find((row) => row.status !== "closed") ??
      null;
    setForm({
      routeId: target?.id ?? "",
      owner: target?.owner || "Dispatch",
      scheduledFor: toLocalInputValue(target?.scheduledFor || "")
    });
    setShowSchedule(true);
  };

  const saveSchedule = async () => {
    if (!form.routeId) {
      showToast("Select a route from Libraries to schedule.", "error");
      return;
    }
    if (!form.scheduledFor.trim()) {
      showToast("Start time is required.", "error");
      return;
    }
    setSaving(true);
    beginSaving("Scheduling route…");
    try {
      const scheduledFor = new Date(form.scheduledFor).toISOString();
      const next = await scheduleRouteInWorkflow(form.routeId, {
        owner: form.owner,
        scheduledFor
      });
      setRoutes(next);
      setShowSchedule(false);
      endSavingDone("Route scheduled");
      showToast("Schedule saved. Next: assign vehicle and driver in Resource allocation.", "success");
      navigate("/Track/routes/resource-allocation");
    } catch (error) {
      endSavingError();
      const message = error instanceof Error ? error.message : "Unable to schedule this route right now.";
      showToast(/backblaze|\bb2\b/i.test(message) ? "Unable to schedule this route right now." : message, "error");
    } finally {
      setSaving(false);
    }
  };

  const schedulable = routes.filter((row) => row.status === "open" || row.status === "scheduled");

  return (
    <div className="page journey-workflow-page">
      <div className="journey-topbar">
        <div>
          <div className="journey-title">Workflow</div>
          <div className="journey-path">
            Track / Routes / Workflow — Schedule routes created in Libraries, then allocate resources
          </div>
        </div>
        <div className="journey-actions">
          <button type="button" className="journey-btn ghost" onClick={() => navigate("/Track/routes/libraries")}>
            Open libraries
          </button>
          <button type="button" className="journey-btn ghost" onClick={() => navigate(ROUTES_REPORTS_PATH)}>
            Routes reports
          </button>
          <button type="button" className="journey-btn ghost" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" className="journey-btn" onClick={() => openSchedule()}>
            Schedule route
          </button>
        </div>
      </div>

      <JourneyPipelineNav active="workflow" />

      <section className="journey-panel">
        <div className="journey-panel-header">
          <div>
            <div className="journey-panel-title">Scheduled routes</div>
            <div className="journey-panel-sub">
              Routes created in Libraries appear here. Schedule a start time, then assign vehicle and driver in
              Resource allocation.
            </div>
          </div>
          <div className="journey-filter-row">
            <input
              className="journey-search"
              placeholder="Search route"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="journey-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="active">Live now</option>
              <option value="scheduled">Scheduled</option>
              <option value="draft">Awaiting schedule</option>
              <option value="paused">Paused</option>
            </select>
          </div>
        </div>
        <div className="journey-table">
          <div className="journey-row journey-row-head journey-row-wide">
            <SortableColumnHeader as="span" label="Routes" {...workflowSort.getHeaderProps("routes")} />
            <SortableColumnHeader as="span" label="Owner" {...workflowSort.getHeaderProps("owner")} />
            <SortableColumnHeader as="span" label="Route" {...workflowSort.getHeaderProps("route")} />
            <SortableColumnHeader as="span" label="Stops" {...workflowSort.getHeaderProps("stops")} />
            <SortableColumnHeader as="span" label="Scheduled" {...workflowSort.getHeaderProps("scheduled")} />
            <SortableColumnHeader as="span" label="Status" {...workflowSort.getHeaderProps("status")} />
            <span>Actions</span>
          </div>
          {loading ? (
            <VTLoader compact label="Loading routes" />
          ) : workflowSort.sortedRows.length === 0 ? (
            <div className="journey-empty">
              No routes yet. Create a route in Libraries, then schedule it here.
            </div>
          ) : (
            workflowSort.sortedRows.map(({ row, displayStatus }) => (
              <div key={row.id} className="journey-row journey-row-wide">
                <span className="journey-name">{row.name}</span>
                <span>{row.owner || "—"}</span>
                <span>
                  {row.origin || "—"} → {row.destination || "—"}
                </span>
                <span>{row.stops.length}</span>
                <span>{formatRouteSchedule(row.scheduledFor)}</span>
                <span className={`journey-pill ${displayStatus}`}>{displayStatus}</span>
                <span className="journey-actions-col">
                  {displayStatus === "draft" || displayStatus === "scheduled" ? (
                    <button type="button" className="journey-action" onClick={() => openSchedule(row)}>
                      {displayStatus === "draft" ? "Schedule" : "Reschedule"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="journey-action"
                    onClick={() => navigate("/Track/routes/resource-allocation")}
                  >
                    Assign
                  </button>
                  <button
                    type="button"
                    className="journey-action ghost"
                    onClick={() => navigate("/Track/routes/Tracking")}
                  >
                    Track
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
        <div className="journey-footer-hint">
          Open routes awaiting schedule: {routes.filter((row) => row.status === "open").length}. Closed routes stay in
          Libraries forever and can be used as a base for a new run.
        </div>
      </section>

      {showSchedule && (
        <div
          className="journey-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Schedule route"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowSchedule(false);
          }}
        >
          <div className="journey-modal journey-modal--create-route">
            <header className="journey-modal-head">
              <div>
                <div className="journey-modal-kicker">Workflow · Schedule</div>
                <h2>Schedule route</h2>
              </div>
              <div className="journey-modal-head-actions">
                <button
                  type="button"
                  className="journey-btn ghost journey-modal-close-btn"
                  onClick={() => setShowSchedule(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="journey-modal-close"
                  onClick={() => setShowSchedule(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </header>
            <div className="journey-create-body">
              <label className="journey-create-field">
                <span>Route from Libraries</span>
                <select
                  value={form.routeId}
                  onChange={(event) => {
                    const selected = routes.find((row) => row.id === event.target.value);
                    setForm((current) => ({
                      ...current,
                      routeId: event.target.value,
                      owner: selected?.owner || current.owner || "Dispatch"
                    }));
                  }}
                >
                  <option value="">Select a saved route…</option>
                  {schedulable.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} ({row.status}) — {row.origin} → {row.destination}
                    </option>
                  ))}
                </select>
              </label>
              <div className="journey-create-grid">
                <label className="journey-create-field">
                  <span>Owner</span>
                  <input
                    value={form.owner}
                    onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}
                    placeholder="Dispatch"
                  />
                </label>
                <label className="journey-create-field">
                  <span>Start time</span>
                  <input
                    type="datetime-local"
                    value={form.scheduledFor}
                    onChange={(event) => setForm((current) => ({ ...current, scheduledFor: event.target.value }))}
                  />
                </label>
              </div>
              <div className="journey-create-actions">
                <button
                  type="button"
                  className="journey-btn ghost"
                  onClick={() => setShowSchedule(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="button" className="journey-btn" onClick={() => void saveSchedule()} disabled={saving}>
                  {saving ? "Scheduling…" : "Save schedule"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
