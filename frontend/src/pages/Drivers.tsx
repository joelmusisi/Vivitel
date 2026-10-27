import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VTLoader from "../components/VTLoader";
import SortableColumnHeader from "../components/SortableColumnHeader";
import { useColumnSort } from "../hooks/useColumnSort";
import { useNavigate } from "react-router-dom";
import { deleteDriverFromApi, getDriversFromApi, upsertDriverDetailed } from "../utils/api";
import { countryOptions } from "../data/countryOptions";
import { showToast } from "../utils/toast";
import { runOptimisticUpdate } from "../utils/optimisticUpdate";
import { readUserPref, USER_PREF_KEYS, writeUserPref } from "../utils/userAppPrefs";
import { filterRecordsForActiveSelection, siteScopesMatch } from "../utils/scopeStorage";
import { readActiveSiteName, subscribeScopeChange } from "../utils/tenantContext";
import { readCachedDrivers, type SharedDriverRecord } from "../utils/driverStore";
import { createHierarchyArranger } from "../utils/viviCategories";
import "../index.css";

type DriverRow = {
  id: string;
  name: string;
  driverId: string;
  extendedDriverId: string;
  employeeNumber: string;
  mobileNumber: string;
  country: string;
  email: string;
  lastTrip: string;
  timeSinceLastTrip: string;
  site: string;
  driverType: string;
  licenceNo: string;
  licenseExpiryDate: string;
  driverDob: string;
  timeZone: string;
  autoCreated?: boolean;
  remindersStatus?: "due-soon" | "overdue" | "none";
};

type FilterKey = "All" | "Automatically created" | "Reminders due soon" | "Reminders overdue";
type ColumnKey = keyof DriverRow;

const DRIVER_TYPE_OPTIONS = ["NONE", "ibutton", "RFID", "Beacon"] as const;

const columns: Array<{ key: ColumnKey; label: string }> = [
  { key: "name", label: "Driver name" },
  { key: "driverId", label: "Driver ID" },
  { key: "extendedDriverId", label: "Extended driver ID" },
  { key: "employeeNumber", label: "Employee number" },
  { key: "mobileNumber", label: "Mobile number" },
  { key: "driverType", label: "Driver type" },
  { key: "driverDob", label: "Date of birth" },
  { key: "licenceNo", label: "Licence number" },
  { key: "licenseExpiryDate", label: "Licence expiry" },
  { key: "timeZone", label: "Time zone" },
  { key: "country", label: "Country" },
  { key: "email", label: "Email" },
  { key: "site", label: "Site" },
  { key: "lastTrip", label: "Last trip" },
  { key: "timeSinceLastTrip", label: "Time since last trip" }
];

const filters: FilterKey[] = ["All", "Automatically created", "Reminders due soon", "Reminders overdue"];

function nextAvailableNumericId(values: string[]): string {
  const used = new Set<number>();
  for (const v of values) {
    const n = Number(String(v ?? "").trim());
    if (Number.isFinite(n) && n > 0) used.add(Math.floor(n));
  }
  let i = 1;
  while (used.has(i)) i += 1;
  return String(i);
}

function toDriverRow(row: SharedDriverRecord): DriverRow {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    driverId: String(row.driverId ?? ""),
    extendedDriverId: String(row.extendedDriverId ?? ""),
    employeeNumber: String(row.employeeNumber ?? ""),
    mobileNumber: String(row.mobileNumber ?? ""),
    country: String(row.country ?? ""),
    email: String(row.email ?? ""),
    lastTrip: String(row.lastTrip ?? ""),
    timeSinceLastTrip: String(row.timeSinceLastTrip ?? ""),
    site: String(row.site ?? ""),
    driverType: String(row.driverType ?? "NONE"),
    licenceNo: String(row.licenceNo ?? ""),
    licenseExpiryDate: String(row.licenseExpiryDate ?? ""),
    driverDob: String(row.driverDob ?? ""),
    timeZone: String(row.timeZone ?? "UTC"),
    autoCreated: row.autoCreated,
    remindersStatus:
      row.remindersStatus === "due-soon" || row.remindersStatus === "overdue" ? row.remindersStatus : "none"
  };
}

function cachedDriverRows(): DriverRow[] {
  return filterRecordsForActiveSelection(readCachedDrivers().map(toDriverRow));
}

