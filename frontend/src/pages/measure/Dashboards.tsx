import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAlertsFromApi, getAssetsFromApi, getDriversFromApi, getHierarchy, type HierarchyRoot } from "../../utils/api";
import ScheduleDateTimePicker from "../../components/ScheduleDateTimePicker";
import {
  buildTimelineBuckets,
  loadDashboardAlertsFromTraccar,
  loadDashboardTripsFromTraccar,
  resolveDashboardDeviceTargets
} from "../../utils/dashboardTraccarData";
import { assetSiteMatchesHierarchySite, matchesStoredSiteSelection, readStoredSelectionScope, recoverActiveSiteName } from "../../utils/selectionScope";
import { useFleetFilterOptional } from "../../contexts/FleetFilterContext";
import { FleetFilterBar } from "../../components/FleetFilterBar";
import "../../index.css";

type DashboardKey =
  | "fleet"
  | "trip"
  | "fuel"
  | "driver"
  | "asset"
  | "safety"
  | "maintenance"
  | "cost";

type RawRow = Record<string, unknown>;

type MetricBar = {
  label: string;
  value: number;
  site: string;
  color?: string;
};

type ScoreRow = {
  name: string;
  score: number;
  site: string;
};

type BarPopupState = {
  id: string;
  dateTimeLabel: string;
  valueLabel: string;
  site: string;
};

type ScorePopupState = {
  id: string;
  site: string;
  valueLabel: string;
};

type DashboardScopeMap = {
  sites: string[];
  assetsBySite: Record<string, string[]>;
  allAssets: string[];
};

const dashboardOptions: Array<{ key: DashboardKey; label: string; summary: string }> = [
  { key: "fleet", label: "Fleet Utilisation (Default)", summary: "Usage, km and trip efficiency" },
  { key: "trip", label: "Trip Productivity", summary: "Trips per shift and route output" },
  { key: "fuel", label: "Fuel and Idling", summary: "Fuel burn, idle and route quality" },
  { key: "driver", label: "Driver Scorecard", summary: "Driver safety score and ranking" },
  { key: "asset", label: "Asset Scorecard", summary: "Asset risk and performance ranking" },
  { key: "safety", label: "Safety and Compliance", summary: "Violations and exceptions" },
  { key: "maintenance", label: "Maintenance Forecast", summary: "Service due and downtime risk" },
  { key: "cost", label: "Cost Per Km", summary: "Operating cost efficiency" }
];

