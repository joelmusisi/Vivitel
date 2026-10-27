import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScheduleDateTimePicker from "../../components/ScheduleDateTimePicker";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
import { loadScopedFromApi, saveScopedToApi } from "../../utils/scopeStorage";
import "../../index.css";

const STORAGE_BASE = "driver-coaching:debrief";

type DebriefFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly";

type SupervisorTeam = {
  id: string;
  name: string;
  assignedDrivers: string;
};

type DebriefSettings = {
  frequency: DebriefFrequency;
  startDate: string;
  supervisors: SupervisorTeam[];
};

const FREQUENCY_OPTIONS: Array<{ value: DebriefFrequency; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" }
];

const pad2 = (value: number) => String(value).padStart(2, "0");

const toDateInputValue = (date: Date) =>
  `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;

const parseDisplayDate = (value: string): Date => {
  const match = String(value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);
    const parsed = new Date(year, month, day);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
};

const defaultSettings = (): DebriefSettings => ({
  frequency: "weekly",
  startDate: toDateInputValue(new Date()),
  supervisors: []
});

export default function DriverDebrief() {
  const navigate = useNavigate();
  const [frequency, setFrequency] = useState<DebriefFrequency>("weekly");
  const [startDate, setStartDate] = useState(() => toDateInputValue(new Date()));
  const [supervisors, setSupervisors] = useState<SupervisorTeam[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDrivers, setDraftDrivers] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState(() => new Date());
  const [datePickerMode, setDatePickerMode] = useState<"date" | "time">("date");
  const [datePickerTime, setDatePickerTime] = useState("00:00");

  const refresh = useCallback(async () => {
    const stored = await loadScopedFromApi<DebriefSettings>(STORAGE_BASE);
    const next = stored ?? defaultSettings();
    setFrequency(next.frequency || "weekly");
    setStartDate(next.startDate || toDateInputValue(new Date()));
    setSupervisors(Array.isArray(next.supervisors) ? next.supervisors : []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredSupervisors = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return supervisors;
    return supervisors.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.assignedDrivers.toLowerCase().includes(query)
    );
  }, [filter, supervisors]);

  const getSupervisorSortValue = useCallback((row: SupervisorTeam, key: string) => {
    if (key === "name") return row.name;
    if (key === "assignedDrivers") return row.assignedDrivers;
    return "";
  }, []);
  const supervisorSort = useColumnSort({ rows: filteredSupervisors, getValue: getSupervisorSortValue });

  const handleSave = async () => {
    setBusy(true);
    try {
      const payload: DebriefSettings = {
        frequency,
        startDate,
        supervisors
      };
      await saveScopedToApi(STORAGE_BASE, payload);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } finally {
      setBusy(false);
    }
  };

  const openStartDatePicker = () => {
    const parsed = parseDisplayDate(startDate);
    setDatePickerValue(parsed);
    setDatePickerTime("00:00");
    setDatePickerMode("date");
    setShowDatePicker(true);
  };

  const confirmStartDate = () => {
    setStartDate(toDateInputValue(datePickerValue));
    setShowDatePicker(false);
  };

  const addSupervisor = () => {
    const name = draftName.trim();
    if (!name) return;
    setSupervisors((prev) => [
      ...prev,
      {
        id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        assignedDrivers: draftDrivers.trim() || "—"
      }
    ]);
    setDraftName("");
    setDraftDrivers("");
    setAddOpen(false);
  };

  const removeSupervisor = (id: string) => {
    setSupervisors((prev) => prev.filter((row) => row.id !== id));
  };

  return (
    <div className="page driver-debrief-page">
      <div className="driver-debrief-card">
        <header className="driver-debrief-header">
          <h1 className="driver-debrief-title">Driver debrief settings</h1>
          <div className="driver-debrief-actions">
            <button type="button" className="driver-debrief-btn ghost" onClick={() => navigate(-1)}>
              Close
            </button>
            <button type="button" className="driver-debrief-btn primary" onClick={() => void handleSave()} disabled={busy}>
              {savedFlash ? "Saved" : "Save"}
            </button>
          </div>
        </header>

        <section className="driver-debrief-section">
          <h2 className="driver-debrief-section-title">Coaching debrief interval</h2>
          <p className="driver-debrief-section-sub">
            Set the frequency that supervisors or teams need to facilitate debrief sessions.
          </p>
          <div className="driver-debrief-interval-row">
            <label className="driver-debrief-field">
              <span>Frequency</span>
              <select value={frequency} onChange={(event) => setFrequency(event.target.value as DebriefFrequency)}>
                {FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="driver-debrief-field">
              <span>Start date</span>
              <button type="button" className="driver-debrief-date-trigger" onClick={openStartDatePicker}>
                <span>{startDate}</span>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M3 9h18M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </label>
          </div>
        </section>

        <section className="driver-debrief-section">
          <div className="driver-debrief-section-head">
            <div className="driver-debrief-section-heading">
              <h2 className="driver-debrief-section-title">Supervisors / Teams</h2>
              <span className="driver-debrief-count" aria-label={`${supervisors.length} supervisors`}>
                {supervisors.length}
              </span>
            </div>
            <button
              type="button"
              className="driver-debrief-add"
              onClick={() => setAddOpen(true)}
              aria-label="Add supervisor or team"
              title="Add supervisor or team"
            >
              +
            </button>
          </div>

          <input
            className="driver-debrief-filter"
            type="search"
            placeholder="Filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />

          <div className="driver-debrief-table" role="table">
            <div className="driver-debrief-table-head" role="row">
              <SortableColumnHeader as="span" label="Supervisor / Team name" {...supervisorSort.getHeaderProps("name")} />
              <SortableColumnHeader as="span" label="Assigned drivers" {...supervisorSort.getHeaderProps("assignedDrivers")} />
              <span className="driver-debrief-table-actions-col" aria-hidden="true" />
            </div>
            {supervisorSort.sortedRows.length === 0 ? (
              <div className="driver-debrief-empty">No records available.</div>
            ) : (
              supervisorSort.sortedRows.map((row) => (
                <div key={row.id} className="driver-debrief-table-row" role="row">
                  <span role="cell" data-label="Supervisor / Team name">
                    {row.name}
                  </span>
                  <span role="cell" data-label="Assigned drivers">
                    {row.assignedDrivers}
                  </span>
                  <span className="driver-debrief-table-actions-col" role="cell" data-label="Actions">
                    <button type="button" className="driver-debrief-row-btn" onClick={() => removeSupervisor(row.id)}>
                      Remove
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {addOpen ? (
        <div className="driver-debrief-modal" role="dialog" aria-modal="true" aria-label="Add supervisor or team">
          <div className="driver-debrief-modal-card">
            <h3>Add supervisor / team</h3>
            <label className="driver-debrief-field">
              <span>Supervisor / Team name</span>
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Name" />
            </label>
            <label className="driver-debrief-field">
              <span>Assigned drivers</span>
              <input
                value={draftDrivers}
                onChange={(event) => setDraftDrivers(event.target.value)}
                placeholder="e.g. 3 drivers or names"
              />
            </label>
            <div className="driver-debrief-actions">
              <button type="button" className="driver-debrief-btn ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button type="button" className="driver-debrief-btn primary" onClick={addSupervisor} disabled={!draftName.trim()}>
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ScheduleDateTimePicker
        open={showDatePicker}
        date={datePickerValue}
        time={datePickerTime}
        mode={datePickerMode}
        showTime={false}
        title="Select start date"
        onClose={() => setShowDatePicker(false)}
        onConfirm={confirmStartDate}
        onDateChange={setDatePickerValue}
        onTimeChange={setDatePickerTime}
        onModeChange={setDatePickerMode}
      />
    </div>
  );
}
