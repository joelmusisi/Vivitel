import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SortableColumnHeader from "../components/SortableColumnHeader";
import { useColumnSort } from "../hooks/useColumnSort";
import { useNavigate } from "react-router-dom";
import "../index.css";
import { EditIcon, CompassIcon, TimelineIcon, TrashIcon } from "../components/Icons";
import { readUserPref, USER_PREF_KEYS, writeUserPref } from "../utils/userAppPrefs";
import {
  filterRecordsForActiveSelection,
  loadScopedFromApi,
  peekScopedFromApi,
  saveScopedToApi,
  siteScopesMatch
} from "../utils/scopeStorage";
import { readActiveSiteName, subscribeScopeChange } from "../utils/tenantContext";
import { showToast } from "../utils/toast";
import { runOptimisticUpdate } from "../utils/optimisticUpdate";

const PASSENGERS_KV_BASE = "fleet:passengers";

type PassengerRow = {
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
  autoCreated?: boolean;
  remindersStatus?: "due-soon" | "overdue" | "none";
};

type PassengerListPayload = { items?: PassengerRow[] };

type FilterKey = "All" | "Automatically created" | "Reminders due soon" | "Reminders overdue";
type ColumnKey = keyof PassengerRow;

const columns: Array<{ key: ColumnKey; label: string }> = [
  { key: "name", label: "Passenger name" },
  { key: "driverId", label: "Passenger ID" },
  { key: "extendedDriverId", label: "Extended passenger ID" },
  { key: "employeeNumber", label: "Employee number" },
  { key: "mobileNumber", label: "Mobile number" },
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

const initialPassengers: PassengerRow[] = [];

const countryOptions = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo, Democratic Republic of the",
  "Congo, Republic of the",
  "Costa Rica",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czech Republic",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Korea, North",
  "Korea, South",
  "Kosovo",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Palestine",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Sudan, South",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe"
];

function readCachedPassengerRows(): PassengerRow[] {
  const activeSite = readActiveSiteName();
  if (!activeSite) return [];
  const payload = peekScopedFromApi<PassengerListPayload>(PASSENGERS_KV_BASE, activeSite);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return filterRecordsForActiveSelection(
    items.map((row) => ({
      ...row,
      site: String(row.site ?? "").trim() || activeSite
    }))
  );
}

