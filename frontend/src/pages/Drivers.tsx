import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveToApi } from "../utils/api";
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
  autoCreated?: boolean;
  remindersStatus?: "due-soon" | "overdue" | "none";
};

const initialDrivers: DriverRow[] = [
  {
    id: "4",
    name: "AutoCreated",
    driverId: "18",
    extendedDriverId: "—",
    employeeNumber: "—",
    mobileNumber: "—",
    country: "—",
    email: "—",
    lastTrip: "15/09/2025 11:30 (EAT)",
    timeSinceLastTrip: "127-20:42:32",
    site: "Default Site",
    autoCreated: true,
    remindersStatus: "overdue"
  },
  {
    id: "5",
    name: "Installer",
    driverId: "-2",
    extendedDriverId: "—",
    employeeNumber: "—",
    mobileNumber: "—",
    country: "—",
    email: "—",
    lastTrip: "07/08/2020 18:11 (EAT)",
    timeSinceLastTrip: "1992-14:01:29",
    site: "Default Site",
    remindersStatus: "none"
  },
  {
    id: "6",
    name: "James Byaruhanga",
    driverId: "19",
    extendedDriverId: "—",
    employeeNumber: "—",
    mobileNumber: "+256 774732913",
    country: "Uganda",
    email: "james_byaruhanga@bat.com",
    lastTrip: "29/12/2025 14:28 (EAT)",
    timeSinceLastTrip: "22-17:44:39",
    site: "BAT Uganda",
    remindersStatus: "none"
  },
  {
    id: "7",
    name: "Mathu Kiunjuri",
    driverId: "21",
    extendedDriverId: "—",
    employeeNumber: "—",
    mobileNumber: "+256 775510557",
    country: "Uganda",
    email: "—",
    lastTrip: "20/01/2026 21:21 (EAT)",
    timeSinceLastTrip: "0-10:51:45",
    site: "BAT Uganda",
    remindersStatus: "none"
  },
  {
    id: "8",
    name: "NTEGE SHARIF",
    driverId: "5",
    extendedDriverId: "—",
    employeeNumber: "—",
    mobileNumber: "—",
    country: "Uganda",
    email: "—",
    lastTrip: "29/03/2021 17:47 (EAT)",
    timeSinceLastTrip: "1758-14:26:03",
    site: "C&G Andjies",
    remindersStatus: "none"
  },
  {
    id: "9",
    name: "Unknown",
    driverId: "0",
    extendedDriverId: "—",
    employeeNumber: "—",
    mobileNumber: "—",
    country: "—",
    email: "—",
    lastTrip: "04/03/2025 18:51 (EAT)",
    timeSinceLastTrip: "322-13:21:32",
    site: "Default Site",
    remindersStatus: "none"
  },
  {
    id: "10",
    name: "Unmatched Extended DriverID",
    driverId: "1",
    extendedDriverId: "—",
    employeeNumber: "—",
    mobileNumber: "—",
    country: "—",
    email: "—",
    lastTrip: "—",
    timeSinceLastTrip: "—",
    site: "Default Site",
    remindersStatus: "none"
  },
  {
    id: "11",
    name: "Vita Nasur",
    driverId: "3",
    extendedDriverId: "—",
    employeeNumber: "—",
    mobileNumber: "—",
    country: "—",
    email: "—",
    lastTrip: "03/04/2021 11:10 (EAT)",
    timeSinceLastTrip: "1753-21:02:55",
    site: "C&G Andjies",
    remindersStatus: "none"
  }
];

const filters = ["All", "Automatically created", "Reminders due soon", "Reminders overdue"] as const;

type FilterKey = (typeof filters)[number];

type ColumnKey = keyof DriverRow;

type Column = {
  key: keyof DriverRow;
  label: string;
};

