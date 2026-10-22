import { ReactNode } from "react";

type Tab = { id: string; label: string };

type Props = {
  eyebrow: string;
  title: string;
  lead: string;
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  actions?: ReactNode;
  children: ReactNode;
};

export default function DeliverSectionShell({
  eyebrow,
  title,
  lead,
  tabs,
  activeTab,
  onTabChange,
  actions,
  children
}: Props) {
  return (
    <div className="page">
      <div className="overview-header">
        <div>
          <div className="overview-eyebrow">{eyebrow}</div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <p className="overview-lead">{lead}</p>
        </div>
        {actions ? <div className="overview-actions">{actions}</div> : null}
      </div>

      <div className="deliver-platform-tabs" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={"btn " + (activeTab === tab.id ? "primary" : "ghost")}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {children}
    </div>
  );
}
