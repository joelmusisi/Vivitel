/*
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
                <div className="remote-access-playback">
                  <div className="remote-access-playback-header">Select Date:</div>
                  <div className="remote-access-playback-body">
                    <div className="remote-access-playback-left">
                      <button type="button" className="remote-access-playback-nav-pill">▲</button>
                      <div className="remote-access-playback-left-label">November</div>
                      <button type="button" className="remote-access-playback-nav-pill">▼</button>
                      <button type="button" className="remote-access-playback-nav-pill">▲</button>
                      <div className="remote-access-playback-left-label">2025</div>
                      <button type="button" className="remote-access-playback-nav-pill">▼</button>
                    </div>
                  ) : (
                                    "30"
                                  ].map((day, index) => (
                                    <div key={`${day}-${index}`} className="remote-access-preview-day">
                                      {day}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                            "30",
                      <div className="remote-access-playback">
                        <div className="remote-access-playback-header">Select Date:</div>
                        <div className="remote-access-playback-toolbar">
                          <div className="remote-access-playback-field">
                            <span>Channel</span>
                            <select className="remote-access-basic-input">
                              <option>Channel 1</option>
                              <option>Channel 2</option>
                              <option>Channel 3</option>
                              <option>Channel 4</option>
                            </select>
                          </div>
                          <div className="remote-access-playback-field">
                            <span>Stream</span>
                            <select className="remote-access-basic-input">
                              <option>Main Stream</option>
                              <option>Sub Stream</option>
                            </select>
                          </div>
                          <div className="remote-access-playback-field">
                            <span>Storage</span>
                            <select className="remote-access-basic-input">
                              <option>Main Storage</option>
                              <option>Secondary Storage</option>
                            </select>
                          </div>
                          <div className="remote-access-playback-field">
                            <span>Speed</span>
                            <select className="remote-access-basic-input">
                              <option>1x</option>
                              <option>2x</option>
                              <option>4x</option>
                              <option>8x</option>
                            </select>
                          </div>
                          <button type="button" className="remote-access-playback-action primary">Search</button>
                        </div>
                        <div className="remote-access-playback-body">
                          <div className="remote-access-playback-calendar">
                            <div className="remote-access-playback-month">
                              <button type="button" className="remote-access-playback-nav">◀</button>
                              <div className="remote-access-playback-month-label">November</div>
                              <button type="button" className="remote-access-playback-nav">▶</button>
                            </div>
                            <div className="remote-access-playback-week">
                              {"S M T W T F S".split(" ").map((day) => (
                                <span key={day}>{day}</span>
                              ))}
                            </div>
                            <div className="remote-access-playback-grid">
                              [
                                "26",
                                "27",
                                "28",
                                "29",
                                "30",
                                "31",
                                "1",
                                "2",
                                "3",
                                "4",
                                "5",
                                "6",
                                "7",
                                "8",
                                "9",
                                "10",
                                "11",
                                "12",
                                "13",
                                "14",
                                "15",
                                "16",
                                "17",
                                "18",
                                "19",
                                "20",
                                "21",
                                "22",
                                "23",
                                "24",
                                "25",
                                "26",
                                "27",
                                "28",
                                "29",
                                "30"
                              ].map((day, index) => (
                                <div
                                  key={`${day}-${index}`}
                                  className={`remote-access-playback-day ${
                                    [15, 20].includes(Number(day))
                                      ? "alarm"
                                      : [17, 18, 21, 22].includes(Number(day))
                                        ? "normal"
                                        : ""
                                  }`}
                                >
                                  {day}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="remote-access-playback-side">
                            <div className="remote-access-playback-select">
                              <select className="remote-access-basic-input">
                                <option>Main Storage</option>
                                <option>Secondary Storage</option>
                              </select>
                            </div>
                            <div className="remote-access-playback-select">
                              <select className="remote-access-basic-input">
                                <option>Main Stream</option>
                                <option>Sub Stream</option>
                              </select>
                            </div>
                            <div className="remote-access-playback-time">
                              <div className="remote-access-basic-field">
                                <span>Start</span>
                                <input type="time" className="remote-access-basic-input" defaultValue="08:00" />
                              </div>
                              <div className="remote-access-basic-field">
                                <span>End</span>
                                <input type="time" className="remote-access-basic-input" defaultValue="18:00" />
                              </div>
                            </div>
                            <div className="remote-access-playback-legend">
                              <div className="remote-access-playback-legend-item">
                                <span className="remote-access-playback-dot locked" />
                                Locked Video
                              </div>
                              <div className="remote-access-playback-legend-item">
                                <span className="remote-access-playback-dot alarm" />
                                Alarm Video
                              </div>
                              <div className="remote-access-playback-legend-item">
                                <span className="remote-access-playback-dot normal" />
                                Normal Video
                              </div>
                            </div>
                            <div className="remote-access-playback-controls">
                              <button type="button" className="remote-access-playback-action">⏮</button>
                              <button type="button" className="remote-access-playback-action">▶</button>
                              <button type="button" className="remote-access-playback-action">⏸</button>
                              <button type="button" className="remote-access-playback-action">⏹</button>
                              <button type="button" className="remote-access-playback-action">⏭</button>
                            </div>
                            <button type="button" className="remote-access-playback-side-nav">›</button>
                          </div>
                        </div>
                      </div>
                                                    key={sub}
                                                    type="button"
                                                    className={`remote-access-subitem ${activePreferencesSub === sub ? "active" : ""}`}
                                                    onClick={() => setActivePreferencesSub(sub)}
                                                  >
                                                    {sub}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </aside>
                                      <section className="remote-access-panel">
                                        <div className="remote-access-playback">
                                          <div className="remote-access-playback-header">Select Date:</div>
                                          <div className="remote-access-playback-body">
                                            <div className="remote-access-playback-left">
                                              <button type="button" className="remote-access-playback-nav-pill">▲</button>
                                              <div className="remote-access-playback-left-label">November</div>
                                              <button type="button" className="remote-access-playback-nav-pill">▼</button>
                                              <button type="button" className="remote-access-playback-nav-pill">▲</button>
                                              <div className="remote-access-playback-left-label">2025</div>
                                              <button type="button" className="remote-access-playback-nav-pill">▼</button>
                                            </div>
                                            <div className="remote-access-playback-calendar">
                                              <div className="remote-access-playback-week">
                                                {"S M T W T F S".split(" ").map((day) => (
                                                  <span key={day} className="remote-access-playback-weekday">
                                                    {day}
                                                  </span>
                                                ))}
                                              </div>
                                              <div className="remote-access-playback-grid">
                                                {
                                                  [
                                                    "26",
                                                    "27",
                                                    "28",
                                                    "29",
                                                    "30",
                                                    "31",
                                                    "1",
                                                    "2",
                                                    "3",
                                                    "4",
                                                    "5",
                                                    "6",
                                                    "7",
                                                    "8",
                                                    "9",
                                                    "10",
                                                    "11",
                                                    "12",
                                                    "13",
                                                    "14",
                                                    "15",
                                                    "16",
                                                    "17",
                                                    "18",
                                                    "19",
                                                    "20",
                                                    "21",
                                                    "22",
                                                    "23",
                                                    "24",
                                                    "25",
                                                    "26",
                                                    "27",
                                                    "28",
                                                    "29",
                                                    "30"
                                                  ].map((day, index) => (
                                                    <div
                                                      key={`${day}-${index}`}
                                                      className={`remote-access-playback-day ${
                                                        [15, 20].includes(Number(day))
                                                          ? "alarm"
                                                          : [17, 18, 21, 22].includes(Number(day))
                                                            ? "normal"
                                                            : ""
                                                      }`}
                                                    >
                                                      {day}
                                                    </div>
                                                  ))}
                                              </div>
                                            </div>
                                            <div className="remote-access-playback-side">
                                              <div className="remote-access-playback-select">
                                                <select className="remote-access-basic-input">
                                                  <option>Main Storage</option>
                                                  <option>Secondary Storage</option>
                                                </select>
                                              </div>
                                              <div className="remote-access-playback-select">
                                                <select className="remote-access-basic-input">
                                                  <option>Main Stream</option>
                                                  <option>Sub Stream</option>
                                                </select>
                                              </div>
                                              <div className="remote-access-playback-legend">
                                                <div className="remote-access-playback-legend-item">
                                                  <span className="remote-access-playback-dot locked" />
                                                  Locked Video
                                                </div>
                                                <div className="remote-access-playback-legend-item">
                                                  <span className="remote-access-playback-dot alarm" />
                                                  Alarm Video
                                                </div>
                                                <div className="remote-access-playback-legend-item">
                                                  <span className="remote-access-playback-dot normal" />
                                                  Normal Video
                                                </div>
                                              </div>
                                              <button type="button" className="remote-access-playback-side-nav">›</button>
                                            </div>
                                          </div>
                                        </div>
                                      </section>
                                    </div>
                                  ) : (
                      <div key={menu.label} className="remote-access-menu-group">
                        <button
                          type="button"
                          className={`remote-access-menu ${activePreferencesMenu === menu.label ? "active" : ""}`}
                          onClick={() => setActivePreferencesMenu(menu.label)}
                        >
                          {menu.label}
                        </button>
                        {menu.sub && activePreferencesMenu === menu.label && (
                          <div className="remote-access-sub">
                            {menu.sub.map((sub) => (
                              <button
                                key={sub}
                                type="button"
                                className={`remote-access-subitem ${activePreferencesSub === sub ? "active" : ""}`}
                                onClick={() => {
                                  setActivePreferencesSub(sub);
                                  if (menu.label === "Others") {
                                    setActiveRemoteTab(sub);
                                  }
                                }}
                              >
                                {sub}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </aside>
                  <section className="remote-access-panel">
                    <div className="remote-access-playback">
                      <div className="remote-access-playback-header">Select Date:</div>
                      <div className="remote-access-playback-body">
                        <div className="remote-access-playback-left">
                          <button type="button" className="remote-access-playback-nav-pill">▲</button>
                          <div className="remote-access-playback-left-label">November</div>
                          <button type="button" className="remote-access-playback-nav-pill">▼</button>
                          <button type="button" className="remote-access-playback-nav-pill">▲</button>
                          <div className="remote-access-playback-left-label">2025</div>
                          <button type="button" className="remote-access-playback-nav-pill">▼</button>
                        </div>
                        <div className="remote-access-playback-calendar">
                          <div className="remote-access-playback-week">
                            {"S M T W T F S".split(" ").map((day) => (
                              <span key={day} className="remote-access-playback-weekday">
                                {day}
                              </span>
                            ))}
                          </div>
                          <div className="remote-access-playback-grid">
                            {
                              [
                                "26",
                                "27",
                                "28",
                                "29",
                                "30",
                                "31",
                                "1",
                                "2",
                                "3",
                                "4",
                                "5",
                                "6",
                                "7",
                                "8",
                                "9",
                                "10",
                                "11",
                                "12",
                                "13",
                                "14",
                                "15",
                                "16",
                                "17",
                                "18",
                                "19",
                                "20",
                                "21",
                                "22",
                                "23",
                                "24",
                                "25",
                                "26",
                                "27",
                                "28",
                                "29",
                                "30"
                              ].map((day, index) => (
                                <div
                                  key={`${day}-${index}`}
                                  className={`remote-access-playback-day ${
                                    [15, 20].includes(Number(day))
                                      ? "alarm"
                                      : [17, 18, 21, 22].includes(Number(day))
                                        ? "normal"
                                        : ""
                                  }`}
                                >
                                  {day}
                                </div>
                              ))}
                          </div>
                        </div>
                        <div className="remote-access-playback-side">
                          <div className="remote-access-playback-select">
                            <select className="remote-access-basic-input">
                              <option>Main Storage</option>
                              <option>Secondary Storage</option>
                            </select>
                          </div>
                          <div className="remote-access-playback-select">
                            <select className="remote-access-basic-input">
                              <option>Main Stream</option>
                              <option>Sub Stream</option>
                            </select>
                          </div>
                          <div className="remote-access-playback-legend">
                            <div className="remote-access-playback-legend-item">
                              <span className="remote-access-playback-dot locked" />
                              Locked Video
                            </div>
                            <div className="remote-access-playback-legend-item">
                              <span className="remote-access-playback-dot alarm" />
                              Alarm Video
                            </div>
                            <div className="remote-access-playback-legend-item">
                              <span className="remote-access-playback-dot normal" />
                              Normal Video
                            </div>
                          </div>
                          <button type="button" className="remote-access-playback-side-nav">›</button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
      () => columns.filter((column) => column.locked || selectedColumns.has(column.key)),
      [selectedColumns]
    );

    const operationColumn = useMemo(
      () => visibleColumns.find((column) => column.key === "operation"),
      [visibleColumns]
    );

    const dataColumns = useMemo(
      () => visibleColumns.filter((column) => column.key !== "operation"),
      [visibleColumns]
    );

    const gridTemplate = useMemo(() => {
      const widths = ["34px", ...dataColumns.map((col) => `${col.width}px`)];
      if (operationColumn) {
        widths.push("1fr", `${operationColumn.width}px`);
      }
      return widths.join(" ");
    }, [dataColumns, operationColumn]);

    const toggleColumn = (key: string, locked?: boolean) => {
      if (locked) return;
      setSelectedColumns((current) => {
        const next = new Set(current);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    };

    const toggleAllColumns = (checked: boolean) => {
      if (checked) {
        setSelectedColumns(new Set(columns.filter((column) => !column.locked).map((column) => column.key)));
      } else {
        setSelectedColumns(new Set(defaultColumnKeys));
      }
    };

    const allSelected = selectedIds.length === deviceRows.length && deviceRows.length > 0;
    const selectedCount = selectedIds.length;
    const activeDevice = useMemo(() => {
      const selectedId = selectedIds[0];
      return deviceRows.find((row) => row.id === selectedId) ?? deviceRows[0];
    }, [selectedIds]);

    return (
      <div className="device-remote-actions">
        <div className="device-remote-page">
          <div className="device-remote-card">
            <div className="device-remote-table">
              <div className="device-remote-row device-remote-head" style={{ gridTemplateColumns: gridTemplate }}>
                <div className="device-remote-cell checkbox">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) =>
                      setSelectedIds(event.target.checked ? deviceRows.map((row) => row.id) : [])
                    }
                    aria-label="Select all devices"
                  />
                </div>
                {dataColumns.map((column) => (
                  <div key={column.key} className="device-remote-cell">
                    {column.label}
                  </div>
                ))}
                {operationColumn && (
                  <div className="device-remote-cell device-remote-cell-spacer" aria-hidden="true" />
                )}
                {operationColumn && (
                  <div key={operationColumn.key} className="device-remote-cell device-remote-cell-op">
                    {operationColumn.label}
                  </div>
                )}
              </div>

              {deviceRows.map((row) => (
                <div key={row.id} className="device-remote-row" style={{ gridTemplateColumns: gridTemplate }}>
                  <div className="device-remote-cell checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={(event) => {
                        setSelectedIds((current) =>
                          event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)
                        );
                      }}
                      aria-label={`Select ${row.plate}`}
                    />
                  </div>
                  {dataColumns.map((column) => {
                    if (column.key === "status") {
                      return (
                        <div key={`${row.id}-${column.key}`} className="device-remote-cell status">
                          <span className={`device-remote-dot ${row.status}`} aria-hidden="true" />
                          {row.status}
                        </div>
                      );
                    }

                    const value = row[column.key] ?? "-";
                    return (
                      <div key={`${row.id}-${column.key}`} className="device-remote-cell">
                        {value}
                      </div>
                    );
                  })}
                  {operationColumn && (
                    <div className="device-remote-cell device-remote-cell-spacer" aria-hidden="true" />
                  )}
                  {operationColumn && (
                    <div key={`${row.id}-${operationColumn.key}`} className="device-remote-cell device-remote-cell-op">
                      <div className="device-remote-row-actions">
                        <button type="button" className="device-remote-row-btn" aria-label="Restart" title="Restart">
                          <span aria-hidden="true">⟳</span>
                          <span className="device-remote-row-label">Restart</span>
                        </button>
                        <button
                          type="button"
                          className="device-remote-row-btn"
                          aria-label="Remote Access"
                          title="Remote Access"
                          onClick={() => setShowRemoteAccess(true)}
                        >
                          <span aria-hidden="true">🔗</span>
                          <span className="device-remote-row-label">Remote Access</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="device-remote-footer">
              <button type="button" className="video-back-btn" onClick={() => navigate("/Track/videos/dashboard")}>
                ← Back to Dashboard
              </button>
              <div className="device-remote-footer-actions">
                <button type="button" className="device-remote-modal-btn" onClick={() => setShowColumnChooser(true)}>
                  Columns
                </button>
                <div className="device-remote-meta">Selected: {selectedCount}</div>
              </div>
            </div>
          </div>
        </div>

        {showColumnChooser && (
          <div className="device-remote-modal" role="dialog" aria-modal="true">
            <div className="device-remote-modal-card">
              <div className="device-remote-modal-header">
                <div>Columns Setting</div>
                <button
                  type="button"
                  className="device-remote-modal-close"
                  aria-label="Close"
                  onClick={() => setShowColumnChooser(false)}
                >
                  ×
                </button>
              </div>
              <div className="device-remote-modal-search">
                <input
                  type="search"
                  placeholder="please enter the field then to search"
                  value={columnQuery}
                  onChange={(event) => setColumnQuery(event.target.value)}
                />
              </div>
              <div className="device-remote-modal-tip">
                Tip: Freeze up to 3 fields
                <button
                  type="button"
                  className="device-remote-modal-reset"
                  onClick={() => setSelectedColumns(new Set(defaultColumnKeys))}
                >
                  Reset
                </button>
              </div>
              <div className="device-remote-modal-list">
                <label className="device-remote-modal-item">
                  <input
                    type="checkbox"
                    checked={selectedColumns.size >= columns.filter((col) => !col.locked).length}
                    onChange={(event) => toggleAllColumns(event.target.checked)}
                  />
                  Select All
                </label>
                {filteredColumns.map((column) => (
                  <label key={column.key} className="device-remote-modal-item">
                    <input
                      type="checkbox"
                      checked={column.locked || selectedColumns.has(column.key)}
                      disabled={column.locked}
                      onChange={() => toggleColumn(column.key, column.locked)}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
              <div className="device-remote-modal-actions">
                <button type="button" className="device-remote-modal-btn" onClick={() => setShowColumnChooser(false)}>
                  Cancel
                </button>
                <button type="button" className="device-remote-modal-btn primary" onClick={() => setShowColumnChooser(false)}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {showRemoteAccess && (
          <div className="device-remote-modal" role="dialog" aria-modal="true">
            <div className="remote-access-card">
              <div className="remote-access-header">
                <div className="remote-access-title">[ AIP953MP ]</div>
                <div className="remote-access-top-tabs">
                  {[
                    { label: "General", icon: "▦" },
                    { label: "Preview", icon: "▣" },
                    { label: "Playback", icon: "▶" },
                    { label: "Preferences", icon: "☰" }
                  ].map((tab) => (
                    <button
                      key={tab.label}
                      type="button"
                      className={`remote-access-top-tab ${activeRemoteTab === tab.label ? "active" : ""}`}
                      onClick={() => setActiveRemoteTab(tab.label)}
                    >
                      <span className="remote-access-top-icon" aria-hidden="true">
                        {tab.icon}
                      </span>
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="device-remote-modal-close"
                  aria-label="Close"
                  onClick={() => setShowRemoteAccess(false)}
                >
                  ×
                </button>
              </div>
              <div className="remote-access-body">
                ) : activeRemoteTab === "General" ? (
                  <div className="remote-access-general-card">
                    <div className="remote-access-general-tabs">
                      {[
                        "Basic Info",
                        "Device Module",
                        "Storage Device",
                        "Version Info"
                      ].map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          className={`remote-access-general-tab ${activeGeneralTab === tab ? "active" : ""}`}
                          onClick={() => setActiveGeneralTab(tab)}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                    {activeGeneralTab === "Basic Info" && (
                      <div className="remote-access-basic-info">
                        <div className="remote-access-basic-info-tabs">
                          {[
                            "Server Status",
                            "Sensor Status",
                            "OBD Data",
                            "6 Axis Data",
                            "Others",
                            "Calibration Status"
                          ].map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              className={`remote-access-basic-info-tab ${
                                activeBasicInfoTab === tab ? "active" : ""
                              }`}
                              onClick={() => setActiveBasicInfoTab(tab)}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                        {activeBasicInfoTab === "Calibration Status" && (
                          <div className="remote-access-basic-info-table">
                            <div className="remote-access-basic-info-row remote-access-basic-info-head">
                              <span>Calibration Status</span>
                              <span>ADAS</span>
                              <span>Calibration success</span>
                            </div>
                            {["DSC", "DMS"].map((item) => (
                              <div key={item} className="remote-access-basic-info-row">
                                <span></span>
                                <span>{item}</span>
                                <span>Calibration success</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {activeBasicInfoTab === "6 Axis Data" && (
                          <div className="remote-access-basic-info-others">
                            <div className="remote-access-basic-info-table">
                              {[
                                { label: "X", value: "-0.13 g" },
                                { label: "Y", value: "0.01 g" },
                                { label: "Z", value: "0.99 g" },
                                { label: "AX", value: "0.06 rad/s" },
                                { label: "AY", value: "0.06 rad/s" },
                                { label: "AZ", value: "-0.24 rad/s" }
                              ].map((row) => (
                                <div key={row.label} className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-section">6 Axis Data</span>
                                  <span>{row.label}</span>
                                  <span>{row.value}</span>
                                </div>
                              ))}
                            </div>
                            <button type="button" className="remote-access-basic-info-nav">›</button>
                            <div className="remote-access-basic-info-footer">
                              <span className="remote-access-basic-info-footer-label">Calibrate</span>
                              <div className="remote-access-basic-info-footer-bar" />
                              <button type="button" className="remote-access-basic-info-footer-btn">
                                Calibrate
                              </button>
                            </div>
                          </div>
                        )}
                        {activeBasicInfoTab === "OBD Data" && (
                          <div className="remote-access-basic-info-others">
                            <div className="remote-access-basic-info-table">
                              <div className="remote-access-basic-info-row">
                                <span className="remote-access-basic-info-section">OBD</span>
                                <span>Connected Status</span>
                                <span>Unconnected</span>
                              </div>
                              {[
                                "Speed",
                                "Engine Speed",
                                "Odometer",
                                "Engine Hours",
                                "Right/Left Turn",
                                "Coolant",
                                "Fuel",
                                "Accelerator",
                                "Brake",
                                "Clutch",
                                "Gear",
                                "Engine Load",
                                "Battery",
                                "Oil Pressure",
                                "Intake Temp",
                                "Fuel Rate",
                                "Trip Fuel",
                                "Trip Distance"
                              ].map((label) => (
                                <div key={label} className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>{label}</span>
                                  <span>-</span>
                                </div>
                              ))}
                            </div>
                            <button type="button" className="remote-access-basic-info-nav">›</button>
                          </div>
                        )}
                        {activeBasicInfoTab === "Sensor Status" && (
                          <div className="remote-access-basic-info-others">
                            <div className="remote-access-basic-info-table">
                              {[
                                { id: "IO1", status: "Low Level", use: "Left Turn" },
                                { id: "IO2", status: "Low Level", use: "Right Turn" },
                                { id: "IO3", status: "Low Level", use: "None" }
                              ].map((sensor) => (
                                <div key={sensor.id} className="remote-access-basic-info-sensor-group">
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-section">{sensor.id}</span>
                                    <span>IO Status</span>
                                    <span>{sensor.status}</span>
                                  </div>
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-muted">&nbsp;</span>
                                    <span>IO Use</span>
                                    <span>{sensor.use}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <button type="button" className="remote-access-basic-info-nav">›</button>
                          </div>
                        )}
                        {activeBasicInfoTab === "Server Status" && (
                          <div className="remote-access-basic-info-others">
                            <div className="remote-access-basic-info-table">
                              {[
                                {
                                  title: "Central Server 1",
                                  status: "Connected",
                                  network: "Communication Module",
                                  protocol: "N9M",
                                  address: "stm.za.mixtel.com",
                                  port: "20001"
                                },
                                {
                                  title: "Central Server 2",
                                  status: "Connected",
                                  network: "Communication Module",
                                  protocol: "N9M",
                                  address: "stm.za.mixtel.com",
                                  port: "20001"
                                }
                              ].map((server) => (
                                <div key={server.title} className="remote-access-basic-info-server">
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-section">{server.title}</span>
                                    <span>Connected Status</span>
                                    <span>{server.status}</span>
                                  </div>
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-muted">&nbsp;</span>
                                    <span>Network Type</span>
                                    <span>{server.network}</span>
                                  </div>
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-muted">&nbsp;</span>
                                    <span>Protocol Type</span>
                                    <span>{server.protocol}</span>
                                  </div>
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-muted">&nbsp;</span>
                                    <span>Server Address</span>
                                    <span>{server.address}</span>
                                  </div>
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-muted">&nbsp;</span>
                                    <span>Port</span>
                                    <span>{server.port}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <button type="button" className="remote-access-basic-info-nav">›</button>
                          </div>
                        )}
                        {activeBasicInfoTab === "Others" && (
                          <div className="remote-access-basic-info-others">
                            <div className="remote-access-basic-info-table">
                              <div className="remote-access-basic-info-row">
                                <span className="remote-access-basic-info-section">ACC</span>
                                <span>ACC Status</span>
                                <span>ACC off</span>
                              </div>
                              <div className="remote-access-basic-info-row">
                                <span className="remote-access-basic-info-section">Pulse</span>
                                <span>Pulse Count</span>
                                <span>0</span>
                              </div>
                              <div className="remote-access-basic-info-row">
                                <span className="remote-access-basic-info-section">Device Status</span>
                                <span>Voltage</span>
                                <span>12.20 V</span>
                              </div>
                              <div className="remote-access-basic-info-row">
                                <span className="remote-access-basic-info-muted">&nbsp;</span>
                                <span>Temperature</span>
                                <span>47.00 °C</span>
                              </div>
                            </div>
                            <button type="button" className="remote-access-basic-info-nav">›</button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="remote-access-general-block">
                      <div className="remote-access-general-title">
                        <span>Device Status</span>
                        <span className="remote-access-general-status">
                          {activeDevice?.status === "online" ? "Online" : "Offline"}
                        </span>
                      </div>
                      <div className="remote-access-general-grid">
                        <div className="remote-access-general-row">
                          <span>Device ID</span>
                          <span>{activeDevice?.deviceId ?? "-"}</span>
                        </div>
                        <div className="remote-access-general-row">
                          <span>Fleet</span>
                          <span>{activeDevice?.fleet ?? "-"}</span>
                        </div>
                        <div className="remote-access-general-row">
                          <span>Module Type</span>
                          <span>{activeDevice?.moduleType ?? "-"}</span>
                        </div>
                        <div className="remote-access-general-row">
                          <span>Master Version</span>
                          <span>{activeDevice?.masterVersion ?? "-"}</span>
                        </div>
                        <div className="remote-access-general-row">
                          <span>Power Box Version</span>
                          <span>{activeDevice?.powerBoxVersion ?? "-"}</span>
                        </div>
                        <div className="remote-access-general-row">
                          <span>IPC</span>
                          <span>{activeDevice?.ipc ?? "-"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : activeRemoteTab === "Preview" ? (
                  <div className="remote-access-preferences">
                    <aside className="remote-access-sidebar">
                      {preferenceMenus.map((menu) => (
                        <div key={menu.label} className="remote-access-menu-group">
                          <button
                            type="button"
                            className={`remote-access-menu ${activePreferencesMenu === menu.label ? "active" : ""}`}
                            onClick={() => setActivePreferencesMenu(menu.label)}
                          >
                            {menu.label}
                          </button>
                          {menu.sub && activePreferencesMenu === menu.label && (
                            <div className="remote-access-sub">
                              {menu.sub.map((sub) => (
                                <button
                                  key={sub}
                                  type="button"
                                  className={`remote-access-subitem ${activePreferencesSub === sub ? "active" : ""}`}
                                  onClick={() => {
                                    setActivePreferencesSub(sub);
                                    if (menu.label === "Others") {
                                      setActiveRemoteTab(sub);
                                    }
                                  }}
                                >
                                  {sub}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </aside>
                    <section className="remote-access-panel">
                      <div className="remote-access-general-tabs">
                        {generalTabs.map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            className={`remote-access-general-tab ${activeGeneralTab === tab ? "active" : ""}`}
                            onClick={() => setActiveGeneralTab(tab)}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                      <div className="remote-access-preview-date">
                        <div className="remote-access-preview-date-header">
                          <span>Preview</span>
                          <button
                            type="button"
                            className="remote-access-action"
                            onClick={() => setShowPreviewCalendar((current) => !current)}
                          >
                            {showPreviewCalendar ? "Hide Date" : "Select Date"}
                          </button>
                        </div>
                        {showPreviewCalendar && (
                          <div className="remote-access-preview-calendar">
                            <div className="remote-access-preview-calendar-title">Select Date</div>
                            <div className="remote-access-preview-week">
                              {"S M T W T F S".split(" ").map((day) => (
                                <span key={day}>{day}</span>
                              ))}
                            </div>
                            <div className="remote-access-preview-grid">
                              {[
                                "26",
                                "27",
                                "28",
                                "29",
                                "30",
                                "31",
                                "1",
                                "2",
                                "3",
                                "4",
                                "5",
                                "6",
                                "7",
                                "8",
                                "9",
                                "10",
                                "11",
                                "12",
                                "13",
                                "14",
                                "15",
                                "16",
                                "17",
                                "18",
                                "19",
                                "20",
                                "21",
                                "22",
                                "23",
                                "24",
                                "25",
                                "26",
                                "27",
                                "28",
                                "29",
                                "30"
                              ].map((day, index) => (
                                <div key={`${day}-${index}`} className="remote-access-preview-day">
                                  {day}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                ) : activeRemoteTab === "Playback" ? (
                  <div className="remote-access-playback">
                    <div className="remote-access-playback-header">Select Date:</div>
                    <div className="remote-access-playback-body">
                      <div className="remote-access-playback-calendar">
                        <div className="remote-access-playback-month">
                          <button type="button" className="remote-access-playback-nav">◀</button>
                          <div className="remote-access-playback-month-label">November</div>
                          <button type="button" className="remote-access-playback-nav">▶</button>
                        </div>
                        <div className="remote-access-playback-week">
                          {"S M T W T F S".split(" ").map((day) => (
                            <span key={day}>{day}</span>
                          ))}
                        </div>
                        <div className="remote-access-playback-grid">
                          {[
                            "26",
                            "27",
                            "28",
                            "29",
                            "30",
                            "31",
                            "1",
                            "2",
                            "3",
                            "4",
                            "5",
                            "6",
                            "7",
                            "8",
                            "9",
                            "10",
                            "11",
                            "12",
                            "13",
                            "14",
                            "15",
                            "16",
                            "17",
                            "18",
                            "19",
                            "20",
                            "21",
                            "22",
                            "23",
                            "24",
                            "25",
                            "26",
                            "27",
                            "28",
                            "29",
                            "30"
                          ].map((day, index) => (
                            <div
                              key={`${day}-${index}`}
                              className={`remote-access-playback-day ${
                                [15, 20].includes(Number(day)) ? "alarm" : [17, 18, 21, 22].includes(Number(day)) ? "normal" : ""
                              }`}
                            >
                              {day}
                            </div>
                          ))}
                        </div>
                        <div className="remote-access-playback-year">2025</div>
                      </div>
                      <div className="remote-access-playback-side">
                        <div className="remote-access-playback-select">
                          <select className="remote-access-basic-input">
                            <option>Main Storage</option>
                            <option>Secondary Storage</option>
                          </select>
                        ) : activeRemoteTab === "Preview" ? (
                          <div className="remote-access-empty">Preview view is not configured yet.</div>
                        ) : activeRemoteTab === "Playback" ? (
                      <div className="remote-access-preferences">
                        <aside className="remote-access-sidebar">
                          {preferenceMenus.map((menu) => (
                            <div key={menu.label} className="remote-access-menu-group">
                              <button
                                type="button"
                                className={`remote-access-menu ${activePreferencesMenu === menu.label ? "active" : ""}`}
                                onClick={() => setActivePreferencesMenu(menu.label)}
                              >
                                {menu.label}
                              </button>
                              {menu.sub && activePreferencesMenu === menu.label && (
                                <div className="remote-access-sub">
                                  {menu.sub.map((sub) => (
                                    <button
                                      key={sub}
                                      type="button"
                                      className={`remote-access-subitem ${activePreferencesSub === sub ? "active" : ""}`}
                                      onClick={() => {
                                        setActivePreferencesSub(sub);
                                        if (menu.label === "Others") {
                                          setActiveRemoteTab(sub);
                                        }
                                      }}
                                    >
                                      {sub}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </aside>
                        <section className="remote-access-panel">
                          <div className="remote-access-general-tabs">
                            {generalTabs.map((tab) => (
                              <button
                                key={tab}
                                type="button"
                                className={`remote-access-general-tab ${activeGeneralTab === tab ? "active" : ""}`}
                                onClick={() => setActiveGeneralTab(tab)}
                              >
                                {tab}
                              </button>
                            ))}
                          </div>
                          <div className="remote-access-playback">
                            <div className="remote-access-playback-header">Select Date:</div>
                            <div className="remote-access-playback-body">
                              <div className="remote-access-playback-calendar">
                                <div className="remote-access-playback-month">
                                  <button type="button" className="remote-access-playback-nav">◀</button>
                                  <div className="remote-access-playback-month-label">November</div>
                                  <button type="button" className="remote-access-playback-nav">▶</button>
                                </div>
                                <div className="remote-access-playback-week">
                                  {"S M T W T F S".split(" ").map((day) => (
                                    <span key={day}>{day}</span>
                                  ))}
                                </div>
                                <div className="remote-access-playback-grid">
                                  {
                                    [
                                      "26",
                                      "27",
                                      "28",
                                      "29",
                                      "30",
                                      "31",
                                      "1",
                                      "2",
                                      "3",
                                      "4",
                                      "5",
                                      "6",
                                      "7",
                                      "8",
                                      "9",
                                      "10",
                                      "11",
                                      "12",
                                      "13",
                                      "14",
                                      "15",
                                      "16",
                                      "17",
                                      "18",
                                      "19",
                                      "20",
                                      "21",
                                      "22",
                                      "23",
                                      "24",
                                      "25",
                                      "26",
                                      "27",
                                      "28",
                                      "29",
                                      "30"
                                    ].map((day, index) => (
                                      <div
                                        key={`${day}-${index}`}
                                        className={`remote-access-playback-day ${
                                          [15, 20].includes(Number(day))
                                            ? "alarm"
                                            : [17, 18, 21, 22].includes(Number(day))
                                              ? "normal"
                                              : ""
                                        }`}
                                      >
                                        {day}
                                      </div>
                                    ))}
                                </div>
                                <div className="remote-access-playback-year">2025</div>
                              </div>
                              <div className="remote-access-playback-side">
                                <div className="remote-access-playback-select">
                                  <select className="remote-access-basic-input">
                                    <option>Main Storage</option>
                                    <option>Secondary Storage</option>
                                  </select>
                                </div>
                                <div className="remote-access-playback-select">
                                  <select className="remote-access-basic-input">
                                    <option>Main Stream</option>
                                    <option>Sub Stream</option>
                                  </select>
                                </div>
                                <div className="remote-access-playback-legend">
                                  <div className="remote-access-playback-legend-item">
                                    <span className="remote-access-playback-dot locked" />
                                    Locked Video
                                  </div>
                                  <div className="remote-access-playback-legend-item">
                                    <span className="remote-access-playback-dot alarm" />
                                    Alarm Video
                                  </div>
                                  <div className="remote-access-playback-legend-item">
                                    <span className="remote-access-playback-dot normal" />
                                    Normal Video
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>
                      </div>
                    ) : activeBasicSub === "Voice Setup" ? (
                      <div className="remote-access-basic-card remote-access-voice-card">
                        <div className="remote-access-voice-row">
                          <span>TTS Voice</span>
                          <input
                            className="remote-access-basic-input"
                            value={voiceTts}
                            onChange={(event) => setVoiceTts(event.target.value)}
                          />
                          <span className="remote-access-basic-hint">(0~63)</span>
                        </div>
                        <div className="remote-access-voice-row">
                          <span>Walkie-talkie volume</span>
                          <input
                            className="remote-access-basic-input"
                            value={voiceWalkie}
                            onChange={(event) => setVoiceWalkie(event.target.value)}
                          />
                          <span className="remote-access-basic-hint">(0~63)</span>
                        </div>
                        <div className="remote-access-voice-row">
                          <span>ADKIT volume</span>
                          <input
                            className="remote-access-basic-input"
                            value={voiceAdkit}
                            onChange={(event) => setVoiceAdkit(event.target.value)}
                          />
                          <span className="remote-access-basic-hint">(0~63)</span>
                        </div>
                      </div>
                    ) : (
                      <div className="remote-access-basic-card">
                        <label className="remote-access-checkline">
                          <input
                            type="checkbox"
                            checked={autoDownloadReconnect}
                            onChange={(event) => setAutoDownloadReconnect(event.target.checked)}
                          />
                          Auto Download Reconnect
                        </label>
                        <div className="remote-access-basic-field">
                          <input
                            className="remote-access-basic-input"
                            value={autoDownloadMinutes}
                            onChange={(event) => setAutoDownloadMinutes(event.target.value)}
                          />
                          <span className="remote-access-basic-hint">(1 ~ 10)Minute</span>
                        </div>
                      </div>
                    )}
                    <div className="remote-access-footer">
                      <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                      <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                    </div>
                  </>
                ) : activeRemoteMenu === "Alarm" && activeRemoteSub === "Base" ? (
                  <>
                    <div className="remote-access-panel-tabs">
                      {["IO Alarm", "Speed Alarm", "Panel Alarm", "GPS Alarm", "Button Configuration"].map((tab) => (
                        <button key={tab} type="button" className="remote-access-chip">
                          {tab}
                        </button>
                      ))}
                    </div>
                    <div className="remote-access-table">
                      <div className="remote-access-row remote-access-head">
                        <span>Name</span>
                        <span>OSD</span>
                        <span>Enable</span>
                        <span>Alarm Type</span>
                        <span>Sensor Uses</span>
                        <span>Trigger</span>
                        <span>Linkage</span>
                      </div>
                      {[
                        { name: "Sensor1", osd: "S1", enable: true, type: "Event", uses: "Left Steering" },
                        { name: "Sensor2", osd: "S2", enable: true, type: "Event", uses: "Right Steering" },
                        { name: "Sensor3", osd: "S3", enable: false, type: "Alarm", uses: "None" }
                      ].map((row) => (
                        <div key={row.name} className="remote-access-row">
                          <span>{row.name}</span>
                          <span>{row.osd}</span>
                          <span className="remote-access-check">
                            <input type="checkbox" checked={row.enable} readOnly />
                          </span>
                          <button type="button" className="remote-access-select">{row.type} ▾</button>
                          <button type="button" className="remote-access-select">{row.uses} ▾</button>
                              <button type="button" className="remote-access-action">Setup</button>
                              <button type="button" className="remote-access-action">Setup</button>
                            </div>
                          ))}
                        </div>
                        <div className="remote-access-table">
                          <div className="remote-access-row remote-access-head remote-access-row-notify">
                            <span>Name</span>
                            <span>R-Watch Voice</span>
                            <span>MP3 Voice</span>
                            <span>B1/B2 Sound</span>
                            <span>B1/B2 Light</span>
                            <span>B3 Sound</span>
                            <span>B3 Light</span>
                          </div>
                          <div className="remote-access-table-scroll">
                            {alarmNotificationRows.map((name) => (
                              <div key={name} className="remote-access-row remote-access-row-notify">
                                <span>{name}</span>
                                <span className="remote-access-check">
                                  <input type="checkbox" checked={name === "Driver Fatigue" || name === "No Driver"} readOnly />
                                </span>
                                <span className="remote-access-check">
                                  <input type="checkbox" checked={name === "Driver Fatigue" || name === "No Driver"} readOnly />
                                </span>
                                <span className="remote-access-check">
                                  <input type="checkbox" checked={name.includes("blind spot") || name === "Front Blind Area"} readOnly />
                                </span>
                                <span className="remote-access-check">
                                  <input type="checkbox" checked={name.includes("blind spot") || name === "Front Blind Area"} readOnly />
                                </span>
                                <span className="remote-access-check">
                                  <input type="checkbox" checked={name.includes("blind spot") || name === "Front Blind Area"} readOnly />
                                </span>
                                <span className="remote-access-check">
                                  <input type="checkbox" checked={name.includes("blind spot") || name === "Front Blind Area"} readOnly />
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="remote-access-table">
                          <div className="remote-access-row remote-access-head remote-access-row-ai">
                            <span>Name</span>
                            <span>Enable</span>
                            {activeAiTab === "DMS/DSC" && <span>Source</span>}
                            <span>Alarm Type</span>
                            <span>Trigger</span>
                            <span>Linkage</span>
                          </div>
                          {aiRows.map((row) => (
                            <div key={row.name} className="remote-access-row remote-access-row-ai">
                              <span>{row.name}</span>
                              <span className="remote-access-check">
                                <input type="checkbox" checked readOnly />
                              </span>
                              {activeAiTab === "DMS/DSC" && (
                                <div className="remote-access-linkage">
                                  <button
                                    type="button"
                                    className="remote-access-select"
                                    onClick={() => setOpenSourceRow(openSourceRow === row.name ? null : row.name)}
                                  >
                                    {sourceSelections[row.name] ?? row.source ?? "DMS"} ▾
                                  </button>
                                  {openSourceRow === row.name && (
                                    <div className="remote-access-dropdown" role="menu">
                                      {sourceOptions.map((option) => (
                                        <button
                                          key={option}
                                          type="button"
                                          className="remote-access-dropdown-option"
                                          onClick={() => setSourceType(row.name, option)}
                                        >
                                          {option}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="remote-access-linkage">
                                <button
                                  type="button"
                                  className="remote-access-select"
                                  onClick={() => setOpenAlarmTypeRow(openAlarmTypeRow === row.name ? null : row.name)}
                                >
                                  {alarmTypeSelections[row.name] ?? "Alarm"} ▾
                                </button>
                                {openAlarmTypeRow === row.name && (
                                  <div className="remote-access-dropdown" role="menu">
                                    {alarmTypeOptions.map((option) => (
                                      <button
                                        key={option}
                                        type="button"
                                        className="remote-access-dropdown-option"
                                        onClick={() => setAlarmType(row.name, option)}
                                      >
                                        {option}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button type="button" className="remote-access-action">Setup</button>
                              <div className="remote-access-linkage">
                                <button
                                  type="button"
                                  className="remote-access-select"
                                  onClick={() => setOpenLinkageRow(openLinkageRow === row.name ? null : row.name)}
                                >
                                  {formatLinkageLabel(row.name)} ▾
                                </button>
                                {openLinkageRow === row.name && (
                                  <div className="remote-access-dropdown" role="menu">
                                    {linkageOptions.map((channel) => {
                                      const selected = linkageSelections[row.name]?.includes(channel) ?? false;
                                      return (
                                        <label key={channel} className="remote-access-dropdown-item">
                                          <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => toggleLinkageChannel(row.name, channel)}
                                          />
                                          <span>Channel {channel}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              <button type="button" className="remote-access-action">Setup</button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </section>
              ) : (
                <div className="remote-access-empty">Select Preferences to configure settings.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
*/

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDeviceDetails, loadFromApi, saveToApi, sendDeviceCommand } from "../utils/api";
import { showToast } from "../utils/toast";
import "../index.css";

