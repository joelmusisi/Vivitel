import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScheduleDateTimePicker from "../components/ScheduleDateTimePicker";
import { getAssetsFromApi, getDriversFromApi, getSiteTimeZoneSettings, type SiteTimeZoneSettings } from "../utils/api";
import {
  loadNotificationPickerEventsForSite,
  NOTIFICATION_LIBRARY_UPDATED_EVENT,
  readActiveSiteName
} from "../utils/notificationLibraryStore";
import { filterForSiteScope, filterRecordsForActiveSelection } from "../utils/scopeStorage";
import {
  matchesStoredSiteSelection,
  normalizeSelectionText,
  readScopeNaming,
  readStoredSelectionScope
} from "../utils/selectionScope";
import {
  cms808DisplayTime,
  cms808MatchesAsset,
  cms808SiteName,
  cms808VehicleToAssetRecord,
  buildCms808PlaybackPlayerUrl,
  isCms808PlayerUrl,
  loadCms808Evidence,
  loadCms808VehiclesForActiveHierarchy,
  type Cms808EvidenceItem
} from "../utils/cms808";
import "../index.css";

const roundBtn: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: "50%",
  border: "1px solid #cbd5e1",
  background: "linear-gradient(180deg,#ffffff,#f1f5f9)",
  color: "#0f172a",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15,23,42,.12)"
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "linear-gradient(135deg,#34a98f,#1f7a68)",
  color: "#fff",
  border: 0,
  borderRadius: 999,
  padding: "9px 20px",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(31,122,104,.35)"
};

const ghostBtn: React.CSSProperties = {
  background: "#f1f5f9",
  color: "#334155",
  border: "1px solid #e2e8f0",
  borderRadius: 999,
  padding: "8px 18px",
  fontWeight: 600,
  cursor: "pointer"
};
const textOf = (value: unknown) => String(value ?? "").trim();

const compactAssetId = (value: string) => value.replace(/^asset-/i, "");

const matchesPickerQuery = (query: string, parts: unknown[]) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return parts.map((part) => textOf(part).toLowerCase()).join(" ").includes(needle);
};

const assetHasLiveCamera = (row: Record<string, unknown>) =>
  Boolean(
    textOf(row.cameraSerial) ||
      textOf(row.devIdno) ||
      textOf(row.deviceId) ||
      textOf(row.camera) ||
      textOf(row.cameraModel) ||
      textOf(row.cameraComponents) ||
      textOf(row.hasCamera).toLowerCase() === "true" ||
      textOf(row.hasCamera).toLowerCase() === "yes" ||
      Number(row.channelCount) > 0
  );

const matchesGalleryHierarchy = (row: Record<string, unknown>) => {
  const selection = readStoredSelectionScope();
  if (!matchesStoredSiteSelection(row.site, selection)) return false;
  const naming = readScopeNaming();
  const expectedDb = normalizeSelectionText(naming.database);
  const rowDb = normalizeSelectionText(row.database ?? row.organisation ?? row.contact);
  if (expectedDb && rowDb && rowDb !== expectedDb) return false;
  return Boolean(textOf(row.site));
};

const filterIcons = [
  { key: "assets", label: "Assets", symbol: "📷", tooltip: "Assets" },
  { key: "driver", label: "Driver", symbol: "🚗", tooltip: "Drivers" },
  { key: "event", label: "Notification", symbol: "⚠️", tooltip: "Notifications" },
  { key: "location", label: "Location", symbol: "📍", tooltip: "Locations" }
];

type GalleryAssetRow = {
  id: string;
  description: string;
  registration: string;
  make: string;
  model: string;
  channels: string;
  peripheral: string;
  site: string;
};

type GalleryDriverRow = { id: string; name: string; site: string };

type EventPickerRow = { id: string; name: string; type: string };

type VideoGalleryProps = {
  embed?: boolean;
};

