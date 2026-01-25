import { useMemo, useState } from "react";
import "../../index.css";

type EventCategory = {
  id: string;
  label: string;
  count: number;
};

type EventRow = {
  id: string;
  eventName: string;
  eventType: string;
  record: string;
  assets: number;
  drivers: number;
  frequency: string;
  lastEditBy: string;
  lastEditTime: string;
};

const categories: EventCategory[] = [
  { id: "active", label: "Active", count: 2 },
  { id: "distance", label: "Distance in location", count: 0 },
  { id: "duration", label: "Duration at location", count: 0 },
  { id: "event", label: "Event at location", count: 0 },
  { id: "entry-exit", label: "Location entry and exit", count: 1 },
  { id: "entry", label: "Location entry or exit", count: 0 },
  { id: "started", label: "Location started or stopped", count: 0 },
  { id: "movement", label: "Movement alert", count: 0 },
  { id: "speeding", label: "Over-speeding in location", count: 1 },
  { id: "inactive", label: "Inactive", count: 0 }
];

const events: EventRow[] = [
  {
    id: "evt-1",
    eventName: "CPP_UG_No_go_Route_Nkombo_Nalweyo",
    eventType: "Location entry and exit",
    record: "Assets",
    assets: 377,
    drivers: 0,
    frequency: "Recurring",
    lastEditBy: "Heritier Asimwe",
    lastEditTime: "07/11/2025 10:08 (EAT)"
  },
  {
    id: "evt-2",
    eventName: "UG CPP Over Speeding in Location 50",
    eventType: "Over-speeding in location",
    record: "Assets",
    assets: 246,
    drivers: 0,
    frequency: "Recurring",
    lastEditBy: "Joel Musisi",
    lastEditTime: "20/10/2025 18:02 (EAT)"
  }
];