type DeviceRow = {
  id: string;
  status: "online" | "off-line";
  plate: string;
  fleet: string;
  deviceId: string;
  moduleType: string;
  masterVersion: string;
  chipVersion: string;
  powerBoxVersion: string;
  ipc: string;
  [key: string]: string;
};

type ColumnDef = {
  key: string;
  label: string;
  width: number;
  locked?: boolean;
};

const deviceRows: DeviceRow[] = [
  {
    id: "dev-1",
    status: "off-line",
    plate: "T878 DHC",
    fleet: "MS/AFR-Tanzania-HV-D (SSF)",
    deviceId: "002B1063A3",
    moduleType: "-",
    masterVersion: "-",
    chipVersion: "-",
    powerBoxVersion: "-",
    ipc: "-"
  },
  {
    id: "dev-2",
    status: "off-line",
    plate: "T538 ECC",
    fleet: "TTL Spot Trucks",
    deviceId: "002B106B76",
    moduleType: "-",
    masterVersion: "-",
    chipVersion: "-",
    powerBoxVersion: "-",
    ipc: "-"
  },
  {
    id: "dev-3",
    status: "off-line",
    plate: "T841EMJ",
    fleet: "CPP_TZ/Telecom",
    deviceId: "00D205FFAB",
    moduleType: "GPS",
    masterVersion: "V3.5.8.19_R25070903",
    chipVersion: "-",
    powerBoxVersion: "ADPP-P21-N32-MCU-T24031201",
    ipc: "-"
  },
  {
    id: "dev-4",
    status: "off-line",
    plate: "T850ENK",
    fleet: "CPP_TZ/Coating",
    deviceId: "00D205FECB",
    moduleType: "GPS",
    masterVersion: "V3.5.8.19_R25070903",
    chipVersion: "-",
    powerBoxVersion: "ADPP-P21-N32-MCU-T24031201",
    ipc: "-"
  },
  {
    id: "dev-5",
    status: "off-line",
    plate: "T443ELY",
    fleet: "CPP_TZ/Telecom",
    deviceId: "00D204DD32",
    moduleType: "GPS",
    masterVersion: "V3.5.8.19_RC25052860",
    chipVersion: "-",
    powerBoxVersion: "ADPP-P21-N32-MCU-T24031201",
    ipc: "-"
  },
  {
    id: "dev-6",
    status: "off-line",
    plate: "T874 DHC",
    fleet: "TTL Spot Trucks",
    deviceId: "002B106149",
    moduleType: "GPS",
    masterVersion: "C6DAI_V3.5.6.8_T240219.70",
    chipVersion: "-",
    powerBoxVersion: "-",
    ipc: "-"
  }
];