const columns: Column[] = [
  { key: "name", label: "Name" },
  { key: "driverId", label: "Driver ID" },
  { key: "extendedDriverId", label: "Extended Driver ID" },
  { key: "employeeNumber", label: "Employee number" },
  { key: "mobileNumber", label: "Mobile number" },
  { key: "country", label: "Country" },
  { key: "email", label: "Email address" },
  { key: "lastTrip", label: "Last trip" },
  { key: "timeSinceLastTrip", label: "Time since last trip (dd-hh:mm:ss)" },
  { key: "site", label: "Site" }
];

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
  "Côte d’Ivoire",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czechia",
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

export default function Drivers() {
  const navigate = useNavigate();
  const bulkImportRef = useRef<HTMLInputElement | null>(null);
  const [driverRows, setDriverRows] = useState<DriverRow[]>(initialDrivers);
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
    if (activeFilter === "All") return driverRows;
    if (activeFilter === "Automatically created") return driverRows.filter((d) => d.autoCreated);
    if (activeFilter === "Reminders due soon") return driverRows.filter((d) => d.remindersStatus === "due-soon");
    if (activeFilter === "Reminders overdue") return driverRows.filter((d) => d.remindersStatus === "overdue");
    return driverRows;
  }, [activeFilter, driverRows]);

  const countFor = (label: FilterKey) => {
    if (label === "All") return driverRows.length;
    if (label === "Automatically created") return driverRows.filter((d) => d.autoCreated).length;
    if (label === "Reminders due soon") return driverRows.filter((d) => d.remindersStatus === "due-soon").length;
    if (label === "Reminders overdue") return driverRows.filter((d) => d.remindersStatus === "overdue").length;
    return driverRows.length;
  };

  const grid = `repeat(${activeCols.length}, minmax(0, 1fr)) 36px`;

  const siteOptions = useMemo(() => {
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
    return () => window.removeEventListener("vivi:orgchange", handleOrgChange as EventListener);
  }, []);

  const saveEditingDriver = () => {
    if (!editingDriver) return;
    setDriverRows((current) => {
      const exists = current.some((row) => row.id === editingDriver.id);
      if (exists) {
        return current.map((row) => (row.id === editingDriver.id ? editingDriver : row));
      }
      return [...current, editingDriver];
    });
    void saveToApi(`drivers:${editingDriver.id}`, {
      ...editingDriver,
      updatedAt: new Date().toISOString()
    });
    setEditingDriver(null);
    setIsNewDriver(false);
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
    const nextRows: DriverRow[] = rows.slice(1).map((line, idx) => {
      const values = parseCsvLine(line);
      const getValue = (key: ColumnKey) => {
        const index = indexByKey[key];
        return typeof index === "number" ? values[index] ?? "" : "";
      };
      return {
        id: `${Date.now()}-${idx}`,
        name: getValue("name") || "—",
        driverId: getValue("driverId") || "—",
        extendedDriverId: getValue("extendedDriverId") || "—",
        employeeNumber: getValue("employeeNumber") || "—",
        mobileNumber: getValue("mobileNumber") || "—",
        country: getValue("country") || "—",
        email: getValue("email") || "—",
        lastTrip: getValue("lastTrip") || "—",
        timeSinceLastTrip: getValue("timeSinceLastTrip") || "—",
        site: getValue("site") || "—",
        remindersStatus: "none"
      };
    });
    setDriverRows((current) => [...current, ...nextRows]);
  };

  const setPersonContext = (name: string, site?: string) => {
    const activeSite = site || localStorage.getItem("vivi.activeSite") || "";
    const filteredRows = driverRows.filter((row) => {
      if (activeSite) return row.site === activeSite;
      if (dbSites.length > 0) return dbSites.includes(row.site);
      return true;
    });
    const options = filteredRows
      .map((row) => ({ name: row.name, site: row.site }))
      .filter((row) => row.name);
    localStorage.setItem("vivi.contextType", "driver");
    localStorage.setItem("vivi.contextName", name);
    localStorage.setItem("vivi.contextOptions.driver", JSON.stringify(options));
    localStorage.setItem("vivi.contextOptions", JSON.stringify(options));
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  return (
    <>
      <div className="page assets-page">
      <div className="assets-toolbar">
        <div className="assets-toolbar-left">
          <span>Drivers</span>
          <span className="assets-toolbar-count">{driverRows.length}</span>
        </div>
        <div className="assets-toolbar-right">
          <div className="assets-toolbar-search">
            <input placeholder="Search" />
            <span className="assets-toolbar-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </span>
          </div>
          <button
            className="assets-toolbar-icon"
            aria-label="Export"
            data-tooltip="Export"
            type="button"
            onClick={handleExport}
          >
            ⤓
          </button>
          <button
            className="assets-toolbar-icon"
            aria-label="Download template"
            data-tooltip="Download template"
            type="button"
            onClick={handleDownloadTemplate}
          >
            ⬇️
          </button>
          <button
            className="assets-toolbar-icon"
            aria-label="Bulk import"
            data-tooltip="Bulk import"
            type="button"
            onClick={() => bulkImportRef.current?.click()}
          >
            ⭱
          </button>
          <button
            className="assets-toolbar-icon"
            aria-label="Refresh"
            data-tooltip="Refresh"
            type="button"
            onClick={() => setDriverRows(initialDrivers)}
          >
            ↻
          </button>
          <button
            className="assets-toolbar-icon"
            aria-label="Reports"
            data-tooltip="Reports"
            type="button"
            data-nav="/measure/insights/reports?category=List%20Reports&report=Driver%20List%20Report"
          >
            📊
          </button>
          <button
            className="assets-toolbar-add"
            aria-label="Add"
            data-tooltip="Add"
            type="button"
            onClick={() => {
              setEditingDriver({
                id: `${Date.now()}`,
                name: "",
                driverId: "",
                extendedDriverId: "",
                employeeNumber: "",
                mobileNumber: "",
                country: "",
                email: "",
                lastTrip: "",
                timeSinceLastTrip: "",
                site: ""
              });
              setIsNewDriver(true);
            }}
          >
            +
          </button>
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
                  {col.label}
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
              {filteredDrivers.map((driver) => (
                <div key={driver.id} className="assets-row" style={{ gridTemplateColumns: grid }}>
                  {activeCols.map((col) => (
                    <div key={col.key} className="assets-cell">
                      {String(driver[col.key] ?? "—")}
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
                            onClick={() => {
                              if (item.label === "Edit") {
                                setEditingDriver(driver);
                                setOpenRowMenu(null);
                              } else if (item.label === "Remove") {
                                const confirmed = window.confirm(`Remove ${driver.name}?`);
                                if (!confirmed) return;
                                setDriverRows((current) => current.filter((row) => row.id !== driver.id));
                                setOpenRowMenu(null);
                              } else if (item.label === "Show on trip timeline") {
                                const currentAsset = localStorage.getItem("vivi.activeAsset");
                                if (!currentAsset) {
                                  localStorage.setItem("vivi.activeAsset", driver.name);
                                }
                                localStorage.setItem("vivi.activeRegistration", driver.driverId);
                                localStorage.setItem("vivi.activeSite", driver.site ?? "—");
                                setPersonContext(driver.name, driver.site);
                                navigate("/monitor/activity/trip-timeline");
                              } else if (item.label === "Show on historical tracking") {
                                const currentAsset = localStorage.getItem("vivi.activeAsset");
                                if (!currentAsset) {
                                  localStorage.setItem("vivi.activeAsset", driver.name);
                                }
                                localStorage.setItem("vivi.activeRegistration", driver.driverId);
                                localStorage.setItem("vivi.activeSite", driver.site ?? "—");
                                localStorage.setItem("vivi.historyTime", new Date().toISOString().slice(0, 16));
                                setPersonContext(driver.name, driver.site);
                                navigate("/monitor/tracking/historical");
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
      {editingDriver && (
        <div className="assets-add-modal" role="dialog" aria-modal="true">
          <div className="assets-add-card">
            <div className="assets-add-header">
              <div className="assets-add-title">Edit driver</div>
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