export default function Passengers() {
  const navigate = useNavigate();
  const bulkImportRef = useRef<HTMLInputElement | null>(null);
  const [passengerRows, setPassengerRows] = useState<PassengerRow[]>(() => readCachedPassengerRows());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("All");
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [colMenuPos, setColMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<keyof PassengerRow>>(
    new Set(columns.map((col) => col.key))
  );
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(columns.map((col) => col.key));
  const [dragCol, setDragCol] = useState<ColumnKey | null>(null);
  const [editingPassenger, setEditingPassenger] = useState<PassengerRow | null>(null);
  const [isNewPassenger, setIsNewPassenger] = useState(false);
  const [dbSites, setDbSites] = useState<string[]>([]);

  const toggleCol = (key: keyof PassengerRow) => {
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

  const filteredPassengers = useMemo(() => {
    let rows = passengerRows;
    if (activeFilter === "Automatically created") rows = passengerRows.filter((d) => d.autoCreated);
    else if (activeFilter === "Reminders due soon") rows = passengerRows.filter((d) => d.remindersStatus === "due-soon");
    else if (activeFilter === "Reminders overdue") rows = passengerRows.filter((d) => d.remindersStatus === "overdue");

    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((passenger) =>
      columns.some((col) => String(passenger[col.key] ?? "").toLowerCase().includes(q))
    );
  }, [activeFilter, passengerRows, searchQuery]);

  const getPassengerSortValue = useCallback(
    (row: PassengerRow, key: ColumnKey) => row[key],
    []
  );

  const { sortedRows: sortedFilteredPassengers, getHeaderProps: getPassengerHeaderProps } = useColumnSort({
    rows: filteredPassengers,
    getValue: getPassengerSortValue
  });

  const countFor = (label: FilterKey) => {
    if (label === "All") return passengerRows.length;
    if (label === "Automatically created") return passengerRows.filter((d) => d.autoCreated).length;
    if (label === "Reminders due soon") return passengerRows.filter((d) => d.remindersStatus === "due-soon").length;
    if (label === "Reminders overdue") return passengerRows.filter((d) => d.remindersStatus === "overdue").length;
    return passengerRows.length;
  };

  const grid = `repeat(${activeCols.length}, minmax(0, 1fr)) 36px`;

  const siteOptions = useMemo(() => {
    const activeSite = readActiveSiteName();
    if (activeSite) return [activeSite];
    const unique = new Set(
      [...passengerRows.map((passenger) => passenger.site), ...dbSites].filter(Boolean)
    );
    return Array.from(unique);
  }, [passengerRows, dbSites]);

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

  const persistPassengers = async (rows: PassengerRow[], site?: string) => {
    const siteName = String(site ?? readActiveSiteName()).trim();
    if (!siteName) {
      showToast("Select a site before saving passengers.", "error");
      return false;
    }
    const scoped = rows
      .map((row) => ({ ...row, site: String(row.site ?? "").trim() || siteName }))
      .filter((row) => siteScopesMatch(row.site, siteName));
    return saveScopedToApi(PASSENGERS_KV_BASE, { items: scoped }, siteName);
  };

  const loadPassengers = async () => {
    const activeSite = readActiveSiteName();
    if (!activeSite) {
      setPassengerRows([]);
      return;
    }
    const cached = readCachedPassengerRows();
    if (cached.length) setPassengerRows(cached);
    const payload = await loadScopedFromApi<PassengerListPayload>(PASSENGERS_KV_BASE, activeSite);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    setPassengerRows(
      filterRecordsForActiveSelection(
        items.map((row) => ({
          ...row,
          site: String(row.site ?? "").trim() || activeSite
        }))
      )
    );
  };

  const saveEditingPassenger = async () => {
    if (!editingPassenger) return;
    const site = String(editingPassenger.site ?? "").trim() || readActiveSiteName();
    if (!site) {
      showToast("Select a site before saving the passenger.", "error");
      return;
    }
    const nextPassenger = { ...editingPassenger, site, updatedAt: new Date().toISOString() } as PassengerRow & {
      updatedAt?: string;
    };
    const nextRows = (() => {
      const exists = passengerRows.some((row) => row.id === nextPassenger.id);
      if (exists) {
        return passengerRows.map((row) => (row.id === nextPassenger.id ? nextPassenger : row));
      }
      return [...passengerRows, nextPassenger];
    })();
    setEditingPassenger(null);
    setIsNewPassenger(false);
    await runOptimisticUpdate({
      getSnapshot: () => passengerRows,
      apply: () => setPassengerRows(filterRecordsForActiveSelection(nextRows)),
      rollback: (snapshot) => {
        setPassengerRows(snapshot);
        setEditingPassenger(nextPassenger);
        setIsNewPassenger(isNewPassenger);
      },
      request: () => persistPassengers(nextRows, site),
      errorMessage: "Unable to save passengers for this site."
    });
  };

  const cancelEditingPassenger = () => {
    setEditingPassenger(null);
    setIsNewPassenger(false);
  };

  const openNewPassenger = () => {
    const nextId = nextAvailableNumericId(passengerRows.map((p) => p.driverId));
    setEditingPassenger({
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
      site: readActiveSiteName()
    });
    setIsNewPassenger(true);
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
    const dataRows = filteredPassengers.map((passenger) => columns.map((col) => String(passenger[col.key] ?? "")));
    downloadCsv("passengers-export.csv", [header, ...dataRows]);
  };

  const handleDownloadTemplate = () => {
    const header = columns.map((col) => col.label);
    const sample = columns.map((col) => {
      if (col.key === "name") return "Jane Doe";
      if (col.key === "driverId") return "1001";
      if (col.key === "extendedDriverId") return "EXT-1001";
      if (col.key === "employeeNumber") return "EMP-1001";
      if (col.key === "mobileNumber") return "+256 700000000";
      if (col.key === "country") return "Uganda";
      if (col.key === "email") return "jane.doe@example.com";
      if (col.key === "lastTrip") return "22/01/2026 10:00 (EAT)";
      if (col.key === "timeSinceLastTrip") return "0-02:00:00";
      if (col.key === "site") return "Default Site";
      return "";
    });
    downloadCsv("passengers-import-template.csv", [header, sample]);
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
    const nextRows: PassengerRow[] = rows.slice(1).map((line, idx) => {
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
        remindersStatus: "none"
      };
    });
    const scopedImports = nextRows.filter((row) => String(row.site ?? "").trim());
    if (scopedImports.length === 0) {
      showToast("Imported passengers must include a site.", "error");
      return;
    }
    const merged = filterRecordsForActiveSelection([...passengerRows, ...scopedImports]);
    await runOptimisticUpdate({
      getSnapshot: () => passengerRows,
      apply: () => setPassengerRows(merged),
      rollback: (snapshot) => setPassengerRows(snapshot),
      request: () => persistPassengers(merged, activeSite || scopedImports[0]?.site),
      errorMessage: "Unable to save passengers for this site."
    });
  };

  useEffect(() => {
    const onAction = (event: Event) => {
      const key = String((event as CustomEvent<{ key?: string }>).detail?.key ?? "");
      if (key === "add") openNewPassenger();
      if (key === "export") handleExport();
      if (key === "template") handleDownloadTemplate();
      if (key === "import") bulkImportRef.current?.click();
      if (key === "refresh") void loadPassengers();
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
  }, [openNewPassenger]);

  useEffect(() => {
    void loadPassengers();
    const unsubscribeScope = subscribeScopeChange(() => void loadPassengers());
    return () => unsubscribeScope();
  }, []);

  const setPersonContext = (name: string, site?: string) => {
    const activeSite = site || readActiveSiteName() || "";
    const filteredRows = passengerRows.filter((row) => {
      if (activeSite) return siteScopesMatch(row.site, activeSite);
      if (dbSites.length > 0) return dbSites.some((dbSite) => siteScopesMatch(row.site, dbSite));
      return Boolean(String(row.site ?? "").trim());
    });
    const options = filteredRows
      .map((row) => ({ name: row.name, site: row.site }))
      .filter((row) => row.name);
    writeUserPref(USER_PREF_KEYS.contextType, "passenger");
    writeUserPref(USER_PREF_KEYS.contextName, name);
    localStorage.setItem("vivi.contextOptions.passenger", JSON.stringify(options));
    localStorage.setItem("vivi.contextOptions", JSON.stringify(options));
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

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
            <span className="assets-toolbar-count">{filteredPassengers.length}</span>
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
                    <SortableColumnHeader label={col.label} {...getPassengerHeaderProps(col.key)} />
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
                {sortedFilteredPassengers.map((passenger) => (
                  <div key={passenger.id} className="assets-row" style={{ gridTemplateColumns: grid }}>
                    {activeCols.map((col) => (
                      <div key={col.key} className="assets-cell">
                        {String(passenger[col.key] ?? "")}
                      </div>
                    ))}
                    <div className="assets-cell actions">
                      <button
                        className="actions-trigger"
                        aria-label="Row actions"
                        onClick={() => setOpenRowMenu((current) => (current === passenger.id ? null : passenger.id))}
                      >
                        ⋯
                      </button>
                      {openRowMenu === passenger.id && (
                        <div className="assets-row-menu" role="menu">
                          {[
                            { label: "Edit", icon: <EditIcon /> },
                            { label: "Show on historical tracking", icon: <CompassIcon /> },
                            { label: "Show on trip timeline", icon: <TimelineIcon /> },
                            { label: "Remove", icon: <TrashIcon /> }
                          ].map((item) => (
                            <button
                              key={item.label}
                              className="assets-row-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                if (item.label === "Edit") {
                                  setEditingPassenger(passenger);
                                  setIsNewPassenger(false);
                                  setOpenRowMenu(null);
                                } else if (item.label === "Remove") {
                                  const confirmed = window.confirm(`Remove ${passenger.name}?`);
                                  if (!confirmed) return;
                                  const nextRows = passengerRows.filter((row) => row.id !== passenger.id);
                                  setOpenRowMenu(null);
                                  void runOptimisticUpdate({
                                    getSnapshot: () => passengerRows,
                                    apply: () => setPassengerRows(nextRows),
                                    rollback: (snapshot) => setPassengerRows(snapshot),
                                    request: () => persistPassengers(nextRows, passenger.site),
                                    errorMessage: "Unable to save passengers for this site.",
                                    successFeedback: false,
                                    onSuccess: () => showToast("Passenger removed.", "success")
                                  });
                                } else if (item.label === "Show on trip timeline") {
                                  const currentAsset = readUserPref(USER_PREF_KEYS.activeAsset);
                                  if (!currentAsset) {
                                    writeUserPref(USER_PREF_KEYS.activeAsset, passenger.name);
                                  }
                                  writeUserPref(USER_PREF_KEYS.activeRegistration, passenger.driverId);
                                  localStorage.setItem("vivi.activeSite", passenger.site ?? "");
                                  setPersonContext(passenger.name, passenger.site);
                                  navigate("/Track/activity/trip-timeline");
                                } else if (item.label === "Show on historical tracking") {
                                  const currentAsset = readUserPref(USER_PREF_KEYS.activeAsset);
                                  if (!currentAsset) {
                                    writeUserPref(USER_PREF_KEYS.activeAsset, passenger.name);
                                  }
                                  writeUserPref(USER_PREF_KEYS.activeRegistration, passenger.driverId);
                                  localStorage.setItem("vivi.activeSite", passenger.site ?? "");
                                  localStorage.setItem("vivi.historyTime", new Date().toISOString().slice(0, 16));
                                  setPersonContext(passenger.name, passenger.site);
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
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
      {editingPassenger && (
        <div className="assets-add-modal" role="dialog" aria-modal="true">
          <div className="assets-add-card people-form-card">
            <div className="assets-add-header">
              <div className="assets-add-title">{isNewPassenger ? "Add passenger" : "Edit passenger"}</div>
              <div className="assets-add-actions">
                <button className="assets-add-icon-btn" type="button" onClick={cancelEditingPassenger}>
                  Cancel
                </button>
                <button
                  className="assets-toolbar-add"
                  type="button"
                  data-tooltip="Save"
                  onClick={() => {
                    void saveEditingPassenger();
                  }}
                >
                  Save
                </button>
              </div>
            </div>
            <div className="assets-add-body data-modal-body">
              <div className="assets-add-grid">
                <label>
                  Name
                  <input
                    value={editingPassenger?.name ?? ""}
                    onChange={(event) =>
                      setEditingPassenger((current) =>
                        current ? { ...current, name: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Passenger ID
                  <input
                    value={editingPassenger?.driverId ?? ""}
                    onChange={(event) =>
                      setEditingPassenger((current) =>
                        current ? { ...current, driverId: event.target.value } : current
                      )
                    }
                    disabled
                  />
                </label>
                <label>
                  Extended Passenger ID
                  <input
                    value={editingPassenger?.extendedDriverId ?? ""}
                    onChange={(event) =>
                      setEditingPassenger((current) =>
                        current ? { ...current, extendedDriverId: event.target.value } : current
                      )
                    }
                    disabled
                  />
                </label>
                <label>
                  Employee number
                  <input
                    value={editingPassenger?.employeeNumber ?? ""}
                    onChange={(event) =>
                      setEditingPassenger((current) =>
                        current ? { ...current, employeeNumber: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Mobile number
                  <input
                    value={editingPassenger?.mobileNumber ?? ""}
                    onChange={(event) =>
                      setEditingPassenger((current) =>
                        current ? { ...current, mobileNumber: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Country
                  <select
                    value={editingPassenger?.country ?? ""}
                    onChange={(event) =>
                      setEditingPassenger((current) =>
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
                    value={editingPassenger?.email ?? ""}
                    onChange={(event) =>
                      setEditingPassenger((current) =>
                        current ? { ...current, email: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label>
                  Site
                  <select
                    value={editingPassenger?.site ?? ""}
                    onChange={(event) =>
                      setEditingPassenger((current) =>
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
