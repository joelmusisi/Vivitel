import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { dismissDemoTour, readDemoSession, type DemoSessionStatus } from "../../utils/api";
import "./DemoGuide.css";

const STEPS = [
  {
    title: "Your 14-day demo",
    body: "You have Basic User access for 14 continuous days. This guide shows the first setup: add an asset, create a configuration group, then attach that group and commission the asset.",
    path: ""
  },
  {
    title: "Add an asset",
    body: "Open Fleet Assets and add the vehicle or device you want to track. Give it a name and keep it on your demo site.",
    path: "/Track/fleet/assets",
    action: "Open Assets"
  },
  {
    title: "Create a configuration group",
    body: "Open Configuration groups and create a group for this asset. The group is what gets attached when you commission.",
    path: "/Control/config/configuration-groups",
    action: "Open configuration groups"
  },
  {
    title: "Attach the group and commission",
    body: "Go back to the asset, choose the configuration group you just created, and commission the asset. That links the group to the asset and finishes setup.",
    path: "/Track/fleet/assets",
    action: "Open Assets"
  }
];

export function DemoGuide() {
  const navigate = useNavigate();
  const location = useLocation();
  const [demo, setDemo] = useState<DemoSessionStatus | null>(() => readDemoSession());
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const openedOnce = useRef(false);

  useEffect(() => {
    const sync = () => {
      const next = readDemoSession();
      setDemo(next);
      if (next?.active && next.showTour && !openedOnce.current) {
        openedOnce.current = true;
        setOpen(true);
      }
      if (next && !next.showTour) setOpen(false);
    };
    sync();
    window.addEventListener("vivi:authchange", sync);
    return () => window.removeEventListener("vivi:authchange", sync);
  }, []);

  if (!demo?.active || demo.expired) return null;

  const current = STEPS[step] ?? STEPS[0];
  const onThisPage = Boolean(current.path) && location.pathname === current.path;

  const closeForNow = () => setOpen(false);

  const finish = async () => {
    setDismissing(true);
    try {
      await dismissDemoTour();
      setOpen(false);
      setDemo(readDemoSession());
    } finally {
      setDismissing(false);
    }
  };

  const goToStep = (index: number) => {
    const next = STEPS[index];
    setStep(index);
    if (next?.path) navigate(next.path);
  };

  return (
    <div className="demo-guide">
      {!open && (
        <button type="button" className="demo-guide__launcher" onClick={() => setOpen(true)}>
          Demo guide
          <span>{demo.daysRemaining} day{demo.daysRemaining === 1 ? "" : "s"} left</span>
        </button>
      )}
      {open && (
        <section className="demo-guide__card" role="dialog" aria-label="Demo setup guide">
          <header className="demo-guide__header">
            <div>
              <p className="demo-guide__kicker">Setup leaflet</p>
              <h2>{current.title}</h2>
            </div>
            <button type="button" className="demo-guide__icon" onClick={closeForNow} aria-label="Hide demo guide">
              ×
            </button>
          </header>
          <p className="demo-guide__days">
            {demo.daysRemaining} day{demo.daysRemaining === 1 ? "" : "s"} of Basic User access remaining
          </p>
          <p className="demo-guide__body">{current.body}</p>
          <ol className="demo-guide__steps">
            {STEPS.map((item, index) => (
              <li key={item.title}>
                <button
                  type="button"
                  className={index === step ? "is-current" : ""}
                  onClick={() => goToStep(index)}
                >
                  {index + 1}. {item.title}
                </button>
              </li>
            ))}
          </ol>
          <footer className="demo-guide__actions">
            {step > 0 && (
              <button type="button" className="demo-guide__ghost" onClick={() => setStep((value) => Math.max(0, value - 1))}>
                Back
              </button>
            )}
            {current.path && (
              <button type="button" className="demo-guide__primary" onClick={() => navigate(current.path)}>
                {onThisPage ? "You are on this page" : current.action}
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className="demo-guide__primary" onClick={() => goToStep(step + 1)}>
                Next
              </button>
            ) : (
              <button type="button" className="demo-guide__primary" onClick={() => void finish()} disabled={dismissing}>
                {dismissing ? "Saving…" : "Finish guide"}
              </button>
            )}
          </footer>
        </section>
      )}
    </div>
  );
}