export default function NotificationsAdmin() {
  const [activeCategory, setActiveCategory] = useState("active");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [eventName, setEventName] = useState("CPP_UG_No_go_Route_Nkombo_Nalweyo");
  const [recordFor, setRecordFor] = useState("Assets");
  const [frequency, setFrequency] = useState("Recurring");
  const [expiryDate, setExpiryDate] = useState("31/10/2032");
  const [expiryTime, setExpiryTime] = useState("");
  const [assetMode, setAssetMode] = useState("Groups");
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [eventType, setEventType] = useState("Location entry and exit");
  const [selectedLocations, setSelectedLocations] = useState([
    "Nkombo-Nalweyo_Road (NO HGV on this Road)"
  ]);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return events;
    return events.filter((row) => row.eventName.toLowerCase().includes(query));
  }, [search]);

  const steps = ["Name", "Assets & Drivers", "Events"];

  const groupOptions = [
    "Africa - MixEA - Transfleet Services - EACOP Tanzania",
    "Africa - MixEA - Transfleet Services - URSA Company Limited",
    "East Africa - Kampala Regional Hub"
  ];

  const individualOptions = [
    "Truck 126 - UBL 421G",
    "Truck 204 - UBG 903K",
    "Truck 311 - UBD 118A"
  ];

  const eventTypeOptions = [
    "Distance in location",
    "Duration at location",
    "Event at location",
    "Location entry",
    "Location exit",
    "Location started",
    "Location stopped",
    "Location entry and exit",
    "Movement alert",
    "Over-speeding in location"
  ];

  const locationOptions = [
    "Dar East Depot",
    "Kampala Central Yard",
    "Nkombo-Nalweyo_Road (NO HGV on this Road)",
    "Mukono Fuel Stop",
    "Mombasa Port Gate"
  ];

  const handleOpenCreate = () => {
    setCreateStep(0);
    setEventName("");
    setRecordFor("Assets");
    setFrequency("Once off");
    setExpiryDate("");
    setExpiryTime("");
    setAssetMode("Groups");
    setSelectedAssets([]);
    setEventType("Distance in location");
    setSelectedLocations([]);
    setShowLocationPicker(false);
    setShowCreate(true);
  };

  const handleCloseCreate = () => {
    setShowCreate(false);
  };

  const handleNext = () => {
    setCreateStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setCreateStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSave = () => {
    setShowCreate(false);
  };

  return (
    <div className="page sat-notifications-page">
      <div className="sat-layout">
        <aside className="sat-sidebar">
          <div className="sat-sidebar-title">Active</div>
          <div className="sat-categories">
            {categories.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`sat-category${activeCategory === item.id ? " active" : ""}`}
                onClick={() => setActiveCategory(item.id)}
              >
                <span>{item.label}</span>
                <span className="sat-badge">{item.count}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="sat-panel">
          <div className="sat-panel-header">
            <div className="sat-panel-title">
              Active
              <span className="sat-panel-badge">2</span>
            </div>
            <div className="sat-panel-actions">
              <div className="sat-search">
                <input
                  placeholder="Search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <span className="sat-search-icon">🔍</span>
              </div>
              <button type="button" className="sat-icon-btn" aria-label="Refresh">
                ⟳
              </button>
              <button
                type="button"
                className="sat-icon-btn"
                aria-label="Add"
                onClick={handleOpenCreate}
              >
                +
              </button>
            </div>
          </div>

          <div className="sat-table">
            <div className="sat-row sat-row-head">
              <span>Event name</span>
              <span>Notification Type</span>
              <span>Record</span>
              <span>Assets</span>
              <span>Drivers</span>
              <span>Frequency</span>
              <span>Last edit by</span>
              <span>Last edit time</span>
              <span />
            </div>
            {filteredEvents.map((row) => (
              <div key={row.id} className="sat-row">
                <span className="sat-link">{row.eventName}</span>
                <span>{row.eventType}</span>
                <span>{row.record}</span>
                <span>{row.assets}</span>
                <span>{row.drivers}</span>
                <span>{row.frequency}</span>
                <span>{row.lastEditBy}</span>
                <span>{row.lastEditTime}</span>
                <span className="sat-actions">
                  <button
                    type="button"
                    className="sat-actions-btn"
                    aria-label="More options"
                    onClick={() =>
                      setOpenMenuId((prev) => (prev === row.id ? null : row.id))
                    }
                  >
                    ⋯
                  </button>
                  {openMenuId === row.id && (
                    <div className="sat-actions-menu">
                      <button type="button" className="sat-actions-item">
                        Open
                      </button>
                      <button type="button" className="sat-actions-item">
                        Edit
                      </button>
                      <button type="button" className="sat-actions-item">
                        Duplicate
                      </button>
                      <button type="button" className="sat-actions-item sat-actions-danger">
                        Deactivate
                      </button>
                    </div>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="sat-footer">
            <span>Last refresh: 1 minute ago</span>
            <button type="button" className="sat-link-btn">Refresh</button>
          </div>
        </section>
      </div>

      {showCreate && (
        <div className="sat-modal-overlay" role="dialog" aria-modal="true">
          <div className="sat-modal-card">
            <div className="sat-modal-header">
              <div className="sat-modal-title">Edit event:&nbsp; {eventName}</div>
              <div className="sat-modal-actions">
                <button type="button" className="sat-pill" onClick={handleCloseCreate}>
                  Close
                </button>
                <button type="button" className="sat-pill" onClick={handleBack}>
                  Back
                </button>
                <button
                  type="button"
                  className="sat-pill sat-pill-primary"
                  disabled={
                    (createStep === 0
                      && (!eventName.trim() || (frequency === "Recurring" && (!expiryDate.trim() || !expiryTime.trim()))))
                    || (createStep === 1 && selectedAssets.length === 0)
                    || (createStep === steps.length - 1 && selectedLocations.length === 0)
                  }
                  onClick={createStep === steps.length - 1 ? handleSave : handleNext}
                >
                  {createStep === steps.length - 1 ? "Save" : "Next"}
                </button>
              </div>
            </div>

            <div className="sat-stepper">
              {steps.map((step, index) => (
                <div
                  key={step}
                  className={`sat-step${index === createStep ? " active" : ""}$
                    {index < createStep ? " completed" : ""}`}
                >
                  {step}
                </div>
              ))}
            </div>

            <div className="sat-modal-body">
              {createStep === 0 && (
                <div className="sat-form">
                  <div className="sat-section-title">Event description</div>
                  <label className="sat-label">
                    <input
                      className="sat-input"
                      value={eventName}
                      onChange={(event) => setEventName(event.target.value)}
                    />
                  </label>
                  {!eventName.trim() && (
                    <div className="sat-error">Event description is required to continue.</div>
                  )}
                  <div className="sat-label">Record event for</div>
                  <select
                    className="sat-input"
                    value={recordFor}
                    onChange={(event) => setRecordFor(event.target.value)}
                  >
                    <option>Assets</option>
                    <option>Drivers</option>
                  </select>
                  <div className="sat-radio-row">
                    <label className="sat-radio">
                      <input
                        type="radio"
                        checked={frequency === "Once off"}
                        onChange={() => setFrequency("Once off")}
                      />
                      Once off
                    </label>
                    <label className="sat-radio">
                      <input
                        type="radio"
                        checked={frequency === "Recurring"}
                        onChange={() => setFrequency("Recurring")}
                      />
                      Recurring
                    </label>
                  </div>
                  {frequency === "Recurring" && (
                    <div className="sat-card">
                      <div className="sat-label">Expiry date & time</div>
                      <div className="sat-date-row">
                        <input
                          className="sat-input sat-date-input"
                          type="date"
                          value={expiryDate}
                          onChange={(event) => setExpiryDate(event.target.value)}
                        />
                        <input
                          className="sat-input sat-time-input"
                          type="time"
                          value={expiryTime}
                          onChange={(event) => setExpiryTime(event.target.value)}
                        />
                        <span className="sat-date-icon">📅</span>
                      </div>
                      {(!expiryDate.trim() || !expiryTime.trim()) && (
                        <div className="sat-error">Expiry date and time are required to continue.</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {createStep === 1 && (
                <div className="sat-form">
                  <div className="sat-section-title">Assets</div>
                  <div className="sat-radio-row">
                    <label className="sat-radio">
                      <input
                        type="radio"
                        checked={assetMode === "Groups"}
                        onChange={() => {
                          setAssetMode("Groups");
                          setSelectedAssets([]);
                        }}
                      />
                      Groups
                    </label>
                    <label className="sat-radio">
                      <input
                        type="radio"
                        checked={assetMode === "Individual"}
                        onChange={() => {
                          setAssetMode("Individual");
                          setSelectedAssets([]);
                        }}
                      />
                      Individual
                    </label>
                  </div>
                  <div className="sat-card">
                    <div className="sat-hint">
                      Selecting a group will automatically select all its sub-groups/sites. This will
                      include or remove assets from the server-side event as they are added or removed
                      from groups.
                    </div>
                    {(assetMode === "Groups" ? groupOptions : individualOptions).map((item) => {
                      const isSelected = selectedAssets.includes(item);
                      return (
                        <div key={item} className="sat-group-row">
                          <button
                            type="button"
                            className="sat-add-icon"
                            disabled={isSelected}
                            onClick={() =>
                              setSelectedAssets((prev) =>
                                isSelected ? prev : [...prev, item]
                              )
                            }
                          >
                            +
                          </button>
                          <div className="sat-group-pill">
                            {item}
                            {assetMode === "Groups" && (
                              <span className="sat-group-count">10</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {selectedAssets.length === 0 && (
                      <div className="sat-error">Select at least one item to continue.</div>
                    )}
                    {selectedAssets.length > 0 && (
                      <div className="sat-chips">
                        {selectedAssets.map((item) => (
                          <span key={item} className="sat-chip">
                            {item}
                            <button
                              type="button"
                              className="sat-chip-remove"
                              onClick={() =>
                                setSelectedAssets((prev) => prev.filter((value) => value !== item))
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {createStep === 2 && (
                <div className="sat-form">
                  <div className="sat-section-title">Events</div>
                  <div className="sat-label">Notification Type</div>
                  <select
                    className="sat-input"
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value)}
                  >
                    {eventTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <div className="sat-card">
                    <div className="sat-hint">
                      Record event when the asset or driver selected has been at or through the
                      selected locations
                    </div>
                    <button
                      type="button"
                      className="sat-pill sat-pill-primary"
                      onClick={() => setShowLocationPicker((prev) => !prev)}
                    >
                      {showLocationPicker ? "Hide locations" : "Select locations"}
                    </button>
                    {showLocationPicker && (
                      <div className="sat-location-list">
                        {locationOptions.map((item) => {
                          const isSelected = selectedLocations.includes(item);
                          return (
                            <div key={item} className="sat-group-row">
                              <button
                                type="button"
                                className="sat-add-icon"
                                disabled={isSelected}
                                onClick={() =>
                                  setSelectedLocations((prev) =>
                                    isSelected ? prev : [...prev, item]
                                  )
                                }
                              >
                                +
                              </button>
                              <div className="sat-group-pill">{item}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="sat-chips">
                      {selectedLocations.map((item) => (
                        <span key={item} className="sat-chip">
                          {item}
                          <button
                            type="button"
                            className="sat-chip-remove"
                            onClick={() =>
                              setSelectedLocations((prev) => prev.filter((value) => value !== item))
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    {selectedLocations.length === 0 && (
                      <div className="sat-error">Select at least one location to continue.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="sat-modal-footer">
              {createStep === steps.length - 1 ? (
                <button type="button" className="sat-pill sat-pill-primary" onClick={handleSave}>
                  Save
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
