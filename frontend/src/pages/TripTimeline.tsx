import React, { useEffect, useMemo, useRef, useState } from "react";
import DatePicker from "react-datepicker";
import TimePicker from "react-time-picker";
import "react-datepicker/dist/react-datepicker.css";
import "react-time-picker/dist/TimePicker.css";
import "react-clock/dist/Clock.css";
// Example trip data for demonstration
// Trip data (static, but positions will be calculated dynamically)
const trips = [
    {
      driver: "Reserved Driver 14 - LOT 2",
      start: "2026-01-19T10:08:00",
      end: "2026-01-19T10:37:32",
      duration: "00:29:32",
    distance: "18.58 km",
    segments: [
      { start: "2026-01-19T10:10:00", end: "2026-01-19T10:18:00", type: "moving" },
      { start: "2026-01-19T10:22:00", end: "2026-01-19T10:30:00", type: "moving" }
    ]
    },
    {
      driver: "Reserved Driver 08 - LOT 2",
      start: "2026-01-19T12:12:00",
      end: "2026-01-19T12:28:18",
      duration: "00:16:18",
    distance: "11.02 km",
    segments: [
      { start: "2026-01-19T12:13:00", end: "2026-01-19T12:20:00", type: "moving" },
      { start: "2026-01-19T12:22:00", end: "2026-01-19T12:27:00", type: "moving" }
    ]
    },
    {
      driver: "Reserved Driver 05 - LOT 2",
      start: "2026-01-19T15:41:00",
      end: "2026-01-19T16:12:10",
      duration: "00:31:10",
    distance: "21.43 km",
    segments: [
      { start: "2026-01-19T15:43:00", end: "2026-01-19T15:55:00", type: "moving" },
      { start: "2026-01-19T16:01:00", end: "2026-01-19T16:10:00", type: "moving" }
    ]
    }
];

type NotificationEvent = {
  id: string;
  at: string;
  durationMinutes?: number;
  tripIndex: number;
};

// Example notification occurrences tied to trip windows
const notificationEvents: NotificationEvent[] = trips.flatMap((trip, tripIndex) => {
  const start = new Date(trip.start).getTime();
  const end = new Date(trip.end).getTime();
  const spanMinutes = Math.max(5, Math.round((end - start) / (1000 * 60)));
  const offsets = [0.2, 0.5, 0.8].map((ratio, i) => ({
    id: String((tripIndex + i) % notificationRows.length + 1),
    at: new Date(start + ratio * spanMinutes * 60 * 1000).toISOString(),
    durationMinutes: Math.max(2, Math.round(spanMinutes * 0.15)),
    tripIndex
  }));
  return offsets;
});
import "../index.css";
import { notificationRows, NotificationRow } from "../data/notificationLibrary";

const ranges = ["24h", "12h", "6h", "3h", "1h", "30m", "15m", "10m", "5m"];
const toolIcons = [
  { label: "Print", icon: "🖨" },
  { label: "Query line", icon: "≡" },
  { label: "Tacho data", icon: "📶" },
  { label: "Pins", icon: "📍" }
];

const moreMenuOptions = [
  { label: "Timeline settings", icon: "⚙️" },
  { label: "Download GPS data", icon: "⬇️" },
  { label: "Download tacho", icon: "⬇️" },
  { label: "Timeline report", icon: "📄" },
  { label: "Download video", icon: "⬇️" }
];

const normalizeContextOptions = (stored: string | null, activeSite: string, dbSites: string[]) => {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as Array<string | { name?: string; site?: string }>;
    if (!Array.isArray(parsed)) return [];
    if (parsed.length > 0 && typeof parsed[0] === "object") {
      return parsed
        .filter((item) => item && typeof item === "object" && typeof item.name === "string")
        .filter((item) => {
          const site = item.site ?? "";
          if (activeSite) return site === activeSite;
          if (dbSites.length > 0) return dbSites.includes(site);
          return true;
        })
        .map((item) => item.name as string);
    }
    return parsed.filter((item) => typeof item === "string" && item) as string[];
  } catch {
    return [];
  }
};

