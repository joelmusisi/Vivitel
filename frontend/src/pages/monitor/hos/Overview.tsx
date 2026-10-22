import { useCallback, useMemo, useState } from "react";
import SortableColumnHeader from "../../../components/SortableColumnHeader";
import { useColumnSort } from "../../../hooks/useColumnSort";
import { useNavigate } from "react-router-dom";
import {
  DEFAULT_MID_BREAK_RULE,
  DEFAULT_SHORT_BREAK_RULE,
  dutyStatusLabel,
  formatDurationMs,
  HOS_JURISDICTION_OPTIONS,
  resolveBreakRules,
  rulesFromPreset,
  saveHosRules,
  useHosFleet,
  type HosBreakRule,
  type HosJurisdiction,
  type HosRules
} from "../../../utils/hos";
import { beginSaving, endSavingDone, endSavingError } from "../../../utils/saveFeedback";
import "../../../index.css";

function syncLegacyBreakFields(breakRules: HosBreakRule[]) {
  const primary = breakRules[breakRules.length - 1] ?? { afterDriveHours: 0, restMinutes: 0 };
  return {
    breakRules,
    breakAfterDriveHours: primary.afterDriveHours,
    breakMinutes: primary.restMinutes
  };
}

export default function HosOverview() {
  const navigate = useNavigate();
  const { snapshot, busy, error, reload, setSnapshot } = useHosFleet();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [rulesDraft, setRulesDraft] = useState<HosRules | null>(null);
  const [savingRules, setSavingRules] = useState(false);

  const rules = rulesDraft ?? snapshot?.rules ?? rulesFromPreset("eu_aetr");
  const drivers = snapshot?.drivers ?? [];
  const breakRules = resolveBreakRules(rules.limits);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter((row) => {
      const hay = `${row.driverName} ${row.assetLabel}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (statusFilter === "compliant") return row.compliant && !row.nearLimit;
      if (statusFilter === "warning") return row.nearLimit && row.compliant;
      if (statusFilter === "violation") return !row.compliant;
      if (statusFilter === "on_duty") {
        return row.currentStatus === "driving" || row.currentStatus === "on_duty" || row.currentStatus === "break";
      }
      return true;
    });
  }, [drivers, search, statusFilter]);

  const getDriverSortValue = useCallback((row: (typeof drivers)[number], key: string) => {
    if (key === "driver") return row.driverName;
    if (key === "asset") return row.assetLabel;
    if (key === "status") return dutyStatusLabel(row.currentStatus);
    if (key === "driveToday") return row.driveMsToday;
    if (key === "remaining") return row.remainingDriveMs;
    if (key === "compliance") {
      if (!row.compliant) return "Violation";
      if (row.nearLimit) return "Warning";
      return "OK";
    }
    return "";
  }, []);
  const driverSort = useColumnSort({ rows: filtered, getValue: getDriverSortValue });

  const applyJurisdiction = (jurisdiction: HosJurisdiction) => {
    setRulesDraft(rulesFromPreset(jurisdiction));
  };

  const patchLimits = (patch: Partial<HosRules["limits"]>) => {
    setRulesDraft({
      ...rules,
      limits: { ...rules.limits, ...patch }
    });
  };

  const setBreakRules = (nextRules: HosBreakRule[]) => {
    patchLimits(syncLegacyBreakFields(nextRules));
  };

  const updateBreakRule = (index: number, patch: Partial<HosBreakRule>) => {
    const next = breakRules.map((row, i) => (i === index ? { ...row, ...patch } : row));
    setBreakRules(next);
  };

  const addBreakRule = (rule: HosBreakRule = { afterDriveHours: 2, restMinutes: 15 }) => {
    const exists = breakRules.some(
      (row) => row.afterDriveHours === rule.afterDriveHours && row.restMinutes === rule.restMinutes
    );
    if (exists) return;
    setBreakRules([...breakRules, rule].sort((a, b) => a.afterDriveHours - b.afterDriveHours));
  };

  const removeBreakRule = (index: number) => {
    setBreakRules(breakRules.filter((_, i) => i !== index));
  };

  const saveRules = async () => {
    setSavingRules(true);
    beginSaving("Saving HOS rules");
    try {
      const normalized = {
        ...rules,
        limits: {
          ...rules.limits,
          ...syncLegacyBreakFields(resolveBreakRules(rules.limits))
        }
      };
      const saved = await saveHosRules(normalized);
      setRulesDraft(saved);
      setSnapshot((current) => (current ? { ...current, rules: saved } : current));
      endSavingDone("HOS rules saved");
      await reload();
    } catch (e: any) {
      endSavingError(String(e?.message ?? e));
    } finally {
      setSavingRules(false);
    }
  };

  return (
    <div className="page hos-page">
      <div className="hos-topbar">
        <div>
          <div className="hos-title">HOS overview</div>
          <div className="hos-path">Track / Hours of service / Overview</div>
        </div>
        <div className="hos-actions">
          <button
            type="button"
            className="hos-btn ghost"
            onClick={() => navigate("/Analyze/insights/reports?category=Hours%20Of%20Service%20Reports")}
          >
            View HOS reports
          </button>
          <button type="button" className="hos-btn" onClick={() => void reload()} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <div className="hos-empty" role="alert">{error}</div> : null}

      <section className="hos-panel">
        <div className="hos-panel-header">
          <div>
            <div className="hos-panel-title">Organisation HOS rules</div>
            <div className="hos-panel-sub">
              Clients can adjust drive / rest thresholds for this database. Changes apply to compliance and alerts.
            </div>
          </div>
          <button type="button" className="hos-btn" disabled={savingRules} onClick={() => void saveRules()}>
            {savingRules ? "Saving…" : "Save rules"}
          </button>
        </div>

        <div className="hos-rules-grid">
          <label className="hos-field">
            Jurisdiction preset
            <select
              value={rules.jurisdiction}
              onChange={(e) => applyJurisdiction(e.target.value as HosJurisdiction)}
            >
              {HOS_JURISDICTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className="hos-field">
            Daily drive (h)
            <input
              type="number"
              min={1}
              step={0.5}
              value={rules.limits.dailyDriveHours}
              onChange={(e) => patchLimits({ dailyDriveHours: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="hos-field">
            Duty window (h)
            <input
              type="number"
              min={0}
              step={0.5}
              value={rules.limits.dutyWindowHours ?? rules.limits.dailyOnDutyHours ?? ""}
              onChange={(e) => patchLimits({ dutyWindowHours: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="hos-field">
            Daily rest (h)
            <input
              type="number"
              min={0}
              step={0.5}
              value={rules.limits.dailyRestHours}
              onChange={(e) => patchLimits({ dailyRestHours: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="hos-field">
            Weekly drive (h)
            <input
              type="number"
              min={0}
              step={1}
              value={rules.limits.weeklyDriveHours ?? ""}
              onChange={(e) => patchLimits({ weeklyDriveHours: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="hos-field">
            Two-week drive (h)
            <input
              type="number"
              min={0}
              step={1}
              value={rules.limits.biweeklyDriveHours ?? ""}
              onChange={(e) => patchLimits({ biweeklyDriveHours: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="hos-field">
            Monthly drive (h)
            <input
              type="number"
              min={0}
              step={1}
              value={rules.limits.monthlyDriveHours ?? ""}
              onChange={(e) => patchLimits({ monthlyDriveHours: Number(e.target.value) || 0 })}
            />
          </label>
        </div>

        <div className="hos-break-rules">
          <div className="hos-break-rules-header">
            <div>
              <div className="hos-panel-title" style={{ fontSize: "0.95rem" }}>Driving rest thresholds</div>
              <div className="hos-panel-sub">
                Example: 2 hours driving requires 15 minutes rest; 4 hours requires 30 minutes rest.
              </div>
            </div>
            <div className="hos-break-presets">
              <button type="button" className="hos-btn ghost" onClick={() => addBreakRule(DEFAULT_SHORT_BREAK_RULE)}>
                + 2h / 15m
              </button>
              <button type="button" className="hos-btn ghost" onClick={() => addBreakRule(DEFAULT_MID_BREAK_RULE)}>
                + 4h / 30m
              </button>
              <button
                type="button"
                className="hos-btn ghost"
                onClick={() => addBreakRule({ afterDriveHours: 4.5, restMinutes: 45 })}
              >
                + 4.5h / 45m
              </button>
              <button type="button" className="hos-btn ghost" onClick={() => addBreakRule()}>
                + Custom
              </button>
            </div>
          </div>

          {breakRules.length === 0 ? (
            <div className="hos-empty">No rest thresholds yet. Add 2h / 15m or 4h / 30m to start.</div>
          ) : (
            breakRules.map((rule, index) => (
              <div key={`${rule.afterDriveHours}-${rule.restMinutes}-${index}`} className="hos-break-rule-row">
                <label className="hos-field">
                  After drive (h)
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={rule.afterDriveHours}
                    onChange={(e) => updateBreakRule(index, { afterDriveHours: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="hos-field">
                  Required rest (min)
                  <input
                    type="number"
                    min={1}
                    step={5}
                    value={rule.restMinutes}
                    onChange={(e) => updateBreakRule(index, { restMinutes: Number(e.target.value) || 0 })}
                  />
                </label>
                <button type="button" className="hos-btn ghost" onClick={() => removeBreakRule(index)}>
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="hos-panel">
        <div className="hos-panel-header">
          <div>
            <div className="hos-panel-title">Driver roster</div>
            <div className="hos-panel-sub">Live compliance from trips and timeclock.</div>
          </div>
          <div className="hos-filter-row">
            <input
              className="hos-search"
              placeholder="Search driver or asset"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="hos-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="on_duty">On duty</option>
              <option value="compliant">Compliant</option>
              <option value="warning">Warning</option>
              <option value="violation">Violations</option>
            </select>
          </div>
        </div>
        <div className="hos-table">
          <div className="hos-row hos-row-head hos-row-6">
            <SortableColumnHeader as="span" label="Driver" {...driverSort.getHeaderProps("driver")} />
            <SortableColumnHeader as="span" label="Asset" {...driverSort.getHeaderProps("asset")} />
            <SortableColumnHeader as="span" label="Status" {...driverSort.getHeaderProps("status")} />
            <SortableColumnHeader as="span" label="Drive today" {...driverSort.getHeaderProps("driveToday")} />
            <SortableColumnHeader as="span" label="Remaining" {...driverSort.getHeaderProps("remaining")} />
            <SortableColumnHeader as="span" label="Compliance" {...driverSort.getHeaderProps("compliance")} />
          </div>
          {driverSort.sortedRows.length === 0 ? (
            <div className="hos-empty">{busy ? "Loading…" : "No drivers match this filter."}</div>
          ) : (
            driverSort.sortedRows.map((row) => (
              <div key={row.driverKey} className="hos-row hos-row-6">
                <span>{row.driverName}</span>
                <span>{row.assetLabel}</span>
                <span>{dutyStatusLabel(row.currentStatus)}</span>
                <span>{formatDurationMs(row.driveMsToday)}</span>
                <span>{formatDurationMs(row.remainingDriveMs)}</span>
                <span className={`hos-pill ${row.compliant ? (row.nearLimit ? "warn" : "ok") : "bad"}`}>
                  {!row.compliant ? "Violation" : row.nearLimit ? "Warning" : "OK"}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
