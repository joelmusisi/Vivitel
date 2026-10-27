import { useCallback, useEffect, useMemo, useState } from "react";
import VTLoader from "../../../components/VTLoader";
import { useNavigate } from "react-router-dom";
import JourneyPipelineNav from "../../../components/journey/JourneyPipelineNav";
import JourneyRouteMapModal from "../../../components/journey/JourneyRouteMapModal";
import JourneyRouteTimelineModal from "../../../components/journey/JourneyRouteTimelineModal";
import JourneyStatusAlerts from "../../../components/journey/JourneyStatusAlerts";
import {
  LIVE_TRACKING_PATH,
  ROUTES_REPORTS_PATH,
  STREAMS_PATH,
  TRIP_TIMELINE_PATH
} from "../../../utils/journeyCatalog";
import { getJourneyRouteDetailFromRecord, type JourneyRouteDetail } from "../../../utils/journeyRouteDetails";
import { downloadJourneyRoutePdf } from "../../../utils/journeyRoutePdf";
import {
  clearRouteLibraryMemoryCache,
  formatRouteSchedule,
  isTrackableRoute,
  loadRouteLibrary,
  type RouteLibraryRecord
} from "../../../utils/journeyRouteLibraryStore";
import SortableColumnHeader from "../../../components/SortableColumnHeader";
import { useColumnSort } from "../../../hooks/useColumnSort";
import "../../../index.css";

type DetailModal = { kind: "map" | "timeline"; detail: JourneyRouteDetail } | null;

export default function JourneyTracking() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<RouteLibraryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailModal, setDetailModal] = useState<DetailModal>(null);

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

  /** Only routes that completed Libraries → Workflow → Allocation. */
  const trackable = useMemo(() => routes.filter(isTrackableRoute), [routes]);

  const filtered = useMemo(() => {
    return trackable.filter((row) => {
      const haystack =
        `${row.name} ${row.origin} ${row.destination} ${row.owner} ${row.assetRegistration} ${row.driverName}`.toLowerCase();
      const matchesSearch = haystack.includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || statusFilter === "stable";
      return matchesSearch && matchesStatus;
    });
  }, [trackable, search, statusFilter]);

  const getTrackingSortValue = useCallback((row: RouteLibraryRecord, key: string) => {
    if (key === "route") return row.name;
    if (key === "owner") return row.owner ?? "";
    if (key === "asset") return row.assetRegistration ?? row.assetDescription ?? "";
    if (key === "driver") return row.driverName ?? "";
    if (key === "scheduled") return row.scheduledFor ?? "";
    if (key === "updated") return row.updatedAt;
    if (key === "health") return "stable";
    return "";
  }, []);
  const trackingSort = useColumnSort({ rows: filtered, getValue: getTrackingSortValue });

  const openDetail = (row: RouteLibraryRecord, kind: "map" | "timeline") => {
    const detail = getJourneyRouteDetailFromRecord(row);
    if (!detail) return;
    setDetailModal({ kind, detail });
  };

  return (
    <div className="page journey-Tracking-page">
      <div className="journey-topbar">
        <div>
          <div className="journey-title">Routes tracking</div>
          <div className="journey-path">
            Track / Routes / Tracking — allocated runs from Workflow → Resource allocation
          </div>
        </div>
        <div className="journey-actions">
          <button type="button" className="journey-btn ghost" onClick={() => navigate("/Track/routes/resource-allocation")}>
            Resource allocation
          </button>
          <button type="button" className="journey-btn ghost" onClick={() => navigate(LIVE_TRACKING_PATH)}>
            Fleet live map
          </button>
          <button type="button" className="journey-btn ghost" onClick={() => navigate(TRIP_TIMELINE_PATH)}>
            Fleet trip timeline
          </button>
          <button type="button" className="journey-btn ghost" onClick={() => navigate(STREAMS_PATH)}>
            Streams
          </button>
          <button type="button" className="journey-btn ghost" onClick={() => navigate(ROUTES_REPORTS_PATH)}>
            Routes reports
          </button>
          <button type="button" className="journey-btn ghost" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <JourneyPipelineNav active="tracking" />

      <section className="journey-panel">
        <div className="journey-panel-header">
          <div>
            <div className="journey-panel-title">Active routes board</div>
            <div className="journey-panel-sub">
              Only routes that were created, scheduled, and allocated appear here. Map and Timeline use the saved stop
              plan from Libraries.
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
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All allocated</option>
              <option value="stable">On plan</option>
            </select>
          </div>
        </div>
        <div className="journey-table">
          <div className="journey-row journey-row-head journey-row-xl">
            <SortableColumnHeader as="span" label="Route" {...trackingSort.getHeaderProps("route")} />
            <SortableColumnHeader as="span" label="Owner" {...trackingSort.getHeaderProps("owner")} />
            <SortableColumnHeader as="span" label="Asset" {...trackingSort.getHeaderProps("asset")} />
            <SortableColumnHeader as="span" label="Driver" {...trackingSort.getHeaderProps("driver")} />
            <SortableColumnHeader as="span" label="Scheduled" {...trackingSort.getHeaderProps("scheduled")} />
            <SortableColumnHeader as="span" label="Updated" {...trackingSort.getHeaderProps("updated")} />
            <SortableColumnHeader as="span" label="Health" {...trackingSort.getHeaderProps("health")} />
            <span>Actions</span>
          </div>
          {loading ? (
            <VTLoader compact label="Loading allocated routes" />
          ) : trackingSort.sortedRows.length === 0 ? (
            <div className="journey-empty">
              No allocated routes yet. Create in Libraries → schedule in Workflow → assign asset & driver in Resource
              allocation.
            </div>
          ) : (
            trackingSort.sortedRows.map((row) => (
              <div key={row.id} className="journey-row journey-row-xl">
                <span className="journey-name">
                  {row.name}
                  <small className="journey-clone-hint">
                    {row.origin} → {row.destination}
                  </small>
                </span>
                <span>{row.owner || "—"}</span>
                <span>{row.assetRegistration || row.assetDescription || "—"}</span>
                <span>{row.driverName || "—"}</span>
                <span>{formatRouteSchedule(row.scheduledFor)}</span>
                <span>{new Date(row.updatedAt).toLocaleString()}</span>
                <span className="journey-pill stable">stable</span>
                <span className="journey-actions-col">
                  <button type="button" className="journey-action" onClick={() => openDetail(row, "map")}>
                    Map
                  </button>
                  <button
                    type="button"
                    className="journey-action ghost"
                    onClick={() => {
                      const detail = getJourneyRouteDetailFromRecord(row);
                      if (detail) downloadJourneyRoutePdf(detail);
                    }}
                  >
                    Download PDF
                  </button>
                  <button type="button" className="journey-action ghost" onClick={() => openDetail(row, "timeline")}>
                    Timeline
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <JourneyStatusAlerts />

      {detailModal?.kind === "map" && (
        <JourneyRouteMapModal
          detail={detailModal.detail}
          onClose={() => setDetailModal(null)}
          onOpenTimeline={() => setDetailModal({ kind: "timeline", detail: detailModal.detail })}
        />
      )}
      {detailModal?.kind === "timeline" && (
        <JourneyRouteTimelineModal
          detail={detailModal.detail}
          onClose={() => setDetailModal(null)}
          onOpenMap={() => setDetailModal({ kind: "map", detail: detailModal.detail })}
        />
      )}
    </div>
  );
}
