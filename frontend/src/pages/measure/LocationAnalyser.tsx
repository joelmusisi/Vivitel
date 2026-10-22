import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadLocationGeofences, type LocationGeofence } from "../../utils/locationGeofences";
import { bindingMatchesSite } from "../../utils/notificationLibraryStore";
import { readActiveSiteName } from "../../utils/tenantContext";
import { useFleetFilterOptional } from "../../contexts/FleetFilterContext";
import { FleetFilterBar } from "../../components/FleetFilterBar";
import "../../index.css";

type HotspotRow = {
  name: string;
  activity: string;
  note: string;
};

export default function LocationAnalyser() {
  const navigate = useNavigate();
  const fleetFilter = useFleetFilterOptional();
  const [locations, setLocations] = useState<LocationGeofence[]>([]);

  useEffect(() => {
    let mounted = true;
    const loadLocations = async () => {
      const rows = await loadLocationGeofences().catch(() => []);
      if (!mounted) return;
      const activeSite = readActiveSiteName();
      const scoped = rows.filter((row) => {
        const site = String((row as { site?: string }).site ?? "").trim();
        if (fleetFilter && fleetFilter.selectedSites.length > 0) {
          return fleetFilter.matchesSite(site);
        }
        return bindingMatchesSite(row, activeSite);
      });
      setLocations(scoped);
    };
    void loadLocations();
    const handleOrgChange = () => {
      void loadLocations();
    };
    window.addEventListener("vivi:orgchange", handleOrgChange);
    return () => {
      mounted = false;
      window.removeEventListener("vivi:orgchange", handleOrgChange);
    };
  }, [fleetFilter]);

  const hotspots = useMemo(
    () =>
      locations.map((location) => ({
        name: String(location.name ?? "").trim() || "Location",
        activity: "—",
        note: String(location.description ?? location.address ?? "").trim() || "—"
      })) satisfies HotspotRow[],
    [locations]
  );

  return (
    <div className="page insight-page">
      <FleetFilterBar showDbProfile />
      <section className="token-card insight-card">
        <div className="token-header">
          <div>
            <p className="eyebrow">Insights</p>
            <h2>Location Analyser</h2>
            <p className="token-sub">Hotspots and location-based activity highlights.</p>
          </div>
          <div className="insight-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                navigate(
                  "/Analyze/insights/reports?category=Movement%20Reports&report=Location%20Overview%20Report"
                )
              }
            >
              Open movement reports
            </button>
            <button type="button" className="btn primary">Create hotspot</button>
          </div>
        </div>
        <div className="insight-analytics">
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Active hotspots</div>
            <div className="insight-analytics-value">{locations.length}</div>
            <div className="insight-analytics-meta">Last 7 days</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">High idle zones</div>
            <div className="insight-analytics-value">0</div>
            <div className="insight-analytics-meta">Requires follow-up</div>
          </div>
          <div className="insight-analytics-card">
            <div className="insight-analytics-title">Top route</div>
            <div className="insight-analytics-value">—</div>
            <div className="insight-analytics-meta">—</div>
          </div>
        </div>
        <div className="token-table">
          <div className="token-row token-row-head">
            <span>Location</span>
            <span>Activity</span>
            <span>Note</span>
          </div>
          {hotspots.length === 0 ? (
            <div className="admin-empty">No records yet.</div>
          ) : (
            hotspots.map((row) => (
              <div key={row.name} className="token-row">
                <span>{row.name}</span>
                <span>{row.activity}</span>
                <span>{row.note}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
