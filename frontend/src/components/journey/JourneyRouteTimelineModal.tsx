import { useEffect } from "react";
import type { JourneyRouteDetail } from "../../utils/journeyRouteDetails";

type JourneyRouteTimelineModalProps = {
  detail: JourneyRouteDetail;
  onClose: () => void;
  onOpenMap: () => void;
};

export default function JourneyRouteTimelineModal({
  detail,
  onClose,
  onOpenMap
}: JourneyRouteTimelineModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="journey-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Timeline for ${detail.routeName}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="journey-modal journey-modal--timeline">
        <header className="journey-modal-head">
          <div>
            <div className="journey-modal-kicker">Routes timeline · stays on Tracking</div>
            <h2>{detail.routeName}</h2>
            <p>
              {detail.vehicle.registration} · {detail.driver.name} · {detail.site}
            </p>
          </div>
          <div className="journey-modal-head-actions">
            <button type="button" className="journey-btn ghost" onClick={onOpenMap}>
              Map
            </button>
            <button type="button" className="journey-btn ghost journey-modal-close-btn" onClick={onClose}>
              Close
            </button>
            <button type="button" className="journey-modal-close" onClick={onClose} aria-label="Close timeline" title="Close">
              ×
            </button>
          </div>
        </header>

        <div className="journey-modal-body journey-modal-body--timeline">
          <aside className="journey-timeline-summary">
            <div className={`journey-timeline-health ${detail.health}`}>
              <span>Health</span>
              <strong>{detail.health}</strong>
              {detail.exception && <em>{detail.exception}</em>}
            </div>
            <dl>
              <div>
                <dt>Progress</dt>
                <dd>{detail.started ? `${detail.progressPercent}%` : "Not started"}</dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>
                  {detail.coveredKm} / {detail.distanceKm} km
                </dd>
              </div>
              <div>
                <dt>Fuel used</dt>
                <dd>{detail.started ? `${detail.fuelUsedLiters} L` : "—"}</dd>
              </div>
              <div>
                <dt>Workflow</dt>
                <dd>{detail.workflowName}</dd>
              </div>
              <div>
                <dt>Lead</dt>
                <dd>{detail.lead}</dd>
              </div>
              <div>
                <dt>ETA</dt>
                <dd>{detail.etaDestination}</dd>
              </div>
            </dl>
          </aside>

          <div className="journey-timeline-track">
            <h3>Events</h3>
            <ol className="journey-timeline-list">
              {detail.timeline.map((event) => (
                <li key={event.id} className={`tone-${event.tone}`}>
                  <div className="journey-timeline-dot" aria-hidden="true" />
                  <div className="journey-timeline-card">
                    <div className="journey-timeline-meta">
                      <time>{event.at}</time>
                      <strong>{event.title}</strong>
                    </div>
                    <p>{event.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <h3>Stop sequence</h3>
            <ol className="journey-timeline-stops">
              {detail.stops.map((stop, index) => (
                <li key={stop.id} className={`is-${stop.status}`}>
                  <span className="journey-timeline-step">{index + 1}</span>
                  <div>
                    <strong>{stop.name}</strong>
                    <p>
                      {stop.kind} · {stop.status} · ETA {stop.eta}
                      {stop.dwellMinutes ? ` · dwell ${stop.dwellMinutes}m` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
