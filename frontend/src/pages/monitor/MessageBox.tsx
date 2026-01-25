import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../index.css";

type MessageRow = {
  id: string;
  channel: "SMS" | "Email" | "In-app";
  subject: string;
  sender: string;
  received: string;
  status: "new" | "open" | "resolved";
};

type QueueRow = {
  id: string;
  label: string;
  count: number;
};

const messages: MessageRow[] = [
  {
    id: "msg-1",
    channel: "SMS",
    subject: "Breakdown reported by driver",
    sender: "+256 701 334 112",
    received: "2 min ago",
    status: "new"
  },
  {
    id: "msg-2",
    channel: "In-app",
    subject: "Service request: tyre change",
    sender: "Driver - KBX 214T",
    received: "18 min ago",
    status: "open"
  },
  {
    id: "msg-3",
    channel: "Email",
    subject: "Route update confirmation",
    sender: "dispatch@vivi.co",
    received: "1 hr ago",
    status: "resolved"
  },
  {
    id: "msg-4",
    channel: "In-app",
    subject: "Late delivery alert",
    sender: "Customer Care",
    received: "2 hrs ago",
    status: "open"
  }
];

const queues: QueueRow[] = [
  { id: "queue-1", label: "Inbox", count: 18 },
  { id: "queue-2", label: "Priority", count: 6 },
  { id: "queue-3", label: "Resolved", count: 24 },
  { id: "queue-4", label: "Escalations", count: 3 }
];

export default function MessageBox() {
  const navigate = useNavigate();
  const [activeQueue, setActiveQueue] = useState("Inbox");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredMessages = useMemo(() => {
    return messages.filter((row) => {
      const matchesSearch =
        row.subject.toLowerCase().includes(search.toLowerCase()) ||
        row.sender.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  const summary = useMemo(
    () => [
      { label: "New", value: messages.filter((row) => row.status === "new").length },
      { label: "Open", value: messages.filter((row) => row.status === "open").length },
      { label: "Resolved", value: messages.filter((row) => row.status === "resolved").length },
      { label: "Avg response", value: "14m" }
    ],
    []
  );

  return (
    <div className="page message-box-page">
      <div className="message-box-topbar">
        <div>
          <div className="message-box-title">Message box</div>
          <div className="message-box-path">Monitor / Jobs & Messaging / Message box</div>
        </div>
        <div className="message-box-actions">
          <button
            type="button"
            className="message-box-btn ghost"
            onClick={() =>
              navigate(
                "/measure/insights/reports?category=Notification%20Reports&report=Overview%20Notification%20Report"
              )
            }
          >
            View notification reports
          </button>
          <button type="button" className="message-box-btn ghost">
            Export inbox
          </button>
          <button
            type="button"
            className="message-box-btn"
            data-modal="Create message"
            data-modal-sub="Compose a message for dispatch or support."
            data-modal-fields="Recipient|Subject|Message"
          >
            Create message
          </button>
        </div>
      </div>

      <section className="message-box-summary">
        {summary.map((card) => (
          <div key={card.label} className="message-box-summary-card">
            <div className="message-box-summary-label">{card.label}</div>
            <div className="message-box-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="message-box-layout">
        <aside className="message-box-panel">
          <div className="message-box-panel-header">
            <div>
              <div className="message-box-panel-title">Queues</div>
              <div className="message-box-panel-sub">Worklists and automated routing queues.</div>
            </div>
          </div>
          <div className="message-box-queue-list">
            {queues.map((queue) => (
              <button
                key={queue.id}
                type="button"
                className={`message-box-queue ${activeQueue === queue.label ? "active" : ""}`}
                onClick={() => setActiveQueue(queue.label)}
              >
                <span>{queue.label}</span>
                <span className="message-box-queue-pill">{queue.count}</span>
              </button>
            ))}
          </div>
          <div className="message-box-panel-footer">
            <button type="button" className="message-box-link">
              Manage queues
            </button>
          </div>
        </aside>

        <div className="message-box-panel">
          <div className="message-box-panel-header">
            <div>
              <div className="message-box-panel-title">Inbox</div>
              <div className="message-box-panel-sub">Showing messages in {activeQueue} queue.</div>
            </div>
            <div className="message-box-filter-row">
              <input
                className="message-box-search"
                placeholder="Search messages"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="message-box-select"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All status</option>
                <option value="new">New</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>
          <div className="message-box-table">
            <div className="message-box-row message-box-row-head">
              <span>Channel</span>
              <span>Subject</span>
              <span>Sender</span>
              <span>Received</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {filteredMessages.length === 0 ? (
              <div className="message-box-empty">No messages match the filters.</div>
            ) : (
              filteredMessages.map((row) => (
                <div key={row.id} className="message-box-row">
                  <span className="message-box-channel">{row.channel}</span>
                  <span className="message-box-subject">{row.subject}</span>
                  <span>{row.sender}</span>
                  <span>{row.received}</span>
                  <span className={`message-box-pill ${row.status}`}>{row.status}</span>
                  <span className="message-box-actions-col">
                    <button type="button" className="message-box-action">Open</button>
                    <button type="button" className="message-box-action ghost">Assign</button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