const columns: ColumnDef[] = [
  { key: "status", label: "Online status", width: 140 },
  { key: "plate", label: "License Plate Number", width: 160 },
  { key: "registrationNumber", label: "Registration number", width: 160 },
  { key: "fleet", label: "Database", width: 200 },
  { key: "deviceModel", label: "Device model", width: 140 },
  { key: "deviceId", label: "Device ID", width: 140 },
  { key: "cameraSerial", label: "Camera serial number", width: 180 },
  { key: "macAddress", label: "MAC Address", width: 160 },
  { key: "moduleType", label: "Positioning module type", width: 180 },
  { key: "masterVersion", label: "Device Master Version", width: 190 },
  { key: "chipVersion", label: "Single chip version", width: 170 },
  { key: "powerBoxVersion", label: "Power Box Version", width: 190 },
  { key: "ipc1Version", label: "IPC 1 version", width: 140 },
  { key: "ipc1Mac", label: "IPC 1 MAC", width: 140 },
  { key: "ipc2Version", label: "IPC 2 version", width: 140 },
  { key: "ipc2Mac", label: "IPC 2 MAC", width: 140 },
  { key: "ipc3Version", label: "IPC 3 version", width: 140 },
  { key: "ipc3Mac", label: "IPC 3 MAC", width: 140 },
  { key: "ipc4Version", label: "IPC 4 version", width: 140 },
  { key: "ipc4Mac", label: "IPC 4 MAC", width: 140 },
  { key: "ipc5Version", label: "IPC 5 version", width: 140 },
  { key: "ipc5Mac", label: "IPC 5 MAC", width: 140 },
  { key: "ipc6Version", label: "IPC 6 version", width: 140 },
  { key: "ipc6Mac", label: "IPC 6 MAC", width: 140 },
  { key: "ipc7Version", label: "IPC 7 version", width: 140 },
  { key: "ipc7Mac", label: "IPC 7 MAC", width: 140 },
  { key: "ipc8Version", label: "IPC 8 version", width: 140 },
  { key: "ipc8Mac", label: "IPC 8 MAC", width: 140 },
  { key: "ipc9Version", label: "IPC 9 version", width: 140 },
  { key: "ipc9Mac", label: "IPC 9 MAC", width: 140 },
  { key: "ipc10Version", label: "IPC 10 version", width: 150 },
  { key: "ipc10Mac", label: "IPC 10 MAC", width: 150 },
  { key: "ipc11Version", label: "IPC 11 version", width: 150 },
  { key: "ipc11Mac", label: "IPC 11 MAC", width: 150 },
  { key: "comm1Type", label: "Communication module 1 type", width: 220 },
  { key: "networkType1", label: "Network type 1", width: 160 },
  { key: "comm1Imei", label: "Communication module 1 - IMEI", width: 220 },
  { key: "comm1Imsi", label: "Communication module 1 - IMSI", width: 220 },
  { key: "comm1Iccid", label: "Communication module 1 - ICCID", width: 220 },
  { key: "comm1Device", label: "Communication module 1 - Device", width: 230 },
  { key: "memory1Type", label: "Memory 1 type", width: 160 },
  { key: "memory1Sn", label: "Memory 1 - SN code", width: 190 },
  { key: "memory1Health", label: "Memory 1 health status", width: 190 },
  { key: "memory1Capacity", label: "Memory 1 capacity", width: 170 },
  { key: "memory1Remain", label: "Remaining capacity of memory 1", width: 230 },
  { key: "memory1Usage", label: "Remaining usage time of memory 1", width: 240 },
  { key: "memory1Power", label: "Power on duration of memory 1", width: 230 },
  { key: "memory2Type", label: "Memory 2 type", width: 160 },
  { key: "memory2Sn", label: "Memory 2 - SN code", width: 190 },
  { key: "memory2Health", label: "Memory 2 health status", width: 190 },
  { key: "memory2Capacity", label: "Memory 2 capacity", width: 170 },
  { key: "memory2Remain", label: "Remaining capacity of memory 2", width: 230 },
  { key: "memory2Usage", label: "Remaining usage time of memory 2", width: 240 },
  { key: "memory2Power", label: "Power on duration of memory 2", width: 230 },
  { key: "memory3Type", label: "Memory 3 type", width: 160 },
  { key: "memory3Sn", label: "Memory 3 - SN code", width: 190 },
  { key: "memory3Health", label: "Memory 3 health status", width: 190 },
  { key: "memory3Capacity", label: "Memory 3 capacity", width: 170 },
  { key: "memory3Remain", label: "Remaining capacity of memory 3", width: 230 },
  { key: "memory3Usage", label: "Remaining usage time of memory 3", width: 240 },
  { key: "memory3Power", label: "Power on duration of memory 3", width: 230 },
  { key: "memory4Type", label: "Memory 4 type", width: 160 },
  { key: "memory4Sn", label: "Memory 4 - SN code", width: 190 },
  { key: "memory4Health", label: "Memory 4 health status", width: 190 },
  { key: "camera1Rec", label: "Camera 1 recording status", width: 210 },
  { key: "camera2Enabled", label: "Camera 2 enabled", width: 170 },
  { key: "camera2Status", label: "Camera 2 status", width: 170 },
  { key: "camera2Resolution", label: "Camera 2 Resolution", width: 180 },
  { key: "camera2Rec", label: "Camera 2 recording status", width: 210 },
  { key: "camera3Enabled", label: "Camera 3 enabled", width: 170 },
  { key: "camera3Status", label: "Camera 3 status", width: 170 },
  { key: "camera3Resolution", label: "Camera 3 Resolution", width: 180 },
  { key: "camera3Rec", label: "Camera 3 recording status", width: 210 },
  { key: "camera4Enabled", label: "Camera 4 enabled", width: 170 },
  { key: "camera4Status", label: "Camera 4 status", width: 170 },
  { key: "camera4Resolution", label: "Camera 4 Resolution", width: 180 },
  { key: "camera4Rec", label: "Camera 4 recording status", width: 210 },
  { key: "camera5Enabled", label: "Camera 5 enabled", width: 170 },
  { key: "camera5Status", label: "Camera 5 status", width: 170 },
  { key: "camera5Resolution", label: "Camera 5 Resolution", width: 180 },
  { key: "camera6Rec", label: "Camera 6 recording status", width: 210 },
  { key: "camera7Enabled", label: "Camera 7 enabled", width: 170 },
  { key: "camera7Status", label: "Camera 7 status", width: 170 },
  { key: "camera7Resolution", label: "Camera 7 Resolution", width: 180 },
  { key: "camera7Rec", label: "Camera 7 recording status", width: 210 },
  { key: "camera8Enabled", label: "Camera 8 enabled", width: 170 },
  { key: "camera8Status", label: "Camera 8 status", width: 170 },
  { key: "camera8Resolution", label: "Camera 8 Resolution", width: 180 },
  { key: "camera8Rec", label: "Camera 8 recording status", width: 210 },
  { key: "camera9Enabled", label: "Camera 9 enabled", width: 170 },
  { key: "camera9Status", label: "Camera 9 status", width: 170 },
  { key: "camera9Resolution", label: "Camera 9 Resolution", width: 180 },
  { key: "camera9Rec", label: "Camera 9 recording status", width: 210 },
  { key: "camera10Enabled", label: "Camera 10 enabled", width: 180 },
  { key: "camera10Status", label: "Camera 10 status", width: 180 },
  { key: "camera10Resolution", label: "Camera 10 Resolution", width: 190 },
  { key: "accAccess", label: "ACC Access Method", width: 170 },
  { key: "calibrationStatus", label: "Calibration status", width: 170 },
  { key: "peripheralStatus", label: "Peripheral status", width: 170 },
  { key: "hardwareConfig", label: "Hardware Configuration Table", width: 230 },
  { key: "upperFleet", label: "Upper-level Fleet", width: 180 },
  { key: "updateTime", label: "Update time", width: 170 },
  { key: "offlineTime", label: "Offline time", width: 170 },
  { key: "operation", label: "Operation", width: 180, locked: true }
];

const defaultColumnKeys = new Set([
  "status",
  "plate",
  "fleet",
  "deviceId",
  "moduleType",
  "masterVersion",
  "chipVersion",
  "powerBoxVersion",
  "ipc",
  "operation"
]);

const preferenceMenus = [
  { label: "Basic Setup", sub: ["Asset Details", "Time Setup", "Startup", "User Setup"] },
  { label: "Surveillance", sub: ["Live View", "Record", "IPC Setup", "Camera Setup"] },
  { label: "Collection", sub: ["Collection"] },
  { label: "Alarm", sub: ["Alarm"] },
  { label: "Others", sub: ["General", "Preview", "Playback"] }
];

const linkageOptions = Array.from({ length: 11 }, (_, index) => index + 1);

const recordRows = [
  { channel: "1", mode: "Power Up", audio: "No Audio", quality: "2", encode: "VBR", format: "G711A" },
  { channel: "2", mode: "Power Up", audio: "No Audio", quality: "2", encode: "VBR", format: "G711A" },
  { channel: "3", mode: "Power Up", audio: "No Audio", quality: "2", encode: "VBR", format: "ADPCM" },
  { channel: "4", mode: "Power Up", audio: "No Audio", quality: "2", encode: "VBR", format: "ADPCM" }
];

const subStreamRows = [
  { channel: "1", enabled: true, resolution: "1080P", frameRate: "10", quality: "3", encode: "H264", audio: "No Audio" },
  { channel: "2", enabled: true, resolution: "1080P", frameRate: "10", quality: "3", encode: "H264", audio: "No Audio" },
  { channel: "3", enabled: true, resolution: "1080P", frameRate: "15", quality: "3", encode: "H265", audio: "No Audio" },
  { channel: "4", enabled: true, resolution: "1080P", frameRate: "15", quality: "3", encode: "H265", audio: "No Audio" }
];

const ipcRows = [
  { channel: "1", enabled: false, ipPort: "", outside: false },
  { channel: "2", enabled: false, ipPort: "", outside: false },
  { channel: "3", enabled: false, ipPort: "", outside: false },
  { channel: "4", enabled: true, ipPort: "10.100.100.100:9006:1", outside: false }
];

const aiAppRows = [
  { channel: "1", use: "ADAS", mode: "Normal" },
  { channel: "2", use: "DSC", mode: "Normal" },
  { channel: "3", use: "None", mode: "Normal" },
  { channel: "4", use: "DMS", mode: "Normal" }
];

const alarmNotifyRows = [
  { name: "Driver Fatigue", rWatch: true, mp3: true, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "No Driver", rWatch: true, mp3: true, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "Handheld Devices", rWatch: true, mp3: true, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "Smoking", rWatch: true, mp3: true, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "Distraction", rWatch: true, mp3: true, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "LDW", rWatch: true, mp3: true, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "FCW", rWatch: true, mp3: true, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "Overspeed", rWatch: false, mp3: false, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "HMW", rWatch: true, mp3: true, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "Yawn", rWatch: true, mp3: true, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "PCW", rWatch: true, mp3: true, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "Seatbelt", rWatch: true, mp3: true, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "No Mask", rWatch: false, mp3: false, b12Sound: false, b12Light: false, b3Sound: false, b3Light: false },
  { name: "Right blind spot level one", rWatch: false, mp3: false, b12Sound: true, b12Light: true, b3Sound: true, b3Light: true },
  { name: "Right blind spot level two", rWatch: false, mp3: false, b12Sound: true, b12Light: true, b3Sound: true, b3Light: true }
];

const bsdRows = [
  { name: "Right blind spot detection", enabled: false, alarmType: "Alarm" },
  { name: "Left blind spot detection", enabled: false, alarmType: "Alarm" },
  { name: "Front Blind Area", enabled: false, alarmType: "Alarm" },
  { name: "Rear blind spot", enabled: false, alarmType: "Alarm" }
];

const dmsRows = [
  { name: "Driver Fatigue", enabled: true, source: "DMS", alarmType: "Alarm" },
  { name: "No Driver", enabled: false, source: "Combined", alarmType: "Alarm" },
  { name: "Handheld Devices", enabled: true, source: "Combined", alarmType: "Alarm" },
  { name: "Smoking", enabled: true, source: "DMS", alarmType: "Alarm" },
  { name: "Distraction", enabled: true, source: "DMS", alarmType: "Alarm" },
  { name: "Yawn", enabled: true, source: "DMS", alarmType: "Alarm" },
  { name: "Seatbelt", enabled: true, source: "DMS", alarmType: "Alarm" },
  { name: "No Mask", enabled: false, source: "DMS", alarmType: "Alarm" },
  { name: "Infrared Blocked", enabled: false, source: "DMS", alarmType: "Alarm" },
  { name: "Device Disconnected", enabled: false, source: "DMS", alarmType: "Alarm" }
];

const adasRows = [
  { name: "LDW", enabled: true, source: "DMS", alarmType: "Alarm" },
  { name: "FCW", enabled: true, source: "DMS", alarmType: "Alarm" },
  { name: "Overspeed", enabled: false, source: "DMS", alarmType: "Alarm" },
  { name: "HMW", enabled: true, source: "DMS", alarmType: "Alarm" },
  { name: "PCW", enabled: false, source: "DMS", alarmType: "Alarm" },
  { name: "Rolling Stop", enabled: false, source: "DMS", alarmType: "Alarm" }
];

const alarmVideoRows = [
  { name: "Video Loss", enabled: true, alarmType: "Alarm" }
];

const alarmTypeOptions = ["Alarm", "Notification"];

const mainStreamRows = [
  {
    channel: "1",
    enabled: true,
    aiAlert: false,
    resolution: "1080P",
    frameRate: "20",
    quality: "2",
    encode: "H264",
    channelName: "CH1",
    recordMode: "Power Up",
    audio: "No Audio",
    alarmQuality: "2",
    encodeMode: "VBR",
    audioFormat: "G711A"
  },
  {
    channel: "2",
    enabled: true,
    aiAlert: false,
    resolution: "1080P",
    frameRate: "20",
    quality: "2",
    encode: "H264",
    channelName: "CH2",
    recordMode: "Power Up",
    audio: "No Audio",
    alarmQuality: "2",
    encodeMode: "VBR",
    audioFormat: "G711A"
  },
  {
    channel: "3",
    enabled: true,
    aiAlert: false,
    resolution: "1080P",
    frameRate: "15",
    quality: "3",
    encode: "H265",
    channelName: "CH3",
    recordMode: "Power Up",
    audio: "No Audio",
    alarmQuality: "2",
    encodeMode: "VBR",
    audioFormat: "ADPCM"
  },
  {
    channel: "4",
    enabled: true,
    aiAlert: false,
    resolution: "1080P",
    frameRate: "20",
    quality: "3",
    encode: "H265",
    channelName: "CH4",
    recordMode: "Power Up",
    audio: "No Audio",
    alarmQuality: "2",
    encodeMode: "VBR",
    audioFormat: "ADPCM"
  }
];

const sidebarMenuItems = [
  {
    label: "Basic Setup",
    sub: [
      "Asset Details",
      "Time Setup",
      "Startup",
      "User Setup",
      "Network",
      "Application",
      "Voice Setup",
      "Driver Picture"
    ]
  },
  { label: "Surveillance", sub: ["Live View", "Record", "IPC Setup", "Camera Setup"] },
  { label: "Collection", sub: ["Collection"] },
  { label: "Alarm", sub: ["Video", "AI App"] },
  { label: "Others", sub: ["General", "Preview", "Playback"] }
];

const generalTabs = ["General", "Basic Info", "Device Module", "Storage Device", "Version Info"];

const generalServers = [
  {
    title: "Main Server",
    status: "Connected",
    networkType: "4G",
    protocol: "TCP",
    address: "main.vivitel.io",
    port: "7000"
  },
  {
    title: "Media Server",
    status: "Connected",
    networkType: "4G",
    protocol: "TCP",
    address: "media.vivitel.io",
    port: "7010"
  }
];

const POSITIONING_PROTOCOL_JTT808 = "JT/T808";
const VIDEO_PROTOCOL_JTT1078 = "JT/T1078";

type NormalizedProtocolPair = {
  protocolType: string;
  videoProtocol: string;
};

const normalizeProtocolPair = (protocolType: unknown, videoProtocol: unknown): NormalizedProtocolPair => {
  const rawProtocolType = String(protocolType ?? "").trim();
  const rawVideoProtocol = String(videoProtocol ?? "").trim();

  // Backward compatibility: older drafts used "JT/T" as a single combined value.
  if (rawProtocolType.toUpperCase() === "JT/T") {
    return {
      protocolType: POSITIONING_PROTOCOL_JTT808,
      videoProtocol: rawVideoProtocol || VIDEO_PROTOCOL_JTT1078
    };
  }

  return {
    protocolType: rawProtocolType || "N9M",
    videoProtocol:
      rawVideoProtocol || (rawProtocolType === POSITIONING_PROTOCOL_JTT808 ? VIDEO_PROTOCOL_JTT1078 : "N9M")
  };
};

