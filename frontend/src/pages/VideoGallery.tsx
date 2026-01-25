import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import TimePicker from "react-time-picker";
import "react-datepicker/dist/react-datepicker.css";
import "react-time-picker/dist/TimePicker.css";
import "react-clock/dist/Clock.css";
import "../index.css";

const filterIcons = [
  { key: "assets", label: "Assets", symbol: "📷", tooltip: "Assets" },
  { key: "driver", label: "Driver", symbol: "🚗", tooltip: "Drivers" },
  { key: "event", label: "Event", symbol: "⚠️", tooltip: "Notifications" },
  { key: "location", label: "Location", symbol: "📍", tooltip: "Locations" }
];

const assetRows = [
  {
    id: "25",
    description: "MAN T136 DNX",
    registration: "T136 DNX",
    make: "MAN",
    model: "",
    channels: "Road, In Cab, Driver",
    peripheral: "Streamax AD Plus",
    site: "Tristar Energy"
  },
  {
    id: "56",
    description: "MAN T189 EJR",
    registration: "T189 EJR",
    make: "MAN",
    model: "TGX 26 450",
    channels: "Road, In Cab, Driver",
    peripheral: "Streamax AD Plus",
    site: "Tristar Energy"
  }
];

const driverRows = [
  { id: "41", name: "Abdallah Hussein Msalu", site: "Tristar Energy" },
  { id: "17", name: "Abdul Mitago", site: "Tristar Energy" },
  { id: "2", name: "Abdulmajid Mwasha", site: "Tristar Energy" },
  { id: "31", name: "Abraham Erasto", site: "Tristar Energy" },
  { id: "12", name: "Abubakari Azzah Makungah", site: "Tristar Energy" },
  { id: "5", name: "Adam Jumanne", site: "Tristar Energy" },
  { id: "44", name: "Ally Abdalah Kitua", site: "Tristar Energy" },
  { id: "53", name: "Ally Dafi Kiya", site: "Tristar Energy" }
];

const eventRows = [
  { id: "29622", name: "Harsh Cornering", type: "System" },
  { id: "29620", name: "Harsh Left Cornering", type: "Default" },
  { id: "29621", name: "Harsh Right Cornering", type: "Default" },
  { id: "29601", name: "Ignition Off", type: "Default" },
  { id: "29600", name: "Ignition On", type: "Default" },
  { id: "29605", name: "Low Battery", type: "Default" },
  { id: "29606", name: "Low Internal Battery", type: "Default" },
  { id: "29635", name: "Panic Alert", type: "Default" }
];

type VideoGalleryProps = {
  embed?: boolean;
};

