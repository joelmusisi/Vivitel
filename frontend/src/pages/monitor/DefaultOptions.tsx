import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveToApi } from "../../utils/api";
import "../../index.css";

type RuleRow = {
  id: string;
  label: string;
  description: string;
  priority: string;
  owner: string;
  status: "active" | "paused" | "draft";
};

type TemplateRow = {
  id: string;
  name: string;
  channel: string;
  updated: string;
  owner: string;
};

const ruleRows: RuleRow[] = [
  {
    id: "rule-1",
    label: "High priority breakdown",
    description: "Route to Operations desk and alert regional manager.",
    priority: "Critical",
    owner: "Fleet Ops",
    status: "active"
  },
  {
    id: "rule-2",
    label: "After-hours assistance",
    description: "Send SMS + create task for standby team.",
    priority: "High",
    owner: "Support",
    status: "active"
  },
  {
    id: "rule-3",
    label: "Maintenance request",
    description: "Queue to maintenance board with 24h SLA.",
    priority: "Medium",
    owner: "Workshop",
    status: "paused"
  }
];

const templateRows: TemplateRow[] = [
  {
    id: "tpl-1",
    name: "Breakdown acknowledgement",
    channel: "SMS",
    updated: "08 Jan 2026",
    owner: "Ops Comms"
  },
  {
    id: "tpl-2",
    name: "Driver check-in",
    channel: "In-app",
    updated: "04 Jan 2026",
    owner: "Support"
  },
  {
    id: "tpl-3",
    name: "Late arrival notice",
    channel: "Email",
    updated: "22 Dec 2025",
    owner: "Dispatch"
  }
];

export default function DefaultOptions() {
  const navigate = useNavigate();
  const [assignmentGroup, setAssignmentGroup] = useState("operations");
  const [defaultPriority, setDefaultPriority] = useState("high");
  const [activeSla, setActiveSla] = useState("2h");
  const [defaultChannel, setDefaultChannel] = useState("in-app");
  const [autoEscalation, setAutoEscalation] = useState(true);

  const handleSaveDefaults = () => {
    void saveToApi("monitor:default-options", {
      assignmentGroup,
      defaultPriority,
      activeSla,
      defaultChannel,
      autoEscalation,
      updatedAt: new Date().toISOString()
    });
  };

  const summary = useMemo(
    () => [
      { label: "Active rules", value: ruleRows.filter((row) => row.status === "active").length },
      { label: "Paused rules", value: ruleRows.filter((row) => row.status === "paused").length },
      { label: "Templates", value: templateRows.length },
      { label: "Default SLA", value: activeSla.toUpperCase() }
    ],
    [activeSla]
  );

  return (
    <div className="page jobs-default-page">
      <div className="jobs-topbar">
        <div>
          <div className="jobs-title">Default options</div>
          <div className="jobs-path">Monitor / Jobs & Messaging / Default options</div>
        </div>
        <div className="jobs-actions">
          <button
            type="button"
            className="jobs-btn ghost"
            onClick={() =>
              navigate(
                "/measure/insights/reports?category=List%20Reports&report=Summary%20and%20Detailed%20Task%20Report%20by%20Template%20and%20Date"
              )
            }
          >
            View task reports
          </button>
          <button type="button" className="jobs-btn ghost">
            View audit log
          </button>
          <button type="button" className="jobs-btn" onClick={handleSaveDefaults}>
            Save defaults
          </button>
        </div>
      </div>

      <section className="jobs-summary">
        {summary.map((card) => (
          <div key={card.label} className="jobs-summary-card">
            <div className="jobs-summary-label">{card.label}</div>
            <div className="jobs-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="jobs-layout">
        <div className="jobs-panel">
          <div className="jobs-panel-header">
            <div>
              <div className="jobs-panel-title">Routing defaults</div>
              <div className="jobs-panel-sub">Applies to all incoming assistance requests.</div>
            </div>
            <button type="button" className="jobs-link">Edit routing</button>
          </div>
          <div className="jobs-form-grid">
            <label>
              Primary assignment group
              <select value={assignmentGroup} onChange={(event) => setAssignmentGroup(event.target.value)}>
                <option value="operations">Operations desk</option>
                <option value="support">Support desk</option>
                <option value="dispatch">Dispatch</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </label>
            <label>
              Default priority
              <select value={defaultPriority} onChange={(event) => setDefaultPriority(event.target.value)}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label>
              Default response SLA
              <select value={activeSla} onChange={(event) => setActiveSla(event.target.value)}>
                <option value="30m">30 minutes</option>
                <option value="2h">2 hours</option>
                <option value="4h">4 hours</option>
                <option value="8h">8 hours</option>
              </select>
            </label>
            <label>
              Default communication channel
              <select
                value={defaultChannel}
                onChange={(event) => setDefaultChannel(event.target.value)}
              >
                <option value="in-app">In-app</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </label>
          </div>
          <div className="jobs-toggle-row">
            <label className="jobs-toggle">
              <input
                type="checkbox"
                checked={autoEscalation}
                onChange={(event) => setAutoEscalation(event.target.checked)}
              />
              Auto-escalate if no response within SLA
            </label>
            <label className="jobs-toggle">
              <input type="checkbox" defaultChecked />
              Notify regional manager on critical events
            </label>
            <label className="jobs-toggle">
              <input type="checkbox" />
              Auto-close tasks after resolution confirmation
            </label>
          </div>
        </div>

        <div className="jobs-panel">
          <div className="jobs-panel-header">
            <div>
              <div className="jobs-panel-title">Message templates</div>
              <div className="jobs-panel-sub">Reusable default messages for job workflows.</div>
            </div>
            <button type="button" className="jobs-link">Manage templates</button>
          </div>
          <div className="jobs-table">
            <div className="jobs-row jobs-row-head">
              <span>Template</span>
              <span>Channel</span>
              <span>Updated</span>
              <span>Owner</span>
            </div>
            {templateRows.map((row) => (
              <div key={row.id} className="jobs-row">
                <span className="jobs-row-title">{row.name}</span>
                <span>{row.channel}</span>
                <span>{row.updated}</span>
                <span>{row.owner}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="jobs-panel">
        <div className="jobs-panel-header">
          <div>
            <div className="jobs-panel-title">Automation rules</div>
            <div className="jobs-panel-sub">Define when tasks are created automatically.</div>
          </div>
          <button
            type="button"
            className="jobs-link"
            data-modal="Create automation rule"
            data-modal-sub="Define rule trigger and workflow."
            data-modal-fields="Rule name|Trigger event|Priority"
          >
            Create rule
          </button>
        </div>
        <div className="jobs-table">
          <div className="jobs-row jobs-row-head jobs-row-wide">
            <span>Rule</span>
            <span>Description</span>
            <span>Priority</span>
            <span>Owner</span>
            <span>Status</span>
          </div>
          {ruleRows.map((row) => (
            <div key={row.id} className="jobs-row jobs-row-wide">
              <span className="jobs-row-title">{row.label}</span>
              <span>{row.description}</span>
              <span>{row.priority}</span>
              <span>{row.owner}</span>
              <span className={`jobs-pill ${row.status}`}>{row.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