export default function DeviceRemoteActions() {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const [columnQuery, setColumnQuery] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(() => new Set(defaultColumnKeys));
  const [showRemoteAccess, setShowRemoteAccess] = useState(false);
  const [activeRemoteTab, setActiveRemoteTab] = useState("General");
  const [activeGeneralMenu, setActiveGeneralMenu] = useState("General");
  const [activeGeneralTab, setActiveGeneralTab] = useState("Basic Info");
  const [activeBasicInfoTab, setActiveBasicInfoTab] = useState("Calibration Status");
  const [openSidebarItem, setOpenSidebarItem] = useState<string | null>("General");
  const [activeSurveillanceSub, setActiveSurveillanceSub] = useState("Live View");
  const [activeBasicSub, setActiveBasicSub] = useState("Time Setup");
  const [activeCollectionSub, setActiveCollectionSub] = useState("Collection");
  const [activeTimeTab, setActiveTimeTab] = useState("General");
  const [activeAppTab, setActiveAppTab] = useState("Download");
  const [activeNetworkTab, setActiveNetworkTab] = useState("Ports");
  type ServerTab = "Server1";
  type ServerConfig = {
    on: boolean;
    protocolType: string;
    videoProtocol: string;
    tlsEnable: boolean;
    enableNetwork: string;
    registerIp: string;
    registerPortProtocol: string;
    registerPort: string;
    registerTls: string;
    mediaIp: string;
    mediaPortProtocol: string;
    mediaPort: string;
    mediaTls: string;
  };
  const serverTabs: ServerTab[] = ["Server1"];

  const [activeServerTab, setActiveServerTab] = useState<ServerTab>("Server1");
  const [serverConfigs, setServerConfigs] = useState<Record<ServerTab, ServerConfig>>({
    Server1: {
      on: true,
      protocolType: "N9M",
      videoProtocol: "N9M",
      tlsEnable: false,
      enableNetwork: "Module1",
      registerIp: "live2.ent.mixtel.com",
      registerPortProtocol: "TCP",
      registerPort: "5556",
      registerTls: "6556",
      mediaIp: "live2.ent.mixtel.com",
      mediaPortProtocol: "TCP",
      mediaPort: "5556",
      mediaTls: "6556"
    }
  });
  const [communicationModuleSettings, setCommunicationModuleSettings] = useState({
    lock: false,
    serverType: "LTE-FDD",
    networkType: "Mix",
    apn: "internet",
    userName: "guest",
    password: "******",
    number: "*99#",
    certification: "CHAP",
    carrier: "Auto",
    protocolType: "IPV4",
    activeMode: "Always",
    number1: "",
    number2: "",
    number3: "",
    mtu: "1500"
  });
  const [activeStartupTab, setActiveStartupTab] = useState("Power Box");
  const [activeRecordTab, setActiveRecordTab] = useState("General");
  const [activePreferencesMenu, setActivePreferencesMenu] = useState("Surveillance");
  const [activePreferencesSub, setActivePreferencesSub] = useState("Record");
  const [activePreferencesTab, setActivePreferencesTab] = useState("General");
  const [showPreviewCalendar, setShowPreviewCalendar] = useState(false);
  const [formattingNotice, setFormattingNotice] = useState<null | { type: "success" | "error"; message: string }>(
    null
  );
  const [openAlarmTypeRow, setOpenAlarmTypeRow] = useState<string | null>(null);
  const [alarmTypeSelections, setAlarmTypeSelections] = useState<Record<string, string>>({});
  const sourceOptions = ["DMS", "Combined"];
  const [openSourceRow, setOpenSourceRow] = useState<string | null>(null);
  const [sourceSelections, setSourceSelections] = useState<Record<string, string>>({});
  const [openLinkageRow, setOpenLinkageRow] = useState<string | null>(null);
  const [linkageSelections, setLinkageSelections] = useState<Record<string, number[]>>({});
  const [openTriggerRow, setOpenTriggerRow] = useState<string | null>(null);
  const [triggerConfigs, setTriggerConfigs] = useState<Record<string, { minSpeed: string; maxSpeed: string; delay: string }>>({});
  const playbackMonths = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  const [playbackMonthIndex, setPlaybackMonthIndex] = useState(10);
  const [playbackYear, setPlaybackYear] = useState(2025);
  const [selectedPlaybackDay, setSelectedPlaybackDay] = useState("15");
  const [activeCameraType, setActiveCameraType] = useState("ADAS");
  const [isMirrorOn, setIsMirrorOn] = useState(false);
  const [isFlipOn, setIsFlipOn] = useState(false);
  const [activeIpcRow, setActiveIpcRow] = useState("4");
  const [activeAlarmSub, setActiveAlarmSub] = useState("AI App");
  const [activeAiTab, setActiveAiTab] = useState("ADAS");
  const [driverPictureName, setDriverPictureName] = useState("");
  const [driverPictureFile, setDriverPictureFile] = useState<File | null>(null);
  const [driverPicturePreview, setDriverPicturePreview] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const activeDevice = useMemo(() => {
    const selectedId = selectedIds[0];
    return deviceRows.find((row) => row.id === selectedId) ?? deviceRows[0];
  }, [selectedIds]);
  const handleFormatStorage = (name: string) => {
    const success = Math.random() > 0.25;
    setFormattingNotice({
      type: success ? "success" : "error",
      message: success
        ? `${name} formatted successfully (OTA).`
        : `${name} formatting failed. Please retry.`
    });
  };
  const updateTriggerConfig = (rowName: string, field: "minSpeed" | "maxSpeed" | "delay", value: string) => {
    setTriggerConfigs((current) => ({
      ...current,
      [rowName]: {
        minSpeed: current[rowName]?.minSpeed ?? "",
        maxSpeed: current[rowName]?.maxSpeed ?? "",
        delay: current[rowName]?.delay ?? "",
        [field]: value
      }
    }));
  };
  const toggleLinkageChannel = (rowName: string, channel: number, allowMultiple = true) => {
    setLinkageSelections((current) => {
      const selected = current[rowName] ?? [];
      const next = allowMultiple
        ? selected.includes(channel)
          ? selected.filter((value) => value !== channel)
          : [...selected, channel]
        : [channel];
      return { ...current, [rowName]: next };
    });
  };
  const setSourceType = (rowName: string, option: string) => {
    setSourceSelections((current) => ({ ...current, [rowName]: option }));
    if (option === "DMS") {
      setLinkageSelections((current) => {
        const selected = current[rowName] ?? [];
        return { ...current, [rowName]: selected.length ? [selected[0]] : [] };
      });
    }
  };
  const handleDriverPictureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setDriverPictureFile(null);
      setDriverPicturePreview("");
      return;
    }
    setDriverPictureFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setDriverPicturePreview(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(file);
  };
  const sanitizedDriverPictureName = driverPictureName.trim().replace(/\s+/g, "_");
  const driverPictureExtension = driverPictureFile?.name.split(".").pop();
  const driverPictureFilename = sanitizedDriverPictureName
    ? driverPictureExtension
      ? `${sanitizedDriverPictureName}.${driverPictureExtension}`
      : sanitizedDriverPictureName
    : driverPictureFile?.name ?? "";
  const canUploadDriverPicture = Boolean(driverPictureFile && sanitizedDriverPictureName);
  const displayPlate = vehiclePlate || activeDevice?.plate || "AIP953MP";
  const [isVisionActionBusy, setIsVisionActionBusy] = useState(false);
  const [visionActionMessage, setVisionActionMessage] = useState("");
  const [isHydratingRemoteAccess, setIsHydratingRemoteAccess] = useState(false);
  const remoteAccessStorageKey = `device-remote-actions:${activeDevice?.id ?? "unknown"}`;

  const buildRemoteAccessPayload = () => ({
    deviceId: activeDevice?.id ?? null,
    plate: vehiclePlate,
    sourceSelections,
    alarmTypeSelections,
    linkageSelections,
    triggerConfigs,
    serverConfigs,
    communicationModuleSettings,
    activeGeneralMenu,
    activeGeneralTab,
    activeBasicSub,
    activeSurveillanceSub,
    activeAlarmSub,
    activeAiTab,
    activeNetworkTab,
    activeServerTab,
    activeTimeTab,
    activeRecordTab,
    activePreferencesMenu,
    activePreferencesSub,
    activePreferencesTab,
    activeCameraType,
    isMirrorOn,
    isFlipOn,
    activeIpcRow,
    driverPictureName,
    driverPictureFilename,
    driverPicturePreview,
    selectedPlaybackDay,
    playbackMonthIndex,
    playbackYear,
    selectedColumns: Array.from(selectedColumns)
  });

  const applyRemoteAccessPayload = (payload: any) => {
    if (!payload || typeof payload !== "object") return;

    if (typeof payload.plate === "string") setVehiclePlate(payload.plate);
    if (payload.sourceSelections && typeof payload.sourceSelections === "object") setSourceSelections(payload.sourceSelections as Record<string, string>);
    if (payload.alarmTypeSelections && typeof payload.alarmTypeSelections === "object") setAlarmTypeSelections(payload.alarmTypeSelections as Record<string, string>);
    if (payload.linkageSelections && typeof payload.linkageSelections === "object") setLinkageSelections(payload.linkageSelections as Record<string, number[]>);
    if (payload.triggerConfigs && typeof payload.triggerConfigs === "object") {
      setTriggerConfigs(payload.triggerConfigs as Record<string, { minSpeed: string; maxSpeed: string; delay: string }>);
    }
    if (payload.serverConfigs && typeof payload.serverConfigs === "object") {
      const incoming = payload.serverConfigs as Partial<Record<"Server1" | "Server2", ServerConfig>>;
      const server1 = incoming.Server1 ?? incoming.Server2;
      if (server1) {
        const normalized = normalizeProtocolPair(server1.protocolType, (server1 as any).videoProtocol);
        setServerConfigs({
          Server1: {
            ...server1,
            protocolType: normalized.protocolType,
            videoProtocol: normalized.videoProtocol
          }
        });
      }
    }
    if (payload.communicationModuleSettings && typeof payload.communicationModuleSettings === "object") {
      setCommunicationModuleSettings((current) => ({
        ...current,
        ...(payload.communicationModuleSettings as typeof current)
      }));
    }

    if (typeof payload.activeGeneralMenu === "string") setActiveGeneralMenu(payload.activeGeneralMenu);
    if (typeof payload.activeGeneralTab === "string") setActiveGeneralTab(payload.activeGeneralTab);
    if (typeof payload.activeBasicSub === "string") setActiveBasicSub(payload.activeBasicSub);
    if (typeof payload.activeSurveillanceSub === "string") setActiveSurveillanceSub(payload.activeSurveillanceSub);
    if (typeof payload.activeAlarmSub === "string") setActiveAlarmSub(payload.activeAlarmSub);
    if (typeof payload.activeAiTab === "string") setActiveAiTab(payload.activeAiTab);
    if (typeof payload.activeNetworkTab === "string") setActiveNetworkTab(payload.activeNetworkTab);
    if (payload.activeServerTab === "Server1") {
      setActiveServerTab(payload.activeServerTab);
    }
    if (typeof payload.activeTimeTab === "string") setActiveTimeTab(payload.activeTimeTab);
    if (typeof payload.activeRecordTab === "string") setActiveRecordTab(payload.activeRecordTab);
    if (typeof payload.activePreferencesMenu === "string") setActivePreferencesMenu(payload.activePreferencesMenu);
    if (typeof payload.activePreferencesSub === "string") setActivePreferencesSub(payload.activePreferencesSub);
    if (typeof payload.activePreferencesTab === "string") setActivePreferencesTab(payload.activePreferencesTab);
    if (typeof payload.activeCameraType === "string") setActiveCameraType(payload.activeCameraType);
    if (typeof payload.activeIpcRow === "string") setActiveIpcRow(payload.activeIpcRow);

    if (typeof payload.isMirrorOn === "boolean") setIsMirrorOn(payload.isMirrorOn);
    if (typeof payload.isFlipOn === "boolean") setIsFlipOn(payload.isFlipOn);

    if (typeof payload.driverPictureName === "string") setDriverPictureName(payload.driverPictureName);
    if (typeof payload.driverPicturePreview === "string") setDriverPicturePreview(payload.driverPicturePreview);
    if (typeof payload.selectedPlaybackDay === "string") setSelectedPlaybackDay(payload.selectedPlaybackDay);
    if (typeof payload.playbackMonthIndex === "number") setPlaybackMonthIndex(payload.playbackMonthIndex);
    if (typeof payload.playbackYear === "number") setPlaybackYear(payload.playbackYear);

    if (Array.isArray(payload.selectedColumns) && payload.selectedColumns.length) {
      setSelectedColumns(new Set(payload.selectedColumns.map((key: unknown) => String(key))));
    }
  };

  const persistRemoteAccessDraft = async (payload: ReturnType<typeof buildRemoteAccessPayload>) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(remoteAccessStorageKey, JSON.stringify(payload));
    }
    await saveToApi(remoteAccessStorageKey, payload);
  };

  const runVisionAction = async (command: string, payload?: unknown) => {
    const deviceId = String(activeDevice?.deviceId ?? "").trim();
    if (!deviceId) {
      showToast("No device ID selected for Vision action.", "error");
      return false;
    }

    setIsVisionActionBusy(true);
    const result = await sendDeviceCommand(deviceId, command, {
      ...(payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}),
      context: {
        remoteTab: activeRemoteTab,
        menu: activeGeneralMenu,
        sub:
          activeGeneralMenu === "Surveillance"
            ? activeSurveillanceSub
            : activeGeneralMenu === "Basic Setup"
              ? activeBasicSub
              : activeGeneralMenu === "Alarm"
                ? activeAlarmSub
                : activeRemoteTab
      }
    });
    setIsVisionActionBusy(false);

    if (!result.ok) {
      const message = String(result.error ?? "Vision command failed.");
      setVisionActionMessage(`Failed: ${message}`);
      showToast(`Vision command failed: ${message}`, "error");
      return false;
    }

    setVisionActionMessage(`Sent to Vision: ${command}`);
    showToast(`Sent to Vision: ${command}`, "success");
    return true;
  };

  const loadRemoteAccessDraft = async () => {
    let loaded: any = null;

    if (typeof window !== "undefined") {
      const local = window.localStorage.getItem(remoteAccessStorageKey);
      if (local) {
        try {
          loaded = JSON.parse(local);
        } catch {
          loaded = null;
        }
      }
    }

    if (!loaded) {
      loaded = await loadFromApi<any>(remoteAccessStorageKey);
    }

    if (loaded) applyRemoteAccessPayload(loaded);
  };

  const handleRemoteAccessCancel = () => {
    void (async () => {
      setIsHydratingRemoteAccess(true);
      await loadRemoteAccessDraft();
      setIsHydratingRemoteAccess(false);
      setVisionActionMessage("Restored latest saved Vision draft.");
    })();
  };

  const handleRemoteAccessSave = () => {
    void (async () => {
      const payload = buildRemoteAccessPayload();
      await persistRemoteAccessDraft(payload);
      await runVisionAction("vision.remoteAccess.apply", payload);
    })();
  };

  const handleRestartDevice = (row: DeviceRow) => {
    setSelectedIds([row.id]);
    setShowRemoteAccess(false);
    void runVisionAction("vision.device.restart", { plate: row.plate, rowId: row.id });
  };

  const openRemoteAccessForRow = (row: DeviceRow) => {
    setSelectedIds([row.id]);
    setShowRemoteAccess(true);
  };

  const handleRemoteActionButton = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const button = target.closest("button");
    if (!button) return;

    const isActionButton =
      button.classList.contains("remote-access-action") ||
      button.classList.contains("remote-access-playback-action") ||
      button.classList.contains("remote-access-preview-action") ||
      button.classList.contains("remote-access-preview-close");
    if (!isActionButton) return;

    const label = String(button.textContent ?? "").trim();
    const map: Record<string, string> = {
      Setup: "vision.remoteAccess.setup",
      Search: "vision.remoteAccess.search",
      "Change Time": "vision.remoteAccess.changeTime",
      Calibration: "vision.remoteAccess.calibration",
      Fullscreen: "vision.remoteAccess.playback.fullscreen",
      "⏮": "vision.remoteAccess.playback.previous",
      "▶": "vision.remoteAccess.playback.play",
      "⏸": "vision.remoteAccess.playback.pause",
      "⏹": "vision.remoteAccess.playback.stop",
      "⏭": "vision.remoteAccess.playback.next",
      Live: "vision.remoteAccess.preview.live",
      Stop: "vision.remoteAccess.preview.stop",
      Snapshot: "vision.remoteAccess.preview.snapshot",
      Record: "vision.remoteAccess.preview.record",
      Audio: "vision.remoteAccess.preview.audio",
      "×": "vision.remoteAccess.preview.close",
      Add: "vision.remoteAccess.add",
      Back: "vision.remoteAccess.back"
    };
    const command = map[label];
    if (!command) return;

    event.preventDefault();
    void runVisionAction(command, { actionLabel: label });
  };

  useEffect(() => {
    setVehiclePlate(activeDevice?.plate ?? "");
  }, [activeDevice?.plate]);

  useEffect(() => {
    if (!showRemoteAccess) return;
    setIsHydratingRemoteAccess(true);

    void (async () => {
      await loadRemoteAccessDraft();
      const details = await getDeviceDetails(String(activeDevice?.deviceId ?? ""));
      if (details.ok) {
        setVisionActionMessage("Vision device link is active.");
      }
      setIsHydratingRemoteAccess(false);
    })();
  }, [showRemoteAccess, activeDevice?.deviceId, remoteAccessStorageKey]);

  useEffect(() => {
    if (!showRemoteAccess || isHydratingRemoteAccess) return;
    const payload = buildRemoteAccessPayload();
    const timeout = window.setTimeout(() => {
      void persistRemoteAccessDraft(payload);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    showRemoteAccess,
    isHydratingRemoteAccess,
    activeDevice?.id,
    vehiclePlate,
    sourceSelections,
    alarmTypeSelections,
    linkageSelections,
    triggerConfigs,
    serverConfigs,
    activeGeneralMenu,
    activeGeneralTab,
    activeBasicSub,
    activeSurveillanceSub,
    activeAlarmSub,
    activeAiTab,
    activeNetworkTab,
    activeServerTab,
    activeTimeTab,
    activeRecordTab,
    activePreferencesMenu,
    activePreferencesSub,
    activePreferencesTab,
    activeCameraType,
    isMirrorOn,
    isFlipOn,
    activeIpcRow,
    driverPictureName,
    driverPictureFilename,
    driverPicturePreview,
    selectedPlaybackDay,
    playbackMonthIndex,
    playbackYear,
    selectedColumns
  ]);

  const setAlarmType = (rowName: string, option: string) => {
    setAlarmTypeSelections((current) => ({ ...current, [rowName]: option }));
  };
  const formatLinkageLabel = (rowName: string) => {
    const selected = linkageSelections[rowName] ?? [];
    if (!selected.length) {
      return "Select channels";
    }
    if (selected.length === 1) {
      return `Channel ${selected[0]}`;
    }
    return `${selected.length} channels`;
  };
  const [userSetupRows] = useState([
    { name: "admin", group: "Admin" },
    { name: "user", group: "Normal User" }
  ]);

  const filteredColumns = useMemo(() => {
    const query = columnQuery.trim().toLowerCase();
    if (!query) return columns;
    return columns.filter((column) => column.label.toLowerCase().includes(query));
  }, [columnQuery]);

  const visibleColumns = useMemo(
    () => columns.filter((column) => column.locked || selectedColumns.has(column.key)),
    [selectedColumns]
  );

  const operationColumn = useMemo(
    () => columns.find((column) => column.key === "operation"),
    []
  );

  const dataColumns = useMemo(
    () => visibleColumns.filter((column) => column.key !== "operation"),
    [visibleColumns]
  );

  const gridTemplate = useMemo(() => {
    const widths = ["34px", ...dataColumns.map((col) => `${col.width}px`)];
    if (operationColumn) {
      widths.push("1fr", `${operationColumn.width}px`);
    }
    return widths.join(" ");
  }, [dataColumns, operationColumn]);

  const toggleColumn = (key: string, locked?: boolean) => {
    if (locked) return;
    setSelectedColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAllColumns = (checked: boolean) => {
    if (checked) {
      setSelectedColumns(new Set(columns.filter((column) => !column.locked).map((column) => column.key)));
    } else {
      setSelectedColumns(new Set(defaultColumnKeys));
    }
  };

  const allSelected = selectedIds.length === deviceRows.length && deviceRows.length > 0;
  const selectedCount = selectedIds.length;

  return (
    <div className="device-remote-actions">
      <div className="device-remote-page">
        <div className="device-remote-card">
          <div className="device-remote-footer">
            <button type="button" className="video-back-btn" onClick={() => navigate("/Track/videos/dashboard")}>
              ← Back to Dashboard
            </button>
            <div className="device-remote-footer-actions">
              <button type="button" className="device-remote-modal-btn" onClick={() => setShowColumnChooser(true)}>
                Columns
              </button>
              <div className="device-remote-meta">Selected: {selectedCount}</div>
            </div>
          </div>
          <div className="device-remote-scroll">
            <div className="device-remote-table">
            <div className="device-remote-row device-remote-head" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="device-remote-cell checkbox">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) =>
                    setSelectedIds(event.target.checked ? deviceRows.map((row) => row.id) : [])
                  }
                  aria-label="Select all devices"
                />
              </div>
              {dataColumns.map((column) => (
                <div key={column.key} className="device-remote-cell">
                  {column.label}
                </div>
              ))}
              {operationColumn && (
                <div className="device-remote-cell device-remote-cell-spacer" aria-hidden="true" />
              )}
              {operationColumn && (
                <div key={operationColumn.key} className="device-remote-cell device-remote-cell-op">
                  {operationColumn.label}
                </div>
              )}
            </div>

            {deviceRows.map((row) => (
              <div key={row.id} className="device-remote-row" style={{ gridTemplateColumns: gridTemplate }}>
                <div className="device-remote-cell checkbox">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(row.id)}
                    onChange={(event) => {
                      setSelectedIds((current) =>
                        event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)
                      );
                    }}
                    aria-label={`Select ${row.plate}`}
                  />
                </div>
                {dataColumns.map((column) => {
                  if (column.key === "status") {
                    return (
                      <div key={`${row.id}-${column.key}`} className="device-remote-cell status">
                        <span className={`device-remote-dot ${row.status}`} aria-hidden="true" />
                        {row.status}
                      </div>
                    );
                  }

                  const value =
                    column.key === "cameraSerial"
                      ? row.deviceId
                      : column.key === "registrationNumber"
                        ? row.plate
                        : row[column.key] ?? "-";
                  return (
                    <div key={`${row.id}-${column.key}`} className="device-remote-cell">
                      {value}
                    </div>
                  );
                })}
                {operationColumn && (
                  <div className="device-remote-cell device-remote-cell-spacer" aria-hidden="true" />
                )}
                {operationColumn && (
                  <div key={`${row.id}-${operationColumn.key}`} className="device-remote-cell device-remote-cell-op">
                    <div className="device-remote-row-actions">
                      <button
                        type="button"
                        className="device-remote-row-btn"
                        aria-label="Restart"
                        title="Restart"
                        onClick={() => handleRestartDevice(row)}
                        disabled={isVisionActionBusy}
                      >
                        <span aria-hidden="true">⟳</span>
                        <span className="device-remote-row-label">Restart</span>
                      </button>
                      <button
                        type="button"
                        className="device-remote-row-btn"
                        aria-label="Remote Access"
                        title="Remote Access"
                        onClick={() => openRemoteAccessForRow(row)}
                      >
                        <span aria-hidden="true">🔗</span>
                        <span className="device-remote-row-label">Remote Access</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>

      {showColumnChooser && (
        <div className="device-remote-modal" role="dialog" aria-modal="true">
          <div className="device-remote-modal-card">
            <div className="device-remote-modal-header">
              <div>Columns Setting</div>
              <button
                type="button"
                className="device-remote-modal-close"
                aria-label="Close"
                onClick={() => setShowColumnChooser(false)}
              >
                ×
              </button>
            </div>
            <div className="device-remote-modal-search">
              <input
                type="search"
                placeholder="please enter the field then to search"
                value={columnQuery}
                onChange={(event) => setColumnQuery(event.target.value)}
              />
            </div>
            <div className="device-remote-modal-tip">
              Tip: Freeze up to 3 fields
              <button
                type="button"
                className="device-remote-modal-reset"
                onClick={() => setSelectedColumns(new Set(defaultColumnKeys))}
              >
                Reset
              </button>
            </div>
            <div className="device-remote-modal-list">
              <label className="device-remote-modal-item">
                <input
                  type="checkbox"
                  checked={selectedColumns.size >= columns.filter((col) => !col.locked).length}
                  onChange={(event) => toggleAllColumns(event.target.checked)}
                />
                Select All
              </label>
              {filteredColumns.map((column) => (
                <label key={column.key} className="device-remote-modal-item">
                  <input
                    type="checkbox"
                    checked={column.locked || selectedColumns.has(column.key)}
                    disabled={column.locked}
                    onChange={() => toggleColumn(column.key, column.locked)}
                  />
                  {column.label}
                </label>
              ))}
            </div>
            <div className="device-remote-modal-actions">
              <button type="button" className="device-remote-modal-btn" onClick={() => setShowColumnChooser(false)}>
                Cancel
              </button>
              <button type="button" className="device-remote-modal-btn primary" onClick={() => setShowColumnChooser(false)}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showRemoteAccess && (
        <div className="device-remote-modal" role="dialog" aria-modal="true">
          <div className="remote-access-card" onClick={handleRemoteActionButton}>
            <div className="remote-access-header">
              <div>
                <div className="remote-access-title">[ {displayPlate} ]</div>
                <div className="remote-access-subtitle">
                  {isVisionActionBusy ? "Sending command to Vision..." : visionActionMessage || "Vision remote access ready"}
                </div>
              </div>
              <button
                type="button"
                className="device-remote-modal-close"
                aria-label="Close"
                onClick={() => setShowRemoteAccess(false)}
              >
                ×
              </button>
            </div>
            <div className="remote-access-body">
              {(["General", "Preview", "Playback"] as const).includes(activeRemoteTab as "General" | "Preview" | "Playback") ? (
                <div className="remote-access-general">
                  <aside className="remote-access-general-sidebar">
                    {sidebarMenuItems.map((item) => (
                      <div key={item.label} className="remote-access-menu-group">
                        <button
                          type="button"
                          className={`remote-access-menu ${activeGeneralMenu === item.label ? "active" : ""}`}
                          onClick={() => {
                            setActiveGeneralMenu(item.label);
                            if (item.label === "General" || item.label === "Preview" || item.label === "Playback") {
                              setActiveRemoteTab(item.label);
                            }
                            setOpenSidebarItem((current) => (current === item.label ? null : item.label));
                            void runVisionAction("vision.remoteAccess.category.select", { category: item.label });
                          }}
                        >
                          {item.label}
                        </button>
                        {item.sub && openSidebarItem === item.label && (
                          <div className="remote-access-sub">
                            {item.sub.map((sub) => (
                              <button
                                key={sub}
                                type="button"
                                className={`remote-access-subitem ${
                                  item.label === "Surveillance" && activeSurveillanceSub === sub
                                    ? "active"
                                    : item.label === "Basic Setup" && activeBasicSub === sub
                                      ? "active"
                                      : item.label === "Collection" && activeCollectionSub === sub
                                        ? "active"
                                    : item.label === "Alarm" && activeAlarmSub === sub
                                      ? "active"
                                      : item.label === "Others" && activeRemoteTab === sub
                                        ? "active"
                                      : ""
                                }`}
                                onClick={() => {
                                  if (item.label === "Surveillance") {
                                    setActiveSurveillanceSub(sub);
                                  } else if (item.label === "Basic Setup") {
                                    setActiveBasicSub(sub);
                                  } else if (item.label === "Collection") {
                                    setActiveCollectionSub(sub);
                                  } else if (item.label === "Alarm") {
                                    setActiveAlarmSub(sub);
                                  } else if (item.label === "Others") {
                                    setActiveRemoteTab(sub);
                                  }
                                  void runVisionAction("vision.remoteAccess.subCategory.select", {
                                    category: item.label,
                                    subCategory: sub
                                  });
                                }}
                              >
                                {sub}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </aside>
                  <section className="remote-access-general-panel">
                    {activeRemoteTab === "Preview" ? (
                      <div className="remote-access-preview">
                        <div className="remote-access-preview-header">
                          <span>[ {displayPlate} ]</span>
                          <button type="button" className="remote-access-preview-close">×</button>
                        </div>
                        <div className="remote-access-preview-content">
                          <div className="remote-access-preview-panel">
                            <div className="remote-access-preview-feed">Camera preview</div>
                            <div className="remote-access-preview-toolbar">
                              <button type="button" className="remote-access-preview-action primary">Live</button>
                              <button type="button" className="remote-access-preview-action">Stop</button>
                              <button type="button" className="remote-access-preview-action">Snapshot</button>
                              <button type="button" className="remote-access-preview-action">Record</button>
                              <button type="button" className="remote-access-preview-action">Audio</button>
                              <button type="button" className="remote-access-preview-action">Fullscreen</button>
                            </div>
                            <div className="remote-access-preview-list">
                              {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="remote-access-preview-item">
                                  <span className="remote-access-preview-channel">Channel {index + 1}</span>
                                  <button type="button" className="remote-access-preview-link">Live preview</button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="remote-access-preview-date">
                            <div className="remote-access-preview-date-header">
                              <span>Preview Settings</span>
                              <button
                                type="button"
                                className="remote-access-action"
                                onClick={() => setShowPreviewCalendar((current) => !current)}
                              >
                                {showPreviewCalendar ? "Hide Date" : "Select Date"}
                              </button>
                            </div>
                            <div className="remote-access-preview-settings">
                              <div className="remote-access-basic-field">
                                <span>Channel</span>
                                <select className="remote-access-basic-input">
                                  <option>Channel 1</option>
                                  <option>Channel 2</option>
                                  <option>Channel 3</option>
                                  <option>Channel 4</option>
                                </select>
                              </div>
                              <div className="remote-access-basic-field">
                                <span>Stream</span>
                                <select className="remote-access-basic-input">
                                  <option>Main Stream</option>
                                  <option>Sub Stream</option>
                                </select>
                              </div>
                              <div className="remote-access-basic-field">
                                <span>Quality</span>
                                <select className="remote-access-basic-input">
                                  <option>Auto</option>
                                  <option>High</option>
                                  <option>Medium</option>
                                  <option>Low</option>
                                </select>
                              </div>
                              <div className="remote-access-basic-field">
                                <span>Audio</span>
                                <select className="remote-access-basic-input">
                                  <option>Enabled</option>
                                  <option>Muted</option>
                                </select>
                              </div>
                            </div>
                            {showPreviewCalendar && (
                              <div className="remote-access-preview-calendar">
                                <div className="remote-access-preview-calendar-title">Select Date</div>
                                <div className="remote-access-preview-week">
                                  {"S M T W T F S".split(" ").map((day) => (
                                    <span key={day}>{day}</span>
                                  ))}
                                </div>
                                <div className="remote-access-preview-grid">
                                  {[
                                    "26",
                                    "27",
                                    "28",
                                    "29",
                                    "30",
                                    "31",
                                    "1",
                                    "2",
                                    "3",
                                    "4",
                                    "5",
                                    "6",
                                    "7",
                                    "8",
                                    "9",
                                    "10",
                                    "11",
                                    "12",
                                    "13",
                                    "14",
                                    "15",
                                    "16",
                                    "17",
                                    "18",
                                    "19",
                                    "20",
                                    "21",
                                    "22",
                                    "23",
                                    "24",
                                    "25",
                                    "26",
                                    "27",
                                    "28",
                                    "29",
                                    "30"
                                  ].map((day, index) => (
                                    <div key={`${day}-${index}`} className="remote-access-preview-day">
                                      {day}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : activeRemoteTab === "Playback" ? (
                      <div className="remote-access-playback">
                        <div className="remote-access-playback-header">Select Date:</div>
                        <div className="remote-access-playback-toolbar">
                          <div className="remote-access-playback-field">
                            <span>Channel</span>
                            <select className="remote-access-basic-input">
                              <option>Channel 1</option>
                              <option>Channel 2</option>
                              <option>Channel 3</option>
                              <option>Channel 4</option>
                            </select>
                          </div>
                          <div className="remote-access-playback-field">
                            <span>Stream</span>
                            <select className="remote-access-basic-input">
                              <option>Main Stream</option>
                              <option>Sub Stream</option>
                            </select>
                          </div>
                          <div className="remote-access-playback-field">
                            <span>Storage</span>
                            <select className="remote-access-basic-input">
                              <option>Main Storage</option>
                              <option>Secondary Storage</option>
                            </select>
                          </div>
                          <div className="remote-access-playback-field">
                            <span>Speed</span>
                            <select className="remote-access-basic-input">
                              <option>1x</option>
                              <option>2x</option>
                              <option>4x</option>
                              <option>8x</option>
                            </select>
                          </div>
                          <button type="button" className="remote-access-playback-action primary">Search</button>
                        </div>
                        <div className="remote-access-playback-body">
                          <div className="remote-access-playback-left-pane">
                            <div className="remote-access-playback-calendar">
                              <div className="remote-access-playback-month">
                                <button
                                  type="button"
                                  className="remote-access-playback-nav"
                                  onClick={() =>
                                    setPlaybackMonthIndex((current) => {
                                      if (current === 0) {
                                        setPlaybackYear((year) => year - 1);
                                        return 11;
                                      }
                                      return current - 1;
                                    })
                                  }
                                  aria-label="Previous month"
                                >
                                  ◀
                                </button>
                                <div className="remote-access-playback-month-label">
                                  {playbackMonths[playbackMonthIndex]} {playbackYear}
                                </div>
                                <button
                                  type="button"
                                  className="remote-access-playback-nav"
                                  onClick={() =>
                                    setPlaybackMonthIndex((current) => {
                                      if (current === 11) {
                                        setPlaybackYear((year) => year + 1);
                                        return 0;
                                      }
                                      return current + 1;
                                    })
                                  }
                                  aria-label="Next month"
                                >
                                  ▶
                                </button>
                              </div>
                              <div className="remote-access-playback-week">
                                {"S M T W T F S".split(" ").map((day) => (
                                  <span key={day}>{day}</span>
                                ))}
                              </div>
                              <div className="remote-access-playback-grid">
                                {[
                                  "26",
                                  "27",
                                  "28",
                                  "29",
                                  "30",
                                  "31",
                                  "1",
                                  "2",
                                  "3",
                                  "4",
                                  "5",
                                  "6",
                                  "7",
                                  "8",
                                  "9",
                                  "10",
                                  "11",
                                  "12",
                                  "13",
                                  "14",
                                  "15",
                                  "16",
                                  "17",
                                  "18",
                                  "19",
                                  "20",
                                  "21",
                                  "22",
                                  "23",
                                  "24",
                                  "25",
                                  "26",
                                  "27",
                                  "28",
                                  "29",
                                  "30"
                                ].map((day, index) => (
                                  <div
                                    key={`${day}-${index}`}
                                    className={`remote-access-playback-day ${
                                      [15, 20].includes(Number(day))
                                        ? "alarm"
                                        : [17, 18, 21, 22].includes(Number(day))
                                          ? "normal"
                                          : ""
                                    } ${selectedPlaybackDay === day ? "active" : ""}`}
                                    onClick={() => setSelectedPlaybackDay(day)}
                                  >
                                    {day}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="remote-access-playback-side">
                              <div className="remote-access-playback-select">
                                <select className="remote-access-basic-input">
                                  <option>Main Storage</option>
                                  <option>Secondary Storage</option>
                                </select>
                              </div>
                              <div className="remote-access-playback-select">
                                <select className="remote-access-basic-input">
                                  <option>Main Stream</option>
                                  <option>Sub Stream</option>
                                </select>
                              </div>
                              <div className="remote-access-playback-time">
                                <div className="remote-access-basic-field">
                                  <span>Start</span>
                                  <input type="time" className="remote-access-basic-input" defaultValue="08:00" />
                                </div>
                                <div className="remote-access-basic-field">
                                  <span>End</span>
                                  <input type="time" className="remote-access-basic-input" defaultValue="18:00" />
                                </div>
                              </div>
                              <div className="remote-access-playback-legend">
                                <div className="remote-access-playback-legend-item">
                                  <span className="remote-access-playback-dot locked" />
                                  Locked Video
                                </div>
                                <div className="remote-access-playback-legend-item">
                                  <span className="remote-access-playback-dot alarm" />
                                  Alarm Video
                                </div>
                                <div className="remote-access-playback-legend-item">
                                  <span className="remote-access-playback-dot normal" />
                                  Normal Video
                                </div>
                              </div>
                              <div className="remote-access-playback-controls">
                                <button type="button" className="remote-access-playback-action">⏮</button>
                                <button type="button" className="remote-access-playback-action">▶</button>
                                <button type="button" className="remote-access-playback-action">⏸</button>
                                <button type="button" className="remote-access-playback-action">⏹</button>
                                <button type="button" className="remote-access-playback-action">⏭</button>
                              </div>
                              <button type="button" className="remote-access-playback-side-nav">›</button>
                            </div>
                          </div>
                          <div className="remote-access-playback-screen">
                            <div className="remote-access-playback-screen-header">
                              <span>Playback Screen</span>
                              <button type="button" className="remote-access-playback-action">Fullscreen</button>
                            </div>
                            <div className="remote-access-playback-screen-body">Video output</div>
                          </div>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Basic Setup" && activeBasicSub === "Asset Details" ? (
                      <div className="remote-access-regist">
                        <div className="remote-access-regist-section">
                          <div className="remote-access-regist-title">Device Info</div>
                          <label className="remote-access-regist-row">
                            <span>Serial Number</span>
                            <span className="remote-access-regist-value">{activeDevice?.deviceId ?? "-"}</span>
                          </label>
                          <label className="remote-access-regist-row">
                            <span>Device ID</span>
                            <input type="text" defaultValue="0" className="remote-access-basic-input" />
                          </label>
                        </div>
                        <div className="remote-access-regist-section">
                          <div className="remote-access-regist-title">Vehicle Info</div>
                          <label className="remote-access-regist-row">
                            <span>Vehicle Plate</span>
                            <input
                              type="text"
                              value={vehiclePlate}
                              onChange={(event) => setVehiclePlate(event.target.value)}
                              className="remote-access-basic-input"
                            />
                          </label>
                          <label className="remote-access-regist-row">
                            <span>Vehicle Num</span>
                            <input type="text" defaultValue="" className="remote-access-basic-input" />
                          </label>
                          <label className="remote-access-regist-row">
                            <span>Vehicle VIN</span>
                            <input type="text" className="remote-access-basic-input" />
                          </label>
                        </div>
                        <div className="remote-access-regist-section">
                          <div className="remote-access-regist-title">Driver Info</div>
                          <label className="remote-access-regist-row">
                            <span>Driver Number</span>
                            <input type="text" className="remote-access-basic-input" />
                          </label>
                          <label className="remote-access-regist-row">
                            <span>Driver Name</span>
                            <input type="text" className="remote-access-basic-input" />
                          </label>
                        </div>
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Basic Setup" && activeBasicSub === "Time Setup" ? (
                      <div className="remote-access-time-setup">
                        <div className="remote-access-time-tabs">
                          {["General", "Time Sync", "DST"].map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              className={`remote-access-time-tab ${activeTimeTab === tab ? "active" : ""}`}
                              onClick={() => setActiveTimeTab(tab)}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                        {activeTimeTab === "General" ? (
                          <div className="remote-access-time-form">
                            <label className="remote-access-time-row">
                              <span>Date Format</span>
                              <select className="remote-access-basic-input">
                                <option>YEAR-MONTH-DAY</option>
                                <option>MONTH-DAY-YEAR</option>
                                <option>DAY-MONTH-YEAR</option>
                              </select>
                            </label>
                            <label className="remote-access-time-row">
                              <span>Time Format</span>
                              <select className="remote-access-basic-input">
                                <option>24 Hours</option>
                                <option>12 Hours</option>
                              </select>
                            </label>
                            <label className="remote-access-time-row">
                              <span>Cross Time Zone Enable</span>
                              <input type="checkbox" defaultChecked />
                            </label>
                            <label className="remote-access-time-row">
                              <span>Time Zone</span>
                              <select className="remote-access-basic-input" disabled>
                                <option>(GMT)DUBLIN EDINBURGH LONDON</option>
                              </select>
                            </label>
                            <label className="remote-access-time-row">
                              <span>Local TimeZone</span>
                              <select className="remote-access-basic-input">
                                <option>(GMT+02:00)HARARE PRETORIA</option>
                                <option>(GMT+03:00)NAIROBI</option>
                              </select>
                            </label>
                          </div>
                        ) : activeTimeTab === "Time Sync" ? (
                          <div className="remote-access-time-sync">
                            <div className="remote-access-time-section">
                              <div className="remote-access-time-section-title">Manually</div>
                              <label className="remote-access-time-row">
                                <span>Date/Time</span>
                                <div className="remote-access-time-inline">
                                  <input type="date" defaultValue="2025-11-22" className="remote-access-basic-input" />
                                  <input type="time" defaultValue="06:31" className="remote-access-basic-input" />
                                </div>
                              </label>
                              <div className="remote-access-time-actions">
                                <button type="button" className="remote-access-action">Change Time</button>
                              </div>
                            </div>
                            <div className="remote-access-time-section">
                              <div className="remote-access-time-section-title">Auto</div>
                              <label className="remote-access-time-row">
                                <span>Satellite</span>
                                <input type="checkbox" defaultChecked />
                              </label>
                              <label className="remote-access-time-row">
                                <span>NTP</span>
                                <input type="checkbox" />
                              </label>
                              <label className="remote-access-time-row">
                                <span>Center Server</span>
                                <input type="checkbox" />
                              </label>
                            </div>
                          </div>
                        ) : activeTimeTab === "DST" ? (
                          <div className="remote-access-time-dst">
                            <label className="remote-access-time-row">
                              <span>Enable</span>
                              <input type="checkbox" />
                            </label>
                            <label className="remote-access-time-row">
                              <span>Offset</span>
                              <select className="remote-access-basic-input remote-access-time-select">
                                <option>One Hour</option>
                                <option>Two Hours</option>
                              </select>
                            </label>
                            <label className="remote-access-time-row">
                              <span>Mode</span>
                              <select className="remote-access-basic-input remote-access-time-select">
                                <option>Week</option>
                                <option>Date</option>
                              </select>
                            </label>
                            <label className="remote-access-time-row">
                              <span>Start</span>
                              <div className="remote-access-time-inline">
                                <select className="remote-access-basic-input remote-access-time-select">
                                  <option>MAR.</option>
                                </select>
                                <select className="remote-access-basic-input remote-access-time-select">
                                  <option>2ND</option>
                                </select>
                                <select className="remote-access-basic-input remote-access-time-select">
                                  <option>Sunday</option>
                                </select>
                                <select className="remote-access-basic-input remote-access-time-select">
                                  <option>2</option>
                                </select>
                                <select className="remote-access-basic-input remote-access-time-select">
                                  <option>00</option>
                                </select>
                              </div>
                            </label>
                            <label className="remote-access-time-row">
                              <span>End</span>
                              <div className="remote-access-time-inline">
                                <select className="remote-access-basic-input remote-access-time-select">
                                  <option>NOV.</option>
                                </select>
                                <select className="remote-access-basic-input remote-access-time-select">
                                  <option>1ST</option>
                                </select>
                                <select className="remote-access-basic-input remote-access-time-select">
                                  <option>Sunday</option>
                                </select>
                                <select className="remote-access-basic-input remote-access-time-select">
                                  <option>2</option>
                                </select>
                                <select className="remote-access-basic-input remote-access-time-select">
                                  <option>00</option>
                                </select>
                              </div>
                            </label>
                          </div>
                        ) : (
                          <div className="remote-access-empty">Select a tab to configure time settings.</div>
                        )}
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Basic Setup" && activeBasicSub === "Voice Setup" ? (
                      <div className="remote-access-voice-setup">
                        <div className="remote-access-voice-form">
                          <div className="remote-access-voice-row">
                            <span>TTS Voice</span>
                            <div className="remote-access-voice-inline">
                              <input type="text" defaultValue="55" className="remote-access-basic-input" />
                              <span className="remote-access-voice-hint">(0~63)</span>
                            </div>
                          </div>
                          <div className="remote-access-voice-row">
                            <span>Walkie-talkie volume</span>
                            <div className="remote-access-voice-inline">
                              <input type="text" defaultValue="55" className="remote-access-basic-input" />
                              <span className="remote-access-voice-hint">(0~63)</span>
                            </div>
                          </div>
                          <div className="remote-access-voice-row">
                            <span>ADKIT volume</span>
                            <div className="remote-access-voice-inline">
                              <input type="text" defaultValue="55" className="remote-access-basic-input" />
                              <span className="remote-access-voice-hint">(0~63)</span>
                            </div>
                          </div>
                        </div>
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Basic Setup" && activeBasicSub === "Application" ? (
                      <div className="remote-access-application">
                        <div className="remote-access-application-tabs">
                          {["FTP Server", "Download"].map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              className={`remote-access-application-tab ${activeAppTab === tab ? "active" : ""}`}
                              onClick={() => setActiveAppTab(tab)}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                        {activeAppTab === "Download" ? (
                          <div className="remote-access-application-export">
                            {[
                              { label: "Export Alarm Log", icon: "⤓" },
                              { label: "Export User Log", icon: "⤓" },
                              { label: "Export Black Box File", icon: "⤓" },
                              { label: "Export Event Record", icon: "⤓" },
                              { label: "Export Image", icon: "⚙" },
                              { label: "Export Configuration File", icon: "⤓" },
                              { label: "Import Configuration File", icon: "⤒" }
                            ].map((item) => (
                              <button key={item.label} type="button" className="remote-access-application-export-item">
                                <span>{item.label}</span>
                                <span className="remote-access-application-export-icon">{item.icon}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="remote-access-application-form">
                            <label className="remote-access-application-row">
                              <span>FTP Enable</span>
                              <input type="checkbox" />
                            </label>
                            <label className="remote-access-application-row">
                              <span>Server</span>
                              <input
                                type="text"
                                defaultValue="192.168.1.200"
                                className="remote-access-basic-input"
                                disabled
                              />
                            </label>
                            <label className="remote-access-application-row">
                              <span>Port</span>
                              <input type="text" defaultValue="21" className="remote-access-basic-input" disabled />
                            </label>
                            <label className="remote-access-application-row">
                              <span>User Name</span>
                              <input
                                type="text"
                                defaultValue="admin"
                                className="remote-access-basic-input"
                                disabled
                              />
                            </label>
                            <label className="remote-access-application-row">
                              <span>Password</span>
                              <input type="password" defaultValue="******" className="remote-access-basic-input" />
                            </label>
                          </div>
                        )}
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Basic Setup" && activeBasicSub === "Network" ? (
                      <div className="remote-access-network">
                        <div className="remote-access-network-tabs">
                          {[
                            "Server Setup",
                            "Local",
                            "WIFI",
                            "Communication Module",
                            "Bluetooth",
                            "Ports"
                          ].map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              className={`remote-access-network-tab ${activeNetworkTab === tab ? "active" : ""}`}
                              onClick={() => setActiveNetworkTab(tab)}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                        {activeNetworkTab === "Ports" ? (
                          <div className="remote-access-network-form">
                            <label className="remote-access-network-row">
                              <span>WEB Port</span>
                              <input type="text" defaultValue="80" className="remote-access-basic-input" />
                            </label>
                            <label className="remote-access-network-row">
                              <span>RTSP Port</span>
                              <input type="text" defaultValue="554" className="remote-access-basic-input" />
                            </label>
                          </div>
                        ) : activeNetworkTab === "Bluetooth" ? (
                          <div className="remote-access-network-form">
                            <label className="remote-access-network-row">
                              <span>Bluetooth</span>
                              <input type="checkbox" />
                            </label>
                          </div>
                        ) : activeNetworkTab === "Communication Module" ? (
                          <div className="remote-access-network-form">
                            <label className="remote-access-network-row">
                              <span>Lock</span>
                              <input
                                type="checkbox"
                                checked={communicationModuleSettings.lock}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    lock: event.target.checked
                                  }))
                                }
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Server Type</span>
                              <input
                                type="text"
                                value={communicationModuleSettings.serverType}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    serverType: event.target.value
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Network Type</span>
                              <select
                                className="remote-access-basic-input"
                                value={communicationModuleSettings.networkType}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    networkType: event.target.value
                                  }))
                                }
                              >
                                <option>Mix</option>
                                <option>LTE</option>
                                <option>3G</option>
                              </select>
                            </label>
                            <div className="remote-access-network-section">Dialing Parameter</div>
                            <label className="remote-access-network-row">
                              <span>APN</span>
                              <input
                                type="text"
                                value={communicationModuleSettings.apn}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    apn: event.target.value
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>User Name</span>
                              <input
                                type="text"
                                value={communicationModuleSettings.userName}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    userName: event.target.value
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Password</span>
                              <input
                                type="password"
                                value={communicationModuleSettings.password}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    password: event.target.value
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Number</span>
                              <input
                                type="text"
                                value={communicationModuleSettings.number}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    number: event.target.value
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Certification</span>
                              <select
                                className="remote-access-basic-input"
                                value={communicationModuleSettings.certification}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    certification: event.target.value
                                  }))
                                }
                              >
                                <option>CHAP</option>
                                <option>PAP</option>
                              </select>
                            </label>
                            <label className="remote-access-network-row">
                              <span>Carrier</span>
                              <select
                                className="remote-access-basic-input"
                                value={communicationModuleSettings.carrier}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    carrier: event.target.value
                                  }))
                                }
                              >
                                <option>Auto</option>
                                <option>Manual</option>
                              </select>
                            </label>
                            <label className="remote-access-network-row">
                              <span>Protocol Type</span>
                              <select
                                className="remote-access-basic-input"
                                value={communicationModuleSettings.protocolType}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    protocolType: event.target.value
                                  }))
                                }
                              >
                                <option>IPV4</option>
                                <option>IPV6</option>
                              </select>
                            </label>
                            <label className="remote-access-network-row">
                              <span>Active Mode</span>
                              <select
                                className="remote-access-basic-input"
                                value={communicationModuleSettings.activeMode}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    activeMode: event.target.value
                                  }))
                                }
                              >
                                <option>Always</option>
                                <option>On Demand</option>
                              </select>
                            </label>
                            <label className="remote-access-network-row">
                              <span>Number1</span>
                              <input
                                type="text"
                                value={communicationModuleSettings.number1}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    number1: event.target.value
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Number2</span>
                              <input
                                type="text"
                                value={communicationModuleSettings.number2}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    number2: event.target.value
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Number3</span>
                              <input
                                type="text"
                                value={communicationModuleSettings.number3}
                                onChange={(event) =>
                                  setCommunicationModuleSettings((current) => ({
                                    ...current,
                                    number3: event.target.value
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>MTU value of SIM card</span>
                              <div className="remote-access-network-inline">
                                <input
                                  type="text"
                                  value={communicationModuleSettings.mtu}
                                  onChange={(event) =>
                                    setCommunicationModuleSettings((current) => ({
                                      ...current,
                                      mtu: event.target.value
                                    }))
                                  }
                                  className="remote-access-basic-input"
                                />
                                <span className="remote-access-network-hint">(100~1500)</span>
                              </div>
                            </label>
                          </div>
                        ) : activeNetworkTab === "WIFI" ? (
                          <div className="remote-access-network-form">
                            <label className="remote-access-network-row">
                              <span>Lock</span>
                              <input type="checkbox" />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Enable</span>
                              <select className="remote-access-basic-input">
                                <option>Client</option>
                                <option>AP</option>
                              </select>
                            </label>
                            <label className="remote-access-network-row">
                              <span>AP Duration Time</span>
                              <div className="remote-access-network-inline">
                                <input type="text" defaultValue="180" className="remote-access-basic-input" />
                                <span className="remote-access-network-hint">(0 ~ 180)Seconds</span>
                              </div>
                            </label>
                            <div className="remote-access-network-section">WIFI Setup</div>
                            <label className="remote-access-network-row">
                              <span>WIFI</span>
                              <div className="remote-access-network-inline">
                                <select className="remote-access-basic-input">
                                  <option>WIFI1</option>
                                  <option>WIFI2</option>
                                </select>
                                <button type="button" className="remote-access-network-icon">+</button>
                                <button type="button" className="remote-access-network-icon">−</button>
                              </div>
                            </label>
                            <label className="remote-access-network-row">
                              <span>ON</span>
                              <input type="checkbox" />
                            </label>
                            <label className="remote-access-network-row">
                              <span>ESSID</span>
                              <div className="remote-access-network-inline">
                                <input type="text" className="remote-access-basic-input" />
                                <button type="button" className="remote-access-action">Search</button>
                              </div>
                            </label>
                            <label className="remote-access-network-row">
                              <span>Encryption</span>
                              <select className="remote-access-basic-input">
                                <option>None</option>
                                <option>WPA2</option>
                                <option>WPA3</option>
                              </select>
                            </label>
                            <label className="remote-access-network-row">
                              <span>Password</span>
                              <input type="password" defaultValue="******" className="remote-access-basic-input" />
                            </label>
                          </div>
                        ) : activeNetworkTab === "Local" ? (
                          <div className="remote-access-network-form">
                            <div className="remote-access-network-title">Local</div>
                            <label className="remote-access-network-row">
                              <span>Enable IPV4</span>
                              <input type="checkbox" defaultChecked />
                            </label>
                            <div className="remote-access-network-row">
                              <span></span>
                              <div className="remote-access-network-inline">
                                <label className="remote-access-record-radio">
                                  <input type="radio" name="ipMode" defaultChecked />
                                  DHCP Mode
                                </label>
                                <label className="remote-access-record-radio">
                                  <input type="radio" name="ipMode" />
                                  Static IP
                                </label>
                              </div>
                            </div>
                            <label className="remote-access-network-row">
                              <span>IP Address</span>
                              <input type="text" defaultValue="192.168.1.99" className="remote-access-basic-input" />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Subnet Mask</span>
                              <input type="text" defaultValue="255.255.255.0" className="remote-access-basic-input" />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Gateway</span>
                              <input type="text" defaultValue="192.168.1.1" className="remote-access-basic-input" />
                            </label>
                          </div>
                        ) : activeNetworkTab === "Server Setup" ? (
                          <div className="remote-access-network-form">
                            <div className="remote-access-network-section">Server1</div>
                            <label className="remote-access-network-row">
                              <span>ON</span>
                              <input
                                type="checkbox"
                                checked={serverConfigs[activeServerTab].on}
                                onChange={(event) =>
                                  setServerConfigs((current) => ({
                                    ...current,
                                    [activeServerTab]: {
                                      ...current[activeServerTab],
                                      on: event.target.checked
                                    }
                                  }))
                                }
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Positioning Protocol</span>
                              <select
                                className="remote-access-basic-input"
                                value={serverConfigs[activeServerTab].protocolType}
                                onChange={(event) =>
                                  setServerConfigs((current) => {
                                    const normalized = normalizeProtocolPair(
                                      event.target.value,
                                      current[activeServerTab].videoProtocol
                                    );
                                    return {
                                      ...current,
                                      [activeServerTab]: {
                                        ...current[activeServerTab],
                                        protocolType: normalized.protocolType,
                                        videoProtocol: normalized.videoProtocol
                                      }
                                    };
                                  })
                                }
                              >
                                <option>N9M</option>
                                <option>{POSITIONING_PROTOCOL_JTT808}</option>
                              </select>
                            </label>
                            <label className="remote-access-network-row">
                              <span>Video Protocol</span>
                              <select
                                className="remote-access-basic-input"
                                value={serverConfigs[activeServerTab].videoProtocol}
                                onChange={(event) =>
                                  setServerConfigs((current) => ({
                                    ...current,
                                    [activeServerTab]: {
                                      ...current[activeServerTab],
                                      videoProtocol: event.target.value
                                    }
                                  }))
                                }
                              >
                                <option>N9M</option>
                                <option>{VIDEO_PROTOCOL_JTT1078}</option>
                              </select>
                            </label>
                            <label className="remote-access-network-row">
                              <span>TLS Enable</span>
                              <input
                                type="checkbox"
                                checked={serverConfigs[activeServerTab].tlsEnable}
                                onChange={(event) =>
                                  setServerConfigs((current) => ({
                                    ...current,
                                    [activeServerTab]: {
                                      ...current[activeServerTab],
                                      tlsEnable: event.target.checked
                                    }
                                  }))
                                }
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Enable Network</span>
                              <select
                                className="remote-access-basic-input"
                                value={serverConfigs[activeServerTab].enableNetwork}
                                onChange={(event) =>
                                  setServerConfigs((current) => ({
                                    ...current,
                                    [activeServerTab]: {
                                      ...current[activeServerTab],
                                      enableNetwork: event.target.value
                                    }
                                  }))
                                }
                              >
                                <option>Module1</option>
                                <option>Module2</option>
                              </select>
                            </label>
                            <label className="remote-access-network-row">
                              <span>Register Server IP</span>
                              <input
                                type="text"
                                value={serverConfigs[activeServerTab].registerIp}
                                onChange={(event) =>
                                  setServerConfigs((current) => ({
                                    ...current,
                                    [activeServerTab]: {
                                      ...current[activeServerTab],
                                      registerIp: event.target.value
                                    }
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Register Server port</span>
                              <div className="remote-access-network-inline">
                                <select
                                  className="remote-access-basic-input"
                                  value={serverConfigs[activeServerTab].registerPortProtocol}
                                  onChange={(event) =>
                                    setServerConfigs((current) => ({
                                      ...current,
                                      [activeServerTab]: {
                                        ...current[activeServerTab],
                                        registerPortProtocol: event.target.value
                                      }
                                    }))
                                  }
                                >
                                  <option>TCP</option>
                                  <option>UDP</option>
                                </select>
                                <input
                                  type="text"
                                  value={serverConfigs[activeServerTab].registerPort}
                                  onChange={(event) =>
                                    setServerConfigs((current) => ({
                                      ...current,
                                      [activeServerTab]: {
                                        ...current[activeServerTab],
                                        registerPort: event.target.value
                                      }
                                    }))
                                  }
                                  className="remote-access-basic-input"
                                />
                              </div>
                            </label>
                            <label className="remote-access-network-row">
                              <span>TLS</span>
                              <input
                                type="text"
                                value={serverConfigs[activeServerTab].registerTls}
                                onChange={(event) =>
                                  setServerConfigs((current) => ({
                                    ...current,
                                    [activeServerTab]: {
                                      ...current[activeServerTab],
                                      registerTls: event.target.value
                                    }
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Media Server IP</span>
                              <input
                                type="text"
                                value={serverConfigs[activeServerTab].mediaIp}
                                onChange={(event) =>
                                  setServerConfigs((current) => ({
                                    ...current,
                                    [activeServerTab]: {
                                      ...current[activeServerTab],
                                      mediaIp: event.target.value
                                    }
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                            <label className="remote-access-network-row">
                              <span>Media Server port</span>
                              <div className="remote-access-network-inline">
                                <select
                                  className="remote-access-basic-input"
                                  value={serverConfigs[activeServerTab].mediaPortProtocol}
                                  onChange={(event) =>
                                    setServerConfigs((current) => ({
                                      ...current,
                                      [activeServerTab]: {
                                        ...current[activeServerTab],
                                        mediaPortProtocol: event.target.value
                                      }
                                    }))
                                  }
                                >
                                  <option>TCP</option>
                                  <option>UDP</option>
                                </select>
                                <input
                                  type="text"
                                  value={serverConfigs[activeServerTab].mediaPort}
                                  onChange={(event) =>
                                    setServerConfigs((current) => ({
                                      ...current,
                                      [activeServerTab]: {
                                        ...current[activeServerTab],
                                        mediaPort: event.target.value
                                      }
                                    }))
                                  }
                                  className="remote-access-basic-input"
                                />
                              </div>
                            </label>
                            <label className="remote-access-network-row">
                              <span>TLS</span>
                              <input
                                type="text"
                                value={serverConfigs[activeServerTab].mediaTls}
                                onChange={(event) =>
                                  setServerConfigs((current) => ({
                                    ...current,
                                    [activeServerTab]: {
                                      ...current[activeServerTab],
                                      mediaTls: event.target.value
                                    }
                                  }))
                                }
                                className="remote-access-basic-input"
                              />
                            </label>
                          </div>
                        ) : (
                          <div className="remote-access-empty">Select a tab to configure network settings.</div>
                        )}
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Basic Setup" && activeBasicSub === "User Setup" ? (
                      <div className="remote-access-user-setup">
                        <label className="remote-access-user-row">
                          <span>Language</span>
                          <select className="remote-access-basic-input">
                            <option>English</option>
                            <option>French</option>
                          </select>
                        </label>
                        <div className="remote-access-user-row">
                          <span>User Controlment</span>
                          <button type="button" className="remote-access-action">Add</button>
                        </div>
                        <div className="remote-access-user-table">
                          <div className="remote-access-user-rowline remote-access-user-head">
                            <span>User Name</span>
                            <span>User Group</span>
                            <span>Setup</span>
                          </div>
                          {userSetupRows.map((row) => (
                            <div key={row.name} className="remote-access-user-rowline">
                              <span>{row.name}</span>
                              <span>{row.group}</span>
                              <div className="remote-access-user-actions">
                                <button type="button" className="remote-access-network-icon">≡</button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <label className="remote-access-user-row">
                          <span>Check Password</span>
                          <input type="checkbox" />
                        </label>
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Basic Setup" && activeBasicSub === "Driver Picture" ? (
                      <div className="remote-access-driver-picture">
                        <div className="remote-access-basic-card remote-access-driver-picture-card">
                          <div className="remote-access-driver-picture-form">
                            <label className="remote-access-driver-picture-row">
                              <span>Driver Name</span>
                              <input
                                type="text"
                                className="remote-access-basic-input"
                                placeholder="Enter driver name"
                                value={driverPictureName}
                                onChange={(event) => setDriverPictureName(event.target.value)}
                              />
                            </label>
                            <label className="remote-access-driver-picture-row">
                              <span>Picture</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="remote-access-basic-input"
                                onChange={handleDriverPictureChange}
                              />
                            </label>
                            <div className="remote-access-driver-picture-meta">
                              <span>Original filename: {driverPictureFile?.name ?? "-"}</span>
                              <span>Renamed to: {driverPictureFilename || "-"}</span>
                            </div>
                            <span className="remote-access-driver-picture-hint">
                              Assign a driver name before uploading; the file will be renamed to match.
                            </span>
                          </div>
                          <div className="remote-access-driver-picture-preview">
                            {driverPicturePreview ? (
                              <img src={driverPicturePreview} alt="Driver preview" />
                            ) : (
                              <span>No preview</span>
                            )}
                          </div>
                        </div>
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" disabled={!canUploadDriverPicture}>
                            Upload
                          </button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Basic Setup" && activeBasicSub === "Startup" ? (
                      <div className="remote-access-startup">
                        <div className="remote-access-startup-tabs">
                          {["ON/OFF", "Sleep", "Wake", "Power Box"].map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              className={`remote-access-startup-tab ${activeStartupTab === tab ? "active" : ""}`}
                              onClick={() => setActiveStartupTab(tab)}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                        {activeStartupTab === "Power Box" ? (
                          <div className="remote-access-startup-form">
                            <label className="remote-access-startup-row">
                              <span>Shutdown Distance</span>
                              <div className="remote-access-network-inline">
                                <input type="text" defaultValue="30" className="remote-access-basic-input" />
                                <span className="remote-access-network-hint">(10 ~ 50)m</span>
                              </div>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Wakeup Threshold</span>
                              <div className="remote-access-network-inline">
                                <input type="text" defaultValue="10" className="remote-access-basic-input" />
                                <span className="remote-access-network-hint">(5 ~ 100)mg</span>
                              </div>
                            </label>
                            <div className="remote-access-startup-metrics">
                              <span>Real-Time:</span>
                              <span>X: 0.855, Y: 2.535, Z: 2.938</span>
                              <span className="remote-access-startup-spacer" />
                              <span>Wakeup threshold:</span>
                              <span>0 mg</span>
                            </div>
                          </div>
                        ) : activeStartupTab === "Sleep" ? (
                          <div className="remote-access-startup-form">
                            <label className="remote-access-startup-row">
                              <span>Sleep Mode</span>
                              <select className="remote-access-basic-input remote-access-startup-select">
                                <option>No consumption standby</option>
                                <option>Low power standby</option>
                                <option>Normal standby</option>
                              </select>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Sleep Time</span>
                              <div className="remote-access-startup-inline">
                                <input type="text" defaultValue="100" className="remote-access-basic-input" />
                                <span className="remote-access-network-hint">(0 ~ 100)H</span>
                              </div>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Low power protect</span>
                              <input type="checkbox" />
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Battery low voltage protect</span>
                              <div className="remote-access-startup-inline">
                                <input type="text" defaultValue="9.5" className="remote-access-basic-input" />
                                <span className="remote-access-network-hint">(8 ~ 11.5)V</span>
                              </div>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Voltage Startup</span>
                              <div className="remote-access-startup-inline">
                                <input type="text" defaultValue="12.5" className="remote-access-basic-input" />
                                <span className="remote-access-network-hint">(12 ~ 14)V</span>
                              </div>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Low Volt Upload</span>
                              <input type="checkbox" />
                            </label>
                          </div>
                        ) : activeStartupTab === "ON/OFF" ? (
                          <div className="remote-access-startup-form">
                            <label className="remote-access-startup-row">
                              <span>ON/OFF Mode</span>
                              <select className="remote-access-basic-input remote-access-startup-select">
                                <option>Ignition</option>
                                <option>Timer</option>
                                <option>Always On</option>
                              </select>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Ignition Delay</span>
                              <div className="remote-access-startup-inline">
                                <input type="text" defaultValue="600" className="remote-access-basic-input" />
                                <span className="remote-access-network-hint">(10 ~ 86399)Seconds</span>
                              </div>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Video delay</span>
                              <div className="remote-access-startup-inline">
                                <input type="text" defaultValue="0" className="remote-access-basic-input" />
                                <span className="remote-access-network-hint">(0 ~ 600)Seconds</span>
                              </div>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Timer From</span>
                              <div className="remote-access-startup-inline">
                                <input type="time" defaultValue="08:00" className="remote-access-basic-input" />
                                <span className="remote-access-startup-time-label">To</span>
                                <input type="time" defaultValue="18:00" className="remote-access-basic-input" />
                              </div>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Light Off Time</span>
                              <select className="remote-access-basic-input remote-access-startup-select">
                                <option>Never</option>
                                <option>10 min</option>
                                <option>30 min</option>
                              </select>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Reboot Delay</span>
                              <input type="checkbox" />
                            </label>
                            <label className="remote-access-startup-row">
                              <span></span>
                              <div className="remote-access-startup-inline">
                                <input type="text" defaultValue="600" className="remote-access-basic-input" />
                                <span className="remote-access-network-hint">(5 ~ 600)Seconds</span>
                              </div>
                            </label>
                          </div>
                        ) : activeStartupTab === "Wake" ? (
                          <div className="remote-access-startup-form remote-access-startup-wake">
                            <label className="remote-access-startup-row">
                              <span>IO Wake</span>
                              <input type="checkbox" />
                            </label>
                            <label className="remote-access-startup-row">
                              <span>G-sensor Wake</span>
                              <input type="checkbox" />
                            </label>
                            <label className="remote-access-startup-row">
                              <span>X Threshold</span>
                              <div className="remote-access-startup-inline">
                                <input
                                  type="text"
                                  defaultValue="5.5"
                                  className="remote-access-basic-input remote-access-startup-threshold"
                                />
                                <span className="remote-access-network-hint">(0-9.9)g</span>
                              </div>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Y Threshold</span>
                              <div className="remote-access-startup-inline">
                                <input
                                  type="text"
                                  defaultValue="5.5"
                                  className="remote-access-basic-input remote-access-startup-threshold"
                                />
                                <span className="remote-access-network-hint">(0-9.9)g</span>
                              </div>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Z Threshold</span>
                              <div className="remote-access-startup-inline">
                                <input
                                  type="text"
                                  defaultValue="5.5"
                                  className="remote-access-basic-input remote-access-startup-threshold"
                                />
                                <span className="remote-access-network-hint">(0-9.9)g</span>
                              </div>
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Remote Wake</span>
                              <input type="checkbox" />
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Telephone Wake</span>
                              <input type="checkbox" />
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Sms Wake</span>
                              <input type="checkbox" />
                            </label>
                            <label className="remote-access-startup-row">
                              <span>Motion Wake</span>
                              <input type="checkbox" />
                            </label>
                            {Array.from({ length: 5 }).map((_, index) => (
                              <label key={index} className="remote-access-startup-row">
                                <span>{`Wake Telephone ${index + 1}`}</span>
                                <input type="text" className="remote-access-basic-input" />
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="remote-access-empty">Select a tab to configure startup settings.</div>
                        )}
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Surveillance" && activeSurveillanceSub === "Live View" ? (
                      <div className="remote-access-liveview-panel">
                        <div className="remote-access-liveview-form">
                          <div className="remote-access-liveview-row">
                            <span className="remote-access-liveview-label">Startup Screen</span>
                            <select className="remote-access-basic-input remote-access-liveview-select">
                              <option>Quad</option>
                              <option>Single</option>
                              <option>Nine</option>
                            </select>
                          </div>
                          <div className="remote-access-liveview-row">
                            <span className="remote-access-liveview-label">Channel</span>
                            <div className="remote-access-liveview-channels">
                              {Array.from({ length: 4 }).map((_, index) => (
                                <label key={index} className="remote-access-liveview-check">
                                  <input type="checkbox" defaultChecked />
                                  {index + 1}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="remote-access-liveview-row">
                            <span className="remote-access-liveview-label">AvOut Enable</span>
                            <label className="remote-access-liveview-check">
                              <input type="checkbox" defaultChecked />
                            </label>
                          </div>
                          <div className="remote-access-liveview-row">
                            <span className="remote-access-liveview-label">AvOut Mode</span>
                            <select className="remote-access-basic-input remote-access-liveview-select">
                              <option>CVBS</option>
                              <option>HDMI</option>
                            </select>
                          </div>
                        </div>
                        <div className="remote-access-liveview-actions">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Surveillance" && activeSurveillanceSub === "Record" ? (
                      <div className="remote-access-record-panel">
                        <div className="remote-access-record-tabs">
                          {["General", "Main Stream", "Sub Stream", "Record OSD"].map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              className={`remote-access-record-tab ${activeRecordTab === tab ? "active" : ""}`}
                              onClick={() => setActiveRecordTab(tab)}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                        {activeRecordTab === "Main Stream" ? (
                          <div className="remote-access-record-table">
                            <div className="remote-access-stream-row remote-access-record-head">
                              <span>Channel</span>
                              <span>Enable</span>
                              <span>AI alert</span>
                              <span>Resolution</span>
                              <span>Frame Rate</span>
                              <span>Quality</span>
                              <span>Encode Standard</span>
                              <span>Channel</span>
                              <span>Record Mode</span>
                              <span>Audio</span>
                              <span>Alarm Quality</span>
                              <span>Encode Mode</span>
                              <span>Audio Coding Format</span>
                            </div>
                            {mainStreamRows.map((row) => (
                              <div key={row.channel} className="remote-access-stream-row">
                                <span>{row.channel}</span>
                                <label className="remote-access-record-check">
                                  <input type="checkbox" defaultChecked={row.enabled} />
                                </label>
                                <label className="remote-access-record-check">
                                  <input type="checkbox" defaultChecked={row.aiAlert} />
                                </label>
                                <button type="button" className="remote-access-select">{row.resolution} ▾</button>
                                <button type="button" className="remote-access-select">{row.frameRate} ▾</button>
                                <button type="button" className="remote-access-select">{row.quality} ▾</button>
                                <button type="button" className="remote-access-select">{row.encode} ▾</button>
                                <select className="remote-access-select" defaultValue={row.channelName}>
                                  {"CH1,CH2,CH3,CH4".split(",").map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                                <button type="button" className="remote-access-select">{row.recordMode} ▾</button>
                                <select className="remote-access-select" defaultValue={row.audio}>
                                  <option>No Audio</option>
                                  <option>Always Audio</option>
                                </select>
                                <button type="button" className="remote-access-select">{row.alarmQuality} ▾</button>
                                <button type="button" className="remote-access-select">{row.encodeMode} ▾</button>
                                <button type="button" className="remote-access-select">{row.audioFormat} ▾</button>
                              </div>
                            ))}
                          </div>
                        ) : activeRecordTab === "Sub Stream" ? (
                          <div className="remote-access-record-table">
                            <div className="remote-access-record-row remote-access-record-head">
                              <span>Channel</span>
                              <span>Enable</span>
                              <span>Resolution</span>
                              <span>Frame Rate</span>
                              <span>Quality</span>
                              <span>Encode Standard</span>
                              <span>Audio</span>
                            </div>
                            {subStreamRows.map((row) => (
                              <div key={row.channel} className="remote-access-record-row">
                                <select className="remote-access-select" defaultValue={`CH${row.channel}`}>
                                  {"CH1,CH2,CH3,CH4".split(",").map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                                <label className="remote-access-record-check">
                                  <input type="checkbox" defaultChecked={row.enabled} />
                                </label>
                                <button type="button" className="remote-access-select">{row.resolution} ▾</button>
                                <button type="button" className="remote-access-select">{row.frameRate} ▾</button>
                                <button type="button" className="remote-access-select">{row.quality} ▾</button>
                                <button type="button" className="remote-access-select">{row.encode} ▾</button>
                                <select className="remote-access-select" defaultValue={row.audio}>
                                  <option>No Audio</option>
                                  <option>Always Audio</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        ) : activeRecordTab === "General" ? (
                          <div className="remote-access-record-general">
                            <div className="remote-access-record-rowline">
                              <span className="remote-access-record-label">System</span>
                              <select className="remote-access-basic-input remote-access-record-select">
                                <option>PAL</option>
                                <option>NTSC</option>
                              </select>
                            </div>
                            <div className="remote-access-record-rowline">
                              <span className="remote-access-record-label">Overwrite</span>
                              <select className="remote-access-basic-input remote-access-record-select">
                                <option>By Capacity</option>
                                <option>By Time</option>
                              </select>
                            </div>
                            <div className="remote-access-record-rowline">
                              <span className="remote-access-record-label">Lock Duration</span>
                              <div className="remote-access-record-inline">
                                <input
                                  type="text"
                                  defaultValue="2"
                                  className="remote-access-basic-input remote-access-record-input"
                                />
                                <span className="remote-access-record-hint">(1 ~ 31) Day</span>
                              </div>
                            </div>
                            <div className="remote-access-record-rowline">
                              <span className="remote-access-record-label">Pre-recording</span>
                              <label className="remote-access-record-check">
                                <input type="checkbox" />
                              </label>
                            </div>
                            <div className="remote-access-record-rowline">
                              <span className="remote-access-record-label">SDRecord Mode</span>
                              <select className="remote-access-basic-input remote-access-record-select">
                                <option>Sub-Record</option>
                                <option>Main-Record</option>
                              </select>
                            </div>
                            <div className="remote-access-record-rowline">
                              <span className="remote-access-record-label">SD Write Resource Ratio</span>
                              <span className="remote-access-record-value">13.5%</span>
                            </div>
                            <div className="remote-access-record-rowline">
                              <span className="remote-access-record-label">Record Storage</span>
                              <div className="remote-access-record-inline">
                                <label className="remote-access-record-radio">
                                  <input type="radio" name="recordStorage" defaultChecked />
                                  Internal SD
                                </label>
                                <label className="remote-access-record-radio">
                                  <input type="radio" name="recordStorage" />
                                  External SD
                                </label>
                              </div>
                            </div>
                            <div className="remote-access-record-rowline">
                              <span className="remote-access-record-label">Channel</span>
                              <div className="remote-access-record-inline">
                                {Array.from({ length: 4 }).map((_, index) => (
                                  <label key={index} className="remote-access-record-check">
                                    <input type="checkbox" defaultChecked />
                                    {index + 1}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="remote-access-record-content">
                            <label className="remote-access-record-check">
                              <input type="checkbox" defaultChecked />
                              Watermark Mode
                            </label>
                            <div className="remote-access-record-grid">
                              <label className="remote-access-record-check">
                                <input type="checkbox" defaultChecked />
                                Time
                              </label>
                              <label className="remote-access-record-check">
                                <input type="checkbox" defaultChecked />
                                Speed
                              </label>
                              <label className="remote-access-record-check">
                                <input type="checkbox" defaultChecked />
                                Vehicle Plate
                              </label>
                              <label className="remote-access-record-check">
                                <input type="checkbox" defaultChecked />
                                GPS
                              </label>
                              <label className="remote-access-record-check">
                                <input type="checkbox" defaultChecked />
                                Channel Name
                              </label>
                              <label className="remote-access-record-check">
                                <input type="checkbox" defaultChecked />
                                Vehicle Num
                              </label>
                              <label className="remote-access-record-check">
                                <input type="checkbox" defaultChecked />
                                Time Zone
                              </label>
                              <label className="remote-access-record-check">
                                <input type="checkbox" />
                                Alarm
                              </label>
                            </div>
                            <div className="remote-access-record-position">
                              <span>Position</span>
                              <button type="button" className="remote-access-action">Setup</button>
                            </div>
                          </div>
                        )}
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Surveillance" && activeSurveillanceSub === "Camera Setup" ? (
                      <div className="remote-access-camera">
                        <div className="remote-access-camera-preview">
                          <div className="remote-access-camera-badge">{activeCameraType}</div>
                          <div className="remote-access-camera-feed">Camera preview</div>
                          <button type="button" className="remote-access-camera-nav" aria-label="Next">
                            ›
                          </button>
                          <button type="button" className="remote-access-camera-nav left" aria-label="Previous">
                            ‹
                          </button>
                        </div>
                        <div className="remote-access-camera-side">
                          <label className="remote-access-camera-row">
                            <span>Install Angle</span>
                            <select className="remote-access-basic-input">
                              <option>0°</option>
                              <option>90°</option>
                              <option>180°</option>
                              <option>270°</option>
                            </select>
                          </label>
                          <div className="remote-access-camera-row">
                            <span>Mirror</span>
                            <div className="remote-access-camera-toggle">
                              <button
                                type="button"
                                className={`remote-access-camera-toggle-btn ${isMirrorOn ? "active" : ""}`}
                                onClick={() => setIsMirrorOn(true)}
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                className={`remote-access-camera-toggle-btn ${!isMirrorOn ? "active" : ""}`}
                                onClick={() => setIsMirrorOn(false)}
                              >
                                No
                              </button>
                            </div>
                          </div>
                          <div className="remote-access-camera-row">
                            <span>Flip</span>
                            <div className="remote-access-camera-toggle">
                              <button
                                type="button"
                                className={`remote-access-camera-toggle-btn ${isFlipOn ? "active" : ""}`}
                                onClick={() => setIsFlipOn(true)}
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                className={`remote-access-camera-toggle-btn ${!isFlipOn ? "active" : ""}`}
                                onClick={() => setIsFlipOn(false)}
                              >
                                No
                              </button>
                            </div>
                          </div>
                          <button type="button" className="remote-access-action">Back</button>
                        </div>
                        <div className="remote-access-camera-channels">
                          {["ADAS", "Incab View Camera", "DMS", "Other"].map((label) => (
                            <button
                              key={label}
                              type="button"
                              className={`remote-access-camera-channel ${
                                activeCameraType === label ? "active" : ""
                              }`}
                              onClick={() => setActiveCameraType(label)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Surveillance" && activeSurveillanceSub === "IPC Setup" ? (
                      <div className="remote-access-ipc">
                        <div className="remote-access-ipc-table">
                          <div className="remote-access-ipc-row remote-access-ipc-head">
                            <span>Device Channel</span>
                            <span>Enable</span>
                            <span>IP &amp; Port</span>
                            <span>Outside</span>
                            <span>Setup</span>
                          </div>
                          {ipcRows.map((row) => (
                            <div key={row.channel} className="remote-access-ipc-row">
                              <span>{row.channel}</span>
                              <label className="remote-access-record-check">
                                <input type="checkbox" defaultChecked={row.enabled} />
                              </label>
                              <span className="remote-access-ipc-ip">{row.ipPort || "-"}</span>
                              <label className="remote-access-record-check">
                                <input type="checkbox" defaultChecked={row.outside} />
                              </label>
                              <div className="remote-access-ipc-actions">
                                <button
                                  type="button"
                                  className={`remote-access-ipc-icon ${
                                    activeIpcRow === row.channel ? "active" : ""
                                  }`}
                                  onClick={() => setActiveIpcRow(row.channel)}
                                  aria-pressed={activeIpcRow === row.channel}
                                >
                                  🔍
                                </button>
                                <button type="button" className="remote-access-ipc-icon">≡</button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="remote-access-ipc-footer">
                          <span>Local Address</span>
                          <div className="remote-access-ipc-local">
                            <span>10.100.100.</span>
                            <input type="text" defaultValue="1" className="remote-access-basic-input" />
                          </div>
                        </div>
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Collection" && activeCollectionSub === "Collection" ? (
                      <div className="remote-access-collection">
                        <div className="remote-access-basic-card remote-access-collection-card">
                          <div className="remote-access-collection-title">Collection</div>
                          <p className="remote-access-collection-note">
                            Driver uploaded pictures can be accessed from here.
                          </p>
                        </div>
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Alarm" && activeAlarmSub === "AI App" ? (
                      <div className="remote-access-ai">
                        <div className="remote-access-ai-tabs">
                          {
                            [
                              "ADAS",
                              "DMS/DSC",
                              "BSD",
                              "Calibration Parameter",
                              "Alarm Notifications",
                              "Algorithm Calibration"
                            ].map((tab) => (
                              <button
                                key={tab}
                                type="button"
                                className={`remote-access-ai-tab ${activeAiTab === tab ? "active" : ""}`}
                                onClick={() => setActiveAiTab(tab)}
                              >
                                {tab}
                              </button>
                            ))
                          }
                        </div>
                        {activeAiTab === "Algorithm Calibration" ? (
                          <div className="remote-access-ai-table">
                            <div className="remote-access-ai-row remote-access-ai-head">
                              <span>Channel</span>
                              <span>Use</span>
                              <span>Mode Type</span>
                              <span>Calibration</span>
                            </div>
                            {aiAppRows.map((row) => (
                              <div key={row.channel} className="remote-access-ai-row">
                                <span>{row.channel}</span>
                                <button type="button" className="remote-access-select">{row.use} ▾</button>
                                <button type="button" className="remote-access-select">{row.mode} ▾</button>
                                <button type="button" className="remote-access-action">Calibration</button>
                              </div>
                            ))}
                          </div>
                        ) : activeAiTab === "Alarm Notifications" ? (
                          <div className="remote-access-ai-notify">
                            <label className="remote-access-ai-notify-row">
                              <span>AI Alarm Voice Enable</span>
                              <input type="checkbox" defaultChecked />
                            </label>
                            <div className="remote-access-ai-notify-row">
                              <span>R-watch Brightness</span>
                              <div className="remote-access-ai-notify-inline">
                                <select className="remote-access-basic-input">
                                  <option>Manual Mode</option>
                                  <option>Auto</option>
                                </select>
                                <input type="text" defaultValue="8" className="remote-access-basic-input" />
                                <span className="remote-access-ai-notify-hint">(0 ~ 8)</span>
                              </div>
                            </div>
                            <label className="remote-access-ai-notify-row">
                              <span>R-watch Voice Enable</span>
                              <input type="checkbox" defaultChecked />
                            </label>
                            <div className="remote-access-ai-notify-row">
                              <span>B1/B2 Mode Set</span>
                              <div className="remote-access-ai-notify-inline">
                                <select className="remote-access-basic-input">
                                  <option>Sound&Light</option>
                                  <option>Sound</option>
                                  <option>Light</option>
                                </select>
                                <input type="text" defaultValue="8" className="remote-access-basic-input" />
                                <span className="remote-access-ai-notify-hint">(0 ~ 8)</span>
                              </div>
                            </div>
                            <div className="remote-access-ai-notify-row">
                              <span>B3 Mode Set</span>
                              <select className="remote-access-basic-input">
                                <option>Close</option>
                                <option>Sound</option>
                                <option>Light</option>
                              </select>
                            </div>
                            <div className="remote-access-ai-notify-table">
                              <div className="remote-access-ai-notify-head">
                                <span>Name</span>
                                <span>R-Watch Voice</span>
                                <span>MP3 Voice</span>
                                <span>B1/B2 Sound</span>
                                <span>B1/B2 Light</span>
                                <span>B3 Sound</span>
                                <span>B3 Light</span>
                              </div>
                              {alarmNotifyRows.map((row) => (
                                <div key={row.name} className="remote-access-ai-notify-rowline">
                                  <span>{row.name}</span>
                                  <label className="remote-access-record-check">
                                    <input type="checkbox" defaultChecked={row.rWatch} />
                                  </label>
                                  <label className="remote-access-record-check">
                                    <input type="checkbox" defaultChecked={row.mp3} />
                                  </label>
                                  <label className="remote-access-record-check">
                                    <input type="checkbox" defaultChecked={row.b12Sound} />
                                  </label>
                                  <label className="remote-access-record-check">
                                    <input type="checkbox" defaultChecked={row.b12Light} />
                                  </label>
                                  <label className="remote-access-record-check">
                                    <input type="checkbox" defaultChecked={row.b3Sound} />
                                  </label>
                                  <label className="remote-access-record-check">
                                    <input type="checkbox" defaultChecked={row.b3Light} />
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : activeAiTab === "BSD" ? (
                          <div className="remote-access-ai-table">
                            <div className="remote-access-bsd-row remote-access-ai-head">
                              <span>Name</span>
                              <span>Enable</span>
                              <span>Alarm Type</span>
                              <span>Trigger</span>
                              <span>Linkage</span>
                              <span>Alarm Capture</span>
                            </div>
                            {bsdRows.map((row) => (
                              <div key={row.name} className="remote-access-bsd-row">
                                <span>{row.name}</span>
                                <label className="remote-access-record-check">
                                  <input type="checkbox" defaultChecked={row.enabled} />
                                </label>
                                <button type="button" className="remote-access-select">{row.alarmType} ▾</button>
                                <button type="button" className="remote-access-action">Setup</button>
                                <button type="button" className="remote-access-action">Setup</button>
                                <button type="button" className="remote-access-action">Setup</button>
                              </div>
                            ))}
                          </div>
                        ) : activeAiTab === "Calibration Parameter" ? (
                          <div className="remote-access-ai-calibration">
                            <div className="remote-access-ai-calibration-form">
                              <label>
                                <span>ADAS Camera Install Height(1)</span>
                                <div className="remote-access-ai-calibration-input">
                                  <input type="text" defaultValue="118" className="remote-access-basic-input" />
                                  <span className="remote-access-ai-calibration-hint">(50 ~ 400)</span>
                                </div>
                              </label>
                              <label>
                                <span>Left margin(inward facing) (2)</span>
                                <div className="remote-access-ai-calibration-input">
                                  <input type="text" defaultValue="100" className="remote-access-basic-input" />
                                  <span className="remote-access-ai-calibration-hint">(40 ~ 170)</span>
                                </div>
                              </label>
                              <label>
                                <span>Front-end Width(3)</span>
                                <div className="remote-access-ai-calibration-input">
                                  <input type="text" defaultValue="180" className="remote-access-basic-input" />
                                  <span className="remote-access-ai-calibration-hint">(140 ~ 350)</span>
                                </div>
                              </label>
                              <label>
                                <span>Front-end Length(4)</span>
                                <div className="remote-access-ai-calibration-input">
                                  <input type="text" defaultValue="175" className="remote-access-basic-input" />
                                  <span className="remote-access-ai-calibration-hint">(0 ~ 250)</span>
                                </div>
                              </label>
                              <label>
                                <span>Steering Wheel Position</span>
                                <div className="remote-access-ai-calibration-radio">
                                  <label>
                                    <input type="radio" name="steering" defaultChecked />
                                    Left Rudder
                                  </label>
                                  <label>
                                    <input type="radio" name="steering" />
                                    Right Rudder
                                  </label>
                                </div>
                              </label>
                              <label>
                                <span>B1/B2 Broadcast mode</span>
                                <select className="remote-access-basic-input remote-access-ai-calibration-select">
                                  <option>Mode1</option>
                                  <option>Mode2</option>
                                </select>
                              </label>
                              <label className="remote-access-ai-calibration-check">
                                <span>DMS AutoCalibration</span>
                                <input type="checkbox" defaultChecked />
                              </label>
                              <label className="remote-access-ai-calibration-check">
                                <span>BSD Curb Identification</span>
                                <input type="checkbox" defaultChecked />
                              </label>
                              <label className="remote-access-ai-calibration-check">
                                <span>BSD Pedestrian Path Prediction</span>
                                <input type="checkbox" defaultChecked />
                              </label>
                              <label>
                                <span>regional settings</span>
                                <select className="remote-access-basic-input remote-access-ai-calibration-select">
                                  <option>North America</option>
                                  <option>Europe</option>
                                  <option>Asia</option>
                                </select>
                              </label>
                            </div>
                            <div className="remote-access-ai-calibration-preview">
                              <div className="remote-access-ai-calibration-unit">
                                <select className="remote-access-basic-input">
                                  <option>CM</option>
                                  <option>IN</option>
                                </select>
                              </div>
                              <div className="remote-access-ai-calibration-diagram">Diagram</div>
                            </div>
                          </div>
                        ) : activeAiTab === "DMS/DSC" ? (
                          <div className="remote-access-ai-table">
                            <div className="remote-access-dms-row remote-access-ai-head">
                              <span>Name</span>
                              <span>Enable</span>
                              <span>Source</span>
                              <span>Alarm Type</span>
                              <span>Trigger</span>
                              <span>Linkage</span>
                              <span>Alarm Capture</span>
                            </div>
                            {dmsRows.map((row) => (
                              <div key={row.name} className="remote-access-dms-row">
                                {(() => {
                                  const sourceType = sourceSelections[row.name] ?? row.source ?? "DMS";
                                  const allowMultiple = sourceType === "Combined";
                                  return (
                                    <>
                                      <span>{row.name}</span>
                                      <label className="remote-access-record-check">
                                        <input type="checkbox" defaultChecked={row.enabled} />
                                      </label>
                                      <div className="remote-access-linkage">
                                        <button
                                          type="button"
                                          className="remote-access-select"
                                          onClick={() => setOpenSourceRow(openSourceRow === row.name ? null : row.name)}
                                        >
                                          {sourceType} ▾
                                        </button>
                                        {openSourceRow === row.name && (
                                          <div className="remote-access-dropdown" role="menu">
                                            {sourceOptions.map((option) => (
                                              <button
                                                key={option}
                                                type="button"
                                                className="remote-access-dropdown-option"
                                                onClick={() => setSourceType(row.name, option)}
                                              >
                                                {option}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="remote-access-linkage">
                                        <button
                                          type="button"
                                          className="remote-access-select"
                                          onClick={() => setOpenAlarmTypeRow(openAlarmTypeRow === row.name ? null : row.name)}
                                        >
                                          {alarmTypeSelections[row.name] ?? row.alarmType ?? "Alarm"} ▾
                                        </button>
                                        {openAlarmTypeRow === row.name && (
                                          <div className="remote-access-dropdown" role="menu">
                                            {alarmTypeOptions.map((option) => (
                                              <button
                                                key={option}
                                                type="button"
                                                className="remote-access-dropdown-option"
                                                onClick={() => setAlarmType(row.name, option)}
                                              >
                                                {option}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="remote-access-linkage">
                                        <button type="button" className="remote-access-action" onClick={() => setOpenTriggerRow(openTriggerRow === row.name ? null : row.name)}>
                                          Setup
                                        </button>
                                        {openTriggerRow === row.name && (
                                          <div className="remote-access-dropdown" role="menu">
                                            <div className="remote-access-dropdown-item remote-access-trigger-row">
                                              <span>Speed range</span>
                                              <div className="remote-access-trigger-inputs">
                                                <input
                                                  type="number"
                                                  className="remote-access-basic-input remote-access-trigger-box"
                                                  placeholder="Min"
                                                  value={triggerConfigs[row.name]?.minSpeed ?? ""}
                                                  onChange={(event) => updateTriggerConfig(row.name, "minSpeed", event.target.value)}
                                                />
                                                <span>to</span>
                                                <input
                                                  type="number"
                                                  className="remote-access-basic-input remote-access-trigger-box"
                                                  placeholder="Max"
                                                  value={triggerConfigs[row.name]?.maxSpeed ?? ""}
                                                  onChange={(event) => updateTriggerConfig(row.name, "maxSpeed", event.target.value)}
                                                />
                                              </div>
                                            </div>
                                            <div className="remote-access-dropdown-item remote-access-trigger-row">
                                              <span>Delay (s)</span>
                                              <input
                                                type="number"
                                                className="remote-access-basic-input remote-access-trigger-box"
                                                placeholder="0"
                                                value={triggerConfigs[row.name]?.delay ?? ""}
                                                onChange={(event) => updateTriggerConfig(row.name, "delay", event.target.value)}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      <div className="remote-access-linkage">
                                        <button
                                          type="button"
                                          className="remote-access-select"
                                          onClick={() => setOpenLinkageRow(openLinkageRow === row.name ? null : row.name)}
                                        >
                                          {formatLinkageLabel(row.name)} ▾
                                        </button>
                                        {openLinkageRow === row.name && (
                                          <div className="remote-access-dropdown" role="menu">
                                            {linkageOptions.map((channel) => {
                                              const selected = linkageSelections[row.name]?.includes(channel) ?? false;
                                              return (
                                                <label key={channel} className="remote-access-dropdown-item">
                                                  <input
                                                    type={allowMultiple ? "checkbox" : "radio"}
                                                    name={`linkage-${row.name}`}
                                                    checked={selected}
                                                    onChange={() => toggleLinkageChannel(row.name, channel, allowMultiple)}
                                                  />
                                                  <span>Channel {channel}</span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                      <button type="button" className="remote-access-action">Setup</button>
                                    </>
                                  );
                                })()}
                              </div>
                            ))}
                          </div>
                        ) : activeAiTab === "ADAS" ? (
                          <div className="remote-access-ai-table">
                            <div className="remote-access-dms-row remote-access-ai-head">
                              <span>Name</span>
                              <span>Enable</span>
                              <span>Source</span>
                              <span>Alarm Type</span>
                              <span>Trigger</span>
                              <span>Linkage</span>
                              <span>Alarm Capture</span>
                            </div>
                            {adasRows.map((row) => (
                              <div key={row.name} className="remote-access-dms-row">
                                {(() => {
                                  const sourceType = sourceSelections[row.name] ?? row.source ?? "DMS";
                                  const allowMultiple = sourceType === "Combined";
                                  return (
                                    <>
                                      <span>{row.name}</span>
                                      <label className="remote-access-record-check">
                                        <input type="checkbox" defaultChecked={row.enabled} />
                                      </label>
                                      <div className="remote-access-linkage">
                                        <button
                                          type="button"
                                          className="remote-access-select"
                                          onClick={() => setOpenSourceRow(openSourceRow === row.name ? null : row.name)}
                                        >
                                          {sourceType} ▾
                                        </button>
                                        {openSourceRow === row.name && (
                                          <div className="remote-access-dropdown" role="menu">
                                            {sourceOptions.map((option) => (
                                              <button
                                                key={option}
                                                type="button"
                                                className="remote-access-dropdown-option"
                                                onClick={() => setSourceType(row.name, option)}
                                              >
                                                {option}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="remote-access-linkage">
                                        <button
                                          type="button"
                                          className="remote-access-select"
                                          onClick={() => setOpenAlarmTypeRow(openAlarmTypeRow === row.name ? null : row.name)}
                                        >
                                          {alarmTypeSelections[row.name] ?? row.alarmType ?? "Alarm"} ▾
                                        </button>
                                        {openAlarmTypeRow === row.name && (
                                          <div className="remote-access-dropdown" role="menu">
                                            {alarmTypeOptions.map((option) => (
                                              <button
                                                key={option}
                                                type="button"
                                                className="remote-access-dropdown-option"
                                                onClick={() => setAlarmType(row.name, option)}
                                              >
                                                {option}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="remote-access-linkage">
                                        <button type="button" className="remote-access-action" onClick={() => setOpenTriggerRow(openTriggerRow === row.name ? null : row.name)}>
                                          Setup
                                        </button>
                                        {openTriggerRow === row.name && (
                                          <div className="remote-access-dropdown" role="menu">
                                            <div className="remote-access-dropdown-item remote-access-trigger-row">
                                              <span>Speed range</span>
                                              <div className="remote-access-trigger-inputs">
                                                <input
                                                  type="number"
                                                  className="remote-access-basic-input remote-access-trigger-box"
                                                  placeholder="Min"
                                                  value={triggerConfigs[row.name]?.minSpeed ?? ""}
                                                  onChange={(event) => updateTriggerConfig(row.name, "minSpeed", event.target.value)}
                                                />
                                                <span>to</span>
                                                <input
                                                  type="number"
                                                  className="remote-access-basic-input remote-access-trigger-box"
                                                  placeholder="Max"
                                                  value={triggerConfigs[row.name]?.maxSpeed ?? ""}
                                                  onChange={(event) => updateTriggerConfig(row.name, "maxSpeed", event.target.value)}
                                                />
                                              </div>
                                            </div>
                                            <div className="remote-access-dropdown-item remote-access-trigger-row">
                                              <span>Delay (s)</span>
                                              <input
                                                type="number"
                                                className="remote-access-basic-input remote-access-trigger-box"
                                                placeholder="0"
                                                value={triggerConfigs[row.name]?.delay ?? ""}
                                                onChange={(event) => updateTriggerConfig(row.name, "delay", event.target.value)}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      <div className="remote-access-linkage">
                                        <button
                                          type="button"
                                          className="remote-access-select"
                                          onClick={() => setOpenLinkageRow(openLinkageRow === row.name ? null : row.name)}
                                        >
                                          {formatLinkageLabel(row.name)} ▾
                                        </button>
                                        {openLinkageRow === row.name && (
                                          <div className="remote-access-dropdown" role="menu">
                                            {linkageOptions.map((channel) => {
                                              const selected = linkageSelections[row.name]?.includes(channel) ?? false;
                                              return (
                                                <label key={channel} className="remote-access-dropdown-item">
                                                  <input
                                                    type={allowMultiple ? "checkbox" : "radio"}
                                                    name={`linkage-${row.name}`}
                                                    checked={selected}
                                                    onChange={() => toggleLinkageChannel(row.name, channel, allowMultiple)}
                                                  />
                                                  <span>Channel {channel}</span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                      <button type="button" className="remote-access-action">Setup</button>
                                    </>
                                  );
                                })()}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="remote-access-empty">Select a tab to configure AI settings.</div>
                        )}
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : activeGeneralMenu === "Alarm" && activeAlarmSub === "Video" ? (
                      <div className="remote-access-alarm-video">
                        <div className="remote-access-alarm-video-tabs">
                          {["Video Loss", "Cover", "Privacy Mode"].map((tab) => (
                            <button key={tab} type="button" className="remote-access-alarm-video-tab">
                              {tab}
                            </button>
                          ))}
                        </div>
                        <div className="remote-access-alarm-video-table">
                          <div className="remote-access-alarm-video-row remote-access-alarm-video-head">
                            <span>Name</span>
                            <span>Enable</span>
                            <span>Alarm Type</span>
                            <span>Trigger</span>
                            <span>Linkage</span>
                          </div>
                          {alarmVideoRows.map((row) => (
                            <div key={row.name} className="remote-access-alarm-video-row">
                              <span>{row.name}</span>
                              <label className="remote-access-record-check">
                                <input type="checkbox" defaultChecked={row.enabled} />
                              </label>
                              <button type="button" className="remote-access-select">{row.alarmType} ▾</button>
                              <button type="button" className="remote-access-action">Setup</button>
                              <button type="button" className="remote-access-action">Setup</button>
                            </div>
                          ))}
                        </div>
                        <div className="remote-access-footer">
                          <button type="button" className="remote-access-action" onClick={handleRemoteAccessCancel}>Cancel</button>
                          <button type="button" className="remote-access-action primary" onClick={handleRemoteAccessSave}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="remote-access-general-tabs">
                          {generalTabs.map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              className={`remote-access-general-tab ${activeGeneralTab === tab ? "active" : ""}`}
                              onClick={() => setActiveGeneralTab(tab)}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                        {activeGeneralTab === "General" ? (
                          <div className="remote-access-general-card">
                            <div className="remote-access-general-block">
                              <div className="remote-access-general-title">
                                <span>Device Status</span>
                                <span className="remote-access-general-status">
                                  {activeDevice?.status === "online" ? "Online" : "Offline"}
                                </span>
                              </div>
                              <div className="remote-access-general-grid">
                                <div className="remote-access-general-row">
                                  <span>Device ID</span>
                                  <span>{activeDevice?.deviceId ?? "-"}</span>
                                </div>
                                <div className="remote-access-general-row">
                                  <span>Fleet</span>
                                  <span>{activeDevice?.fleet ?? "-"}</span>
                                </div>
                                <div className="remote-access-general-row">
                                  <span>Module Type</span>
                                  <span>{activeDevice?.moduleType ?? "-"}</span>
                                </div>
                                <div className="remote-access-general-row">
                                  <span>Master Version</span>
                                  <span>{activeDevice?.masterVersion ?? "-"}</span>
                                </div>
                                <div className="remote-access-general-row">
                                  <span>Power Box Version</span>
                                  <span>{activeDevice?.powerBoxVersion ?? "-"}</span>
                                </div>
                                <div className="remote-access-general-row">
                                  <span>IPC</span>
                                  <span>{activeDevice?.ipc ?? "-"}</span>
                                </div>
                              </div>
                            </div>
                            {generalServers.map((server) => (
                              <div key={server.title} className="remote-access-general-block">
                                <div className="remote-access-general-title">
                                  <span>{server.title}</span>
                                  <span className="remote-access-general-status">{server.status}</span>
                                </div>
                                <div className="remote-access-general-grid">
                                  <div className="remote-access-general-row">
                                    <span>Connected Status</span>
                                    <span>{server.status}</span>
                                  </div>
                                  <div className="remote-access-general-row">
                                    <span>Network Type</span>
                                    <span>{server.networkType}</span>
                                  </div>
                                  <div className="remote-access-general-row">
                                    <span>Protocol Type</span>
                                    <span>{server.protocol}</span>
                                  </div>
                                  <div className="remote-access-general-row">
                                    <span>Server Address</span>
                                    <span>{server.address}</span>
                                  </div>
                                  <div className="remote-access-general-row">
                                    <span>Port</span>
                                    <span>{server.port}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : activeGeneralTab === "Basic Info" ? (
                          <div className="remote-access-basic-info">
                            <div className="remote-access-basic-info-tabs">
                              {[
                                "Server Status",
                                "Sensor Status",
                                "OBD Data",
                                "6 Axis Data",
                                "Others",
                                "Calibration Status"
                              ].map((tab) => (
                                <button
                                  key={tab}
                                  type="button"
                                  className={`remote-access-basic-info-tab ${
                                    activeBasicInfoTab === tab ? "active" : ""
                                  }`}
                                  onClick={() => setActiveBasicInfoTab(tab)}
                                >
                                  {tab}
                                </button>
                              ))}
                            </div>
                            {activeBasicInfoTab === "Calibration Status" && (
                              <div className="remote-access-basic-info-table">
                                <div className="remote-access-basic-info-row remote-access-basic-info-head">
                                  <span>Calibration Status</span>
                                  <span>ADAS</span>
                                  <span>Calibration success</span>
                                </div>
                                {["DSC", "DMS"].map((item) => (
                                  <div key={item} className="remote-access-basic-info-row">
                                    <span></span>
                                    <span>{item}</span>
                                    <span>Calibration success</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {activeBasicInfoTab === "Others" && (
                              <div className="remote-access-basic-info-others">
                                <div className="remote-access-basic-info-table">
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-section">ACC</span>
                                    <span>ACC Status</span>
                                    <span>ACC off</span>
                                  </div>
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-section">Pulse</span>
                                    <span>Pulse Count</span>
                                    <span>0</span>
                                  </div>
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-section">Device Status</span>
                                    <span>Voltage</span>
                                    <span>12.20 V</span>
                                  </div>
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-muted">&nbsp;</span>
                                    <span>Temperature</span>
                                    <span>47.00 °C</span>
                                  </div>
                                </div>
                                <button type="button" className="remote-access-basic-info-nav">›</button>
                              </div>
                            )}
                            {activeBasicInfoTab === "6 Axis Data" && (
                              <div className="remote-access-basic-info-others">
                                <div className="remote-access-basic-info-table">
                                  {[
                                    { label: "X", value: "-0.13 g" },
                                    { label: "Y", value: "0.01 g" },
                                    { label: "Z", value: "0.99 g" },
                                    { label: "AX", value: "0.06 rad/s" },
                                    { label: "AY", value: "0.06 rad/s" },
                                    { label: "AZ", value: "-0.24 rad/s" }
                                  ].map((row) => (
                                    <div key={row.label} className="remote-access-basic-info-row">
                                      <span className="remote-access-basic-info-section">6 Axis Data</span>
                                      <span>{row.label}</span>
                                      <span>{row.value}</span>
                                    </div>
                                  ))}
                                </div>
                                <button type="button" className="remote-access-basic-info-nav">›</button>
                                <div className="remote-access-basic-info-footer">
                                  <span className="remote-access-basic-info-footer-label">Calibrate</span>
                                  <div className="remote-access-basic-info-footer-bar" />
                                  <button type="button" className="remote-access-basic-info-footer-btn">
                                    Calibrate
                                  </button>
                                </div>
                              </div>
                            )}
                            {activeBasicInfoTab === "OBD Data" && (
                              <div className="remote-access-basic-info-others">
                                <div className="remote-access-basic-info-table">
                                  <div className="remote-access-basic-info-row">
                                    <span className="remote-access-basic-info-section">OBD</span>
                                    <span>Connected Status</span>
                                    <span>Unconnected</span>
                                  </div>
                                  {[
                                    "Speed",
                                    "Engine Speed",
                                    "Odometer",
                                    "Engine Hours",
                                    "Right/Left Turn",
                                    "Coolant",
                                    "Fuel",
                                    "Accelerator",
                                    "Brake",
                                    "Clutch",
                                    "Gear",
                                    "Engine Load",
                                    "Battery",
                                    "Oil Pressure",
                                    "Intake Temp",
                                    "Fuel Rate",
                                    "Trip Fuel",
                                    "Trip Distance"
                                  ].map((label) => (
                                    <div key={label} className="remote-access-basic-info-row">
                                      <span className="remote-access-basic-info-muted">&nbsp;</span>
                                      <span>{label}</span>
                                      <span>-</span>
                                    </div>
                                  ))}
                                </div>
                                <button type="button" className="remote-access-basic-info-nav">›</button>
                              </div>
                            )}
                            {activeBasicInfoTab === "Sensor Status" && (
                              <div className="remote-access-basic-info-others">
                                <div className="remote-access-basic-info-table">
                                  {[
                                    { id: "IO1", status: "Low Level", use: "Left Turn" },
                                    { id: "IO2", status: "Low Level", use: "Right Turn" },
                                    { id: "IO3", status: "Low Level", use: "None" }
                                  ].map((sensor) => (
                                    <div key={sensor.id} className="remote-access-basic-info-sensor-group">
                                      <div className="remote-access-basic-info-row">
                                        <span className="remote-access-basic-info-section">{sensor.id}</span>
                                        <span>IO Status</span>
                                        <span>{sensor.status}</span>
                                      </div>
                                      <div className="remote-access-basic-info-row">
                                        <span className="remote-access-basic-info-muted">&nbsp;</span>
                                        <span>IO Use</span>
                                        <span>{sensor.use}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <button type="button" className="remote-access-basic-info-nav">›</button>
                              </div>
                            )}
                            {activeBasicInfoTab === "Server Status" && (
                              <div className="remote-access-basic-info-others">
                                <div className="remote-access-basic-info-table">
                                  {[
                                    {
                                      title: "Central Server 1",
                                      status: "Connected",
                                      network: "Communication Module",
                                      protocol: "N9M",
                                      address: "stm.za.mixtel.com",
                                      port: "20001"
                                    },
                                    {
                                      title: "Central Server 2",
                                      status: "Connected",
                                      network: "Communication Module",
                                      protocol: "N9M",
                                      address: "stm.za.mixtel.com",
                                      port: "20001"
                                    }
                                  ].map((server) => (
                                    <div key={server.title} className="remote-access-basic-info-server">
                                      <div className="remote-access-basic-info-row">
                                        <span className="remote-access-basic-info-section">{server.title}</span>
                                        <span>Connected Status</span>
                                        <span>{server.status}</span>
                                      </div>
                                      <div className="remote-access-basic-info-row">
                                        <span className="remote-access-basic-info-muted">&nbsp;</span>
                                        <span>Network Type</span>
                                        <span>{server.network}</span>
                                      </div>
                                      <div className="remote-access-basic-info-row">
                                        <span className="remote-access-basic-info-muted">&nbsp;</span>
                                        <span>Protocol Type</span>
                                        <span>{server.protocol}</span>
                                      </div>
                                      <div className="remote-access-basic-info-row">
                                        <span className="remote-access-basic-info-muted">&nbsp;</span>
                                        <span>Server Address</span>
                                        <span>{server.address}</span>
                                      </div>
                                      <div className="remote-access-basic-info-row">
                                        <span className="remote-access-basic-info-muted">&nbsp;</span>
                                        <span>Port</span>
                                        <span>{server.port}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <button type="button" className="remote-access-basic-info-nav">›</button>
                              </div>
                            )}
                          </div>
                        ) : activeGeneralTab === "Device Module" ? (
                          <div className="remote-access-basic-info">
                            <div className="remote-access-basic-info-others">
                              <div className="remote-access-basic-info-table">
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-section">Communication Module1</span>
                                  <span>Module Status</span>
                                  <span>Existed</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>SIM Card Status</span>
                                  <span>Existed</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>Dial Status</span>
                                  <span>Dialed Up</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>Module</span>
                                  <span>EC25</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>Network Type</span>
                                  <span>LTE-FDD</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>Signal</span>
                                  <span>
                                    <span className="remote-access-signal">
                                      <span className="remote-access-signal-label">4G</span>
                                      <span className="remote-access-signal-bars">
                                        {[1, 2, 3, 4].map((bar) => (
                                          <span key={bar} className={`remote-access-signal-bar active level-${bar}`} />
                                        ))}
                                      </span>
                                    </span>
                                  </span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>Protocol Stack</span>
                                  <span>IPV4</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>IPV4</span>
                                  <span>10.23.221.109</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>Version Info</span>
                                  <span>EC25ECGAR06A16M1G</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>Version Identification</span>
                                  <span>20.200.20.200</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-section">WIFI Module</span>
                                  <span>Module Status</span>
                                  <span>Existed</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>ESSID</span>
                                  <span>ST-AIP953MP</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>IPV4</span>
                                  <span>192.168.240.1</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>MAC Address</span>
                                  <span>70:C9:12:E6:82:E2</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-section">Satellite Module</span>
                                  <span>Module Status</span>
                                  <span>Normal Signal</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>Data Source</span>
                                  <span>GPS</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>Satellite Number</span>
                                  <span>43</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>Satellite Angle</span>
                                  <span>0.0</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span className="remote-access-basic-info-muted">&nbsp;</span>
                                  <span>Speed</span>
                                  <span>0.0</span>
                                </div>
                              </div>
                              <button type="button" className="remote-access-basic-info-nav">›</button>
                            </div>
                          </div>
                        ) : activeGeneralTab === "Storage Device" ? (
                          <div className="remote-access-basic-info">
                            <div className="remote-access-basic-info-others">
                              <div className="remote-access-basic-info-hint">Formatting is performed instantly OTA on the device storage.</div>
                              {formattingNotice && (
                                <div className={`remote-access-basic-info-notice ${formattingNotice.type}`}>
                                  {formattingNotice.message}
                                </div>
                              )}
                              <div className="remote-access-basic-info-table remote-access-storage-table">
                                <div className="remote-access-basic-info-row remote-access-basic-info-head remote-access-storage-head">
                                  <span>Storage Name</span>
                                  <span>Status</span>
                                  <span>Remain/Total</span>
                                  <span>Formatting</span>
                                </div>
                                {[
                                  {
                                    name: "Internal SD Card1",
                                    status: "Normal",
                                    remain: "939.5 MB/126.4 GB"
                                  },
                                  {
                                    name: "Internal SD Card2",
                                    status: "Normal",
                                    remain: "872.4 MB/126.4 GB"
                                  }
                                ].map((item) => (
                                  <div key={item.name} className="remote-access-basic-info-row remote-access-storage-row">
                                    <span>{item.name}</span>
                                    <span>{item.status}</span>
                                    <span>{item.remain}</span>
                                    <button
                                      type="button"
                                      className="remote-access-storage-icon"
                                      title={`Format ${item.name}`}
                                      onClick={() => handleFormatStorage(item.name)}
                                    >
                                      Format
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <button type="button" className="remote-access-basic-info-nav">›</button>
                            </div>
                          </div>
                        ) : activeGeneralTab === "Version Info" ? (
                          <div className="remote-access-basic-info">
                            <div className="remote-access-basic-info-others">
                              <div className="remote-access-basic-info-table remote-access-version-table">
                                <div className="remote-access-basic-info-row">
                                  <span>Device Model</span>
                                  <span>ADPLUS2.0-STANDARD</span>
                                  <span></span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span>File System Version</span>
                                  <span>5.0</span>
                                  <span></span>
                                </div>
                                <div className="remote-access-basic-info-row remote-access-basic-info-head remote-access-version-head">
                                  <span>Name</span>
                                  <span>Current Version</span>
                                  <span>Upgrade</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span>Firmware Version</span>
                                  <span>V3.5.8.19_R25070903</span>
                                  <span className="remote-access-version-icon">⤴</span>
                                </div>
                                <div className="remote-access-basic-info-row">
                                  <span>MCU Version</span>
                                  <span>ADX-M01-GD32-MCU-T25052201</span>
                                  <span className="remote-access-version-icon">⤴</span>
                                </div>
                                <div className="remote-access-basic-info-row remote-access-version-section">
                                  <span>Peripheral</span>
                                  <span></span>
                                  <span></span>
                                </div>
                                {[
                                  { name: "IPC", version: "" },
                                  { name: "RWatch", version: "" },
                                  { name: "SLA(outside the car)", version: "" },
                                  { name: "SLA(in-car)", version: "" },
                                  { name: "Communication Module 1", version: "EC25ECGAR06A16M1G" },
                                  { name: "GPS", version: "GTK:20250505" },
                                  { name: "Power Box", version: "ADPP-P21-N32-MCU-T23111601" },
                                  { name: "Offline Map", version: "" }
                                ].map((item) => (
                                  <div key={item.name} className="remote-access-basic-info-row">
                                    <span>{item.name}</span>
                                    <span>{item.version}</span>
                                    <span className="remote-access-version-icon">⤴</span>
                                  </div>
                                ))}
                              </div>
                              <button type="button" className="remote-access-basic-info-nav">›</button>
                            </div>
                          </div>
                        ) : (
                          <div className="remote-access-general-card">
                            <div className="remote-access-general-block">
                              <div className="remote-access-general-title">
                                <span>Device Status</span>
                                <span className="remote-access-general-status">
                                  {activeDevice?.status === "online" ? "Online" : "Offline"}
                                </span>
                              </div>
                              <div className="remote-access-general-grid">
                                <div className="remote-access-general-row">
                                  <span>Device ID</span>
                                  <span>{activeDevice?.deviceId ?? "-"}</span>
                                </div>
                                <div className="remote-access-general-row">
                                  <span>Fleet</span>
                                  <span>{activeDevice?.fleet ?? "-"}</span>
                                </div>
                                <div className="remote-access-general-row">
                                  <span>Module Type</span>
                                  <span>{activeDevice?.moduleType ?? "-"}</span>
                                </div>
                                <div className="remote-access-general-row">
                                  <span>Master Version</span>
                                  <span>{activeDevice?.masterVersion ?? "-"}</span>
                                </div>
                                <div className="remote-access-general-row">
                                  <span>Power Box Version</span>
                                  <span>{activeDevice?.powerBoxVersion ?? "-"}</span>
                                </div>
                                <div className="remote-access-general-row">
                                  <span>IPC</span>
                                  <span>{activeDevice?.ipc ?? "-"}</span>
                                </div>
                              </div>
                            </div>
                            {generalServers.map((server) => (
                              <div key={server.title} className="remote-access-general-block">
                                <div className="remote-access-general-title">
                                  <span>{server.title}</span>
                                  <span className="remote-access-general-status">{server.status}</span>
                                </div>
                                <div className="remote-access-general-grid">
                                  <div className="remote-access-general-row">
                                    <span>Connected Status</span>
                                    <span>{server.status}</span>
                                  </div>
                                  <div className="remote-access-general-row">
                                    <span>Network Type</span>
                                    <span>{server.networkType}</span>
                                  </div>
                                  <div className="remote-access-general-row">
                                    <span>Protocol Type</span>
                                    <span>{server.protocol}</span>
                                  </div>
                                  <div className="remote-access-general-row">
                                    <span>Server Address</span>
                                    <span>{server.address}</span>
                                  </div>
                                  <div className="remote-access-general-row">
                                    <span>Port</span>
                                    <span>{server.port}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </section>
                </div>
              ) : activeRemoteTab === "Preview" ? (
                <div className="remote-access-preview">
                  <div className="remote-access-preview-header">
                    <span>[ {activeDevice?.plate ?? "AIP953MP"} ]</span>
                    <button type="button" className="remote-access-preview-close">×</button>
                  </div>
                  <div className="remote-access-preview-list">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="remote-access-preview-item">
                        <span className="remote-access-preview-channel">Channel {index + 1}</span>
                        <button type="button" className="remote-access-preview-link">Live preview</button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeRemoteTab === "Playback" ? (
                <div className="remote-access-playback">
                  <div className="remote-access-playback-header">Select Date:</div>
                  <div className="remote-access-playback-body">
                    <div className="remote-access-playback-calendar">
                      <div className="remote-access-playback-month">
                        <button type="button" className="remote-access-playback-nav">◀</button>
                        <div className="remote-access-playback-month-label">November</div>
                        <button type="button" className="remote-access-playback-nav">▶</button>
                      </div>
                      <div className="remote-access-playback-week">
                        {"S M T W T F S".split(" ").map((day) => (
                          <span key={day}>{day}</span>
                        ))}
                      </div>
                      <div className="remote-access-playback-grid">
                        {[
                          "26",
                          "27",
                          "28",
                          "29",
                          "30",
                          "31",
                          "1",
                          "2",
                          "3",
                          "4",
                          "5",
                          "6",
                          "7",
                          "8",
                          "9",
                          "10",
                          "11",
                          "12",
                          "13",
                          "14",
                          "15",
                          "16",
                          "17",
                          "18",
                          "19",
                          "20",
                          "21",
                          "22",
                          "23",
                          "24",
                          "25",
                          "26",
                          "27",
                          "28",
                          "29",
                          "30"
                        ].map((day, index) => (
                          <div
                            key={`${day}-${index}`}
                            className={`remote-access-playback-day ${
                              [15, 20].includes(Number(day))
                                ? "alarm"
                                : [17, 18, 21, 22].includes(Number(day))
                                  ? "normal"
                                  : ""
                            }`}
                          >
                            {day}
                          </div>
                        ))}
                      </div>
                      <div className="remote-access-playback-year">2025</div>
                    </div>
                    <div className="remote-access-playback-side">
                      <div className="remote-access-playback-select">
                        <select className="remote-access-basic-input">
                          <option>Main Storage</option>
                          <option>Secondary Storage</option>
                        </select>
                      </div>
                      <div className="remote-access-playback-select">
                        <select className="remote-access-basic-input">
                          <option>Main Stream</option>
                          <option>Sub Stream</option>
                        </select>
                      </div>
                      <div className="remote-access-playback-legend">
                        <div className="remote-access-playback-legend-item">
                          <span className="remote-access-playback-dot locked" />
                          Locked Video
                        </div>
                        <div className="remote-access-playback-legend-item">
                          <span className="remote-access-playback-dot alarm" />
                          Alarm Video
                        </div>
                        <div className="remote-access-playback-legend-item">
                          <span className="remote-access-playback-dot normal" />
                          Normal Video
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="remote-access-preferences">
                  <aside className="remote-access-sidebar">
                    {preferenceMenus.map((menu) => (
                      <div key={menu.label} className="remote-access-menu-group">
                        <button
                          type="button"
                          className={`remote-access-menu ${activePreferencesMenu === menu.label ? "active" : ""}`}
                          onClick={() => setActivePreferencesMenu(menu.label)}
                        >
                          {menu.label}
                        </button>
                        {menu.sub && activePreferencesMenu === menu.label && (
                          <div className="remote-access-sub">
                            {menu.sub.map((sub) => (
                              <button
                                key={sub}
                                type="button"
                                className={`remote-access-subitem ${activePreferencesSub === sub ? "active" : ""}`}
                                onClick={() => setActivePreferencesSub(sub)}
                              >
                                {sub}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </aside>
                  <section className="remote-access-panel">
                    <div className="remote-access-empty">
                      Use the Surveillance → Record menu to configure recording settings.
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
