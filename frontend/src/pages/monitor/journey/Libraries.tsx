import { useCallback, useEffect, useMemo, useState } from "react";
import VTLoader from "../../../components/VTLoader";
import { useNavigate } from "react-router-dom";
import JourneyPipelineNav from "../../../components/journey/JourneyPipelineNav";
import JourneyRouteCreatePlanner, {
  createDefaultWaypoints,
  waypointsFromStops,
  type PlannerWaypoint
} from "../../../components/journey/JourneyRouteCreatePlanner";
import JourneySearchableSelect from "../../../components/journey/JourneySearchableSelect";
import { ROUTES_REPORTS_PATH } from "../../../utils/journeyCatalog";
import {
  appendRouteToLibrary,
  buildNewRouteRecord,
  clearRouteLibraryMemoryCache,
  loadRouteLibrary,
  setRouteLifecycleStatus,
  type RouteLibraryRecord,
  type RouteLifecycleStatus,
  type RouteStopDraft
} from "../../../utils/journeyRouteLibraryStore";
import {
  loadJourneySiteAssets,
  loadJourneySiteDrivers,
  type SiteAssetOption,
  type SiteDriverOption
} from "../../../utils/journeySiteResources";
import SortableColumnHeader from "../../../components/SortableColumnHeader";
import { useColumnSort } from "../../../hooks/useColumnSort";
import { beginSaving, endSavingDone, endSavingError } from "../../../utils/saveFeedback";
import { showToast } from "../../../utils/toast";
import { readActiveSiteName } from "../../../utils/tenantContext";
import { readPrincipalIdentity } from "../../../utils/api";
import "../../../index.css";

type CreateMode = "fresh" | "from-previous";

const emptyForm = {
  name: "",
  description: "",
  assetId: "",
  assetRegistration: "",
  assetDescription: "",
  driverId: "",
  driverName: "",
  notes: "",
  cloneFromId: ""
};