export default function TripTimeline() {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [selectedDateTime, setSelectedDateTime] = useState("2026-01-20T01:44");
  // For react-datepicker, keep a Date object in sync
  const [selectedDateObj, setSelectedDateObj] = useState(() => new Date("2026-01-20T01:44"));
  const [selectedTime, setSelectedTime] = useState(() => {
    const initial = new Date("2026-01-20T01:44");
    return `${initial.getHours().toString().padStart(2, "0")}:${initial.getMinutes().toString().padStart(2, "0")}`;
  });
  const [selectedAsset, setSelectedAsset] = useState(() => localStorage.getItem("vivi.activeAsset") || "—");
  const [contextType, setContextType] = useState(() => localStorage.getItem("vivi.contextType") || "");
  const [contextName, setContextName] = useState(() => localStorage.getItem("vivi.contextName") || "");
  const [viewMode, setViewMode] = useState<"drivers" | "passengers" | "assets">(() => {
    const stored = localStorage.getItem("vivi.contextType") || "";
    if (stored === "passenger") return "passengers";
    return stored === "driver" ? "drivers" : "assets";
  });
  const [contextOptions, setContextOptions] = useState<string[]>(() => {
    const storedType = localStorage.getItem("vivi.contextType") || "";
    const key = storedType === "passenger"
      ? "vivi.contextOptions.passenger"
      : storedType === "driver"
        ? "vivi.contextOptions.driver"
        : "vivi.contextOptions";
    const activeSite = localStorage.getItem("vivi.activeSite") || "";
    const storedSites = localStorage.getItem("vivi.activeDbSites");
    let dbSites: string[] = [];
    if (storedSites) {
      try {
        const parsedSites = JSON.parse(storedSites);
        dbSites = Array.isArray(parsedSites) ? parsedSites : [];
      } catch {
        dbSites = [];
      }
    }
    return normalizeContextOptions(localStorage.getItem(key), activeSite, dbSites);
  });
  const isPersonTimeline = contextType === "driver" || contextType === "passenger";
  const displayName = isPersonTimeline ? contextName || selectedAsset : selectedAsset;
  const hasSelection = Boolean(displayName);
  const [showQueryLine, setShowQueryLine] = useState(false);
  const [queryLinePct, setQueryLinePct] = useState(62);
  const [draggingQueryLine, setDraggingQueryLine] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);
  const [notificationFilter, setNotificationFilter] = useState("");
  const [isDatepickerOpen, setIsDatepickerOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<"date" | "time">("date");
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoFrom, setVideoFrom] = useState("2026-01-12T16:50");
  const [videoTo, setVideoTo] = useState("2026-01-12T16:52");
  const [videoViews, setVideoViews] = useState<string[]>([]);
  const [videoResolution, setVideoResolution] = useState("Standard resolution");
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [videoPickerTarget, setVideoPickerTarget] = useState<"from" | "to">("from");
  const [videoPickerDateObj, setVideoPickerDateObj] = useState(() => new Date("2026-01-12T16:50"));
  const [videoPickerTime, setVideoPickerTime] = useState("16:50");
  const [videoPickerActive, setVideoPickerActive] = useState<"date" | "time">("date");
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState(() => localStorage.getItem("vivi.activeSite") || "—");
  const [selectedRegistration, setSelectedRegistration] = useState(() => {
    const stored = localStorage.getItem("vivi.activeRegistration");
    if (stored) return stored;
    const assetLabel = localStorage.getItem("vivi.activeAsset") || selectedAsset;
    if (!assetLabel) return "—";
    return assetLabel.includes(" - ") ? assetLabel.split(" - ").slice(-1)[0] : assetLabel;
  });
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const downloadNoticeTimeout = useRef<number | null>(null);
  // Timeline navigation state
  const [timelineOffsetHours, setTimelineOffsetHours] = useState(0); // in hours
  const visibleToolIcons = isPersonTimeline
    ? toolIcons.filter((tool) => tool.label === "Print" || tool.label === "Query line")
    : toolIcons;
  const visibleMoreMenuOptions = isPersonTimeline
    ? moreMenuOptions.filter((opt) => opt.label === "Timeline settings" || opt.label === "Timeline report")
    : moreMenuOptions;

  const handleViewModeChange = (mode: "drivers" | "passengers" | "assets") => {
    setViewMode(mode);
    if (mode === "drivers") {
      localStorage.setItem("vivi.contextType", "driver");
      if (!contextName && contextOptions.length > 0) {
        localStorage.setItem("vivi.contextName", contextOptions[0]);
      }
    } else if (mode === "passengers") {
      localStorage.setItem("vivi.contextType", "passenger");
      if (!contextName && contextOptions.length > 0) {
        localStorage.setItem("vivi.contextName", contextOptions[0]);
      }
    } else {
      localStorage.setItem("vivi.contextType", "asset");
    }
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const baseStart = useMemo(() => {
    const base = new Date(selectedDateTime);
    if (Number.isNaN(base.getTime())) return null;
    const rounded = new Date(base);
    rounded.setMinutes(0, 0, 0);
    // Apply timeline offset
    rounded.setHours(rounded.getHours() + timelineOffsetHours);
    return rounded;
  }, [selectedDateTime, timelineOffsetHours]);

  const latestTripEnd = useMemo(() => {
    if (trips.length === 0) return null;
    const latest = trips.reduce((max, trip) => {
      const end = new Date(trip.end).getTime();
      return Number.isNaN(end) ? max : Math.max(max, end);
    }, 0);
    return latest ? new Date(latest) : null;
  }, []);

  const visibleTrips = useMemo(() => {
    if (!baseStart) return [];
    const windowStart = baseStart.getTime();
    const windowEnd = windowStart + 24 * 60 * 60 * 1000;
    return trips.filter((trip) => {
      const tripStart = new Date(trip.start).getTime();
      const tripEnd = new Date(trip.end).getTime();
      return tripEnd > windowStart && tripStart < windowEnd;
    });
  }, [baseStart]);

  const formatDateTime = (dt: Date) => {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(
      dt.getMinutes()
    )}`;
  };

  const formatDisplayDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (val: number) => String(val).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(
      date.getMinutes()
    )}`;
  };

  const formatTimeLabel = (dt: Date) => {
    const hour = dt.getHours();
    if (hour === 0) return "Midnight";
    if (hour === 12) return "Midday";
    return `${String(hour).padStart(2, "0")}:00`;
  };

  const scaleLabels = useMemo(() => {
    if (!baseStart) {
      return ["21:00", "Midnight", "03:00", "06:00", "09:00", "Midday", "15:00", "18:00"];
    }
    return Array.from({ length: 8 }, (_, index) => {
      const dt = new Date(baseStart.getTime() + index * 3 * 60 * 60 * 1000);
      return formatTimeLabel(dt);
    });
  }, [baseStart]);

  const queryLabel = useMemo(() => {
    if (!baseStart) return "";
    const rangeHours = 24;
    const offsetMs = (queryLinePct / 100) * rangeHours * 60 * 60 * 1000;
    const dt = new Date(baseStart.getTime() + offsetMs);
    return formatDateTime(dt);
  }, [baseStart, queryLinePct]);

  const handleToolAction = (label: string) => {
    if (label === "Print") {
      window.print();
      return;
    }
    if (label === "Query line") {
      setShowQueryLine((current) => !current);
      return;
    }
    if (label === "More") {
      setShowMoreMenu((open) => !open);
      return;
    }
    console.info(`${label} clicked`);
  };

  const handleDownload = (filename: string, content: string, type = "text/plain") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const showDownloadNotice = (message: string) => {
    setDownloadNotice(message);
    if (downloadNoticeTimeout.current) {
      window.clearTimeout(downloadNoticeTimeout.current);
    }
    downloadNoticeTimeout.current = window.setTimeout(() => {
      setDownloadNotice(null);
      downloadNoticeTimeout.current = null;
    }, 4200);
  };

  useEffect(() => {
    return () => {
      if (downloadNoticeTimeout.current) {
        window.clearTimeout(downloadNoticeTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateFromStorage = () => {
      const site = localStorage.getItem("vivi.activeSite") || "—";
      const reg = localStorage.getItem("vivi.activeRegistration");
      const assetLabel = localStorage.getItem("vivi.activeAsset") || selectedAsset;
      const derivedReg = reg || (assetLabel?.includes(" - ") ? assetLabel.split(" - ").slice(-1)[0] : assetLabel);
      const storedContextType = localStorage.getItem("vivi.contextType") || "";
      const storedContextName = localStorage.getItem("vivi.contextName") || "";
      const storedSites = localStorage.getItem("vivi.activeDbSites");
      let dbSites: string[] = [];
      if (storedSites) {
        try {
          const parsedSites = JSON.parse(storedSites);
          dbSites = Array.isArray(parsedSites) ? parsedSites : [];
        } catch {
          dbSites = [];
        }
      }
      const optionsKey = storedContextType === "passenger"
        ? "vivi.contextOptions.passenger"
        : storedContextType === "driver"
          ? "vivi.contextOptions.driver"
          : "vivi.contextOptions";
      const storedContextOptions = localStorage.getItem(optionsKey);
      setSelectedSite(site || "—");
      setSelectedRegistration(derivedReg || "—");
      setSelectedAsset(assetLabel || "—");
      setContextType(storedContextType);
      setContextName(storedContextName);
      setViewMode(
        storedContextType === "passenger"
          ? "passengers"
          : storedContextType === "driver"
            ? "drivers"
            : "assets"
      );
      setContextOptions(normalizeContextOptions(storedContextOptions, site || "", dbSites));
    };
    updateFromStorage();
    const handleStorage = (event: StorageEvent) => {
      if (event.key?.startsWith("vivi.active") || event.key?.startsWith("vivi.context")) {
        updateFromStorage();
      }
    };
    const handleContextChange = () => updateFromStorage();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("vivi:contextchange", handleContextChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("vivi:contextchange", handleContextChange as EventListener);
    };
  }, [selectedAsset]);

  useEffect(() => {
    if (!latestTripEnd) return;
    const iso = latestTripEnd.toISOString().slice(0, 16);
    setSelectedDateTime(iso);
    setSelectedDateObj(new Date(latestTripEnd));
    setSelectedTime(`${latestTripEnd.getHours().toString().padStart(2, "0")}:${latestTripEnd.getMinutes().toString().padStart(2, "0")}`);
  }, [latestTripEnd]);

  const openTimelineReport = () => {
    if (!baseStart) return;
    const windowStart = baseStart;
    const windowEnd = new Date(baseStart.getTime() + 24 * 60 * 60 * 1000);
    const reportTrips = trips.filter((trip) => {
      const tripStart = new Date(trip.start).getTime();
      const tripEnd = new Date(trip.end).getTime();
      return tripEnd > windowStart.getTime() && tripStart < windowEnd.getTime();
    });
    const format = (dt: Date) => `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2, "0")}:${dt
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    const totalDurationMs = reportTrips.reduce((sum, trip) => {
      const start = new Date(trip.start).getTime();
      const end = new Date(trip.end).getTime();
      return sum + Math.max(0, end - start);
    }, 0);
    const totalDistance = reportTrips.reduce((sum, trip) => sum + Number(trip.distance.replace(/[^0-9.]/g, "") || 0), 0);
    const reportHtml = `<!doctype html>
      <html><head><meta charset="utf-8" />
      <title>Activity Timeline Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        h2 { font-size: 14px; color: #6b7280; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: left; }
        th { background: #f3f4f6; }
      </style></head>
      <body>
        <h1>Activity Timeline Report - ${displayName}</h1>
        <h2>${format(windowStart)} - ${format(windowEnd)} EAT</h2>
        <h3 style="margin:16px 0 8px;">Overview</h3>
        <table>
          <tr>
            <th>Start time</th>
            <th>Driving time</th>
            <th>Idle time</th>
            <th>Standing time</th>
            <th>Total duration</th>
            <th>End time</th>
            <th>Time parked</th>
          </tr>
          <tr>
            <td>${format(windowStart)}</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>${Math.round(totalDurationMs / 60000)} mins</td>
            <td>${format(windowEnd)}</td>
            <td>-</td>
          </tr>
        </table>
        <table>
          <tr>
            <th>Maximum speed</th>
            <th>Average speed</th>
            <th>Distance travelled</th>
            <th>Fuel used</th>
            <th>Fuel consumption</th>
            <th>Average standard score</th>
          </tr>
          <tr>
            <td>-</td>
            <td>-</td>
            <td>${totalDistance.toFixed(2)} km</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
          </tr>
        </table>
        <table>
          <tr>
            <th>Start time</th>
            <th>Stop time</th>
            <th>Odometer</th>
            <th>Distance</th>
            <th>Fuel</th>
            <th colspan="3">Over Speeding</th>
            <th colspan="3">Over Revving</th>
            <th colspan="3">Harsh Braking</th>
            <th colspan="3">Harsh Acceleration</th>
            <th colspan="2">Idle</th>
            <th>Average Standard Score</th>
          </tr>
          <tr>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th>Count</th>
            <th>Max</th>
            <th>Duration</th>
            <th>Count</th>
            <th>Max</th>
            <th>Duration</th>
            <th>Count</th>
            <th>Max</th>
            <th>Duration</th>
            <th>Count</th>
            <th>Max</th>
            <th>Duration</th>
            <th>Count</th>
            <th>Duration</th>
            <th>Score</th>
          </tr>
          ${reportTrips
            .map(
              (trip) => `
              <tr>
                <td>${format(new Date(trip.start))}</td>
                <td>${format(new Date(trip.end))}</td>
                <td>-</td>
                <td>${trip.distance}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>00:00:00</td>
                <td>-</td>
                <td>-</td>
                <td>00:00:00</td>
                <td>-</td>
                <td>-</td>
                <td>00:00:00</td>
                <td>-</td>
                <td>-</td>
                <td>00:00:00</td>
                <td>-</td>
                <td>00:00:00</td>
                <td>-</td>
              </tr>`
            )
            .join("")}
        </table>
      </body></html>`;
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) return;
    reportWindow.document.open();
    reportWindow.document.write(reportHtml);
    reportWindow.document.close();
  };

  const buildTachoCsv = () => {
    const header = "Notification Name,Start time,End time,Site";
    if (!baseStart) return header;
    const windowStart = baseStart.getTime();
    const windowEnd = windowStart + 24 * 60 * 60 * 1000;
    const visibleTripIndexes = new Set(
      trips
        .map((trip, index) => ({
          index,
          start: new Date(trip.start).getTime(),
          end: new Date(trip.end).getTime()
        }))
        .filter((trip) => trip.end > windowStart && trip.start < windowEnd)
        .map((trip) => trip.index)
    );

    if (visibleTripIndexes.size === 0 || selectedNotifications.length === 0) {
      return header;
    }

    const notificationNameById = new Map(
      notifications.map((notif) => [notif.id, notif.name])
    );

    const rows = notificationEvents
      .filter((event) => selectedNotifications.includes(event.id))
      .filter((event) => visibleTripIndexes.has(event.tripIndex))
      .map((event) => {
        const trip = trips[event.tripIndex];
        if (!trip) return null;
        const eventStart = new Date(event.at).getTime();
        const durationMs = (event.durationMinutes ?? 3) * 60 * 1000;
        const eventEnd = eventStart + durationMs;
        const tripStart = new Date(trip.start).getTime();
        const tripEnd = new Date(trip.end).getTime();
        if (eventStart < tripStart || eventStart > tripEnd) return null;
        if (eventStart < windowStart || eventStart > windowEnd) return null;
        const clampedEnd = Math.min(eventEnd, tripEnd, windowEnd);
        return {
          at: event.at,
          endAt: new Date(clampedEnd).toISOString(),
          name: notificationNameById.get(event.id) ?? event.id,
          site: "—"
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a!.at).getTime() - new Date(b!.at).getTime())
      .map((row) => `${row!.name},${formatDateTime(new Date(row!.at))},${formatDateTime(new Date(row!.endAt))},${row!.site}`);

    const metaRows = [
      `Site,${selectedSite || "—"}`,
      `Registration,${selectedRegistration || "—"}`,
      "",
      header
    ];
    if (rows.length === 0) return metaRows.join("\n");
    return [...metaRows, ...rows].join("\n");
  };

  const handleMoreMenuAction = (label: string) => {
    setShowMoreMenu(false);
    if (label === "Timeline settings") {
      alert("Timeline settings coming soon.");
      return;
    }
    if (label === "Timeline report") {
      openTimelineReport();
      return;
    }
    if (label === "Download GPS data") {
      handleDownload("gps-data.csv", "timestamp,lat,lng\n2026-01-19T10:08:00Z,-1.2833,36.8167");
      showDownloadNotice("Download requested successfully.");
      return;
    }
    if (label === "Download tacho") {
      handleDownload("tacho-data.csv", buildTachoCsv());
      showDownloadNotice("Download requested successfully.");
      return;
    }
    if (label === "Download video") {
      setShowVideoModal(true);
      return;
    }
  };

  useEffect(() => {
    if (!draggingQueryLine) return;
    document.body.classList.add("no-select");
    const handleMove = (event: MouseEvent) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clamped = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const pct = rect.width === 0 ? 0 : (clamped / rect.width) * 100;
      setQueryLinePct(pct);
    };
    const handleUp = () => setDraggingQueryLine(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      document.body.classList.remove("no-select");
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingQueryLine]);

  useEffect(() => {
    if (draggingQueryLine) return;
    document.body.classList.remove("no-select");
  }, [draggingQueryLine]);

  // Use notifications from the shared notification library
  const notifications = notificationRows.map((row: NotificationRow, idx: number) => ({ id: String(idx + 1), name: row.description.replace(/^\*\s*/, "") }));
  const filteredNotifications = notificationFilter.trim()
    ? notifications.filter(n => n.name.toLowerCase().includes(notificationFilter.trim().toLowerCase()))
    : notifications;

  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (!el) return;
    el.indeterminate = !!(
      filteredNotifications.some(n => selectedNotifications.includes(n.id))
      && !filteredNotifications.every(n => selectedNotifications.includes(n.id))
    );
  }, [filteredNotifications, selectedNotifications]);

  const formatDayLabel = (date: Date) => date.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const formatMonthLabel = (date: Date) => date.toLocaleDateString("en-US", { month: "short" });
  const hourLabels = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")), []);

  const adjustTimeByMinutes = (deltaMinutes: number) => {
    const base = new Date(selectedDateObj);
    base.setMinutes(base.getMinutes() + deltaMinutes);
    const updated = `${base.getHours().toString().padStart(2, "0")}:${base.getMinutes().toString().padStart(2, "0")}`;
    setSelectedTime(updated);
    syncDateTime(base, updated);
  };

  const syncDateTime = (date: Date, timeValue?: string) => {
    const base = new Date(date);
    const [hours, minutes] = (timeValue ?? selectedTime).split(":").map((v) => Number(v));
    if (!Number.isNaN(hours)) base.setHours(hours);
    if (!Number.isNaN(minutes)) base.setMinutes(minutes);
    base.setSeconds(0, 0);
    setSelectedDateObj(base);
    setSelectedDateTime(base.toISOString().slice(0, 16));
  };

  return (
    <div className="trip-page">
      {downloadNotice && (
        <div className="trip-download-toast" role="status" aria-live="polite">
          <span className="trip-download-toast-icon" aria-hidden="true">✓</span>
          <span>{downloadNotice}</span>
        </div>
      )}
      <header className="trip-toolbar">
        <div className="trip-toolbar-left">
          <div className="trip-context-toggle" role="group" aria-label="Timeline view">
            <button
              type="button"
              className={`trip-toggle-btn${viewMode === "drivers" ? " active" : ""}`}
              onClick={() => handleViewModeChange("drivers")}
            >
              Drivers
            </button>
            <button
              type="button"
              className={`trip-toggle-btn${viewMode === "passengers" ? " active" : ""}`}
              onClick={() => handleViewModeChange("passengers")}
            >
              Passengers
            </button>
            <button
              type="button"
              className={`trip-toggle-btn${viewMode === "assets" ? " active" : ""}`}
              onClick={() => handleViewModeChange("assets")}
            >
              Assets
            </button>
          </div>
          {isPersonTimeline && (
            <label className="trip-context-select">
              <span className="trip-context-label">
                {contextType === "passenger" ? "Passenger" : "Driver"}
              </span>
              <select
                value={contextName}
                onChange={(event) => {
                  const next = event.target.value;
                  setContextName(next);
                  localStorage.setItem("vivi.contextName", next);
                  window.dispatchEvent(new Event("vivi:contextchange"));
                }}
              >
                {contextOptions.length === 0 && <option value="">Select</option>}
                {contextOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="trip-datetime" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setIsDatepickerOpen(true)}
              style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 12px', fontSize: 16, cursor: 'pointer', minWidth: 160, textAlign: 'left' }}
            >
              {selectedDateObj
                ? `${selectedDateObj.getDate().toString().padStart(2, '0')}/${(selectedDateObj.getMonth() + 1).toString().padStart(2, '0')}/${selectedDateObj.getFullYear()} ${selectedDateObj.getHours().toString().padStart(2, '0')}:${selectedDateObj.getMinutes().toString().padStart(2, '0')}`
                : ''}{" "}
              <span role="img" aria-label="calendar">📅</span>
            </button>
          </div>
        </div>

        <div className="trip-toolbar-right">
          {!isPersonTimeline && (
            <button
              className="live-topbar-chip"
              type="button"
              aria-label="Notifications"
              data-tooltip="Notifications"
              onClick={() => setShowNotifications(true)}
            >
              <span className="live-chip-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                  <path d="M9 19a3 3 0 006 0" />
                </svg>
              </span>
              {selectedNotifications.length}
            </button>
          )}
          <button
            className="live-topbar-chip"
            type="button"
            data-tooltip="Reports"
            data-nav="/measure/insights/reports?category=Trip%20Reports&report=Daily%20Trip%20Report"
          >
            <span className="live-chip-icon" aria-hidden="true">📊</span>
            Trip report
          </button>
          {visibleToolIcons.map((tool) => (
            <button
              key={tool.label}
              className={`trip-icon-btn${tool.label === "Query line" && showQueryLine ? " active" : ""}`}
              type="button"
              aria-label={tool.label}
              data-tooltip={tool.label}
              onClick={() => handleToolAction(tool.label)}
            >
              {tool.icon}
            </button>
          ))}
          <div style={{ display: "inline-block", position: "relative" }}>
            <button
              className="trip-icon-btn"
              type="button"
              aria-label="Actions"
              title="Actions"
              onClick={() => setShowMoreMenu((open) => !open)}
            >
              ⋯
            </button>
            {showMoreMenu && (
              <div
                className="trip-more-menu"
                style={{
                  position: "absolute",
                  right: 0,
                  top: 36,
                  minWidth: 200,
                  zIndex: 1000
                }}
              >
                {visibleMoreMenuOptions.map((opt) => (
                  <button
                    key={opt.label}
                    className="trip-more-item"
                    onClick={() => handleMoreMenuAction(opt.label)}
                    onMouseDown={e => e.preventDefault()}
                  >
                    <span className="trip-more-icon" aria-hidden="true">{opt.icon}</span>
                    <span className="trip-more-label">{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {isDatepickerOpen && (
        <div className="trip-datetime-modal" role="dialog" aria-modal="true" aria-label="Date and time">
          <div className="trip-datetime-card">
            <div className="trip-datetime-card-header">
              <div className="trip-datetime-card-day">{formatDayLabel(selectedDateObj)}</div>
              <div className="trip-datetime-card-date">
                <span className="trip-datetime-month">{formatMonthLabel(selectedDateObj)}</span>
                <span className="trip-datetime-day">{selectedDateObj.getDate()}</span>
                <span className="trip-datetime-year">{selectedDateObj.getFullYear()}</span>
              </div>
              <button
                type="button"
                className="trip-datetime-card-time"
                onClick={() => setActivePicker("time")}
              >
                {selectedDateObj.getHours().toString().padStart(2, "0")}:{selectedDateObj.getMinutes().toString().padStart(2, "0")}
              </button>
            </div>
            <div className="trip-datetime-card-body">
              {activePicker === "time" ? (
                <div className="trip-timepicker">
                  <div className="trip-clock-shell">
                    <div className="trip-clock-labels" aria-hidden="true">
                      {hourLabels.map((label, index) => (
                        <span
                          key={label}
                          className="trip-clock-label"
                          style={{
                            transform: `rotate(${index * 15}deg) translateY(-100px) rotate(${-index * 15}deg)`
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <TimePicker
                      onChange={(value) => {
                        if (!value) return;
                        setSelectedTime(value);
                        syncDateTime(selectedDateObj, value);
                      }}
                      value={selectedTime}
                      format="HH:mm"
                      maxDetail="minute"
                      isOpen
                      openClockOnFocus={false}
                      disableClock
                      clockIcon={null}
                      clearIcon={null}
                      className="trip-timepicker-control"
                    />
                  </div>
                </div>
              ) : (
                <DatePicker
                  selected={selectedDateObj}
                  onChange={(date: Date | null) => {
                    if (!date) return;
                    syncDateTime(date);
                  }}
                  inline
                  calendarClassName="trip-datepicker-calendar"
                />
              )}
            </div>
            <div className="trip-datetime-card-actions">
              <button
                type="button"
                onClick={() => setIsDatepickerOpen(false)}
                className="trip-datetime-done"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => setIsDatepickerOpen(false)}
                className="trip-datetime-confirm"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setActivePicker(activePicker === "date" ? "time" : "date")}
                className="trip-datetime-toggle"
              >
                {activePicker === "date" ? "Time" : "Date"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVideoModal && (
        <div className="trip-video-modal" role="dialog" aria-modal="true" aria-label="Download video">
          <div className="trip-video-card">
            <div className="trip-video-header">
              <div>Download video</div>
              <button
                type="button"
                className="trip-video-close"
                onClick={() => setShowVideoModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="trip-video-body">
              <div className="trip-video-help">Select the time period that you would like to download video for:</div>
              <label className="trip-video-field">
                <span>From</span>
                <button
                  type="button"
                  className="trip-video-date-btn"
                  onClick={() => {
                    setVideoPickerTarget("from");
                    const date = new Date(videoFrom);
                    setVideoPickerDateObj(date);
                    setVideoPickerTime(`${date.getHours().toString().padStart(2, "0")}:${date
                      .getMinutes()
                      .toString()
                      .padStart(2, "0")}`);
                    setVideoPickerActive("date");
                    setVideoPickerOpen(true);
                  }}
                >
                  {formatDisplayDateTime(videoFrom)}
                </button>
              </label>
              <label className="trip-video-field">
                <span>to</span>
                <button
                  type="button"
                  className="trip-video-date-btn"
                  onClick={() => {
                    setVideoPickerTarget("to");
                    const date = new Date(videoTo);
                    setVideoPickerDateObj(date);
                    setVideoPickerTime(`${date.getHours().toString().padStart(2, "0")}:${date
                      .getMinutes()
                      .toString()
                      .padStart(2, "0")}`);
                    setVideoPickerActive("date");
                    setVideoPickerOpen(true);
                  }}
                >
                  {formatDisplayDateTime(videoTo)}
                </button>
              </label>
              <div className="trip-video-section">Select which video views you would like to download</div>
              <label className="trip-video-checkbox">
                <input
                  type="checkbox"
                  checked={videoViews.includes("Road")}
                  onChange={(e) => {
                    setVideoViews((current) => e.target.checked
                      ? [...current, "Road"]
                      : current.filter((v) => v !== "Road"));
                  }}
                />
                Road
              </label>
              <label className="trip-video-checkbox">
                <input
                  type="checkbox"
                  checked={videoViews.includes("In Cab")}
                  onChange={(e) => {
                    setVideoViews((current) => e.target.checked
                      ? [...current, "In Cab"]
                      : current.filter((v) => v !== "In Cab"));
                  }}
                />
                In Cab
              </label>
              <label className="trip-video-checkbox">
                <input
                  type="checkbox"
                  checked={videoViews.includes("Driver")}
                  onChange={(e) => {
                    setVideoViews((current) => e.target.checked
                      ? [...current, "Driver"]
                      : current.filter((v) => v !== "Driver"));
                  }}
                />
                Driver
              </label>
              <label className="trip-video-field">
                <span>Video resolution</span>
                <select
                  value={videoResolution}
                  onChange={(e) => setVideoResolution(e.target.value)}
                >
                  <option>Standard resolution</option>
                  <option>High resolution</option>
                </select>
              </label>
              <div className="trip-video-note">
                You will receive an email confirmation when the video is ready for viewing. Please note, this may take some time.
              </div>
            </div>
            <div className="trip-video-actions">
              <button type="button" className="trip-video-cancel" onClick={() => setShowVideoModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="trip-video-submit"
                onClick={() => {
                  setShowVideoModal(false);
                  alert("Video download request submitted.");
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {videoPickerOpen && (
        <div className="trip-datetime-modal" role="dialog" aria-modal="true" aria-label="Select video time">
          <div className="trip-datetime-card">
            <div className="trip-datetime-card-header">
              <div className="trip-datetime-card-day">{formatDayLabel(videoPickerDateObj)}</div>
              <div className="trip-datetime-card-date">
                <span className="trip-datetime-month">{formatMonthLabel(videoPickerDateObj)}</span>
                <span className="trip-datetime-day">{videoPickerDateObj.getDate()}</span>
                <span className="trip-datetime-year">{videoPickerDateObj.getFullYear()}</span>
              </div>
              <button
                type="button"
                className="trip-datetime-card-time"
                onClick={() => setVideoPickerActive("time")}
              >
                {videoPickerTime}
              </button>
            </div>
            <div className="trip-datetime-card-body">
              {videoPickerActive === "time" ? (
                <div className="trip-timepicker">
                  <div className="trip-clock-shell">
                    <div className="trip-clock-labels" aria-hidden="true">
                      {hourLabels.map((label, index) => (
                        <span
                          key={label}
                          className="trip-clock-label"
                          style={{
                            transform: `rotate(${index * 15}deg) translateY(-100px) rotate(${-index * 15}deg)`
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <TimePicker
                      onChange={(value) => {
                        if (!value) return;
                        setVideoPickerTime(value);
                      }}
                      value={videoPickerTime}
                      format="HH:mm"
                      maxDetail="minute"
                      isOpen
                      openClockOnFocus={false}
                      disableClock
                      clockIcon={null}
                      clearIcon={null}
                      className="trip-timepicker-control"
                    />
                  </div>
                </div>
              ) : (
                <DatePicker
                  selected={videoPickerDateObj}
                  onChange={(date: Date | null) => {
                    if (!date) return;
                    setVideoPickerDateObj(date);
                  }}
                  inline
                  calendarClassName="trip-datepicker-calendar"
                />
              )}
            </div>
            <div className="trip-datetime-card-actions">
              <button
                type="button"
                onClick={() => setVideoPickerOpen(false)}
                className="trip-datetime-done"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  const [hours, minutes] = videoPickerTime.split(":").map((v) => Number(v));
                  const next = new Date(videoPickerDateObj);
                  if (!Number.isNaN(hours)) next.setHours(hours);
                  if (!Number.isNaN(minutes)) next.setMinutes(minutes);
                  next.setSeconds(0, 0);
                  const value = next.toISOString().slice(0, 16);
                  if (videoPickerTarget === "from") {
                    setVideoFrom(value);
                  } else {
                    setVideoTo(value);
                  }
                  setVideoPickerOpen(false);
                }}
                className="trip-datetime-confirm"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setVideoPickerActive(videoPickerActive === "date" ? "time" : "date")}
                className="trip-datetime-toggle"
              >
                {videoPickerActive === "date" ? "Time" : "Date"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Modal */}
      {showNotifications && (
        <div style={{
          position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(30,41,59,0.18)',
          zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', borderRadius: 16, minWidth: 600, maxWidth: '90vw', padding: 24, boxShadow: '0 8px 32px rgba(15,23,42,0.18)' }}>
            <div style={{
              fontWeight: 700,
              fontSize: 20,
              marginBottom: 16,
              color: '#111827',
              textAlign: 'left',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              borderBottomLeftRadius: 0,
              background: 'transparent',
              padding: '0 0 0 0',
            }}>
              Select Notifications
            </div>
            <input
              placeholder="Filter notifications"
              style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              value={notificationFilter}
              onChange={e => setNotificationFilter(e.target.value)}
            />
            <div style={{ maxHeight: 350, overflowY: 'auto', marginBottom: 18 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <th style={{ textAlign: 'left', padding: 8, fontWeight: 600 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          ref={headerCheckboxRef}
                          type="checkbox"
                          checked={filteredNotifications.length > 0 && filteredNotifications.every(n => selectedNotifications.includes(n.id))}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedNotifications(sel => Array.from(new Set([...sel, ...filteredNotifications.map(n => n.id)])));
                            } else {
                              setSelectedNotifications(sel => sel.filter(id => !filteredNotifications.some(n => n.id === id)));
                            }
                          }}
                          style={{ marginRight: 6 }}
                        />
                        Notification name
                      </label>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotifications.map(n => (
                    <tr key={n.id}>
                      <td style={{ padding: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={selectedNotifications.includes(n.id)}
                            onChange={e => {
                              setSelectedNotifications(sel =>
                                e.target.checked
                                  ? [...sel, n.id]
                                  : sel.filter(id => id !== n.id)
                              );
                            }}
                          />
                          {n.name}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setShowNotifications(false)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => setShowNotifications(false)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700 }}>Select Notifications</button>
            </div>
          </div>
        </div>
      )}

      <section className="trip-stage">
        {hasSelection ? (
          <>
            <div className="trip-timeline">
              <div className="trip-timeline-header">
                <span className="trip-timeline-range">
                  {baseStart ? `${formatDateTime(baseStart)} - ${formatDateTime(new Date(baseStart.getTime() + 24 * 60 * 60 * 1000))} EAT` : ''}
                </span>
              </div>

              <div className="trip-timeline-nav">
                <button
                  className="trip-timeline-arrow"
                  type="button"
                  aria-label="Previous"
                  onClick={() => setTimelineOffsetHours(offset => offset - 1)}
                >
                  ◀
                </button>
                <div className="trip-timeline-nav-spacer" aria-hidden="true" />
                <button
                  className="trip-timeline-arrow"
                  type="button"
                  aria-label="Next"
                  onClick={() => setTimelineOffsetHours(offset => offset + 1)}
                >
                  ▶
                </button>
              </div>

              <div className="trip-timeline-track">
                <button
                  className="trip-timeline-arrow"
                  type="button"
                  aria-label="Previous"
                  onClick={() => setTimelineOffsetHours(offset => offset - 1)}
                  style={{ zIndex: 2 }}
                >
                  ◀
                </button>
                <div className="trip-timeline-grid" ref={timelineRef}>
                  {showQueryLine && (
                    <div
                      className="trip-query-line"
                      style={{ left: `${queryLinePct}%` }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setDraggingQueryLine(true);
                      }}
                      role="slider"
                      aria-valuenow={Math.round(queryLinePct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Query line"
                    >
                      <span className="trip-query-label">{queryLabel}</span>
                      <span className="trip-query-handle" aria-hidden="true" />
                    </div>
                  )}
                  <div className="trip-timeline-ruler" aria-hidden="true" />
                  <div className="trip-timeline-labels">
                    {scaleLabels.map((label, index) => (
                      <span key={`${label}-${index}`}>{label}</span>
                    ))}
                  </div>
                  <div className="trip-timeline-ruler" aria-hidden="true" />
                  <div className="trip-timeline-bars">
                    <div className="trip-timeline-row trip-timeline-row--trips">
                      <div className="trip-timeline-bar trip-timeline-bar--trips">
                        <span className="trip-timeline-bar-label">Trips</span>
                        {/* Dynamically position trips within the current timeline window */}
                        {baseStart && (() => {
                          const windowStart = baseStart.getTime();
                          const windowEnd = windowStart + 24 * 60 * 60 * 1000;
                          return trips
                            .map((trip, i) => {
                              const tripStart = new Date(trip.start).getTime();
                              const tripEnd = new Date(trip.end).getTime();
                              // Only show trips that overlap the window
                              if (tripEnd < windowStart || tripStart > windowEnd) return null;
                              // Clamp trip to window
                              const clampedStart = Math.max(tripStart, windowStart);
                              const clampedEnd = Math.min(tripEnd, windowEnd);
                              const leftPct = ((clampedStart - windowStart) / (windowEnd - windowStart)) * 100;
                              const widthPct = ((clampedEnd - clampedStart) / (windowEnd - windowStart)) * 100;
                              return <TripBlock key={i} trip={{ ...trip, left: `${leftPct}%`, width: `${widthPct}%` }} />;
                            })
                        })()}
                        {baseStart && visibleTrips.length === 0 && (
                          <div className="trip-empty-results">No trips available for this asset in the selected window.</div>
                        )}
                      </div>
                    </div>
                    <div className="trip-timeline-scroll">
                      {/* Selected Notifications Timeline Rows */}
                      {selectedNotifications.length > 0 && selectedNotifications.map((id) => {
                        const notif = notifications.find((n) => n.id === id);
                        if (!notif) return null;
                        // Only show notification bar if it overlaps with at least one trip in the current window
                        if (!baseStart) return null;
                        const windowStart = baseStart.getTime();
                        const windowEnd = windowStart + 24 * 60 * 60 * 1000;
                        // Find if any trip overlaps with the window
                        const hasTripInWindow = trips.some(trip => {
                          const tripStart = new Date(trip.start).getTime();
                          const tripEnd = new Date(trip.end).getTime();
                          return tripEnd > windowStart && tripStart < windowEnd;
                        });
                        if (!hasTripInWindow) return null;
                        const eventsForRow = notificationEvents.filter((event) => event.id === id);
                        const isIgnitionOnRow = notif.name.toLowerCase() === "ignition on";
                        const isIgnitionOffRow = notif.name.toLowerCase() === "ignition off";
                        const tripWindows = trips
                          .map((trip) => ({
                            start: new Date(trip.start).getTime(),
                            end: new Date(trip.end).getTime()
                          }))
                          .filter((trip) => trip.end > windowStart && trip.start < windowEnd)
                          .sort((a, b) => a.start - b.start);
                        const ignitionOnSpans = tripWindows.map((trip) => ({
                          start: Math.max(trip.start, windowStart),
                          end: Math.min(trip.end, windowEnd)
                        }));
                        const ignitionOffSpans = (() => {
                          if (tripWindows.length === 0) {
                            return [{ start: windowStart, end: windowEnd }];
                          }
                          const spans: { start: number; end: number }[] = [];
                          let cursor = windowStart;
                          tripWindows.forEach((trip) => {
                            if (trip.start > cursor) {
                              spans.push({ start: cursor, end: Math.min(trip.start, windowEnd) });
                            }
                            cursor = Math.max(cursor, trip.end);
                          });
                          if (cursor < windowEnd) {
                            spans.push({ start: cursor, end: windowEnd });
                          }
                          return spans;
                        })();
                        return (
                          <div className="trip-timeline-row" key={id}>
                            <span className="trip-timeline-row-label" style={{ fontWeight: 600, color: '#222' }}>{notif.name}</span>
                            <div className="trip-timeline-bar">
                              {isIgnitionOnRow && ignitionOnSpans.map((span, index) => {
                                const leftPct = ((span.start - windowStart) / (windowEnd - windowStart)) * 100;
                                const widthPct = ((span.end - span.start) / (windowEnd - windowStart)) * 100;
                                return (
                                  <span
                                    key={`ignition-on-${index}`}
                                    className="trip-notification-block trip-notification-block--ignition"
                                    style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1)}%` }}
                                  />
                                );
                              })}
                              {isIgnitionOffRow && ignitionOffSpans.map((span, index) => {
                                const leftPct = ((span.start - windowStart) / (windowEnd - windowStart)) * 100;
                                const widthPct = ((span.end - span.start) / (windowEnd - windowStart)) * 100;
                                return (
                                  <span
                                    key={`ignition-off-${index}`}
                                    className="trip-notification-block trip-notification-block--ignition"
                                    style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1)}%` }}
                                  />
                                );
                              })}
                              {!isIgnitionOnRow && !isIgnitionOffRow && (() => {
                                const merged: Array<{ start: number; end: number }> = [];
                                const normalized = eventsForRow
                                  .map((event) => {
                                    const tripForEvent = trips[event.tripIndex];
                                    if (!tripForEvent) return null;
                                    const eventStart = new Date(event.at).getTime();
                                    const durationMs = (event.durationMinutes ?? 3) * 60 * 1000;
                                    const eventEnd = eventStart + durationMs;
                                    const tripStart = new Date(tripForEvent.start).getTime();
                                    const tripEnd = new Date(tripForEvent.end).getTime();
                                    if (eventEnd < tripStart || eventStart > tripEnd) return null;
                                    if (eventEnd < windowStart || eventStart > windowEnd) return null;
                                    return {
                                      start: Math.max(eventStart, windowStart),
                                      end: Math.min(eventEnd, windowEnd)
                                    };
                                  })
                                  .filter(Boolean)
                                  .sort((a: any, b: any) => a.start - b.start) as Array<{ start: number; end: number }>;
                                const mergeGap = 2 * 60 * 1000;
                                normalized.forEach((span) => {
                                  const last = merged[merged.length - 1];
                                  if (!last || span.start > last.end + mergeGap) {
                                    merged.push({ ...span });
                                  } else {
                                    last.end = Math.max(last.end, span.end);
                                  }
                                });
                                return merged.map((span, index) => {
                                  const leftPct = ((span.start - windowStart) / (windowEnd - windowStart)) * 100;
                                  const widthPct = ((span.end - span.start) / (windowEnd - windowStart)) * 100;
                                  return (
                                    <span
                                      key={`${id}-${index}`}
                                      className="trip-notification-block trip-notification-block--event"
                                      style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1)}%` }}
                                    />
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <button
                  className="trip-timeline-arrow"
                  type="button"
                  aria-label="Next"
                  onClick={() => setTimelineOffsetHours(offset => offset + 1)}
                  style={{ zIndex: 2 }}
                >
                  ▶
                </button>
              </div>
            </div>
            {/* ...existing code... */}
          </>
        ) : (
          <>
            <div className="trip-map" aria-hidden="true" />
            <div className="trip-empty">
              <div className="trip-empty-title">Please select an asset</div>
              <div className="trip-empty-sub">Choose a vehicle to see its trip timeline and notifications.</div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// TripBlock component for rich tooltip (must be after export default)
function TripBlock({ trip }: { trip: any }) {
  const [hovered, setHovered] = React.useState(false);
  const format = (dt: string) => {
    const d = new Date(dt);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };
  const tripStart = new Date(trip.start).getTime();
  const tripEnd = new Date(trip.end).getTime();
  const tripDuration = Math.max(tripEnd - tripStart, 1);
  return (
    <span
      className="trip-trip-block trip-ignition-on"
      style={{ left: trip.left, width: trip.width, zIndex: hovered ? 10 : undefined }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {Array.isArray(trip.segments) && trip.segments
        .filter((segment: any) => segment.type === "moving")
        .map((segment: any, index: number) => {
          const segStart = new Date(segment.start).getTime();
          const segEnd = new Date(segment.end).getTime();
          const clampedStart = Math.max(segStart, tripStart);
          const clampedEnd = Math.min(segEnd, tripEnd);
          if (clampedEnd <= clampedStart) return null;
          const leftPct = ((clampedStart - tripStart) / tripDuration) * 100;
          const widthPct = ((clampedEnd - clampedStart) / tripDuration) * 100;
          return (
            <span
              key={`move-${index}`}
              className="trip-trip-seg trip-trip-seg--moving"
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            />
          );
        })}
      {hovered && (
        <div className="trip-tooltip-rich">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{trip.driver}</div>
          <div><b>Start date:</b> {format(trip.start)} (EAT)</div>
          <div><b>End date:</b> {format(trip.end)} (EAT)</div>
          <div><b>Duration:</b> {trip.duration.replace(/^0+/, "")}</div>
          <div><b>Distance:</b> {trip.distance}</div>
        </div>
      )}
    </span>
  );
}