export default function VideoGallery({ embed = false }: VideoGalleryProps) {
  const navigate = useNavigate();
  const [startDateObj, setStartDateObj] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 0, 0);
  });
  const [endDateObj, setEndDateObj] = useState(() => new Date());
  const [rawEvidenceItems, setRawEvidenceItems] = useState<Cms808EvidenceItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"start" | "end">("start");
  const [pickerDateObj, setPickerDateObj] = useState(() => new Date());
  const [pickerTime, setPickerTime] = useState("00:00");
  const [activePicker, setActivePicker] = useState<"date" | "time">("date");
  const posterFor = (item: Cms808EvidenceItem): string | undefined => {
    let best: Cms808EvidenceItem | undefined;
    let bestGap = Infinity;
    for (const candidate of rawEvidenceItems) {
      if (candidate.mediaKind !== "image" || !candidate.url || candidate.deviceId !== item.deviceId) continue;
      const gap = Math.abs(candidate.atMs - item.atMs);
      if (gap < bestGap) {
        best = candidate;
        bestGap = gap;
      }
    }
    return best?.url;
  };
  const [playerItem, setPlayerItem] = useState<Cms808EvidenceItem | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveSelection, setSaveSelection] = useState<string[]>([]);
  const playerVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  useEffect(() => {
    if (!playerItem) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
        return;
      }
      if (saveOpen) setSaveOpen(false);
      else setPlayerItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerItem, saveOpen]);
  const channelOf = (clip: Cms808EvidenceItem) => {
    const match = /CH(?:N)?[=\s]?(\d+)/i.exec(`${clip.alarmType} ${clip.url}`);
    return match ? Number(match[1]) : undefined;
  };
  const CHANNEL_NAMES = ["Road Cam", "Incab", "DMS", "External L", "External R"];
  const channelLabel = (clip: Cms808EvidenceItem, index: number) => {
    const channel = channelOf(clip);
    const name = channel !== undefined ? CHANNEL_NAMES[channel - 1] : undefined;
    const sameChannel = playerChannels.filter((other) => channelOf(other) === channel).length > 1;
    if (!name) return `Clip ${index + 1}`;
    return sameChannel ? `${name} · clip ${index + 1}` : name;
  };
  const playerChannels = playerItem
    ? Array.from(
        new Map(
          rawEvidenceItems
            .filter(
              (clip) =>
                clip.mediaKind === "video" &&
                clip.url &&
                !isCms808PlayerUrl(clip.url) &&
                clip.deviceId === playerItem.deviceId &&
                Math.abs(clip.atMs - playerItem.atMs) <= 120_000
            )
            .concat(playerItem.mediaKind === "video" && playerItem.url && !isCms808PlayerUrl(playerItem.url) ? [playerItem] : [])
            .map((clip) => [clip.url, clip] as const)
        ).values()
      ).sort((left, right) => (channelOf(left) ?? 0) - (channelOf(right) ?? 0) || left.atMs - right.atMs)
    : [];
  const downloadClip = async (clip: Cms808EvidenceItem, label: string) => {
    const name = `${clip.plate || clip.deviceId}-${label.replace(/\s+/g, "")}-${clip.atMs || Date.now()}.mp4`;
    try {
      const response = await fetch(clip.url);
      if (!response.ok) throw new Error("download failed");
      const href = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      const link = document.createElement("a");
      link.href = clip.url;
      link.download = name;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.click();
    }
  };  const [showAssetsModal, setShowAssetsModal] = useState(false);
  const [showDriversModal, setShowDriversModal] = useState(false);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [eventRows, setEventRows] = useState<EventPickerRow[]>([]);
  const [assetRows, setAssetRows] = useState<GalleryAssetRow[]>([]);
  const [driverRows, setDriverRows] = useState<GalleryDriverRow[]>([]);
  const [assetsFilter, setAssetsFilter] = useState("");
  const [driversFilter, setDriversFilter] = useState("");
  const [eventsFilter, setEventsFilter] = useState("");
  const [evidenceItems, setEvidenceItems] = useState<Cms808EvidenceItem[]>([]);
  const [evidenceStatus, setEvidenceStatus] = useState("");
  const [sortBy, setSortBy] = useState<"Date" | "Driver" | "Notification">("Date");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeLabel, setScopeLabel] = useState("All");
  const [siteTimeZones, setSiteTimeZones] = useState<SiteTimeZoneSettings | null>(null);
  const [brokenMediaIds, setBrokenMediaIds] = useState<Record<string, true>>({});
  const visibleAssets = useMemo(
    () =>
      assetRows.filter((row) =>
        matchesPickerQuery(assetsFilter, [row.id, row.description, row.registration, row.make, row.model, row.peripheral, row.site])
      ),
    [assetRows, assetsFilter]
  );
  const visibleDrivers = useMemo(
    () => driverRows.filter((row) => matchesPickerQuery(driversFilter, [row.id, row.name, row.site])),
    [driverRows, driversFilter]
  );
  const visibleEvents = useMemo(
    () => eventRows.filter((row) => matchesPickerQuery(eventsFilter, [row.id, row.name, row.type])),
    [eventRows, eventsFilter]
  );
  const allAssetsSelected = visibleAssets.length > 0 && visibleAssets.every((row) => selectedAssets.includes(row.id));
  const allDriversSelected = visibleDrivers.length > 0 && visibleDrivers.every((row) => selectedDrivers.includes(row.id));
  const allEventsSelected = visibleEvents.length > 0 && visibleEvents.every((row) => selectedEvents.includes(row.id));

  useEffect(() => {
    let cancelled = false;
    const reloadBoundEvents = async () => {
      try {
        const rows = await loadNotificationPickerEventsForSite(readActiveSiteName());
        if (!cancelled) {
          setEventRows(rows.map((row) => ({ id: row.id, name: row.name, type: row.eventType })));
        }
      } catch {
        if (!cancelled) setEventRows([]);
      }
    };
    void reloadBoundEvents();
    window.addEventListener("vivi:orgchange", reloadBoundEvents);
    window.addEventListener("vivi:contextchange", reloadBoundEvents);
    window.addEventListener("vivi:bindingschange", reloadBoundEvents);
    window.addEventListener(NOTIFICATION_LIBRARY_UPDATED_EVENT, reloadBoundEvents);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:orgchange", reloadBoundEvents);
      window.removeEventListener("vivi:contextchange", reloadBoundEvents);
      window.removeEventListener("vivi:bindingschange", reloadBoundEvents);
      window.removeEventListener(NOTIFICATION_LIBRARY_UPDATED_EVENT, reloadBoundEvents);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLivePickers = async () => {
      const site = readActiveSiteName() || cms808SiteName();
      const [assets, drivers, cmsVehicles] = await Promise.all([
        getAssetsFromApi<Record<string, unknown>>().catch(() => []),
        getDriversFromApi<{ id?: string; name?: string; site?: string }>().catch(() => []),
        loadCms808VehiclesForActiveHierarchy()
      ]);
      if (cancelled) return;

      const liveAssets = filterRecordsForActiveSelection(Array.isArray(assets) ? assets : [])
        .filter((row) => assetHasLiveCamera(row) && matchesGalleryHierarchy(row))
            .map((row) => {
              const id = compactAssetId(
                textOf(row.cameraSerial ?? row.imei ?? row.devIdno ?? row.deviceId ?? row.id ?? row.assetId)
              );
              if (!id) return null;
              return {
                id,
                description: textOf(row.assetDescription ?? row.registration ?? row.vehiIdno ?? row.cameraSerial ?? id),
                registration: textOf(row.registration ?? row.vehiIdno),
                make: textOf(row.make),
                model: textOf(row.cameraModel ?? row.model),
                channels: textOf(row.cameraComponents ?? row.channelCount),
                peripheral: textOf(row.camera ?? row.device),
                site: textOf(row.site)
              } satisfies GalleryAssetRow;
            })
            .filter((row): row is GalleryAssetRow => Boolean(row));

      const live808 = cmsVehicles
        .map((row) => {
          const rec = cms808VehicleToAssetRecord(row);
          const id = textOf(row.devIdno || row.deviceId || row.vehiIdno);
          if (!id) return null;
          return {
            id,
            description: textOf(rec.assetDescription || row.vehiIdno || row.devIdno),
            registration: textOf(rec.registration || row.vehiIdno),
            make: "VIVI Camera",
            model: textOf(rec.cameraModel) || (row.channels ? `MDVR-${row.channels}CH` : "MDVR"),
            channels: (row.channelNames || []).join(", "),
            peripheral: "VIVI Telematics",
            site: textOf(rec.site) || site || cms808SiteName()
          } satisfies GalleryAssetRow;
        })
        .filter((row): row is GalleryAssetRow => Boolean(row));

      const merged = [...live808];
      for (const row of liveAssets) {
        if (!merged.some((item) => item.id === row.id || (row.registration && item.registration === row.registration))) {
          merged.push(row);
        }
      }
      setAssetRows(merged);
      setSelectedAssets((current) => current.filter((id) => merged.some((row) => row.id === id)));

      const liveDrivers = site
        ? filterForSiteScope(Array.isArray(drivers) ? drivers : [], site)
            .map((row) => ({
              id: textOf(row.id),
              name: textOf(row.name),
              site: textOf(row.site)
            }))
            .filter((row) => row.id && row.name && row.site)
        : [];
      setDriverRows(liveDrivers);
      setSelectedDrivers((current) => current.filter((id) => liveDrivers.some((row) => row.id === id)));
    };
    void loadLivePickers();
    const reload = () => void loadLivePickers();
    window.addEventListener("vivi:orgchange", reload);
    window.addEventListener("vivi:contextchange", reload);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:orgchange", reload);
      window.removeEventListener("vivi:contextchange", reload);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getSiteTimeZoneSettings()
      .then((settings) => {
        if (!cancelled) setSiteTimeZones(settings);
      })
      .catch(() => {
        if (!cancelled) setSiteTimeZones(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadEvidence = async () => {
      setEvidenceStatus("Loading live evidence…");
      const vehicles = await loadCms808VehiclesForActiveHierarchy().catch(() => []);
      if (cancelled) return;
      const selectedVehicles = vehicles.filter((vehicle) => {
        if (scopeLabel === "Selected" && !selectedAssets.length) return false;
        if (!selectedAssets.length) return true;
        return selectedAssets.some((id) => {
          const asset = assetRows.find((row) => row.id === id);
          return asset
            ? cms808MatchesAsset(vehicle, { ...asset, cameraSerial: asset.id, imei: asset.id })
            : textOf(vehicle.devIdno) === id;
        });
      }).slice(0, 4);
      if (!selectedVehicles.length) {
        setRawEvidenceItems([]);
        setEvidenceStatus("No live cameras for this site.");
        return;
      }

      const batches = await Promise.all(
        selectedVehicles.map(async (vehicle) => {
          const device = textOf(vehicle.devIdno || vehicle.deviceId);
          if (!device && !textOf(vehicle.vehiIdno)) return [] as Cms808EvidenceItem[];
          const rows = await loadCms808Evidence(vehicle, startDateObj, endDateObj).catch(() => []);
          return rows.map((item) => {
            const asset = assetRows.find(
              (rowAsset) =>
                rowAsset.id === item.deviceId ||
                rowAsset.registration === item.plate ||
                cms808MatchesAsset(vehicle, { ...rowAsset, cameraSerial: rowAsset.id, imei: rowAsset.id })
            );
            const vehicleLabel = asset
              ? [asset.registration || item.plate, asset.description, asset.model].filter(Boolean).join(" - ")
              : item.vehicleLabel;
            return {
              ...item,
              vehicleLabel: vehicleLabel || item.vehicleLabel,
              driver: item.driver && item.driver !== "Unknown" ? item.driver : "Unknown",
              site: item.location || item.site || asset?.site || cms808SiteName()
            };
          });
        })
      );
      if (cancelled) return;
      const photos = batches.flat();
      setRawEvidenceItems(photos);
      setBrokenMediaIds({});
      setEvidenceStatus(
        photos.length
          ? `${photos.length} live evidence item${photos.length === 1 ? "" : "s"}`
          : "No live evidence for this site."
      );
    };
    void loadEvidence();
    const watchdog = window.setTimeout(() => {
      if (!cancelled) {
        setEvidenceStatus((current) =>
          current === "Loading live evidence…" ? "Evidence search timed out — try a shorter date range." : current
        );
      }
    }, 45_000);
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
    };
  }, [endDateObj, scopeLabel, selectedAssets, startDateObj]);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = rawEvidenceItems.filter((item) => {
      if (selectedEvents.length) {
        const eventNames = selectedEvents.map((eventId) => {
          const match = eventRows.find((row) => row.id === eventId);
          return textOf(match?.name || match?.type || eventId).toLowerCase();
        });
        if (!eventNames.some((name) => item.alarmType.toLowerCase().includes(name) || name.includes(item.alarmType.toLowerCase()))) {
          return false;
        }
      }
      if (selectedDrivers.length) {
        const driverNames = selectedDrivers.map((id) => {
          const match = driverRows.find((row) => row.id === id);
          return textOf(match?.name || id).toLowerCase();
        });
        if (!driverNames.some((name) => item.driver.toLowerCase().includes(name))) return false;
      }
      if (!query) return true;
      return `${item.plate} ${item.vehicleLabel} ${item.alarmType} ${item.at} ${item.driver} ${item.site}`.toLowerCase().includes(query);
    });
    filtered.sort((a, b) => {
      if (sortBy === "Notification") return a.alarmType.localeCompare(b.alarmType) || b.atMs - a.atMs;
      if (sortBy === "Driver") return a.driver.localeCompare(b.driver) || b.atMs - a.atMs;
      return (b.atMs || 0) - (a.atMs || 0) || String(b.at).localeCompare(String(a.at));
    });
    setEvidenceItems(filtered);
    if (rawEvidenceItems.length) {
      setEvidenceStatus(
        filtered.length
          ? `${filtered.length} live evidence item${filtered.length === 1 ? "" : "s"}`
          : "No live evidence matches the current filters."
      );
    }
  }, [driverRows, eventRows, rawEvidenceItems, searchQuery, selectedDrivers, selectedEvents, sortBy]);

  const formatEvidenceTime = (item: Cms808EvidenceItem) => {
    let ms = 0;
    const raw = String(item.at || "").trim();
    // Platform text times are naive and in platform time (UTC+8)
    const naive = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (naive) ms = Date.parse(`${naive[1]}-${naive[2]}-${naive[3]}T${naive[4]}:${naive[5]}:${naive[6] || "00"}+08:00`);
    else if (/^\d{12,}$/.test(raw)) ms = Number(raw);
    else if (raw) ms = Date.parse(raw);
    if (!Number.isFinite(ms) || !ms) ms = Number(item.atMs) || 0;
    if (!ms) return raw ? cms808DisplayTime(raw, item.site, siteTimeZones) : "";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(ms));
    return `${parts.replace(" ", " ").replace(/,?\s(\d{2}:)/, ", $1")} EAT`;
  };

  const evidenceByDate = useMemo(() => {
    const groups = new Map<string, { label: string; sortKey: string; items: Cms808EvidenceItem[] }>();
    for (const item of evidenceItems) {
      const stamp = item.atMs || Date.parse(item.at.includes("T") ? item.at : item.at.replace(" ", "T")) || 0;
      const day = Number.isFinite(stamp) && stamp > 0 ? new Date(stamp) : null;
      const sortKey = day
        ? `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
        : "unknown";
      const label = day
        ? day.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
        : "Unknown date";
      const existing = groups.get(sortKey);
      if (existing) existing.items.push(item);
      else groups.set(sortKey, { label, sortKey, items: [item] });
    }
    return Array.from(groups.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [evidenceItems]);

  const formatDisplayDateTime = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(
      date.getMinutes()
    )}`;
  };

  const openPicker = (target: "start" | "end") => {
    const base = target === "start" ? startDateObj : endDateObj;
    setPickerTarget(target);
    setPickerDateObj(new Date(base));
    setPickerTime(`${base.getHours().toString().padStart(2, "0")}:${base.getMinutes().toString().padStart(2, "0")}`);
    setActivePicker("date");
    setPickerOpen(true);
  };

  const applyPicker = () => {
    const base = new Date(pickerDateObj);
    const [hours, minutes] = pickerTime.split(":").map((v) => Number(v));
    if (!Number.isNaN(hours)) base.setHours(hours);
    if (!Number.isNaN(minutes)) base.setMinutes(minutes);
    base.setSeconds(0, 0);
    if (pickerTarget === "start") {
      setStartDateObj(base);
    } else {
      setEndDateObj(base);
    }
    setPickerOpen(false);
  };

  return (
    <div className={embed ? "video-page video-embed" : "page video-page"}>
      {!embed && (
        <div className="video-back-row">
          <button
            type="button"
            className="video-back-btn"
            onClick={() => navigate("/Track/videos/dashboard")}
          >
            ← Back to Dashboard
          </button>
        </div>
      )}
      <div className="video-filters-card">
        <div className="video-filters-row">
          <div className="video-filter-block video-date-group">
            <span className="video-filter-label">Start date:</span>
            <button className="video-date-btn" type="button" onClick={() => openPicker("start")}>
              {formatDisplayDateTime(startDateObj)} <span aria-hidden="true">📅</span>
            </button>
          </div>
          <div className="video-filter-block video-date-group">
            <span className="video-filter-label">End date:</span>
            <button className="video-date-btn" type="button" onClick={() => openPicker("end")}>
              {formatDisplayDateTime(endDateObj)} <span aria-hidden="true">📅</span>
            </button>
          </div>
          <div className="video-divider" aria-hidden="true" />
          <div className="video-filter-block">
            <span className="video-filter-label">Filter by:</span>
            <div className="video-icon-filters">
              {filterIcons.map((icon) => (
                <button
                  key={icon.key}
                  className="video-icon-btn"
                  type="button"
                  aria-label={icon.label}
                  data-tooltip={icon.tooltip}
                  onClick={() => {
                    if (icon.key === "assets") {
                      setShowAssetsModal(true);
                    } else if (icon.key === "driver") {
                      setShowDriversModal(true);
                    } else if (icon.key === "event") {
                      setShowEventsModal(true);
                    }
                  }}
                >
                  <span aria-hidden="true">{icon.symbol}</span>
                  {icon.key === "assets" && selectedAssets.length > 0 && (
                    <span className="video-filter-count" aria-hidden="true">
                      {selectedAssets.length}
                    </span>
                  )}
                  {icon.key === "driver" && selectedDrivers.length > 0 && (
                    <span className="video-filter-count" aria-hidden="true">
                      {selectedDrivers.length}
                    </span>
                  )}
                  {icon.key === "event" && selectedEvents.length > 0 && (
                    <span className="video-filter-count" aria-hidden="true">
                      {selectedEvents.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              className="video-link-btn"
              type="button"
              onClick={() => {
                setSelectedAssets([]);
                setSelectedDrivers([]);
                setSelectedEvents([]);
                setSearchQuery("");
                setScopeLabel("All");
              }}
            >
              Clear all
            </button>
            <button
              className="video-link-btn"
              type="button"
              data-nav="/Analyze/insights/reports?category=Notification%20Reports&report=Detailed%20Notification%20Report"
            >
              View reports
            </button>
          </div>
          <div className="video-filter-block video-search-block">
            <span className="video-filter-label">Search:</span>
            <input
              className="video-search-input"
              placeholder=""
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="video-sort-row">
        <div className="video-sort">
          <span>Sort by:</span>
          <div className="video-sort-trigger">
            <button
              className="video-link-btn"
              type="button"
              onClick={() => setSortMenuOpen((current) => !current)}
              aria-haspopup="listbox"
              aria-expanded={sortMenuOpen}
            >
              {sortBy} ▾
            </button>
            {sortMenuOpen && (
              <div className="video-sort-menu" role="listbox">
                {["Date", "Driver", "Notification"].map((option) => (
                  <button
                    key={option}
                    className="video-sort-option"
                    role="option"
                    type="button"
                    aria-selected={sortBy === option}
                    onClick={() => {
                      setSortBy(option as "Date" | "Driver" | "Notification");
                      setSortMenuOpen(false);
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          className="video-pill"
          type="button"
          onClick={() => setScopeLabel((current) => (current === "All" ? "Selected" : "All"))}
        >
          {scopeLabel}
        </button>
      </div>

      {evidenceItems.length ? (
        <div className="video-evidence-board">
          {evidenceByDate.map((group) => (
            <section key={group.sortKey} className="video-evidence-day">
              <h2 className="video-evidence-day-title">{group.label}</h2>
              <div className="video-evidence-grid">
                {group.items.map((item) => {
                  const mediaBroken = Boolean(brokenMediaIds[item.id]);
                  const showPlaceholder = !item.url || mediaBroken;
                  return (
                    <article key={item.id} className="video-evidence-card">
                      <div className="video-evidence-media">
                        {item.mediaKind === "video" ? (
                          <div
                            className="video-evidence-thumb"
                            style={{ position: "relative", width: "100%", height: "100%", background: "#334155", cursor: "pointer", overflow: "hidden" }}
                            onClick={() => {
                              if (item.url) {
                                setPlayerItem(item);
                                return;
                              }
                              void (async () => {
                                const url = await buildCms808PlaybackPlayerUrl(item.deviceId, item.plate, {
                                  begintime: item.at || undefined
                                }).catch(() => "");
                                if (url) setPlayerItem({ ...item, url });
                                else navigate("/Track/videos/live-video-streaming");
                              })();
                            }}
                          >
                            {item.url && !isCms808PlayerUrl(item.url) && !mediaBroken ? (
                              <video
                                src={`${item.url}${item.url.includes("#") ? "" : "#t=0.5"}`}
                                poster={posterFor(item)}
                                preload="metadata"
                                muted
                                playsInline
                                style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
                                onError={() => setBrokenMediaIds((current) => ({ ...current, [item.id]: true }))}
                              />
                            ) : posterFor(item) ? (
                              <img src={posterFor(item)} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : null}
                            <span
                              style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 34, textShadow: "0 1px 6px rgba(0,0,0,.7)" }}
                            >
                              ▶
                            </span>
                          </div>
                        ) : showPlaceholder ? (
                          <div className="video-evidence-media-empty">
                            Media is still uploading from the camera. Try refreshing shortly.
                          </div>                        ) : (
                          <img
                            src={item.url}
                            style={{ cursor: "pointer" }}
                            onClick={() => setPlayerItem(item)}
                            alt={item.alarmType || item.plate || "Evidence"}
                            onError={() => {
                              setBrokenMediaIds((current) => ({ ...current, [item.id]: true }));
                            }}
                          />
                        )}
                      </div>
                      <div className="video-evidence-meta">
                        <strong className="video-evidence-event">
                          {[item.plate || item.deviceId, item.alarmType || "Evidence"].filter(Boolean).join(" - ")}
                        </strong>
                        <span className="video-evidence-time">{formatEvidenceTime(item)}</span>
                        <span className="video-evidence-line video-evidence-vehicle">
                          <span className="video-evidence-ico" aria-hidden="true">🚚</span>
                          <span>{item.vehicleLabel || item.plate || item.deviceId || "Unknown asset"}</span>
                        </span>
                        <span className="video-evidence-line video-evidence-driver">
                          <span className="video-evidence-ico" aria-hidden="true">👤</span>
                          <span>{item.driver || "Unknown"}</span>
                        </span>
                        <span className="video-evidence-line video-evidence-site">
                          <span className="video-evidence-ico" aria-hidden="true">📍</span>
                          <span>{item.site || cms808SiteName()}</span>
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="video-empty">
          <div className="video-empty-icon" aria-hidden="true">📹</div>
          <div>{evidenceStatus || "No videos found for current selection"}</div>
        </div>
      )}

      {playerItem ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPlayerItem(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ background: "#fff", borderRadius: 10, width: "min(1100px, 96vw)", height: "min(86vh, 760px)", display: "flex", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,.4)" }}
          >
            <div style={{ flex: "1 1 62%", display: "flex", flexDirection: "column", minWidth: 0, background: "#f4f4f4" }}>
              <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {playerChannels.length ? (
                  playerChannels.map((clip, index) => (
                    <div key={clip.id} style={{ position: "relative", background: "#d9d9d9", borderRadius: 6, overflow: "hidden" }}>
                      <video
                        ref={(node) => {
                          playerVideoRefs.current[clip.id] = node;
                        }}
                        src={clip.url}
                        poster={posterFor(clip)}
                        controls
                        preload="metadata"
                        playsInline
                        style={{ width: "100%", maxHeight: 260, background: "#000", display: "block" }}
                      />
                      <button
                        type="button"
                        aria-label="Maximise"
                        title="Maximise (Esc to exit)"
                        onClick={() => void playerVideoRefs.current[clip.id]?.requestFullscreen?.()}
                        style={{ position: "absolute", top: 8, left: 8, width: 30, height: 30, border: 0, borderRadius: 8, background: "rgba(17,17,17,.75)", color: "#fff", cursor: "pointer", fontSize: 16 }}
                      >
                        ⛶
                      </button>
                      <span style={{ position: "absolute", top: 8, right: 8, background: "#111", color: "#fff", fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>
                        {channelLabel(clip, index)}
                      </span>
                    </div>
                  ))
                ) : playerItem.mediaKind === "image" ? (
                  <img src={playerItem.url} alt={playerItem.alarmType || "Photo"} style={{ width: "100%", borderRadius: 6 }} />
                ) : isCms808PlayerUrl(playerItem.url) ? (
                  <iframe title="Playback" src={playerItem.url} style={{ width: "100%", height: "100%", minHeight: 420, border: 0 }} allow="autoplay; fullscreen" />
                ) : null}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderTop: "1px solid #e2e8f0", background: "#fff" }}>
                {playerChannels.length ? (
                  <>
                    <button
                      type="button"
                      aria-label="Play all"
                      style={roundBtn}
                      onClick={() => Object.values(playerVideoRefs.current).forEach((video) => void video?.play().catch(() => undefined))}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Pause all"
                      style={roundBtn}
                      onClick={() => Object.values(playerVideoRefs.current).forEach((video) => video?.pause())}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Stop all"
                      style={roundBtn}
                      onClick={() =>
                        Object.values(playerVideoRefs.current).forEach((video) => {
                          if (!video) return;
                          video.pause();
                          video.currentTime = 0;
                        })
                      }
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z" /></svg>
                    </button>
                  </>
                ) : null}
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  disabled={!playerChannels.length && !playerItem.url}
                  onClick={() => {
                    if (!playerChannels.length) {
                      void downloadClip(playerItem, "Photo");
                      return;
                    }
                    setSaveSelection(playerChannels.map((clip) => clip.id));
                    setSaveOpen(true);
                  }}
                  style={primaryBtn}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 20h16" /></svg>
                  {playerChannels.length ? "Save video" : "Save photo"}
                </button>
              </div>
            </div>            <div style={{ flex: "1 1 38%", borderLeft: "1px solid #e5e5e5", padding: 18, overflowY: "auto", position: "relative" }}>
              <button type="button" onClick={() => setPlayerItem(null)} aria-label="Close" style={{ position: "absolute", top: 8, right: 10, border: 0, fontSize: 18, cursor: "pointer", width: 30, height: 30, borderRadius: "50%", background: "#f1f5f9" }}>✕</button>
              <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>{playerItem.vehicleLabel || playerItem.plate} - {playerItem.alarmType || "Recording"}</h3>
              <div style={{ fontSize: 14 }}>Notification time: {formatEvidenceTime(playerItem)}</div>
              <div style={{ fontSize: 13, color: "#667", marginTop: 12 }}>🚚 {playerItem.vehicleLabel || playerItem.plate}</div>
              <div style={{ fontSize: 13, color: "#667", marginTop: 4 }}>👤 {playerItem.driver || "Unknown"}</div>
              <hr style={{ margin: "14px 0", border: 0, borderTop: "1px solid #e5e5e5" }} />
              <div style={{ fontSize: 14, fontWeight: 700 }}>📍 {playerItem.site || cms808SiteName()}</div>
              {playerItem.location ? <div style={{ fontSize: 13, color: "#445" }}>{playerItem.location}</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {playerItem && saveOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSaveOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={(event) => event.stopPropagation()} style={{ background: "#fff", borderRadius: 10, padding: 18, width: "min(420px, 92vw)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <strong>Save videos</strong>
              <button type="button" aria-label="Close" onClick={() => setSaveOpen(false)} style={{ border: 0, background: "none", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ background: "#f3f3f3", borderRadius: 8, padding: 14, fontSize: 14 }}>
              <div style={{ marginBottom: 6 }}>Select which video views you would like to save</div>
              {playerChannels.map((clip, index) => (
                <label key={clip.id} style={{ display: "block", margin: "4px 0 4px 14px" }}>
                  <input
                    type="checkbox"
                    checked={saveSelection.includes(clip.id)}
                    onChange={(event) =>
                      setSaveSelection((current) =>
                        event.target.checked ? [...current, clip.id] : current.filter((id) => id !== clip.id)
                      )
                    }
                  />{" "}
                  {channelLabel(clip, index)}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" style={ghostBtn} onClick={() => setSaveOpen(false)}>Cancel</button>
              <button
                type="button"
                disabled={!saveSelection.length}
                onClick={() => {
                  playerChannels
                    .filter((clip) => saveSelection.includes(clip.id))
                    .forEach((clip, index) => window.setTimeout(() => void downloadClip(clip, channelLabel(clip, index)), index * 400));
                  setSaveOpen(false);
                }}
                style={{ ...primaryBtn, padding: "8px 20px", opacity: saveSelection.length ? 1 : 0.5 }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <button className="video-help-fab" type="button" aria-label="Help">
        ?
      </button>

      <ScheduleDateTimePicker
        open={pickerOpen}
        date={pickerDateObj}
        time={pickerTime}
        mode={activePicker}
        onClose={() => setPickerOpen(false)}
        onConfirm={applyPicker}
        onDateChange={setPickerDateObj}
        onTimeChange={setPickerTime}
        onModeChange={setActivePicker}
        title={pickerTarget === "start" ? "Select start date and time" : "Select end date and time"}
        restrictToPast
      />

      {showAssetsModal && (
        <div className="video-assets-modal" role="dialog" aria-modal="true" aria-label="Select assets">
          <div className="video-assets-card">
            <div className="video-assets-header">
              <span>Select assets</span>
              <button
                className="video-assets-close"
                type="button"
                aria-label="Close"
                onClick={() => setShowAssetsModal(false)}
              >
                ×
              </button>
            </div>
            <div className="video-assets-body">
              <div className="video-assets-panel">
                <input
                  className="video-assets-filter"
                  placeholder="Filter"
                  value={assetsFilter}
                  onChange={(event) => setAssetsFilter(event.target.value)}
                />
                <div className="video-assets-table">
                  <table className="video-assets-grid">
                    <colgroup>
                      <col className="video-assets-col-check" />
                      <col className="video-assets-col-id" />
                      <col className="video-assets-col-desc" />
                      <col className="video-assets-col-reg" />
                      <col className="video-assets-col-make" />
                      <col className="video-assets-col-model" />
                      <col className="video-assets-col-channels" />
                      <col className="video-assets-col-peripheral" />
                      <col className="video-assets-col-site" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="video-assets-cell-check">
                          <input
                            type="checkbox"
                            aria-label="Select all"
                            checked={allAssetsSelected}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedAssets(visibleAssets.map((row) => row.id));
                              } else {
                                setSelectedAssets([]);
                              }
                            }}
                          />
                        </th>
                        <th>Id</th>
                        <th>Asset description</th>
                        <th>Registration number</th>
                        <th>Make</th>
                        <th>Model</th>
                        <th>Channels</th>
                        <th>Peripheral</th>
                        <th>Site</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAssets.length === 0 ? (
                        <tr>
                          <td className="video-assets-empty-text" colSpan={9}>
                            No live assets for this site.
                          </td>
                        </tr>
                      ) : (
                        visibleAssets.map((row) => (
                          <tr key={row.id} className="video-assets-data">
                            <td className="video-assets-cell-check">
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.description}`}
                                checked={selectedAssets.includes(row.id)}
                                onChange={(event) => {
                                  setSelectedAssets((current) =>
                                    event.target.checked
                                      ? [...current, row.id]
                                      : current.filter((id) => id !== row.id)
                                  );
                                }}
                              />
                            </td>
                            <td title={row.id}>{row.id}</td>
                            <td title={row.description}>{row.description}</td>
                            <td title={row.registration}>{row.registration}</td>
                            <td title={row.make}>{row.make}</td>
                            <td title={row.model}>{row.model}</td>
                            <td title={row.channels}>{row.channels}</td>
                            <td title={row.peripheral}>{row.peripheral}</td>
                            <td title={row.site}>{row.site}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="video-assets-actions">
              <button className="video-assets-cancel" type="button" onClick={() => setShowAssetsModal(false)}>
                Cancel
              </button>
              <button className="video-assets-select" type="button" onClick={() => setShowAssetsModal(false)}>
                Select
              </button>
            </div>
          </div>
        </div>
      )}

      {showDriversModal && (
        <div className="video-assets-modal" role="dialog" aria-modal="true" aria-label="Select drivers">
          <div className="video-assets-card">
            <div className="video-assets-header">
              <span>Select drivers</span>
              <button
                className="video-assets-close"
                type="button"
                aria-label="Close"
                onClick={() => setShowDriversModal(false)}
              >
                ×
              </button>
            </div>
            <div className="video-assets-body">
              <div className="video-assets-panel">
                <input
                  className="video-assets-filter"
                  placeholder="Filter"
                  value={driversFilter}
                  onChange={(event) => setDriversFilter(event.target.value)}
                />
                <div className="video-assets-table">
                  <table className="video-assets-grid video-assets-grid-drivers">
                    <colgroup>
                      <col className="video-assets-col-check" />
                      <col className="video-assets-col-id" />
                      <col />
                      <col className="video-assets-col-site" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="video-assets-cell-check">
                          <input
                            type="checkbox"
                            aria-label="Select all"
                            checked={allDriversSelected}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedDrivers(visibleDrivers.map((row) => row.id));
                              } else {
                                setSelectedDrivers([]);
                              }
                            }}
                          />
                        </th>
                        <th>Id</th>
                        <th>Name</th>
                        <th>Site</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDrivers.length === 0 ? (
                        <tr>
                          <td className="video-assets-empty-text" colSpan={4}>
                            No live drivers for this site.
                          </td>
                        </tr>
                      ) : (
                        visibleDrivers.map((row) => (
                          <tr key={row.id} className="video-assets-data">
                            <td className="video-assets-cell-check">
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.name}`}
                                checked={selectedDrivers.includes(row.id)}
                                onChange={(event) => {
                                  setSelectedDrivers((current) =>
                                    event.target.checked
                                      ? [...current, row.id]
                                      : current.filter((id) => id !== row.id)
                                  );
                                }}
                              />
                            </td>
                            <td title={row.id}>{row.id}</td>
                            <td title={row.name}>{row.name}</td>
                            <td title={row.site}>{row.site}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="video-assets-actions">
              <button className="video-assets-cancel" type="button" onClick={() => setShowDriversModal(false)}>
                Cancel
              </button>
              <button className="video-assets-select" type="button" onClick={() => setShowDriversModal(false)}>
                Select
              </button>
            </div>
          </div>
        </div>
      )}

      {showEventsModal && (
        <div className="video-assets-modal" role="dialog" aria-modal="true" aria-label="Select events">
          <div className="video-assets-card">
            <div className="video-assets-header">
              <span>Select events</span>
              <button
                className="video-assets-close"
                type="button"
                aria-label="Close"
                onClick={() => setShowEventsModal(false)}
              >
                ×
              </button>
            </div>
            <div className="video-assets-body">
              <div className="video-assets-panel">
                <input
                  className="video-assets-filter"
                  placeholder="Filter"
                  value={eventsFilter}
                  onChange={(event) => setEventsFilter(event.target.value)}
                />
                <div className="video-assets-table">
                  <table className="video-assets-grid video-assets-grid-events">
                    <colgroup>
                      <col className="video-assets-col-check" />
                      <col className="video-assets-col-id" />
                      <col />
                      <col className="video-assets-col-site" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="video-assets-cell-check">
                          <input
                            type="checkbox"
                            aria-label="Select all"
                            checked={allEventsSelected}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedEvents(visibleEvents.map((row) => row.id));
                              } else {
                                setSelectedEvents([]);
                              }
                            }}
                          />
                        </th>
                        <th>Id</th>
                        <th>Notification name</th>
                        <th>Notification Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEvents.length === 0 ? (
                        <tr>
                          <td className="video-assets-empty-text" colSpan={4}>
                            No live events for this site.
                          </td>
                        </tr>
                      ) : (
                        visibleEvents.map((row) => (
                          <tr key={row.id} className="video-assets-data">
                            <td className="video-assets-cell-check">
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.name}`}
                                checked={selectedEvents.includes(row.id)}
                                onChange={(event) => {
                                  setSelectedEvents((current) =>
                                    event.target.checked
                                      ? [...current, row.id]
                                      : current.filter((id) => id !== row.id)
                                  );
                                }}
                              />
                            </td>
                            <td title={row.id}>{row.id}</td>
                            <td title={row.name}>* {row.name}</td>
                            <td title={row.type}>{row.type}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="video-assets-actions">
              <button className="video-assets-cancel" type="button" onClick={() => setShowEventsModal(false)}>
                Cancel
              </button>
              <button className="video-assets-select" type="button" onClick={() => setShowEventsModal(false)}>
                Select
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
