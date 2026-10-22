import { useCallback, useState } from "react";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
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

export default function DefaultOptions() {
  const navigate = useNavigate();
  const [assignmentGroup, setAssignmentGroup] = useState("operations");
  const [defaultPriority, setDefaultPriority] = useState("high");
  const [activeSla, setActiveSla] = useState("2h");
  const [defaultChannel, setDefaultChannel] = useState("in-app");
  const [autoEscalation, setAutoEscalation] = useState(true);
  const ruleRows: RuleRow[] = [];
  const templateRows: TemplateRow[] = [];

  const getTemplateRowSortValue = useCallback((row: TemplateRow, key: string) => {
    if (key === "template") return row.name;
    if (key === "channel") return row.channel;
    if (key === "updated") return row.updated;
    if (key === "owner") return row.owner;
    return "";
  }, []);
  const templateSort = useColumnSort({ rows: templateRows, getValue: getTemplateRowSortValue });

  const getRuleRowSortValue = useCallback((row: RuleRow, key: string) => {
    if (key === "rule") return row.label;
    if (key === "description") return row.description;
    if (key === "priority") return row.priority;
    if (key === "owner") return row.owner;
    if (key === "status") return row.status;
    return "";
  }, []);
  const ruleSort = useColumnSort({ rows: ruleRows, getValue: getRuleRowSortValue });

  const handleSaveDefaults = () => {
    void saveToApi("Track:default-options", {
      assignmentGroup,
      defaultPriority,
      activeSla,
      defaultChannel,
      autoEscalation,
      updatedAt: new Date().toISOString()
    });
  };

  return (
    <div className="page jobs-default-page">
      <div className="jobs-topbar">
        <div>
          <div className="jobs-title">Default options</div>
          <div className="jobs-path">Track / Jobs & Messaging / Default options</div>
        </div>
        <div className="jobs-actions">
          <button
            type="button"
            className="jobs-btn ghost"
            onClick={() =>
              navigate(
                "/Analyze/insights/reports?category=List%20Reports&report=Summary%20and%20Detailed%20Task%20Report%20by%20Template%20and%20Date"
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
              Notify regional Controlr on critical events
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
            <button type="button" className="jobs-link">Control templates</button>
          </div>
          <div className="jobs-table">
            <div className="jobs-row jobs-row-head">
              <SortableColumnHeader as="span" label="Template" {...templateSort.getHeaderProps("template")} />
              <SortableColumnHeader as="span" label="Channel" {...templateSort.getHeaderProps("channel")} />
              <SortableColumnHeader as="span" label="Updated" {...templateSort.getHeaderProps("updated")} />
              <SortableColumnHeader as="span" label="Owner" {...templateSort.getHeaderProps("owner")} />
            </div>
            {templateSort.sortedRows.length === 0 ? (
              <div className="jobs-empty">No records yet.</div>
            ) : (
              templateSort.sortedRows.map((row) => (
                <div key={row.id} className="jobs-row">
                  <span className="jobs-row-title">{row.name}</span>
                  <span>{row.channel}</span>
                  <span>{row.updated}</span>
                  <span>{row.owner}</span>
                </div>
              ))
            )}
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
            <SortableColumnHeader as="span" label="Rule" {...ruleSort.getHeaderProps("rule")} />
            <SortableColumnHeader as="span" label="Description" {...ruleSort.getHeaderProps("description")} />
            <SortableColumnHeader as="span" label="Priority" {...ruleSort.getHeaderProps("priority")} />
            <SortableColumnHeader as="span" label="Owner" {...ruleSort.getHeaderProps("owner")} />
            <SortableColumnHeader as="span" label="Status" {...ruleSort.getHeaderProps("status")} />
          </div>
          {ruleSort.sortedRows.length === 0 ? (
            <div className="jobs-empty">No records yet.</div>
          ) : (
            ruleSort.sortedRows.map((row) => (
              <div key={row.id} className="jobs-row jobs-row-wide">
                <span className="jobs-row-title">{row.label}</span>
                <span>{row.description}</span>
                <span>{row.priority}</span>
                <span>{row.owner}</span>
                <span className={`jobs-pill ${row.status}`}>{row.status}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