export default function VideoGallery({ embed = false }: VideoGalleryProps) {
  const navigate = useNavigate();
  const [startDateObj, setStartDateObj] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0);
  });
  const [endDateObj, setEndDateObj] = useState(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"start" | "end">("start");
  const [pickerDateObj, setPickerDateObj] = useState(() => new Date());
  const [pickerTime, setPickerTime] = useState("00:00");
  const [activePicker, setActivePicker] = useState<"date" | "time">("date");
  const [showAssetsModal, setShowAssetsModal] = useState(false);
  const [showDriversModal, setShowDriversModal] = useState(false);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<string[]>(["25", "56"]);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"Date" | "Driver" | "Event">("Date");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeLabel, setScopeLabel] = useState("All");
  const allAssetsSelected = selectedAssets.length === assetRows.length && assetRows.length > 0;
  const allDriversSelected = selectedDrivers.length === driverRows.length && driverRows.length > 0;
  const allEventsSelected = selectedEvents.length === eventRows.length && eventRows.length > 0;
  const hourLabels = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")), []);

  const formatDayLabel = (date: Date) => date.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const formatMonthLabel = (date: Date) => date.toLocaleDateString("en-US", { month: "short" });
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
            onClick={() => navigate("/monitor/videos/dashboard")}
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
              data-nav="/measure/insights/reports?category=Notification%20Reports&report=Detailed%20Notification%20Report"
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
                {["Date", "Driver", "Event"].map((option) => (
                  <button
                    key={option}
                    className="video-sort-option"
                    role="option"
                    type="button"
                    aria-selected={sortBy === option}
                    onClick={() => {
                      setSortBy(option as "Date" | "Driver" | "Event");
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

      <div className="video-empty">
        <div className="video-empty-icon" aria-hidden="true">📹</div>
        <div>No videos found for current selection</div>
      </div>

      <button className="video-help-fab" type="button" aria-label="Help">
        ?
      </button>

      {pickerOpen && (
        <div className="trip-datetime-modal" role="dialog" aria-modal="true" aria-label="Select date and time">
          <div className="trip-datetime-card">
            <div className="trip-datetime-card-header">
              <div className="trip-datetime-card-day">{formatDayLabel(pickerDateObj)}</div>
              <div className="trip-datetime-card-date">
                <span className="trip-datetime-month">{formatMonthLabel(pickerDateObj)}</span>
                <span className="trip-datetime-day">{pickerDateObj.getDate()}</span>
                <span className="trip-datetime-year">{pickerDateObj.getFullYear()}</span>
              </div>
              <button
                type="button"
                className="trip-datetime-card-time"
                onClick={() => setActivePicker("time")}
              >
                {pickerDateObj.getHours().toString().padStart(2, "0")}:{pickerDateObj
                  .getMinutes()
                  .toString()
                  .padStart(2, "0")}
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
                        setPickerTime(value);
                      }}
                      value={pickerTime}
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
                  selected={pickerDateObj}
                  onChange={(date: Date | null) => {
                    if (!date) return;
                    setPickerDateObj(date);
                  }}
                  inline
                  calendarClassName="trip-datepicker-calendar"
                />
              )}
            </div>
            <div className="trip-datetime-card-actions">
              <button type="button" onClick={applyPicker} className="trip-datetime-done">
                Done
              </button>
              <button type="button" onClick={applyPicker} className="trip-datetime-confirm">
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
                <input className="video-assets-filter" placeholder="Filter" />
                <div className="video-assets-table">
                  <div className="video-assets-row video-assets-head">
                    <div className="video-assets-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allAssetsSelected}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedAssets(assetRows.map((row) => row.id));
                          } else {
                            setSelectedAssets([]);
                          }
                        }}
                      />
                    </div>
                    <div className="video-assets-cell">Id</div>
                    <div className="video-assets-cell">Asset description</div>
                    <div className="video-assets-cell">Registration number</div>
                    <div className="video-assets-cell">Make</div>
                    <div className="video-assets-cell">Model</div>
                    <div className="video-assets-cell">Channels</div>
                    <div className="video-assets-cell">Peripheral</div>
                    <div className="video-assets-cell">Site</div>
                  </div>
                  {assetRows.length === 0 ? (
                    <div className="video-assets-row video-assets-empty">
                      <div className="video-assets-empty-text">No records available.</div>
                    </div>
                  ) : (
                    assetRows.map((row) => (
                      <div key={row.id} className="video-assets-row video-assets-data">
                        <div className="video-assets-cell">
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
                        </div>
                        <div className="video-assets-cell">{row.id}</div>
                        <div className="video-assets-cell">{row.description}</div>
                        <div className="video-assets-cell">{row.registration}</div>
                        <div className="video-assets-cell">{row.make}</div>
                        <div className="video-assets-cell">{row.model || "—"}</div>
                        <div className="video-assets-cell">{row.channels}</div>
                        <div className="video-assets-cell">{row.peripheral}</div>
                        <div className="video-assets-cell">{row.site}</div>
                      </div>
                    ))
                  )}
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
                <input className="video-assets-filter" placeholder="Filter" />
                <div className="video-assets-table">
                  <div className="video-drivers-row video-assets-head">
                    <div className="video-assets-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allDriversSelected}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedDrivers(driverRows.map((row) => row.id));
                          } else {
                            setSelectedDrivers([]);
                          }
                        }}
                      />
                    </div>
                    <div className="video-assets-cell">Id</div>
                    <div className="video-assets-cell">Name</div>
                    <div className="video-assets-cell">Site</div>
                  </div>
                  {driverRows.length === 0 ? (
                    <div className="video-assets-row video-assets-empty">
                      <div className="video-assets-empty-text">No records available.</div>
                    </div>
                  ) : (
                    driverRows.map((row) => (
                      <div key={row.id} className="video-drivers-row">
                        <div className="video-assets-cell">
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
                        </div>
                        <div className="video-assets-cell">{row.id}</div>
                        <div className="video-assets-cell">{row.name}</div>
                        <div className="video-assets-cell">{row.site}</div>
                      </div>
                    ))
                  )}
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
                <input className="video-assets-filter" placeholder="Filter" />
                <div className="video-assets-table">
                  <div className="video-events-row video-assets-head">
                    <div className="video-assets-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allEventsSelected}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedEvents(eventRows.map((row) => row.id));
                          } else {
                            setSelectedEvents([]);
                          }
                        }}
                      />
                    </div>
                    <div className="video-assets-cell">Id</div>
                    <div className="video-assets-cell">Event name</div>
                    <div className="video-assets-cell">Notification Type</div>
                  </div>
                  {eventRows.length === 0 ? (
                    <div className="video-assets-row video-assets-empty">
                      <div className="video-assets-empty-text">No records available.</div>
                    </div>
                  ) : (
                    eventRows.map((row) => (
                      <div key={row.id} className="video-events-row">
                        <div className="video-assets-cell">
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
                        </div>
                        <div className="video-assets-cell">{row.id}</div>
                        <div className="video-assets-cell">* {row.name}</div>
                        <div className="video-assets-cell">{row.type}</div>
                      </div>
                    ))
                  )}
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