export default function JourneyLibraries() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<RouteLibraryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RouteLifecycleStatus>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("fresh");
  const [form, setForm] = useState(emptyForm);
  const [waypoints, setWaypoints] = useState<PlannerWaypoint[]>(() => createDefaultWaypoints());
  const [activeWaypointId, setActiveWaypointId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<RouteLibraryRecord | null>(null);
  const [siteAssets, setSiteAssets] = useState<SiteAssetOption[]>([]);
  const [siteDrivers, setSiteDrivers] = useState<SiteDriverOption[]>([]);
  const [siteOptionsLoading, setSiteOptionsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const items = await loadRouteLibrary();
      setRoutes(items);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSiteOptions = useCallback(async () => {
    setSiteOptionsLoading(true);
    try {
      const [assets, drivers] = await Promise.all([loadJourneySiteAssets(), loadJourneySiteDrivers()]);
      setSiteAssets(assets);
      setSiteDrivers(drivers);
    } catch {
      setSiteAssets([]);
      setSiteDrivers([]);
      showToast("Unable to load site assets/drivers.", "error");
    } finally {
      setSiteOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onContextChange = () => {
      clearRouteLibraryMemoryCache();
      setRoutes([]);
      setDetail(null);
      setShowCreate(false);
      void refresh();
    };
    window.addEventListener("vivi:orgchange", onContextChange);
    window.addEventListener("vivi:contextchange", onContextChange);
    return () => {
      window.removeEventListener("vivi:orgchange", onContextChange);
      window.removeEventListener("vivi:contextchange", onContextChange);
    };
  }, [refresh]);

  useEffect(() => {
    if (!showCreate) return;
    void refreshSiteOptions();
  }, [showCreate, refreshSiteOptions]);

  const filtered = useMemo(() => {
    return routes.filter((row) => {
      const haystack =
        `${row.name} ${row.description} ${row.origin} ${row.destination} ${row.assetRegistration} ${row.driverName}`.toLowerCase();
      const matchesSearch = haystack.includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [routes, search, statusFilter]);

  const getRouteArchiveSortValue = useCallback((row: RouteLibraryRecord, key: string) => {
    if (key === "route") return row.name;
    if (key === "od") return `${row.origin ?? ""} ${row.destination ?? ""}`;
    if (key === "asset") return row.assetRegistration ?? row.assetDescription ?? "";
    if (key === "driver") return row.driverName ?? "";
    if (key === "updated") return row.updatedAt;
    if (key === "status") return row.status;
    return "";
  }, []);
  const routeArchiveSort = useColumnSort({ rows: filtered, getValue: getRouteArchiveSortValue });

  const openCreate = (mode: CreateMode, clone?: RouteLibraryRecord) => {
    setCreateMode(mode);
    if (mode === "from-previous" && clone) {
      const nextWaypoints = waypointsFromStops(clone.stops);
      setForm({
        ...emptyForm,
        name: `${clone.name} (new)`,
        description: clone.description || "",
        assetId: "",
        assetRegistration: "",
        assetDescription: "",
        driverId: "",
        driverName: "",
        notes: "",
        cloneFromId: clone.id
      });
      setWaypoints(nextWaypoints);
      setActiveWaypointId(nextWaypoints[0]?.id ?? null);
    } else {
      const nextWaypoints = createDefaultWaypoints();
      setForm(emptyForm);
      setWaypoints(nextWaypoints);
      setActiveWaypointId(nextWaypoints[0]?.id ?? null);
    }
    setShowCreate(true);
  };

  const saveCreate = async () => {
    const activeSite = readActiveSiteName().trim();
    if (!activeSite) {
      showToast("Select a site in the org ribbon before creating a route.", "error");
      return;
    }
    const name = form.name.trim();
    if (!name) {
      showToast("Route name is required.", "error");
      return;
    }
    if (!form.description.trim()) {
      showToast("Route description is required.", "error");
      return;
    }
    const cloneFrom =
      createMode === "from-previous"
        ? routes.find((row) => row.id === form.cloneFromId) ?? null
        : null;
    if (createMode === "from-previous" && !cloneFrom) {
      showToast("Select a previous route to copy destinations from.", "error");
      return;
    }

    const start = waypoints.find((row) => row.kind === "start");
    const end = waypoints.find((row) => row.kind === "destination");
    if (!start?.name.trim() || typeof start.lat !== "number" || typeof start.lng !== "number") {
      showToast("Plot the start point on the map (name/coords + pin).", "error");
      return;
    }
    if (!end?.name.trim() || typeof end.lat !== "number" || typeof end.lng !== "number") {
      showToast("Plot the end point on the map (name/coords + pin).", "error");
      return;
    }
    const midStops = waypoints.filter((row) => row.kind === "stop" || row.kind === "rest");
    for (const stop of midStops) {
      if (!stop.name.trim() || typeof stop.lat !== "number" || typeof stop.lng !== "number") {
        showToast("Every added stop or rest point must be labeled and plotted on the map.", "error");
        return;
      }
    }

    const stops: RouteStopDraft[] = waypoints
      .filter((row) => row.name.trim() && typeof row.lat === "number" && typeof row.lng === "number")
      .map((row) => ({
        name: row.name.trim(),
        kind: row.kind,
        lat: row.lat as number,
        lng: row.lng as number
      }));

    const principal = readPrincipalIdentity();
    setSaving(true);
    beginSaving("Saving route…");
    try {
      const record = buildNewRouteRecord({
        name,
        description: form.description,
        origin: start.name.trim(),
        destination: end.name.trim(),
        stops,
        assetRegistration: form.assetRegistration,
        assetDescription: form.assetDescription,
        driverName: form.driverName,
        notes: form.notes,
        createdBy: principal.userId || principal.email || principal.name || undefined,
        cloneFrom
      });
      const next = await appendRouteToLibrary(record);
      setRoutes(next);
      setShowCreate(false);
      setForm(emptyForm);
      setWaypoints(createDefaultWaypoints());
      endSavingDone("Route saved");
      showToast(
        cloneFrom
          ? `Route “${record.name}” created from a previous route. Next: open Workflow to schedule it.`
          : `Route “${record.name}” saved to Libraries. Next: open Workflow to schedule it.`,
        "success"
      );
    } catch (err) {
      endSavingError();
      const message = String((err as Error)?.message ?? "Unable to save the route right now.");
      showToast(/backblaze|\bb2\b/i.test(message) ? "Unable to save the route right now. Please try again." : message, "error");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row: RouteLibraryRecord, status: RouteLifecycleStatus) => {
    beginSaving("Updating route status…");
    try {
      const next = await setRouteLifecycleStatus(row.id, status);
      setRoutes(next);
      endSavingDone("Route status updated");
      const label =
        status === "open" ? "re-opened" : status === "scheduled" ? "marked scheduled" : "closed";
      showToast(`Route “${row.name}” ${label}.`, "success");
    } catch {
      endSavingError();
      showToast("Unable to update route status right now.", "error");
    }
  };

  return (
    <div className="page journey-libraries-page">
      <div className="journey-topbar">
        <div>
          <div className="journey-title">Libraries</div>
          <div className="journey-path">
            Track / Routes / Libraries — saved routes archive (open, scheduled, closed). History is kept permanently.
          </div>
        </div>
        <div className="journey-actions">
          <button type="button" className="journey-btn ghost" onClick={() => navigate(ROUTES_REPORTS_PATH)}>
            Routes reports
          </button>
          <button type="button" className="journey-btn ghost" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" className="journey-btn" onClick={() => openCreate("fresh")}>
            Create route
          </button>
        </div>
      </div>

      <JourneyPipelineNav active="libraries" />

      <section className="journey-panel">
        <div className="journey-panel-header">
          <div>
            <div className="journey-panel-title">Saved routes</div>
            <div className="journey-panel-sub">
              Open, scheduled, and closed routes stay here permanently. After create: Workflow schedules the run, then
              Resource allocation assigns the asset and driver that will carry it.
            </div>
          </div>
          <div className="journey-filter-row">
            <input
              className="journey-search"
              placeholder="Search routes, assets, drivers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="journey-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="scheduled">Scheduled</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
        <div className="journey-table">
          <div className="journey-row journey-row-head journey-row-route-archive">
            <SortableColumnHeader as="span" label="Route" {...routeArchiveSort.getHeaderProps("route")} />
            <SortableColumnHeader as="span" label="Origin → Destination" {...routeArchiveSort.getHeaderProps("od")} />
            <SortableColumnHeader as="span" label="Asset" {...routeArchiveSort.getHeaderProps("asset")} />
            <SortableColumnHeader as="span" label="Driver" {...routeArchiveSort.getHeaderProps("driver")} />
            <SortableColumnHeader as="span" label="Updated" {...routeArchiveSort.getHeaderProps("updated")} />
            <SortableColumnHeader as="span" label="Status" {...routeArchiveSort.getHeaderProps("status")} />
            <span>Actions</span>
          </div>
          {loading ? (
            <VTLoader compact label="Loading saved routes" />
          ) : routeArchiveSort.sortedRows.length === 0 ? (
            <div className="journey-empty">No saved routes match your filters.</div>
          ) : (
            routeArchiveSort.sortedRows.map((row) => (
              <div key={row.id} className="journey-row journey-row-route-archive">
                <span className="journey-name">
                  {row.name}
                  {row.clonedFromName ? (
                    <small className="journey-clone-hint">From “{row.clonedFromName}”</small>
                  ) : null}
                </span>
                <span>
                  {row.origin || "—"} → {row.destination || "—"}
                </span>
                <span>
                  {row.assetRegistration || "—"}
                  {row.assetDescription ? (
                    <small className="journey-clone-hint">{row.assetDescription}</small>
                  ) : null}
                </span>
                <span>{row.driverName || "—"}</span>
                <span>{new Date(row.updatedAt).toLocaleString()}</span>
                <span className={`journey-pill ${row.status}`}>{row.status}</span>
                <span className="journey-actions-col">
                  <button type="button" className="journey-action" onClick={() => setDetail(row)}>
                    Open
                  </button>
                  <button
                    type="button"
                    className="journey-action ghost"
                    onClick={() => openCreate("from-previous", row)}
                  >
                    Use as base
                  </button>
                  {row.status !== "scheduled" && (
                    <button
                      type="button"
                      className="journey-action ghost"
                      onClick={() => void changeStatus(row, "scheduled")}
                    >
                      Mark scheduled
                    </button>
                  )}
                  {row.status !== "closed" && (
                    <button
                      type="button"
                      className="journey-action ghost"
                      onClick={() => void changeStatus(row, "closed")}
                    >
                      Mark closed
                    </button>
                  )}
                  {row.status === "closed" && (
                    <button
                      type="button"
                      className="journey-action ghost"
                      onClick={() => void changeStatus(row, "open")}
                    >
                      Re-open
                    </button>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {showCreate && (
        <div
          className="journey-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Create route"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowCreate(false);
          }}
        >
          <div className="journey-modal journey-modal--create-route journey-modal--create-route-wide">
            <header className="journey-modal-head">
              <div>
                <div className="journey-modal-kicker">Libraries · Create route</div>
                <h2>Create route</h2>
              </div>
              <div className="journey-modal-head-actions">
                <button type="button" className="journey-btn ghost journey-modal-close-btn" onClick={() => setShowCreate(false)}>
                  Close
                </button>
                <button type="button" className="journey-modal-close" onClick={() => setShowCreate(false)} aria-label="Close">
                  ×
                </button>
              </div>
            </header>

            <div className="journey-create-body">
              <div className="journey-create-mode">
                <button
                  type="button"
                  className={createMode === "fresh" ? "is-active" : undefined}
                  onClick={() => openCreate("fresh")}
                >
                  Fresh route
                </button>
                <button
                  type="button"
                  className={createMode === "from-previous" ? "is-active" : undefined}
                  onClick={() => {
                    const source =
                      routes.find((row) => row.id === form.cloneFromId) ?? routes[0] ?? null;
                    if (source) {
                      openCreate("from-previous", source);
                      return;
                    }
                    setCreateMode("from-previous");
                    setForm((current) => ({ ...current, cloneFromId: "" }));
                  }}
                >
                  From previous route
                </button>
              </div>

              {createMode === "from-previous" && (
                <label className="journey-create-field">
                  <span>Base route (trail copied · original stays unchanged)</span>
                  <select
                    value={form.cloneFromId}
                    onChange={(event) => {
                      const source = routes.find((row) => row.id === event.target.value);
                      if (!source) {
                        setForm((current) => ({ ...current, cloneFromId: event.target.value }));
                        return;
                      }
                      openCreate("from-previous", source);
                    }}
                  >
                    <option value="">Select a saved route…</option>
                    {routes.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} ({row.status}) — {row.origin} → {row.destination}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="journey-create-grid">
                <label className="journey-create-field">
                  <span>Route name</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="e.g. Northern Fuel Corridor — evening"
                  />
                </label>
                <label className="journey-create-field">
                  <span>Route description</span>
                  <input
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="What this run is for, constraints, notes for dispatch"
                  />
                </label>
              </div>

              <JourneyRouteCreatePlanner
                waypoints={waypoints}
                activeId={activeWaypointId}
                onChange={setWaypoints}
                onActiveIdChange={setActiveWaypointId}
              />

              <div className="journey-create-grid">
                <JourneySearchableSelect
                  label="Vehicle / asset (optional)"
                  placeholder="Select site asset…"
                  searchPlaceholder="Search registration or description"
                  valueId={form.assetId}
                  valueLabel={
                    form.assetId
                      ? [form.assetDescription, form.assetRegistration].filter(Boolean).join(" — ")
                      : ""
                  }
                  loading={siteOptionsLoading}
                  options={siteAssets.map((asset) => ({
                    id: asset.id,
                    label: asset.label,
                    sublabel: asset.registration || undefined
                  }))}
                  emptyMessage="No assets on this site."
                  onSelect={(option) => {
                    if (!option) {
                      setForm((current) => ({
                        ...current,
                        assetId: "",
                        assetRegistration: "",
                        assetDescription: ""
                      }));
                      return;
                    }
                    const asset = siteAssets.find((row) => row.id === option.id);
                    setForm((current) => ({
                      ...current,
                      assetId: option.id,
                      assetRegistration: asset?.registration ?? "",
                      assetDescription: asset?.description || option.label
                    }));
                  }}
                />
                <JourneySearchableSelect
                  label="Driver (optional)"
                  placeholder="Select site driver…"
                  searchPlaceholder="Search driver name"
                  valueId={form.driverId}
                  valueLabel={form.driverName}
                  loading={siteOptionsLoading}
                  options={siteDrivers.map((driver) => ({
                    id: driver.id,
                    label: driver.name,
                    sublabel: driver.site || undefined
                  }))}
                  emptyMessage="No drivers on this site."
                  onSelect={(option) => {
                    if (!option) {
                      setForm((current) => ({ ...current, driverId: "", driverName: "" }));
                      return;
                    }
                    const driver = siteDrivers.find((row) => row.id === option.id);
                    setForm((current) => ({
                      ...current,
                      driverId: option.id,
                      driverName: driver?.name || option.label
                    }));
                  }}
                />
              </div>

              <label className="journey-create-field">
                <span>Notes</span>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Optional notes for this new route"
                />
              </label>

              <div className="journey-create-actions">
                <button type="button" className="journey-btn ghost" onClick={() => setShowCreate(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="button" className="journey-btn" onClick={() => void saveCreate()} disabled={saving}>
                  {saving ? "Saving…" : "Save route"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div
          className="journey-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Route ${detail.name}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setDetail(null);
          }}
        >
          <div className="journey-modal journey-modal--create-route">
            <header className="journey-modal-head">
              <div>
                <div className="journey-modal-kicker">Saved route · {detail.status}</div>
                <h2>{detail.name}</h2>
                <p>
                  {detail.origin} → {detail.destination}
                </p>
              </div>
              <div className="journey-modal-head-actions">
                <button
                  type="button"
                  className="journey-btn ghost"
                  onClick={() => {
                    setDetail(null);
                    openCreate("from-previous", detail);
                  }}
                >
                  Create from this
                </button>
                <button type="button" className="journey-btn ghost journey-modal-close-btn" onClick={() => setDetail(null)}>
                  Close
                </button>
                <button type="button" className="journey-modal-close" onClick={() => setDetail(null)} aria-label="Close">
                  ×
                </button>
              </div>
            </header>
            <div className="journey-create-body">
              <dl className="journey-map-facts">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`journey-pill ${detail.status}`}>{detail.status}</span>
                  </dd>
                </div>
                <div>
                  <dt>Description</dt>
                  <dd>{detail.description || "—"}</dd>
                </div>
                <div>
                  <dt>Registration</dt>
                  <dd>{detail.assetRegistration || "—"}</dd>
                </div>
                <div>
                  <dt>Asset</dt>
                  <dd>{detail.assetDescription || "—"}</dd>
                </div>
                <div>
                  <dt>Driver</dt>
                  <dd>{detail.driverName || "—"}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{new Date(detail.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{new Date(detail.updatedAt).toLocaleString()}</dd>
                </div>
                {detail.clonedFromName && (
                  <div>
                    <dt>Cloned from</dt>
                    <dd>{detail.clonedFromName}</dd>
                  </div>
                )}
              </dl>
              <div className="journey-map-stops">
                <h3>Stops</h3>
                <ol>
                  {detail.stops.map((stop, index) => (
                    <li key={`${detail.id}-stop-${index}`}>
                      <strong>{stop.name}</strong>
                      <span>
                        {stop.kind}
                        {typeof stop.lat === "number" && typeof stop.lng === "number"
                          ? ` · ${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              {detail.notes ? <p className="journey-create-note">{detail.notes}</p> : null}
              <div className="journey-create-actions">
                <button
                  type="button"
                  className="journey-btn ghost"
                  onClick={() => navigate("/Track/routes/workflow")}
                >
                  Use in workflow
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
