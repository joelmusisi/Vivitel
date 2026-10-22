import { useEffect, useState } from "react";
import { readDemoSession, type DemoSessionStatus } from "../../utils/api";
import { showToast } from "../../utils/toast";
import "./TrialBanner.css";

const HIDE_KEY = "vivi.demo.banner.hidden";

export function TrialBanner() {
  const [demo, setDemo] = useState<DemoSessionStatus | null>(() => readDemoSession());
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(HIDE_KEY) === "1";
  });

  useEffect(() => {
    const sync = () => setDemo(readDemoSession());
    window.addEventListener("vivi:authchange", sync);
    return () => window.removeEventListener("vivi:authchange", sync);
  }, []);

  if (!demo?.active || demo.activated || demo.expired || !demo.startedAt || hidden) return null;

  const total = 14;
  const left = Math.max(0, Math.min(total, demo.daysRemaining));
  const width = `${Math.max(8, (left / total) * 100)}%`;

  return (
    <div className="trial-banner" role="status">
      <div className="trial-banner__mark" aria-hidden="true">
        <span />
      </div>
      <div className="trial-banner__copy">
        <p>Trial settings</p>
        <div className="trial-banner__meter" aria-hidden="true">
          <i style={{ width }} />
        </div>
        <strong>
          Trial ending in {left} day{left === 1 ? "" : "s"}
        </strong>
      </div>
      <button
        type="button"
        className="trial-banner__activate"
        onClick={() =>
          showToast("Own Support or an admin activates this account from User admin.", "info")
        }
      >
        Activate account
      </button>
      <button
        type="button"
        className="trial-banner__close"
        aria-label="Hide trial countdown"
        onClick={() => {
          window.sessionStorage.setItem(HIDE_KEY, "1");
          setHidden(true);
        }}
      >
        ×
      </button>
    </div>
  );
}
