import { useCallback, useEffect, useMemo, useState } from "react";
import VTLoader from "../../../components/VTLoader";
import { useNavigate } from "react-router-dom";
import JourneyPipelineNav from "../../../components/journey/JourneyPipelineNav";
import JourneySearchableSelect from "../../../components/journey/JourneySearchableSelect";
import { ROUTES_REPORTS_PATH } from "../../../utils/journeyCatalog";
import {
  allocateRouteResources,
  clearRouteLibraryMemoryCache,
  formatRouteSchedule,
  loadRouteLibrary,
  type RouteLibraryRecord
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
import "../../../index.css";

export default function ResourceAllocation() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<RouteLibraryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unassigned" | "allocated">("all");
  const [showAssign, setShowAssign] = useState(false);
  const [saving, setSaving] = useState(false);
  const [siteAssets, setSiteAssets] = useState<SiteAssetOption[]>([]);
  const [siteDrivers, setSiteDrivers] = useState<SiteDriverOption[]>([]);
  const [siteOptionsLoading, setSiteOptionsLoading] = useState(false);
  const [form, setForm] = useState({
    routeId: "",
    assetId: "",
    assetRegistration: "",
    assetDescription: "",
    driverId: "",
    driverName: ""
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRoutes(await loadRouteLibrary());
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
    if (!showAssign) return;
    void refreshSiteOptions();
  }, [showAssign, refreshSiteOptions]);

  /** Scheduled routes from Workflow (including already allocated). */
  const boardRows = useMemo(
    () => routes.filter((row) => row.status === "scheduled"),
    [routes]
  );

  const filtered = useMemo(() => {
    return boardRows.filter((row) => {
      const haystack =
        `${row.name} ${row.origin} ${row.destination} ${row.assetRegistration} ${row.driverName}`.toLowerCase();
      const matchesSearch = haystack.includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.allocationStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [boardRows, search, statusFilter]);

  const getAllocationSortValue = useCallback((row: RouteLibraryRecord, key: string) => {
    if (key === "routes") return row.name;
    if (key === "route") return `${row.origin ?? ""} ${row.destination ?? ""}`;
    if (key === "scheduled") return row.scheduledFor ?? "";
    if (key === "vehicle") return row.assetRegistration ?? row.assetDescription ?? "";
    if (key === "driver") return row.driverName ?? "";
    if (key === "allocation") return row.allocationStatus ?? "";
    return "";
  }, []);
  const allocationSort = useColumnSort({ rows: filtered, getValue: getAllocationSortValue });

  const resolveFormFromRoute = (target: RouteLibraryRecord | null | undefined, routeId: string) => {
    const registration = target?.assetRegistration ?? "";
    const description = target?.assetDescription ?? "";
    const driverName = target?.driverName ?? "";
    const matchedAsset =
      siteAssets.find(
        (asset) =>
          (registration && asset.registration === registration) ||
          (description && asset.description === description)
      ) ?? null;
    const matchedDriver = siteDrivers.find((driver) => driver.name === driverName) ?? null;
    return {
      routeId,
      assetId: matchedAsset?.id ?? "",
      assetRegistration: registration,
      assetDescription: description,
      driverId: matchedDriver?.id ?? "",
      driverName
    };
  };

  const openAssign = (route?: RouteLibraryRecord) => {
    const target =
      route ??
      boardRows.find((row) => row.allocationStatus === "unassigned") ??
      boardRows[0] ??
      null;
    setForm(resolveFormFromRoute(target, target?.id ?? ""));
    setShowAssign(true);
  };

  const saveAssign = async () => {
    if (!form.routeId) {
      showToast("Select a scheduled route to allocate.", "error");
      return;
    }
    if (!form.assetRegistration.trim() || !form.driverName.trim()) {
      showToast("Vehicle registration and driver are required.", "error");
      return;
    }
    setSaving(true);
    beginSaving("Allocating resources…");
    try {
      const next = await allocateRouteResources(form.routeId, {
        assetRegistration: form.assetRegistration,
        assetDescription: form.assetDescription,
        driverName: form.driverName
      });
      setRoutes(next);
      setShowAssign(false);
      endSavingDone("Asset and driver allocated");
      showToast("Resources allocated. Next: open Tracking to monitor the journey.", "success");
    } catch (error) {
      endSavingError();
      const message = error instanceof Error ? error.message : "Unable to allocate right now.";
      showToast(/backblaze|\bb2\b/i.test(message) ? "Unable to allocate resources right now." : message, "error");
    } finally {
      setSaving(false);
    }
  };

  const assignable = routes.filter((row) => row.status === "scheduled");

  return (
    <div className="page journey-resources-page">
      <div className="journey-topbar">
        <div>
          <div className="journey-title">Resource allocation</div>
          <div className="journey-path">
            Track / Routes / Resource allocation — assign the asset and driver that will carry each scheduled route
          </div>
        </div>
        <div className="journey-actions">
          <button type="button" className="journey-btn ghost" onClick={() => navigate("/Track/routes/workflow")}>
            Back to workflow
          </button>
          <button type="button" className="journey-btn ghost" onClick={() => navigate(ROUTES_REPORTS_PATH)}>
            Routes reports
          </button>
          <button type="button" className="journey-btn ghost" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" className="journey-btn" onClick={() => openAssign()}>
            Assign resource
          </button>
        </div>
      </div>

      <JourneyPipelineNav active="resource-allocation" />

      <section className="journey-panel">
        <div className="journey-panel-header">
          <div>
            <div className="journey-panel-title">Allocation board</div>
            <div className="journey-panel-sub">
              Scheduled routes from Workflow appear here. Assign vehicle and driver, then open Tracking.
            </div>
          </div>
          <div className="journey-filter-row">
            <input
              className="journey-search"
              placeholder="Search route, asset, driver"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="journey-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <option value="all">All allocation</option>
              <option value="unassigned">Needs allocation</option>
              <option value="allocated">Allocated</option>
            </select>
          </div>
        </div>
        <div className="journey-table">
          <div className="journey-row journey-row-head journey-row-alloc">
            <SortableColumnHeader as="span" label="Routes" {...allocationSort.getHeaderProps("routes")} />
            <SortableColumnHeader as="span" label="Route" {...allocationSort.getHeaderProps("route")} />
            <SortableColumnHeader as="span" label="Scheduled" {...allocationSort.getHeaderProps("scheduled")} />
            <SortableColumnHeader as="span" label="Vehicle" {...allocationSort.getHeaderProps("vehicle")} />
            <SortableColumnHeader as="span" label="Driver" {...allocationSort.getHeaderProps("driver")} />
            <SortableColumnHeader as="span" label="Allocation" {...allocationSort.getHeaderProps("allocation")} />
            <span>Actions</span>
          </div>
          {loading ? (
            <VTLoader compact label="Loading allocations" />
          ) : allocationSort.sortedRows.length === 0 ? (
            <div className="journey-empty">
              No Scheduled routes yet. Create a route in Libraries, schedule it in Workflow, then allocate here.
            </div>
          ) : (
            allocationSort.sortedRows.map((row) => (
              <div key={row.id} className="journey-row journey-row-alloc">
                <span className="journey-name">{row.name}</span>
                <span>
                  {row.origin || "—"} → {row.destination || "—"}
                </span>
                <span>{formatRouteSchedule(row.scheduledFor)}</span>
                <span>
                  {row.assetRegistration || "—"}
                  {row.assetDescription ? (
                    <small className="journey-clone-hint">{row.assetDescription}</small>
                  ) : null}
                </span>
                <span>{row.driverName || "—"}</span>
                <span className={`journey-pill ${row.allocationStatus}`}>
                  {row.allocationStatus === "allocated" ? "allocated" : "unassigned"}
                </span>
                <span className="journey-actions-col">
                  <button type="button" className="journey-action" onClick={() => openAssign(row)}>
                    {row.allocationStatus === "allocated" ? "Reassign" : "Assign"}
                  </button>
                  <button
                    type="button"
                    className="journey-action ghost"
                    onClick={() => navigate("/Track/routes/Tracking")}
                  >
                    View tracking
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {showAssign && (
        <div
          className="journey-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Assign resource"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowAssign(false);
          }}
        >
          <div className="journey-modal journey-modal--create-route">
            <header className="journey-modal-head">
              <div>
                <div className="journey-modal-kicker">Resource allocation</div>
                <h2>Assign asset & driver</h2>
              </div>
              <div className="journey-modal-head-actions">
                <button
                  type="button"
                  className="journey-btn ghost journey-modal-close-btn"
                  onClick={() => setShowAssign(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="journey-modal-close"
                  onClick={() => setShowAssign(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </header>
            <div className="journey-create-body">
              <label className="journey-create-field">
                <span>Scheduled route</span>
                <select
                  value={form.routeId}
                  onChange={(event) => {
                    const selected = routes.find((row) => row.id === event.target.value);
                    setForm(resolveFormFromRoute(selected, event.target.value));
                  }}
                >
                  <option value="">Select a route…</option>
                  {assignable.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} — {formatRouteSchedule(row.scheduledFor)} ({row.allocationStatus})
                    </option>
                  ))}
                </select>
              </label>
              <div className="journey-create-grid">
                <JourneySearchableSelect
                  label="Vehicle / asset"
                  placeholder="Select site asset…"
                  searchPlaceholder="Search registration or description"
                  valueId={form.assetId}
                  valueLabel={
                    form.assetId || form.assetRegistration || form.assetDescription
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
                  label="Driver"
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
              <div className="journey-create-actions">
                <button
                  type="button"
                  className="journey-btn ghost"
                  onClick={() => setShowAssign(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="button" className="journey-btn" onClick={() => void saveAssign()} disabled={saving}>
                  {saving ? "Saving…" : "Save allocation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
