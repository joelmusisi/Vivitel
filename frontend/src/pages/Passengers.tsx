import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveToApi } from "../utils/api";
import "../index.css";

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

const initialPassengers: PassengerRow[] = [
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

type ColumnKey = keyof PassengerRow;

type Column = {
  key: keyof PassengerRow;
  label: string;
};

const columns: Column[] = [
  { key: "name", label: "Name" },
  { key: "driverId", label: "Passenger ID" },
  { key: "extendedDriverId", label: "Extended Passenger ID" },
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

export default function Passengers() {
  const navigate = useNavigate();
  const bulkImportRef = useRef<HTMLInputElement | null>(null);
  const [passengerRows, setPassengerRows] = useState<PassengerRow[]>(initialPassengers);
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
    if (activeFilter === "All") return passengerRows;
    if (activeFilter === "Automatically created") return passengerRows.filter((d) => d.autoCreated);
    if (activeFilter === "Reminders due soon") return passengerRows.filter((d) => d.remindersStatus === "due-soon");
    if (activeFilter === "Reminders overdue") return passengerRows.filter((d) => d.remindersStatus === "overdue");
    return passengerRows;
  }, [activeFilter, passengerRows]);

  const countFor = (label: FilterKey) => {
    if (label === "All") return passengerRows.length;
    if (label === "Automatically created") return passengerRows.filter((d) => d.autoCreated).length;
    if (label === "Reminders due soon") return passengerRows.filter((d) => d.remindersStatus === "due-soon").length;
    if (label === "Reminders overdue") return passengerRows.filter((d) => d.remindersStatus === "overdue").length;
    return passengerRows.length;
  };

  const grid = `repeat(${activeCols.length}, minmax(0, 1fr)) 36px`;

  const siteOptions = useMemo(() => {
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
    return () => window.removeEventListener("vivi:orgchange", handleOrgChange as EventListener);
  }, []);

  const saveEditingPassenger = () => {
    if (!editingPassenger) return;
    setPassengerRows((current) => {
      const exists = current.some((row) => row.id === editingPassenger.id);
      if (exists) {
        return current.map((row) => (row.id === editingPassenger.id ? editingPassenger : row));
      }
      return [...current, editingPassenger];
    });
    void saveToApi(`passengers:${editingPassenger.id}`, {
      ...editingPassenger,
      updatedAt: new Date().toISOString()
    });
    setEditingPassenger(null);
  };

  const cancelEditingPassenger = () => {
    setEditingPassenger(null);
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
    const nextRows: PassengerRow[] = rows.slice(1).map((line, idx) => {
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
    setPassengerRows((current) => [...current, ...nextRows]);
  };

  const setPersonContext = (name: string, site?: string) => {
    const activeSite = site || localStorage.getItem("vivi.activeSite") || "";
    const filteredRows = passengerRows.filter((row) => {
      if (activeSite) return row.site === activeSite;
      if (dbSites.length > 0) return dbSites.includes(row.site);
      return true;
    });
    const options = filteredRows
      .map((row) => ({ name: row.name, site: row.site }))
      .filter((row) => row.name);
    localStorage.setItem("vivi.contextType", "passenger");
    localStorage.setItem("vivi.contextName", name);
    localStorage.setItem("vivi.contextOptions.passenger", JSON.stringify(options));
    localStorage.setItem("vivi.contextOptions", JSON.stringify(options));
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  return (
    <>
      <div className="page assets-page">
        <div className="assets-toolbar">
          <div className="assets-toolbar-left">
            <span>Passengers</span>
            <span className="assets-toolbar-count">{passengerRows.length}</span>
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
              onClick={() => setPassengerRows(initialPassengers)}
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
                setEditingPassenger({
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
                {filteredPassengers.map((passenger) => (
                  <div key={passenger.id} className="assets-row" style={{ gridTemplateColumns: grid }}>
                    {activeCols.map((col) => (
                      <div key={col.key} className="assets-cell">
                        {String(passenger[col.key] ?? "—")}
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
                                  setEditingPassenger(passenger);
                                  setOpenRowMenu(null);
                                } else if (item.label === "Remove") {
                                  const confirmed = window.confirm(`Remove ${passenger.name}?`);
                                  if (!confirmed) return;
                                  setPassengerRows((current) => current.filter((row) => row.id !== passenger.id));
                                  setOpenRowMenu(null);
                                } else if (item.label === "Show on trip timeline") {
                                  const currentAsset = localStorage.getItem("vivi.activeAsset");
                                  if (!currentAsset) {
                                    localStorage.setItem("vivi.activeAsset", passenger.name);
                                  }
                                  localStorage.setItem("vivi.activeRegistration", passenger.driverId);
                                  localStorage.setItem("vivi.activeSite", passenger.site ?? "—");
                                  setPersonContext(passenger.name, passenger.site);
                                  navigate("/monitor/activity/trip-timeline");
                                } else if (item.label === "Show on historical tracking") {
                                  const currentAsset = localStorage.getItem("vivi.activeAsset");
                                  if (!currentAsset) {
                                    localStorage.setItem("vivi.activeAsset", passenger.name);
                                  }
                                  localStorage.setItem("vivi.activeRegistration", passenger.driverId);
                                  localStorage.setItem("vivi.activeSite", passenger.site ?? "—");
                                  localStorage.setItem("vivi.historyTime", new Date().toISOString().slice(0, 16));
                                  setPersonContext(passenger.name, passenger.site);
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
      {editingPassenger && (
        <div className="assets-add-modal" role="dialog" aria-modal="true">
          <div className="assets-add-card">
            <div className="assets-add-header">
              <div className="assets-add-title">Edit passenger</div>
              <div className="assets-add-actions">
                <button className="assets-add-icon-btn" type="button" onClick={cancelEditingPassenger}>
                  Cancel
                </button>
                <button
                  className="assets-toolbar-add"
                  type="button"
                  data-tooltip="Save"
                  onClick={saveEditingPassenger}
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