const datePresets = ["Today", "Yesterday", "This Week", "This Month", "Last 30 Days", "Custom"] as const;
const tripModes = ["Trips only", "Trips and positioning", "Deliveries only"];
const hourLabels = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}:00`);
const DEFAULT_MAX_REASONABLE_SPEED_KPH = 140;
const EMPTY_DASHBOARD_SCOPE: DashboardScopeMap = { sites: [], assetsBySite: {}, allAssets: [] };
type DatePreset = typeof datePresets[number];
type DashboardDatePickerTarget = "from" | "to";

const toText = (value: unknown): string => String(value ?? "").trim();
const toLower = (value: unknown): string => toText(value).toLowerCase();
const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeScopeLabel = (value: unknown) => String(value ?? "").trim();

const readAccessScope = () => {
  if (typeof window === "undefined") {
    return { activeDbId: "", activeSite: "", allowedSites: [] as string[] };
  }
  const activeDbId = String(window.localStorage.getItem("vivi.activeDbId") ?? "").trim();
  const activeSite = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
  const rawSites = window.localStorage.getItem("vivi.activeDbSites") ?? "";
  let allowedSites: string[] = [];
  try {
    const parsed = rawSites ? JSON.parse(rawSites) : [];
    allowedSites = Array.isArray(parsed)
      ? parsed.map((site) => String(site ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    allowedSites = [];
  }
  return { activeDbId, activeSite, allowedSites };
};

const selectionIsSiteLevel = () => {
  const scope = readStoredSelectionScope().scope;
  return scope === "site" || scope === "asset";
};

const siteNamesMatch = (left: string, right: string) =>
  Boolean(left && right) && (
    left.toLowerCase() === right.toLowerCase() || assetSiteMatchesHierarchySite(left, right)
  );

const buildDashboardScopeMap = (hierarchy: HierarchyRoot | null | undefined, rawAssets: any[]): DashboardScopeMap => {
  const next: DashboardScopeMap = { sites: [], assetsBySite: {}, allAssets: [] };
  const { activeDbId, activeSite, allowedSites } = readAccessScope();
  const allowedSiteSet = new Set(allowedSites.map((site) => site.toLowerCase()));
  const siteLevel = selectionIsSiteLevel();
  const activeSiteLabel = recoverActiveSiteName() || activeSite;

  const dealers = Array.isArray(hierarchy?.dealers) ? hierarchy.dealers : [];
  for (const dealer of dealers) {
    const organisations = Array.isArray((dealer as any)?.organisations) ? (dealer as any).organisations : [];
    for (const organisation of organisations) {
      const databases = Array.isArray((organisation as any)?.databases) ? (organisation as any).databases : [];
      for (const database of databases) {
        const dbId = normalizeScopeLabel((database as any)?.id);
        if (activeDbId && dbId && dbId !== activeDbId) continue;
        const sites = Array.isArray((database as any)?.sites) ? (database as any).sites : [];
        for (const site of sites) {
          const siteName = normalizeScopeLabel((site as any)?.name);
          if (!siteName) continue;
          if (siteLevel) {
            if (!siteNamesMatch(siteName, activeSiteLabel)) continue;
          } else if (allowedSiteSet.size > 0 && !allowedSiteSet.has(siteName.toLowerCase())) {
            continue;
          } else if (allowedSiteSet.size === 0 && activeSiteLabel && !siteNamesMatch(siteName, activeSiteLabel)) {
            continue;
          }
          if (!next.assetsBySite[siteName]) {
            next.assetsBySite[siteName] = [];
            next.sites.push(siteName);
          }
        }
      }
    }
  }

  if (siteLevel && activeSiteLabel && !next.sites.some((site) => siteNamesMatch(site, activeSiteLabel))) {
    next.assetsBySite[activeSiteLabel] = [];
    next.sites.push(activeSiteLabel);
  }

  for (const asset of Array.isArray(rawAssets) ? rawAssets : []) {
    const siteName = normalizeScopeLabel((asset as any)?.site);
    const registration =
      normalizeScopeLabel((asset as any)?.registration)
      || normalizeScopeLabel((asset as any)?.assetDescription)
      || normalizeScopeLabel((asset as any)?.name);
    if (!registration || !siteName) continue;
    const scopedSiteKey = next.sites.find((site) => siteNamesMatch(site, siteName));
    if (!scopedSiteKey) continue;
    next.assetsBySite[scopedSiteKey].push(registration);
  }

  next.sites = [...new Set(next.sites)].sort((a, b) => a.localeCompare(b));
  const scopedAssets = new Set<string>();
  for (const site of Object.keys(next.assetsBySite)) {
    next.assetsBySite[site] = [...new Set(next.assetsBySite[site])].sort((a, b) => a.localeCompare(b));
    for (const registration of next.assetsBySite[site]) scopedAssets.add(registration);
  }
  next.allAssets = [...scopedAssets].sort((a, b) => a.localeCompare(b));
  return next;
};

const assetsForSites = (scope: DashboardScopeMap, siteNames: string[]) => {
  const collected = new Set<string>();
  for (const name of siteNames) {
    const token = normalizeScopeLabel(name);
    if (!token || token === "All sites") continue;
    const key = Object.keys(scope.assetsBySite).find((site) => siteNamesMatch(site, token));
    for (const registration of key ? scope.assetsBySite[key] ?? [] : []) {
      if (registration) collected.add(registration);
    }
  }
  return [...collected].sort((a, b) => a.localeCompare(b));
};

const getTripEndDate = (row: RawRow): Date | null => {
  const raw = toText(row.endTime) || toText(row.tripEnd) || toText(row.serverTime);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeTripDistanceKm = (rawDistance: number, startMs: number, endMs: number, maxReasonableSpeedKph: number): number => {
  if (!Number.isFinite(rawDistance) || rawDistance <= 0) return 0;
  if (rawDistance >= 1000) return rawDistance / 1000;
  if (!Number.isInteger(rawDistance)) return rawDistance;
  const durationHours = Math.max(0, endMs - startMs) / 3_600_000;
  if (durationHours <= 0) return rawDistance;
  const asKmAvg = rawDistance / durationHours;
  const asMetersAvg = (rawDistance / 1000) / durationHours;
  if (asKmAvg > maxReasonableSpeedKph * 1.3 && asMetersAvg <= maxReasonableSpeedKph * 1.3) {
    return rawDistance / 1000;
  }
  return rawDistance;
};

const getVerifiedTripDistanceKm = (row: RawRow): number => {
  const rawDistance = toNumber(row.distanceKm) || toNumber(row.distance) || toNumber(row.km) || toNumber(row.totalDistance);
  if (!rawDistance) return 0;
  const start = rowDate(row);
  const end = getTripEndDate(row);
  const startMs = start?.getTime() ?? Number.NaN;
  const endMs = end?.getTime() ?? startMs;
  return normalizeTripDistanceKm(rawDistance, startMs, endMs, DEFAULT_MAX_REASONABLE_SPEED_KPH);
};

const getVerifiedTripDurationMinutes = (row: RawRow): number => {
  const raw = toNumber(row.durationMin) || toNumber(row.duration) || toNumber(row.tripDuration);
  const start = rowDate(row);
  const end = getTripEndDate(row);
  const windowMinutes = start && end ? Math.max(0, end.getTime() - start.getTime()) / 60000 : Number.NaN;
  const candidates = [
    raw,
    raw > 0 ? raw / 60 : 0,
    raw > 0 ? raw / 60000 : 0,
    Number.isFinite(windowMinutes) ? windowMinutes : 0
  ].filter((value) => Number.isFinite(value) && value >= 0 && value <= 24 * 60);
  if (!candidates.length) return 0;
  if (Number.isFinite(windowMinutes) && windowMinutes > 0) {
    return candidates.sort((a, b) => Math.abs(a - windowMinutes) - Math.abs(b - windowMinutes))[0] ?? 0;
  }
  return candidates[0] ?? 0;
};

const safeRatio = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : 0);

const normalizeMatchKey = (value: unknown) => toText(value).toLowerCase();

const rowSite = (row: RawRow): string =>
  toText(row.site) || toText(row.siteName) || toText(row.location) || toText(row.hub) || "Unknown site";

const siteMatchesFilter = (row: RawRow, filter: string) =>
  filter === "All sites" || normalizeMatchKey(rowSite(row)) === normalizeMatchKey(filter);

const rowAsset = (row: RawRow): string =>
  toText(row.assetDescription) ||
  toText(row.registration) ||
  toText(row.fleetNumber) ||
  toText(row.asset) ||
  toText(row.assetId) ||
  toText(row.imei) ||
  "Unknown asset";

const rowDriver = (row: RawRow): string =>
  toText(row.driverName) || toText(row.name) || toText(row.driver) || toText(row.driverId) || "Unknown driver";

const rowDate = (row: RawRow): Date | null => {
  const raw =
    toText(row.startTime) ||
    toText(row.tripStart) ||
    toText(row.createdAt) ||
    toText(row.timestamp) ||
    toText(row.date);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const iso = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const rangeFromPreset = (preset: string) => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);

  switch (preset) {
    case "Today":
      break;
    case "Yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "This Week": {
      const day = end.getDay();
      const mondayOffset = day === 0 ? 6 : day - 1;
      start.setDate(end.getDate() - mondayOffset);
      break;
    }
    case "This Month":
      start.setDate(1);
      break;
    case "Last 30 Days":
      start.setDate(end.getDate() - 29);
      break;
    default:
      break;
  }

  return { from: iso(start), to: iso(end) };
};

const formatDateLabel = (input: string) => {
  const [year, month, day] = input.split("-");
  if (!year || !month || !day) return input;
  return `${day}/${month}/${year}`;
};

const formatNumber = (value: number) => Math.round(value).toLocaleString();

const seriesMax = (values: number[]) => Math.max(0, ...values);

const scaleBarHeight = (value: number, maxValue: number, maxHeight = 180) => {
  if (value <= 0) return 2;
  if (maxValue <= 0) return 8;
  return Math.max(8, Math.round((value / maxValue) * maxHeight));
};

const denseBarLayout = (count: number) => count >= 12;

const scoreTone = (score: number, amberThreshold: number, redThreshold: number) => {
  if (score > redThreshold) return "red";
  if (score > amberThreshold) return "amber";
  return "green";
};

const sameOrAfter = (date: Date, isoDate: string) => date.getTime() >= new Date(`${isoDate}T00:00:00.000`).getTime();
const sameOrBefore = (date: Date, isoDate: string) => date.getTime() <= new Date(`${isoDate}T23:59:59.999`).getTime();

const classifyTripMode = (row: RawRow): "delivery" | "positioning" | "trip" => {
  const combined = [
    row.tripType,
    row.type,
    row.category,
    row.mode,
    row.journeyType,
    row.purpose,
    row.status,
    row.reason,
    row.notes,
    row.description,
    row.routeType
  ]
    .map((value) => toLower(value))
    .join(" ");

  const hasDeliveryFlag =
    Boolean(toText(row.deliveryId)) ||
    Boolean(toText(row.orderId)) ||
    Boolean(toText(row.invoiceId)) ||
    /\b(delivery|drop\s?off|pick\s?up|dispatch|waybill|consignment)\b/.test(combined);
  if (hasDeliveryFlag) return "delivery";

  const hasPositioningFlag =
    /\b(position|positioning|reposition|deadhead|empty\s?run|yard\s?move|relocation)\b/.test(combined) ||
    toLower(row.isPositioning) === "true";
  if (hasPositioningFlag) return "positioning";

  return "trip";
};

export default function Dashboards() {
  const fleetFilter = useFleetFilterOptional();
  const [activeDashboard, setActiveDashboard] = useState<DashboardKey>("fleet");
  const [datePreset, setDatePreset] = useState<DatePreset>("This Month");
  const initialRange = rangeFromPreset("This Month");
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<DashboardDatePickerTarget>("from");
  const [datePickerValue, setDatePickerValue] = useState(() => new Date());
  const [datePickerMode, setDatePickerMode] = useState<"date" | "time">("date");
  const [assetFilter, setAssetFilter] = useState("All assets");
  const [siteFilter, setSiteFilter] = useState("All sites");
  const [tripMode, setTripMode] = useState("Trips only");
  const [amberThreshold, setAmberThreshold] = useState(2);
  const [redThreshold, setRedThreshold] = useState(5);
  const [barPopup, setBarPopup] = useState<BarPopupState | null>(null);
  const [scorePopup, setScorePopup] = useState<ScorePopupState | null>(null);

  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [filtersDirty, setFiltersDirty] = useState(false);
  const [lastRunLabel, setLastRunLabel] = useState("");
  const [runSummary, setRunSummary] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [dashboardScope, setDashboardScope] = useState<DashboardScopeMap>(EMPTY_DASHBOARD_SCOPE);
  const [assetsRows, setAssetsRows] = useState<RawRow[]>([]);
  const [tripRows, setTripRows] = useState<RawRow[]>([]);
  const [driverRows, setDriverRows] = useState<RawRow[]>([]);
  const [alertRows, setAlertRows] = useState<RawRow[]>([]);
  const [scopeReady, setScopeReady] = useState(false);
  const [trackedDeviceCount, setTrackedDeviceCount] = useState(0);
  const loadRequestId = useRef(0);
  const lastRunSignature = useRef("");

  useEffect(() => {
    if (datePreset === "Custom") return;
    const range = rangeFromPreset(datePreset);
    setFromDate(range.from);
    setToDate(range.to);
  }, [datePreset]);

  const openDashboardDatePicker = (target: DashboardDatePickerTarget) => {
    const source = target === "from" ? fromDate : toDate;
    const parsed = new Date(`${source}T00:00:00.000`);
    setDatePickerTarget(target);
    setDatePickerValue(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
    setDatePickerMode("date");
    setDatePreset("Custom");
    setShowDatePickerModal(true);
  };

  const applyDashboardDatePicker = () => {
    const value = iso(datePickerValue);
    if (datePickerTarget === "from") {
      setFromDate(value);
    } else {
      setToDate(value);
    }
    setDatePreset("Custom");
    setShowDatePickerModal(false);
  };

  useEffect(() => {
    if (!barPopup && !scorePopup) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBarPopup(null);
        setScorePopup(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [barPopup, scorePopup]);

  useEffect(() => {
    let cancelled = false;
    const loadScope = async () => {
      try {
        const [hierarchy, rawAssets] = await Promise.all([getHierarchy(), getAssetsFromApi<any>()]);
        if (cancelled) return;
        setDashboardScope(buildDashboardScopeMap(hierarchy ?? null, rawAssets ?? []));
      } catch {
        if (cancelled) return;
        setDashboardScope(EMPTY_DASHBOARD_SCOPE);
      } finally {
        if (!cancelled) setScopeReady(true);
      }
    };
    void loadScope();
    const handleContextChange = () => {
      setScopeReady(false);
      setHasRun(false);
      setFiltersDirty(false);
      setRunSummary("");
      setLastRunLabel("");
      setTripRows([]);
      setAlertRows([]);
      setDriverRows([]);
      setAssetsRows([]);
      setTrackedDeviceCount(0);
      lastRunSignature.current = "";
      void loadScope();
    };
    window.addEventListener("vivi:orgchange", handleContextChange);
    window.addEventListener("vivi:contextchange", handleContextChange);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:orgchange", handleContextChange);
      window.removeEventListener("vivi:contextchange", handleContextChange);
    };
  }, []);

  const filterSignature = useMemo(
    () => [
      fromDate,
      toDate,
      siteFilter,
      assetFilter,
      tripMode,
      (fleetFilter?.selectedSites ?? []).join("|"),
      (fleetFilter?.selectedAssets ?? []).join("|")
    ].join("~"),
    [fromDate, toDate, siteFilter, assetFilter, tripMode, fleetFilter?.selectedSites, fleetFilter?.selectedAssets]
  );

  useEffect(() => {
    if (!hasRun || !lastRunSignature.current) return;
    setFiltersDirty(lastRunSignature.current !== filterSignature);
  }, [filterSignature, hasRun]);

  const runDashboard = useCallback(async () => {
    if (!scopeReady) return;
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    const signatureAtRun = filterSignature;
    setLoading(true);
    setErrorMessage("");
    try {
      const fleetSites = (fleetFilter?.selectedSites ?? [])
        .map((site) => site.trim())
        .filter((site) => dashboardScope.sites.some((allowed) => siteNamesMatch(allowed, site)));
      const scopedSites = siteFilter !== "All sites"
        ? [siteFilter]
        : fleetSites.length > 0
          ? fleetSites
          : dashboardScope.sites;
      const traccarQuery = {
        fromDate,
        toDate,
        siteFilter: scopedSites.length === 1 ? scopedSites[0] : siteFilter,
        assetFilter,
        scopedSites,
        assetsBySite: dashboardScope.assetsBySite
      };
      const deviceTargets = await resolveDashboardDeviceTargets(traccarQuery);
      if (loadRequestId.current !== requestId) return;
      const [assets, trips, drivers, traccarAlerts, legacyAlerts] = await Promise.all([
        getAssetsFromApi<RawRow>(),
        loadDashboardTripsFromTraccar(traccarQuery),
        getDriversFromApi<RawRow>(),
        loadDashboardAlertsFromTraccar(traccarQuery),
        getAlertsFromApi<RawRow>()
      ]);
      if (loadRequestId.current !== requestId) return;
      const rowOnScopedSite = (row: RawRow) => {
        const site = rowSite(row);
        if (!scopedSites.length) return matchesStoredSiteSelection(site, readStoredSelectionScope());
        return scopedSites.some((scopedSite) => siteNamesMatch(site, scopedSite));
      };
      setTrackedDeviceCount(deviceTargets.length);
      setAssetsRows((Array.isArray(assets) ? assets : []).filter(rowOnScopedSite));
      const filteredTrips = (Array.isArray(trips) ? trips : []).filter((row) => {
        if (!rowOnScopedSite(row)) return false;
        const mode = classifyTripMode(row);
        return tripMode === "Trips and positioning"
          || (tripMode === "Trips only" && mode === "trip")
          || (tripMode === "Deliveries only" && mode === "delivery");
      });
      setTripRows(filteredTrips);
      setDriverRows((Array.isArray(drivers) ? drivers : []).filter(rowOnScopedSite));
      const mergedAlerts = (Array.isArray(traccarAlerts) && traccarAlerts.length > 0)
        ? traccarAlerts
        : (Array.isArray(legacyAlerts) ? legacyAlerts : []);
      setAlertRows(mergedAlerts.filter(rowOnScopedSite));
      const tripCount = filteredTrips.length;
      const deviceCount = deviceTargets.length;
      const siteLabel = scopedSites.length === 1
        ? scopedSites[0]
        : `${scopedSites.length} sites in this database`;
      setRunSummary(`${tripCount.toLocaleString()} trips from ${deviceCount.toLocaleString()} tracked devices on ${siteLabel}.`);
      setLastRunLabel(new Date().toLocaleString());
      lastRunSignature.current = signatureAtRun;
      setFiltersDirty(false);
      setHasRun(true);
    } catch {
      if (loadRequestId.current !== requestId) return;
      setErrorMessage("Unable to load dashboard metrics.");
    } finally {
      if (loadRequestId.current === requestId) setLoading(false);
    }
  }, [
    scopeReady,
    filterSignature,
    fleetFilter?.selectedSites,
    siteFilter,
    dashboardScope.sites,
    dashboardScope.assetsBySite,
    fromDate,
    toDate,
    assetFilter,
    tripMode
  ]);

  const rangeLabel = useMemo(() => {
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    const dayCount = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
      ? 1
      : Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    const granularity = dayCount <= 1 ? "hourly view" : dayCount <= 31 ? "daily view" : "weekly view";
    return `${formatDateLabel(fromDate)} – ${formatDateLabel(toDate)} (${granularity})`;
  }, [fromDate, toDate]);

  const siteLevelSelection = selectionIsSiteLevel();

  const allSites = useMemo(() => {
    if (siteLevelSelection) return dashboardScope.sites;
    if (dashboardScope.sites.length > 0) return ["All sites", ...dashboardScope.sites];
    return ["All sites"];
  }, [dashboardScope.sites, siteLevelSelection]);

  const assetScopeSites = useMemo(() => {
    if (siteFilter !== "All sites") return [siteFilter];
    const fleetSites = (fleetFilter?.selectedSites ?? [])
      .map((site) => site.trim())
      .filter((site) => dashboardScope.sites.some((allowed) => siteNamesMatch(allowed, site)));
    if (fleetSites.length === 1) return fleetSites;
    if (siteLevelSelection && dashboardScope.sites.length === 1) return dashboardScope.sites;
    return [];
  }, [siteFilter, fleetFilter?.selectedSites, siteLevelSelection, dashboardScope.sites]);

  const allAssets = useMemo(
    () => ["All assets", ...assetsForSites(dashboardScope, assetScopeSites)],
    [dashboardScope, assetScopeSites]
  );

  const assetChoices = useMemo(
    () => allAssets.filter((item) => item !== "All assets"),
    [allAssets]
  );

  useEffect(() => {
    if (!scopeReady || allSites.length === 0) return;
    if (!allSites.includes(siteFilter)) setSiteFilter(allSites[0]);
  }, [allSites, siteFilter, scopeReady]);

  useEffect(() => {
    if (!allAssets.includes(assetFilter)) setAssetFilter("All assets");
  }, [allAssets, assetFilter]);

  const fleetSitesInScope = useMemo(
    () => (fleetFilter?.selectedSites ?? [])
      .map((site) => site.trim())
      .filter((site) => dashboardScope.sites.some((allowed) => siteNamesMatch(allowed, site))),
    [fleetFilter?.selectedSites, dashboardScope.sites]
  );

  const fleetAssetsInScope = useMemo(
    () => (fleetFilter?.selectedAssets ?? []).filter((asset) => assetChoices.includes(asset)),
    [fleetFilter?.selectedAssets, assetChoices]
  );

  const selectedTrips = useMemo(() => {
    const selection = readStoredSelectionScope();
    return tripRows.filter((row) => {
      const siteMatch = siteMatchesFilter(row, siteFilter) && matchesStoredSiteSelection(rowSite(row), selection);
      const assetMatch = assetFilter === "All assets" || rowAsset(row) === assetFilter;
      const date = rowDate(row);
      const dateMatch = date ? sameOrAfter(date, fromDate) && sameOrBefore(date, toDate) : true;

      const mode = classifyTripMode(row);
      const modeMatch =
        tripMode === "Trips and positioning" ||
        (tripMode === "Trips only" && mode === "trip") ||
        (tripMode === "Deliveries only" && mode === "delivery");

      const fleetSiteOk = fleetSitesInScope.length === 0 || fleetSitesInScope.some((site) => siteNamesMatch(site, rowSite(row)));
      const fleetAssetOk = fleetAssetsInScope.length === 0 || fleetAssetsInScope.includes(rowAsset(row));

      return siteMatch && assetMatch && dateMatch && modeMatch && fleetSiteOk && fleetAssetOk;
    });
  }, [tripRows, siteFilter, assetFilter, fromDate, toDate, tripMode, fleetSitesInScope, fleetAssetsInScope]);

  const selectedAssets = useMemo(() => {
    const selection = readStoredSelectionScope();
    return assetsRows.filter((row) => {
      const siteMatch = siteMatchesFilter(row, siteFilter) && matchesStoredSiteSelection(rowSite(row), selection);
      const assetMatch = assetFilter === "All assets" || rowAsset(row) === assetFilter;
      const fleetSiteOk = fleetSitesInScope.length === 0 || fleetSitesInScope.some((site) => siteNamesMatch(site, rowSite(row)));
      const fleetAssetOk = fleetAssetsInScope.length === 0 || fleetAssetsInScope.includes(rowAsset(row));
      return siteMatch && assetMatch && fleetSiteOk && fleetAssetOk;
    });
  }, [assetsRows, siteFilter, assetFilter, fleetSitesInScope, fleetAssetsInScope]);

  const selectedAlerts = useMemo(() => {
    return alertRows.filter((row) => {
      const siteMatch = siteMatchesFilter(row, siteFilter);
      const assetMatch = assetFilter === "All assets" || rowAsset(row) === assetFilter;
      const date = rowDate(row);
      const dateMatch = date ? sameOrAfter(date, fromDate) && sameOrBefore(date, toDate) : true;
      const fleetSiteOk = fleetSitesInScope.length === 0 || fleetSitesInScope.some((site) => siteNamesMatch(site, rowSite(row)));
      const fleetAssetOk = fleetAssetsInScope.length === 0 || fleetAssetsInScope.includes(rowAsset(row));
      return siteMatch && assetMatch && dateMatch && fleetSiteOk && fleetAssetOk;
    });
  }, [alertRows, siteFilter, assetFilter, fromDate, toDate, fleetSitesInScope, fleetAssetsInScope]);

  const selectedDrivers = useMemo(() => {
    return driverRows.filter((row) => {
      const siteMatch = siteMatchesFilter(row, siteFilter);
      const fleetSiteOk = fleetSitesInScope.length === 0 || fleetSitesInScope.some((site) => siteNamesMatch(site, rowSite(row)));
      return siteMatch && fleetSiteOk;
    });
  }, [driverRows, siteFilter, fleetSitesInScope]);

  const totalDistanceKm = useMemo(
    () =>
      selectedTrips.reduce(
        (sum, row) => sum + getVerifiedTripDistanceKm(row),
        0
      ),
    [selectedTrips]
  );

  const daysCount = useMemo(() => {
    const from = new Date(`${fromDate}T00:00:00.000`);
    const to = new Date(`${toDate}T00:00:00.000`);
    const diff = Math.max(0, to.getTime() - from.getTime());
    return Math.max(1, Math.floor(diff / 86400000) + 1);
  }, [fromDate, toDate]);

  const assetCount = Math.max(1, new Set(selectedAssets.map((row) => rowAsset(row))).size);
  const totalTrips = selectedTrips.length;
  const activeAssetCount = useMemo(
    () => new Set(selectedTrips.map((row) => rowAsset(row))).size,
    [selectedTrips]
  );
  const totalDurationMins = useMemo(
    () => selectedTrips.reduce((sum, row) => sum + getVerifiedTripDurationMinutes(row), 0),
    [selectedTrips]
  );
  const modeSummary = `Filtered mode: ${tripMode} · ${totalTrips.toLocaleString()} trips · ${trackedDeviceCount} tracked devices`;

  const fleetUtilisationTotal = useMemo(() => {
    const fleetSize = Math.max(trackedDeviceCount, assetCount);
    if (fleetSize <= 0 || activeAssetCount <= 0) return 0;
    return Math.min(100, Math.round((activeAssetCount / fleetSize) * 100));
  }, [trackedDeviceCount, assetCount, activeAssetCount]);

  const distanceTotals = useMemo(
    () => [
      { label: "Total trips", value: formatNumber(totalTrips), icon: "TR" },
      { label: "Total km", value: formatNumber(totalDistanceKm), icon: "KM" },
      { label: "Total driving mins", value: formatNumber(totalDurationMins), icon: "MIN" },
      { label: "Fleet utilisation", value: `${fleetUtilisationTotal}%`, icon: "UTL" }
    ],
    [totalTrips, totalDistanceKm, totalDurationMins, fleetUtilisationTotal]
  );

  const distanceKpis = useMemo(
    () => [
      { label: "Avg km/asset/day", value: safeRatio(totalDistanceKm, assetCount * daysCount).toFixed(2), icon: "KM" },
      { label: "Avg trips/asset/day", value: safeRatio(totalTrips, assetCount * daysCount).toFixed(2), icon: "TR" },
      { label: "Avg km/trip", value: safeRatio(totalDistanceKm, totalTrips).toFixed(2), icon: "AVG" }
    ],
    [totalDistanceKm, assetCount, daysCount, totalTrips]
  );

  const byDay = useMemo(() => {
    const base = buildTimelineBuckets(fromDate, toDate);

    selectedTrips.forEach((row) => {
      const date = rowDate(row);
      if (!date) return;
      const bucket = base.find((item) => item.match(date));
      if (!bucket) return;
      bucket.tripCount += 1;
      bucket.distance += getVerifiedTripDistanceKm(row);
      bucket.duration += getVerifiedTripDurationMinutes(row);
      bucket.activeAssets.add(rowAsset(row));
      const site = rowSite(row);
      bucket.siteCounts.set(site, (bucket.siteCounts.get(site) ?? 0) + 1);
    });

    const fleetAssetCount = Math.max(
      trackedDeviceCount,
      new Set(selectedAssets.map((row) => rowAsset(row))).size,
      new Set(selectedTrips.map((row) => rowAsset(row))).size
    );
    const totalKnownAssets = Math.max(1, fleetAssetCount);

    return base.map((bucket) => {
      const bestSite = Array.from(bucket.siteCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? (siteFilter === "All sites" ? "Mixed sites" : siteFilter);
      const utilisationPct = bucket.tripCount > 0
        ? Math.min(100, Math.round((bucket.activeAssets.size / totalKnownAssets) * 100))
        : 0;
      return {
        label: bucket.label,
        utilisation: utilisationPct,
        duration: Math.round(bucket.duration),
        distance: Math.round(bucket.distance),
        site: bestSite,
        color: bucket.color
      };
    });
  }, [selectedTrips, selectedAssets, siteFilter, fromDate, toDate, trackedDeviceCount]);

  const fleetUtilisation: MetricBar[] = byDay.map((row) => ({ label: row.label, value: row.utilisation, site: row.site }));
  const drivingAndIdling: MetricBar[] = byDay.map((row) => ({ label: row.label, value: row.duration, site: row.site }));
  const distanceByDay: MetricBar[] = byDay.map((row) => ({ label: row.label, value: row.distance, site: row.site, color: row.color }));

  const movementByHour: MetricBar[] = useMemo(() => {
    const base = hourLabels.map((label, index) => ({
      label,
      value: 0,
      site: siteFilter === "All sites" ? "Mixed sites" : siteFilter,
      siteCounts: new Map<string, number>(),
      color: index >= 17 || index < 5 ? "#1d4ed8" : "#60a5fa"
    }));

    selectedTrips.forEach((row) => {
      const date = rowDate(row);
      if (!date) return;
      const bucket = base[date.getHours()];
      if (!bucket) return;
      bucket.value += 1;
      const site = rowSite(row);
      bucket.siteCounts.set(site, (bucket.siteCounts.get(site) ?? 0) + 1);
    });

    return base.map((bucket) => ({
      label: bucket.label,
      value: bucket.value,
      site: Array.from(bucket.siteCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? bucket.site,
      color: bucket.color
    }));
  }, [selectedTrips, siteFilter]);

  const isHourlyView = daysCount <= 1;
  const bucketCount = byDay.length;
  const denseBars = denseBarLayout(bucketCount);
  const fleetUtilMax = seriesMax(fleetUtilisation.map((item) => item.value));
  const drivingMax = seriesMax(drivingAndIdling.map((item) => item.value));
  const distanceMax = seriesMax(distanceByDay.map((item) => item.value));
  const movementMax = seriesMax(movementByHour.map((item) => item.value));

  const chartPanelClass = () =>
    ["util-panel", denseBars ? "util-panel-chart" : ""].filter(Boolean).join(" ");

  const barChartClass = (tone: string) =>
    ["util-bars", tone, denseBars ? "util-bars-dense" : "", bucketCount >= 12 ? "util-bars-scroll" : ""]
      .filter(Boolean)
      .join(" ");

  const afterHours = useMemo(() => {
    const total = Math.max(1, selectedTrips.length);
    const after = selectedTrips.filter((row) => {
      const date = rowDate(row);
      if (!date) return false;
      const h = date.getHours();
      return h >= 17 || h < 5;
    }).length;
    return { after, total, percent: Math.round((after / total) * 1000) / 10 };
  }, [selectedTrips]);

  const driverScores: ScoreRow[] = useMemo(() => {
    const rows = selectedDrivers.slice(0, 25).map((row, index) => {
      const explicit =
        toNumber(row.score) || toNumber(row.riskScore) || toNumber(row.safetyScore) || toNumber(row.performanceScore);
      const inferredEvents =
        toNumber(row.harshEvents) +
        toNumber(row.overspeedEvents) +
        toNumber(row.idleEvents) +
        toNumber(row.violations) +
        toNumber(row.fatigueEvents);
      const score = explicit > 0 ? explicit : Math.min(10, Math.max(0, inferredEvents || (selectedAlerts.length / Math.max(1, selectedDrivers.length)) + index * 0.1));
      return { name: rowDriver(row), score: Number(score.toFixed(1)), site: rowSite(row) };
    });
    return rows.length ? rows : [{ name: "No driver data", score: 0, site: siteFilter === "All sites" ? "-" : siteFilter }];
  }, [selectedDrivers, selectedAlerts.length, siteFilter]);

  const assetScores: ScoreRow[] = useMemo(() => {
    const alertCountByAsset = new Map<string, number>();
    selectedAlerts.forEach((row) => {
      const key = rowAsset(row);
      alertCountByAsset.set(key, (alertCountByAsset.get(key) ?? 0) + 1);
    });
    const tripCountByAsset = new Map<string, number>();
    selectedTrips.forEach((row) => {
      const key = rowAsset(row);
      tripCountByAsset.set(key, (tripCountByAsset.get(key) ?? 0) + 1);
    });

    const rows = selectedAssets.slice(0, 25).map((row) => {
      const name = rowAsset(row);
      const explicit = toNumber(row.score) || toNumber(row.riskScore) || toNumber(row.healthScore);
      const alerts = alertCountByAsset.get(name) ?? 0;
      const trips = Math.max(1, tripCountByAsset.get(name) ?? 0);
      const inferred = Math.min(10, (alerts / trips) * 4 + toNumber(row.idleHours) * 0.05 + toNumber(row.serviceOverdueDays) * 0.02);
      const score = explicit > 0 ? explicit : inferred;
      return { name, score: Number(score.toFixed(1)), site: rowSite(row) };
    });

    return rows.length ? rows : [{ name: "No asset data", score: 0, site: siteFilter === "All sites" ? "-" : siteFilter }];
  }, [selectedAssets, selectedAlerts, selectedTrips, siteFilter]);

  const safeAmber = Math.max(0, Math.min(amberThreshold, redThreshold));
  const safeRed = Math.max(safeAmber, redThreshold);
  const thresholdDescription = `Red > ${safeRed} | Amber > ${safeAmber} and <= ${safeRed} | Green <= ${safeAmber}`;
  const dashboardTitle = dashboardOptions.find((item) => item.key === activeDashboard)?.label ?? "Fleet Utilisation (Default)";
  const openBarPopup = (popupId: string, item: MetricBar, valueLabel: string) => {
    setScorePopup(null);
    setBarPopup((current) => {
      if (current?.id === popupId) return null;
      return {
        id: popupId,
        dateTimeLabel: `${item.label} · ${rangeLabel}`,
        valueLabel,
        site: item.site
      };
    });
  };

  const openScorePopup = (popupId: string, site: string, valueLabel: string) => {
    setBarPopup(null);
    setScorePopup((current) => {
      if (current?.id === popupId) return null;
      return { id: popupId, site, valueLabel };
    });
  };

  const renderMetricLeaflet = (popup: BarPopupState | null) => {
    if (!popup) return null;
    return (
      <div className="util-inline-popup">
        <div className="easytrack-popup">
          <div className="easytrack-popup-title">Metric details</div>
          <div className="easytrack-popup-body">
            <div className="easytrack-popup-row">
              <span>Date and time</span>
              <div>{popup.dateTimeLabel}</div>
            </div>
            <div className="easytrack-popup-row">
              <span>Site</span>
              <div>{popup.site}</div>
            </div>
            <div className="easytrack-popup-row">
              <span>Value</span>
              <strong>{popup.valueLabel}</strong>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderScoreLeaflet = (popup: ScorePopupState | null) => {
    if (!popup) return null;
    return (
      <div className="util-inline-popup util-inline-popup-score">
        <div className="easytrack-popup">
          <div className="easytrack-popup-title">Score details</div>
          <div className="easytrack-popup-body">
            <div className="easytrack-popup-row">
              <span>Site</span>
              <div>{popup.site}</div>
            </div>
            <div className="easytrack-popup-row">
              <span>Score value</span>
              <strong>{popup.valueLabel}</strong>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const showUtilisationPanels = activeDashboard === "fleet" || activeDashboard === "trip" || activeDashboard === "fuel" || activeDashboard === "maintenance" || activeDashboard === "cost" || activeDashboard === "safety";
  const showDriverScorecard = activeDashboard === "driver";
  const showAssetScorecard = activeDashboard === "asset";

  return (
    <div className="page util-page">
      <FleetFilterBar
        showDbProfile
        siteOptions={allSites.filter((s) => s !== "All sites")}
        assetOptions={assetChoices}
        restrictAssetsToOptions
        restrictSitesToOptions
        assetEmptyLabel={
          assetChoices.length > 0
            ? undefined
            : assetScopeSites.length === 0
              ? "Select a site to list assets"
              : "No assets on this site"
        }
      />
      <div className="util-toolbar">
        <div className="util-breadcrumb">Dashboards - {dashboardTitle}</div>
        <div className="util-toolbar-actions">
          <select className="util-select" value={activeDashboard} onChange={(event) => setActiveDashboard(event.target.value as DashboardKey)}>
            {dashboardOptions.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
          <button className="util-icon-btn" aria-label="Add widget">+</button>
        </div>
      </div>

      <div className="util-filters util-filters-grid">
        <label className="util-filter-field">
          Date range
          <select value={datePreset} onChange={(event) => setDatePreset(event.target.value as DatePreset)}>
            {datePresets.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="util-filter-field">
          Asset scope
          <select
            value={assetFilter}
            disabled={assetScopeSites.length === 0}
            onChange={(event) => setAssetFilter(event.target.value)}
          >
            {assetScopeSites.length === 0 ? (
              <option value="All assets">Select a site first</option>
            ) : allAssets.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          {assetScopeSites.length === 0 ? (
            <span className="util-filter-hint">
              {fleetSitesInScope.length > 1
                ? "Pick one site to list its assets. Assets are not shared across sites."
                : "Assets stay on one site. Choose a site before picking assets."}
            </span>
          ) : null}
        </label>
        <label className="util-filter-field">
          Site scope
          <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}>
            {allSites.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="util-filter-field">
          Mode
          <select value={tripMode} onChange={(event) => setTripMode(event.target.value)}>
            {tripModes.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      {datePreset === "Custom" ? (
        <div className="util-filters util-filters-grid util-filters-custom">
          <label className="util-filter-field">
            From
            <button type="button" className="util-date-button" onClick={() => openDashboardDatePicker("from")}>
              {formatDateLabel(fromDate)}
            </button>
          </label>
          <label className="util-filter-field">
            To
            <button type="button" className="util-date-button" onClick={() => openDashboardDatePicker("to")}>
              {formatDateLabel(toDate)}
            </button>
          </label>
        </div>
      ) : null}

      <ScheduleDateTimePicker
        open={showDatePickerModal}
        showTime={false}
        restrictToPast
        title={datePickerTarget === "from" ? "Select start date" : "Select end date"}
        date={datePickerValue}
        time="00:00"
        mode={datePickerMode}
        onClose={() => setShowDatePickerModal(false)}
        onConfirm={applyDashboardDatePicker}
        onDateChange={setDatePickerValue}
        onTimeChange={() => undefined}
        onModeChange={setDatePickerMode}
      />

      <div className="util-run-row">
        <button
          type="button"
          className={`util-run-btn${loading ? " is-loading" : ""}`}
          onClick={() => void runDashboard()}
          disabled={loading || !scopeReady}
          aria-busy={loading}
        >
          {loading ? (
            <>
              <span className="util-run-spinner" aria-hidden="true" />
              Running…
            </>
          ) : "Run"}
        </button>
        <div className="util-run-status" aria-live="polite">
          {!scopeReady
            ? "Loading sites…"
            : loading
              ? "Running the dashboard query for the selected site."
              : !hasRun
                ? "Click Run to load km, trips, and utilisation. Figures stay empty until the query finishes."
                : filtersDirty
                  ? `Filters changed since ${lastRunLabel}. Click Run to refresh.`
                  : `Last run ${lastRunLabel}. ${runSummary}`}
        </div>
      </div>

      {hasRun ? <div className="util-muted" aria-live="polite">{modeSummary}</div> : null}

      {errorMessage ? <div className="util-placeholder">{errorMessage}</div> : null}

      {!hasRun ? (
        <div className="util-placeholder">
          {loading ? "Running dashboard query…" : "Click Run to load dashboard data for the selected site."}
        </div>
      ) : (
      <div className="util-grid" aria-busy={loading}>
        <section className="util-panel">
          <div className="util-panel-header">
            <div>
              <p className="util-eyebrow">Control fleet utilisation</p>
              <h3>Km and trip insights</h3>
              <p className="util-range">{rangeLabel} - {assetFilter} - {siteFilter}</p>
            </div>
            <div className="util-panel-icons">...</div>
          </div>

          <div className="util-distance-block">
            <div className="util-distance-main">
              <p className="util-muted">Distance ({tripMode})</p>
              <div className="util-distance-value">{formatNumber(totalDistanceKm)} <span>km</span></div>
              <p className="util-muted">{activeAssetCount} active assets in range</p>
            </div>
            <div className="util-distance-section">
              <p className="util-distance-section-title">Totals</p>
              <div className="util-distance-metrics util-distance-totals">
                {distanceTotals.map((item) => (
                  <div key={item.label} className="util-distance-item">
                    <span className="util-distance-icon" aria-hidden="true">{item.icon}</span>
                    <div className="util-distance-value-sm">{item.value}</div>
                    <div className="util-muted">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="util-distance-section">
              <p className="util-distance-section-title">Averages</p>
              <div className="util-distance-metrics">
                {distanceKpis.map((kpi) => (
                  <div key={kpi.label} className="util-distance-item">
                    <span className="util-distance-icon" aria-hidden="true">{kpi.icon}</span>
                    <div className="util-distance-value-sm">{kpi.value}</div>
                    <div className="util-muted">{kpi.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={chartPanelClass()}>
          <div className="util-panel-header"><div><p className="util-eyebrow">Control fleet utilisation</p><h3>Fleet utilisation %</h3><p className="util-range">{rangeLabel}</p></div><div className="util-panel-icons">...</div></div>
          <div className="util-verified-chip">Data verified</div>
          <div className="util-chart-scroll">
            <div className={barChartClass("util-bars-amber")}>
              {fleetUtilisation.map((item) => (
                <div key={item.label} className={`util-bar-col${denseBars ? " util-bar-col-dense" : ""}`}>
                  {(() => {
                    const popupId = `fleet:${item.label}`;
                    return (
                      <>
                  <button
                    type="button"
                    className="util-bar-trigger"
                    onClick={() => openBarPopup(popupId, item, `${item.value}%`)}
                    aria-label={`Open details for ${item.label} fleet utilisation`}
                  >
                    <div className="util-bar" style={{ height: `${scaleBarHeight(item.value, fleetUtilMax, 160)}px` }} />
                    <span className="util-bar-label">{item.label}</span>
                  </button>
                  {barPopup?.id === popupId ? renderMetricLeaflet(barPopup) : null}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
          <div className="util-legend"><span className="util-dot util-dot-low" /> 0-39%<span className="util-dot util-dot-med" /> 40-94%<span className="util-dot util-dot-high" /> {">="}95%</div>
        </section>

        <section className={chartPanelClass()}>
          <div className="util-panel-header"><div><p className="util-eyebrow">Control fleet utilisation</p><h3>Driving and idling time</h3><p className="util-range">{rangeLabel}</p></div><div className="util-panel-icons">...</div></div>
          <div className="util-verified-chip">Data verified</div>
          <div className="util-chart-scroll">
            <div className={barChartClass("util-bars-blue")}>
              {drivingAndIdling.map((item) => (
                <div key={item.label} className={`util-bar-col${denseBars ? " util-bar-col-dense" : ""}`}>
                  {(() => {
                    const popupId = `idling:${item.label}`;
                    return (
                      <>
                  <button
                    type="button"
                    className="util-bar-trigger"
                    onClick={() => openBarPopup(popupId, item, `${item.value} mins`)}
                    aria-label={`Open details for ${item.label} driving and idling time`}
                  >
                    <div className="util-bar util-bar-blue" style={{ height: `${scaleBarHeight(item.value, drivingMax, 160)}px` }} />
                    <span className="util-bar-label">{item.label}</span>
                  </button>
                  {barPopup?.id === popupId ? renderMetricLeaflet(barPopup) : null}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={chartPanelClass()}>
          <div className="util-panel-header"><div><p className="util-eyebrow">Control fleet utilisation</p><h3>Movement by hour of day</h3><p className="util-range">{rangeLabel}</p></div><div className="util-panel-icons">...</div></div>
          <div className="util-verified-chip">Data verified</div>
          <div className="util-chart-scroll">
            <div className={barChartClass("util-bars-hours")}>
              {movementByHour.map((item) => (
                <div key={item.label} className="util-bar-col util-bar-col-hour util-bar-col-dense">
                  {(() => {
                    const popupId = `hour:${item.label}`;
                    return (
                      <>
                  <button
                    type="button"
                    className="util-bar-trigger"
                    onClick={() => openBarPopup(popupId, item, `${formatNumber(item.value)} trips`)}
                    aria-label={`Open details for ${item.label} movement by hour`}
                  >
                    <div
                      className="util-bar util-bar-hour"
                      style={{
                        height: `${scaleBarHeight(item.value, movementMax, 140)}px`,
                        background: item.color
                      }}
                    />
                    <span className="util-bar-label util-bar-label-hour">{item.label.slice(0, 2)}</span>
                  </button>
                  {barPopup?.id === popupId ? renderMetricLeaflet(barPopup) : null}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
          <div className="util-muted">{loading ? "Loading data..." : `Trips in selection: ${totalTrips}`}</div>
        </section>

        <section className={chartPanelClass()}>
          <div className="util-panel-header"><div><p className="util-eyebrow">Control fleet utilisation</p><h3>{isHourlyView ? "Distance by hour" : "Distance / day of week"}</h3><p className="util-range">{rangeLabel}</p></div><div className="util-panel-icons">...</div></div>
          <div className="util-verified-chip">Data verified</div>
          <div className="util-chart-scroll">
            <div className={barChartClass("util-bars-Vivied")}>
              {distanceByDay.map((item) => (
                <div key={item.label} className={`util-bar-col${denseBars ? " util-bar-col-dense" : ""}`}>
                  {(() => {
                    const popupId = `distance:${item.label}`;
                    return (
                      <>
                  <button
                    type="button"
                    className="util-bar-trigger"
                    onClick={() => openBarPopup(popupId, item, `${formatNumber(item.value)} km`)}
                    aria-label={`Open details for ${item.label} distance`}
                  >
                    <div className="util-bar util-bar-Vivied" style={{ height: `${scaleBarHeight(item.value, distanceMax, 160)}px`, background: item.color }} />
                    <span className="util-bar-label">{item.label}</span>
                  </button>
                  {barPopup?.id === popupId ? renderMetricLeaflet(barPopup) : null}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="util-panel util-panel-chart">
          <div className="util-panel-header"><div><p className="util-eyebrow">Control fleet utilisation</p><h3>After work hour analysis (5pm to 5am)</h3><p className="util-range">{rangeLabel}</p></div><div className="util-panel-icons">...</div></div>
          <div className="util-verified-chip">Data verified</div>
          <div className="util-donut">
            <div className="util-donut-ring" style={{ background: `conic-gradient(#3b82f6 0% ${afterHours.percent}%, #d1d5db ${afterHours.percent}% 100%)` }} />
            <div className="util-donut-label"><div className="util-donut-percent">{afterHours.percent}%</div><div>{afterHours.after} after-hours</div><div>{afterHours.total - afterHours.after} work-hours</div></div>
          </div>
        </section>

        {showDriverScorecard ? (
        <section className="util-panel">
          <div className="util-panel-header"><div><p className="util-eyebrow">Driver scorecard</p><h3>Risk score by driver</h3><p className="util-range">{rangeLabel}</p></div><div className="util-panel-icons">...</div></div>
          <div className="util-threshold-controls">
            <label>Amber threshold ({">"}2 and {"<="} red)
              <input type="number" step="0.1" min={0} value={amberThreshold} onChange={(e) => setAmberThreshold(Number(e.target.value) || 0)} />
            </label>
            <label>Red threshold ({">"}5 default)
              <input type="number" step="0.1" min={0} value={redThreshold} onChange={(e) => setRedThreshold(Number(e.target.value) || 0)} />
            </label>
          </div>
          <div className="util-muted">{thresholdDescription}</div>
          <div className="util-score-list">
            {driverScores.map((row) => {
              const tone = scoreTone(row.score, safeAmber, safeRed);
              const popupId = `driver-score:${row.name}`;
              return (
                <div key={row.name} className="util-score-item">
                  <button
                    type="button"
                    className="util-score-row util-score-row-button"
                    onClick={() => openScorePopup(popupId, row.site, row.score.toFixed(1))}
                    aria-label={`Open score details for ${row.name}`}
                  >
                    <div><strong>{row.name}</strong><small>{row.site}</small></div>
                    <span className={`util-score-badge util-score-${tone}`}>{row.score.toFixed(1)}</span>
                  </button>
                  {scorePopup?.id === popupId ? renderScoreLeaflet(scorePopup) : null}
                </div>
              );
            })}
          </div>
        </section>
        ) : null}

        {showAssetScorecard ? (
        <section className="util-panel">
          <div className="util-panel-header"><div><p className="util-eyebrow">Asset scorecard</p><h3>Risk score by asset</h3><p className="util-range">{rangeLabel}</p></div><div className="util-panel-icons">...</div></div>
          <div className="util-score-list">
            {assetScores.map((row) => {
              const tone = scoreTone(row.score, safeAmber, safeRed);
              const popupId = `asset-score:${row.name}`;
              return (
                <div key={row.name} className="util-score-item">
                  <button
                    type="button"
                    className="util-score-row util-score-row-button"
                    onClick={() => openScorePopup(popupId, row.site, row.score.toFixed(1))}
                    aria-label={`Open score details for ${row.name}`}
                  >
                    <div><strong>{row.name}</strong><small>{row.site}</small></div>
                    <span className={`util-score-badge util-score-${tone}`}>{row.score.toFixed(1)}</span>
                  </button>
                  {scorePopup?.id === popupId ? renderScoreLeaflet(scorePopup) : null}
                </div>
              );
            })}
          </div>
        </section>
        ) : null}
      </div>
      )}

    </div>
  );
}