export default function Drivers() {
  const navigate = useNavigate();
  const bulkImportRef = useRef<HTMLInputElement | null>(null);
  const [driverRows, setDriverRows] = useState<DriverRow[]>(() => cachedDriverRows());
  const [driversLoading, setDriversLoading] = useState(() => cachedDriverRows().length === 0);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("All");
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [colMenuPos, setColMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<keyof DriverRow>>(
    new Set(columns.map((col) => col.key))
  );
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(columns.map((col) => col.key));
  const [dragCol, setDragCol] = useState<ColumnKey | null>(null);
  const [editingDriver, setEditingDriver] = useState<DriverRow | null>(null);
  const [isNewDriver, setIsNewDriver] = useState(false);
  const [dbSites, setDbSites] = useState<string[]>([]);

  const toggleCol = (key: keyof DriverRow) => {
    setVisibleCols((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeCols = columnOrder
    .filter((key) => visibleCols.has(key))
    .map((key) => columns.find((col) => col.key === key)!)
    .filter(Boolean);

  const filteredDrivers = useMemo(() => {
    let rows = driverRows;
    if (activeFilter === "Automatically created") rows = driverRows.filter((d) => d.autoCreated);
    else if (activeFilter === "Reminders due soon") rows = driverRows.filter((d) => d.remindersStatus === "due-soon");
    else if (activeFilter === "Reminders overdue") rows = driverRows.filter((d) => d.remindersStatus === "overdue");

    const q = searchQuery.trim().toLowerCase();
    const matched = !q
      ? rows
      : rows.filter((driver) =>
          columns.some((col) => String(driver[col.key] ?? "").toLowerCase().includes(q))
        );
    return matched;
  }, [activeFilter, driverRows, searchQuery]);

  const getDriverSortValue = useCallback(
    (row: DriverRow, key: ColumnKey) => row[key],
    []
  );

  const {
    sortedRows: sortedFilteredDrivers,
    sort: driverTableSort,
    getHeaderProps: getDriverHeaderProps
  } = useColumnSort({
    rows: filteredDrivers,
    getValue: getDriverSortValue
  });

  const driverTableItems = useMemo(() => {
    if (driverTableSort) {
      return sortedFilteredDrivers.map((driver) => ({ type: "driver" as const, driver }));
    }
    const arranger = createHierarchyArranger();
    const sites = new Set(filteredDrivers.map((driver) => String(driver.site ?? "").trim().toLowerCase()));
    const showGroups = sites.size > 1;
    const items: Array<
      | { type: "group"; key: string; title: string; path: string }
      | { type: "driver"; driver: DriverRow }
    > = [];
    let lastKey = "";
    for (const driver of filteredDrivers) {
      if (showGroups) {
        const group = arranger.groupFor(driver);
        if (group.key !== lastKey) {
          items.push({ type: "group", ...group });
          lastKey = group.key;
        }
      }
      items.push({ type: "driver", driver });
    }
    return items;
  }, [driverTableSort, filteredDrivers, sortedFilteredDrivers]);

  const countFor = (label: FilterKey) => {
    if (label === "All") return driverRows.length;
    if (label === "Automatically created") return driverRows.filter((d) => d.autoCreated).length;
    if (label === "Reminders due soon") return driverRows.filter((d) => d.remindersStatus === "due-soon").length;
    if (label === "Reminders overdue") return driverRows.filter((d) => d.remindersStatus === "overdue").length;
    return driverRows.length;
  };

  const grid = `repeat(${activeCols.length}, minmax(0, 1fr)) 36px`;

  const siteOptions = useMemo(() => {
    const activeSite = readActiveSiteName();
    if (activeSite) return [activeSite];
    const unique = new Set(
      [...driverRows.map((driver) => driver.site), ...dbSites].filter(Boolean)
    );
    return Array.from(unique);
  }, [driverRows, dbSites]);

  useEffect(() => {
    const readDbSites = () => {
      const stored = localStorage.getItem("vivi.activeDbSites");
      if (!stored) {
        setDbSites([]);
        return;
      }
      try {
        const parsed = JSON.parse(stored);
        setDbSites(Array.isArray(parsed) ? parsed : []);
      } catch {
        setDbSites([]);
      }
    };
    readDbSites();
    const handleOrgChange = () => readDbSites();
    window.addEventListener("vivi:orgchange", handleOrgChange as EventListener);
    window.addEventListener("vivi:contextchange", handleOrgChange as EventListener);
    return () => {
      window.removeEventListener("vivi:orgchange", handleOrgChange as EventListener);
      window.removeEventListener("vivi:contextchange", handleOrgChange as EventListener);
    };
  }, []);

  const saveEditingDriver = async () => {
    if (!editingDriver) return;
    const site = String(editingDriver.site ?? "").trim() || readActiveSiteName();
    if (!site) {
      showToast("Select a site before saving the driver.", "error");
      return;
    }
    const name = String(editingDriver.name ?? "").trim();
    if (!name) {
      showToast("Driver name is required.", "error");
      return;
    }
    const nextDriver = { ...editingDriver, name, site, updatedAt: new Date().toISOString() };

    setEditingDriver(null);
    setIsNewDriver(false);
    await runOptimisticUpdate({
      getSnapshot: () => driverRows,
      apply: () =>
        setDriverRows((current) => {
          const exists = current.some((row) => row.id === nextDriver.id);
          const next = exists
            ? current.map((row) => (row.id === nextDriver.id ? nextDriver : row))
            : [...current, nextDriver];
          return filterRecordsForActiveSelection(next);
        }),
      rollback: (snapshot) => {
        setDriverRows(snapshot);
        setEditingDriver(nextDriver);
        setIsNewDriver(isNewDriver);
      },
      request: () => upsertDriverDetailed(nextDriver),
      errorMessage: (result) => {
        const message =
          typeof result === "object" ? String(result.error ?? "Unable to save driver.") : "Unable to save driver.";
        if (typeof result === "object" && result.status === 409 && /driver email exists/i.test(message)) {
          return "Driver Email Exists";
        }
        return message;
      }
    });
  };

  const cancelEditingDriver = () => {
    setEditingDriver(null);
    setIsNewDriver(false);
  };

  const parseCsvLine = (line: string) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values.map((value) => value.replace(/^"|"$/g, "").trim());
  };

  const downloadCsv = (filename: string, rows: string[][]) => {
    const content = rows
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const header = columns.map((col) => col.label);
    const dataRows = filteredDrivers.map((driver) => columns.map((col) => String(driver[col.key] ?? "")));
    downloadCsv("drivers-export.csv", [header, ...dataRows]);
  };

  const handleDownloadTemplate = () => {
    const header = columns.map((col) => col.label);
    const sample = columns.map((col) => {
      if (col.key === "name") return "Jane Doe";
      if (col.key === "driverId") return "1001";
      if (col.key === "extendedDriverId") return "EXT-1001";
      if (col.key === "employeeNumber") return "EMP-1001";
      if (col.key === "mobileNumber") return "+256 700000000";
      if (col.key === "driverType") return "NONE";
      if (col.key === "driverDob") return "1990-01-15";
      if (col.key === "licenceNo") return "DL-1001";
      if (col.key === "licenseExpiryDate") return "2027-06-07 21:00:00";
      if (col.key === "timeZone") return "UTC";
      if (col.key === "country") return "Uganda";
      if (col.key === "email") return "jane.doe@example.com";
      if (col.key === "lastTrip") return "22/01/2026 10:00 (EAT)";
      if (col.key === "timeSinceLastTrip") return "0-02:00:00";
      if (col.key === "site") return "Default Site";
      return "";
    });
    downloadCsv("drivers-import-template.csv", [header, sample]);
  };

  const handleBulkImport = async (file: File) => {
    const text = await file.text();
    const rows = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (rows.length < 2) return;
    const header = parseCsvLine(rows[0]).map((value) => value.toLowerCase());
    const indexByKey = columns.reduce<Record<string, number>>((acc, col) => {
      const labelIndex = header.indexOf(col.label.toLowerCase());
      if (labelIndex >= 0) acc[col.key] = labelIndex;
      return acc;
    }, {});
    const activeSite = readActiveSiteName();
    const nextRows: DriverRow[] = rows.slice(1).map((line, idx) => {
      const values = parseCsvLine(line);
      const getValue = (key: ColumnKey) => {
        const index = indexByKey[key];
        return typeof index === "number" ? values[index] ?? "" : "";
      };
      return {
        id: `${Date.now()}-${idx}`,
        name: getValue("name") || "",
        driverId: getValue("driverId") || "",
        extendedDriverId: getValue("extendedDriverId") || "",
        employeeNumber: getValue("employeeNumber") || "",
        mobileNumber: getValue("mobileNumber") || "",
        country: getValue("country") || "",
        email: getValue("email") || "",
        lastTrip: getValue("lastTrip") || "",
        timeSinceLastTrip: getValue("timeSinceLastTrip") || "",
        site: getValue("site") || activeSite || "",
        driverType: getValue("driverType") || "NONE",
        licenceNo: getValue("licenceNo") || "",
        licenseExpiryDate: getValue("licenseExpiryDate") || "",
        driverDob: getValue("driverDob") || "",
        timeZone: getValue("timeZone") || "UTC",
        remindersStatus: "none"
      };
    });
    const scopedImports = nextRows.filter((row) => String(row.site ?? "").trim() && String(row.name ?? "").trim());
    if (scopedImports.length === 0) {
      showToast("Imported drivers must include a name and site.", "error");
      return;
    }
    const stored: DriverRow[] = [];
    let failed = 0;
    for (const row of scopedImports) {
      const result = await upsertDriverDetailed(row);
      if (result.stored) stored.push(row);
      else failed += 1;
    }
    if (stored.length === 0) {
      showToast("Unable to save imported drivers to the server.", "error");
      return;
    }
    setDriverRows((current) => filterRecordsForActiveSelection([...current, ...stored]));
    showToast(
      failed > 0
        ? `Imported ${stored.length} driver(s); ${failed} could not be saved.`
        : `Imported ${stored.length} driver(s).`,
      failed > 0 ? "info" : "success"
    );
  };

  const setPersonContext = (name: string, site?: string) => {
    const activeSite = site || readActiveSiteName() || "";
    const filteredRows = driverRows.filter((row) => {
      if (activeSite) return siteScopesMatch(row.site, activeSite);
      if (dbSites.length > 0) return dbSites.some((dbSite) => siteScopesMatch(row.site, dbSite));
      return Boolean(String(row.site ?? "").trim());
    });
    const options = filteredRows
      .map((row) => ({ name: row.name, site: row.site }))
      .filter((row) => row.name);
    writeUserPref(USER_PREF_KEYS.contextType, "driver");
    writeUserPref(USER_PREF_KEYS.contextName, name);
    localStorage.setItem("vivi.contextOptions.driver", JSON.stringify(options));
    localStorage.setItem("vivi.contextOptions", JSON.stringify(options));
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const openNewDriver = () => {
    const nextId = nextAvailableNumericId(driverRows.map((d) => d.driverId));
    setEditingDriver({
      id: `${Date.now()}`,
      name: "",
      driverId: nextId,
      extendedDriverId: `EXT-${nextId}`,
      employeeNumber: "",
      mobileNumber: "",
      country: "",
      email: "",
      lastTrip: "",
      timeSinceLastTrip: "",
      site: readActiveSiteName(),
      driverType: "NONE",
      licenceNo: "",
      licenseExpiryDate: "",
      driverDob: "",
      timeZone: "UTC"
    });
    setIsNewDriver(true);
  };

  const loadDrivers = async () => {
    const cached = cachedDriverRows();
    if (cached.length) {
      setDriverRows(cached);
      setDriversLoading(false);
    } else {
      setDriversLoading(true);
    }
    try {
      const rows = await getDriversFromApi<DriverRow>();
      setDriverRows(filterRecordsForActiveSelection(Array.isArray(rows) ? rows : []));
    } finally {
      setDriversLoading(false);
    }
  };

  useEffect(() => {
    const onAction = (event: Event) => {
      const key = String((event as CustomEvent<{ key?: string }>).detail?.key ?? "");
      if (key === "add") openNewDriver();
      if (key === "export") handleExport();
      if (key === "template") handleDownloadTemplate();
      if (key === "import") bulkImportRef.current?.click();
      if (key === "refresh") void loadDrivers();
    };
    const onSearch = (event: Event) => {
      setSearchQuery(String((event as CustomEvent<{ value?: string }>).detail?.value ?? ""));
    };
    window.addEventListener("vivi.ribbon.action", onAction as EventListener);
    window.addEventListener("vivi.ribbon.search", onSearch as EventListener);
    return () => {
      window.removeEventListener("vivi.ribbon.action", onAction as EventListener);
      window.removeEventListener("vivi.ribbon.search", onSearch as EventListener);
    };
  }, [openNewDriver]);

  useEffect(() => {
    void loadDrivers();
    const unsubscribeScope = subscribeScopeChange(() => void loadDrivers());
    return () => unsubscribeScope();
  }, []);

  return (
    <>
      <div className="page assets-page">
      <input
        ref={bulkImportRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          handleBulkImport(file);
          event.currentTarget.value = "";
        }}
      />

      <div className="assets-toolbar">
        <div className="assets-toolbar-left">
          <span className="assets-toolbar-pill">{activeFilter}</span>
          <span className="assets-toolbar-count">{filteredDrivers.length}</span>
        </div>
      </div>

      <div className="assets-layout">
        <aside className="assets-filter">
          {filters.map((label) => (
            <button
              key={label}
              type="button"
              className={`filter-row${activeFilter === label ? " active" : ""}`}
              onClick={() => setActiveFilter(label)}
            >
              <span>{label}</span>
              <span className="count-pill">{countFor(label)}</span>
            </button>
          ))}
        </aside>

        <section className="assets-table-wrap">
          <div className="assets-table-inner">
            <div className="assets-table-head" style={{ gridTemplateColumns: grid }}>
              {activeCols.map((col) => (
                <div
                  key={col.key}
                  className={`assets-col${dragCol === col.key ? " dragging" : ""}`}
                  draggable
                  onDragStart={(event) => {
                    setDragCol(col.key);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", col.key);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const fromKey = (event.dataTransfer.getData("text/plain") as ColumnKey) || dragCol;
                    if (!fromKey || fromKey === col.key) return;
                    setColumnOrder((current) => {
                      const next = current.filter((key) => key !== fromKey);
                      const targetIndex = next.indexOf(col.key);
                      next.splice(Math.max(0, targetIndex), 0, fromKey);
                      return next;
                    });
                    setDragCol(null);
                  }}
                  onDragEnd={() => setDragCol(null)}
                >
                  <SortableColumnHeader label={col.label} {...getDriverHeaderProps(col.key)} />
                </div>
              ))}
              <div className="assets-col-menu">
                <button
                  className="menu-icon-btn"
                  aria-label="Toggle columns"
                  onClick={(event) => {
                    const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                    setShowColumns((current) => !current);
                    setColMenuPos({ top: rect.bottom + 6, left: rect.right - 220 });
                  }}
                >
                  <span />
                  <span />
                  <span />
                </button>
                {showColumns && colMenuPos && (
                  <div className="assets-col-dropdown" style={{ top: colMenuPos.top, left: colMenuPos.left }}>
                    {columns.map((col) => (
                      <label key={col.key} className="columns-option">
                        <input
                          type="checkbox"
                          checked={visibleCols.has(col.key)}
                          onChange={() => toggleCol(col.key)}
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="assets-table-body">
              {driversLoading && filteredDrivers.length === 0 ? (
                <VTLoader compact label="Loading drivers" />
              ) : null}
              {driverTableItems.map((entry) => {
                if (entry.type === "group") {
                  return (
                  <div key={`group:${entry.key}`} className="drivers-hierarchy-group">
                    <span className="drivers-hierarchy-group-title">{entry.title}</span>
                    {entry.path ? <span className="drivers-hierarchy-group-path">{entry.path}</span> : null}
                  </div>
                  );
                }
                const driver = entry.driver;
                return (
                <div key={driver.id} className="assets-row" style={{ gridTemplateColumns: grid }}>
                  {activeCols.map((col) => (
                    <div key={col.key} className="assets-cell">
                      {String(driver[col.key] ?? "")}
                    </div>
                  ))}
                  <div className="assets-cell actions">
                    <button
                      className="actions-trigger"
                      aria-label="Row actions"
                      onClick={() => setOpenRowMenu((current) => (current === driver.id ? null : driver.id))}
                    >
                      ⋯
                    </button>
                    {openRowMenu === driver.id && (
                      <div className="assets-row-menu" role="menu">
                        {[
                          { label: "Edit", icon: "✏️" },
                          { label: "Show on historical tracking", icon: "🧭" },
                          { label: "Show on trip timeline", icon: "🧾" },
                          { label: "Remove", icon: "🗑️" }
                        ].map((item) => (
                          <button
                            key={item.label}
                            className="assets-row-menu-item"
                            type="button"
                            role="menuitem"
                            onClick={async () => {
                              if (item.label === "Edit") {
                                setEditingDriver(driver);
                                setIsNewDriver(false);
                                setOpenRowMenu(null);
                              } else if (item.label === "Remove") {
                                const confirmed = window.confirm(`Remove ${driver.name}?`);
                                if (!confirmed) return;
                                setOpenRowMenu(null);
                                void runOptimisticUpdate({
                                  getSnapshot: () => driverRows,
                                  apply: () =>
                                    setDriverRows((current) => current.filter((row) => row.id !== driver.id)),
                                  rollback: (snapshot) => setDriverRows(snapshot),
                                  request: () => deleteDriverFromApi(driver.id, driver.site),
                                  errorMessage: "Unable to remove driver from the server.",
                                  successFeedback: false,
                                  onSuccess: () => showToast("Driver removed.", "success")
                                });
                              } else if (item.label === "Show on trip timeline") {
                                const currentAsset = readUserPref(USER_PREF_KEYS.activeAsset);
                                if (!currentAsset) {
                                  writeUserPref(USER_PREF_KEYS.activeAsset, driver.name);
                                }
                                writeUserPref(USER_PREF_KEYS.activeRegistration, driver.driverId);
                                localStorage.setItem("vivi.activeSite", driver.site ?? "");
                                setPersonContext(driver.name, driver.site);
                                navigate("/Track/activity/trip-timeline");
                              } else if (item.label === "Show on historical tracking") {
                                const currentAsset = readUserPref(USER_PREF_KEYS.activeAsset);
                                if (!currentAsset) {
                                  writeUserPref(USER_PREF_KEYS.activeAsset, driver.name);
                                }
                                writeUserPref(USER_PREF_KEYS.activeRegistration, driver.driverId);
                                localStorage.setItem("vivi.activeSite", driver.site ?? "");
                                localStorage.setItem("vivi.historyTime", new Date().toISOString().slice(0, 16));
                                setPersonContext(driver.name, driver.site);
                                navigate("/Track/tracking/historical");
                              }
                            }}
                          >
                            <span className="assets-row-menu-icon" aria-hidden="true">
                              {item.icon}
                            </span>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
      </div>
      {editingDriver && (
        <div className="assets-add-modal" role="dialog" aria-modal="true">
          <div className="assets-add-card people-form-card">
            <div className="assets-add-header">
              <div className="assets-add-title">{isNewDriver ? "Add driver" : "Edit driver"}</div>
              <div className="assets-add-actions">
                <button className="assets-add-icon-btn" type="button" onClick={cancelEditingDriver}>
                  Cancel
                </button>
                <button
                  className="assets-toolbar-add"
                  type="button"
                  data-tooltip="Save"
                  onClick={saveEditingDriver}
                >
                  Save
                </button>
              </div>
            </div>
            <div className="assets-add-body data-modal-body">
              <div className="assets-add-grid">
                <label>
                  Name
                  <span className="assets-required"> *</span>
                  <input
                    value={editingDriver?.name ?? ""}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, name: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Driver ID
                  <input
                    value={editingDriver?.driverId ?? ""}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, driverId: event.target.value } : current
                      )
                    }
                    disabled
                  />
                </label>
                <label>
                  Extended Driver ID
                  <input
                    value={editingDriver?.extendedDriverId ?? ""}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, extendedDriverId: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Employee number
                  <input
                    value={editingDriver?.employeeNumber ?? ""}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, employeeNumber: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Mobile number
                  <input
                    value={editingDriver?.mobileNumber ?? ""}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, mobileNumber: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Driver type
                  <select
                    value={editingDriver?.driverType || "NONE"}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, driverType: event.target.value } : current
                      )
                    }
                  >
                    {DRIVER_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Date of birth
                  <input
                    type="date"
                    value={String(editingDriver?.driverDob ?? "").slice(0, 10)}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, driverDob: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Licence number
                  <input
                    value={editingDriver?.licenceNo ?? ""}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, licenceNo: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Licence expiry
                  <input
                    value={editingDriver?.licenseExpiryDate ?? ""}
                    placeholder="2027-06-07 21:00:00"
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, licenseExpiryDate: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Time zone
                  <input
                    value={editingDriver?.timeZone || "UTC"}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, timeZone: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Country
                  <select
                    value={editingDriver?.country ?? ""}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, country: event.target.value } : current
                      )
                    }
                  >
                    <option value="">Select country</option>
                    {countryOptions.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Email address
                  <input
                    value={editingDriver?.email ?? ""}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, email: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Site
                  <select
                    value={editingDriver?.site ?? ""}
                    onChange={(event) =>
                      setEditingDriver((current) =>
                        current ? { ...current, site: event.target.value } : current
                      )
                    }
                  >
                    <option value="">Select site</option>
                    {siteOptions.map((site) => (
                      <option key={site} value={site}>
                        {site}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
