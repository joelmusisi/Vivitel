import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { JOURNEY_STATUS_OPTIONS, NOTIFICATIONS_BINDINGS_PATH, STREAMS_PATH } from "../../utils/journeyCatalog";
import {
  defaultJourneyAlertPrefs,
  loadJourneyAlertPrefs,
  saveJourneyAlertPrefs,
  subscribeJourneyAlertPrefs,
  type JourneyAlertPrefs
} from "../../utils/journeyAlertPrefs";

type JourneyStatusAlertsProps = {
  title?: string;
  subtitle?: string;
  showLinks?: boolean;
};

/** Per-account routes exception alerts — shared by Tracking and Streams. */
export default function JourneyStatusAlerts({
  title = "Routes status alerts",
  subtitle = "Notify this account when a live route hits an exception status.",
  showLinks = true
}: JourneyStatusAlertsProps) {
  const [prefs, setPrefs] = useState<JourneyAlertPrefs>(() => defaultJourneyAlertPrefs());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadJourneyAlertPrefs();
      if (!cancelled) {
        setPrefs(loaded);
        setLoading(false);
      }
    })();
    const unsubscribe = subscribeJourneyAlertPrefs((next) => setPrefs(next));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const updatePref = (status: (typeof JOURNEY_STATUS_OPTIONS)[number], patch: Partial<JourneyAlertPrefs[typeof status]>) => {
    setPrefs((current) => ({
      ...current,
      [status]: { ...current[status], ...patch }
    }));
    setMessage("");
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    const ok = await saveJourneyAlertPrefs(prefs);
    setSaving(false);
    setMessage(ok ? "Alert preferences saved for your account." : "Unable to save preferences right now.");
  };

  const enabledCount = JOURNEY_STATUS_OPTIONS.filter((status) => prefs[status].enabled).length;

  return (
    <section className="journey-panel journey-status-panel">
      <div className="journey-panel-header">
        <div>
          <div className="journey-panel-title">{title}</div>
          <div className="journey-panel-sub">{subtitle}</div>
        </div>
        <div className="journey-filter-row">
          <span className="journey-meta-pill">{enabledCount} enabled</span>
          <button type="button" className="journey-btn" disabled={loading || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save alerts"}
          </button>
        </div>
      </div>

      {showLinks && (
        <div className="journey-link-row">
          <Link to={STREAMS_PATH}>Open Streams / Info Hub</Link>
          <Link to={NOTIFICATIONS_BINDINGS_PATH}>Notification bindings</Link>
        </div>
      )}

      {message && <div className="journey-inline-note">{message}</div>}

      <div className="journey-status-table">
        <div className="journey-status-row head">
          <span>Routes status</span>
          <span>Play sounds</span>
        </div>
        {loading ? (
          <div className="journey-empty">Loading your alert preferences…</div>
        ) : (
          JOURNEY_STATUS_OPTIONS.map((status) => (
            <div key={status} className="journey-status-row">
              <label className="journey-status-check">
                <input
                  type="checkbox"
                  checked={prefs[status].enabled}
                  onChange={(event) => updatePref(status, { enabled: event.target.checked })}
                />
                {status}
              </label>
              <input
                type="checkbox"
                checked={prefs[status].playSound}
                disabled={!prefs[status].enabled}
                aria-label={`Play sounds for ${status}`}
                onChange={(event) => updatePref(status, { playSound: event.target.checked })}
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
