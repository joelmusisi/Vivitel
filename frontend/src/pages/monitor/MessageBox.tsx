import { useCallback, useMemo, useState } from "react";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
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

export default function MessageBox() {
  const navigate = useNavigate();
  const [activeQueue, setActiveQueue] = useState("Inbox");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const messages: MessageRow[] = [];

  const queues: QueueRow[] = useMemo(
    () => [
      { id: "queue-1", label: "Inbox", count: 0 },
      { id: "queue-2", label: "Priority", count: 0 },
      { id: "queue-3", label: "Resolved", count: 0 },
      { id: "queue-4", label: "Escalations", count: 0 }
    ],
    []
  );

  const filteredMessages = useMemo(() => {
    return messages.filter((row) => {
      const matchesSearch =
        row.subject.toLowerCase().includes(search.toLowerCase()) ||
        row.sender.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [messages, search, statusFilter]);

  const hasActiveFilters = search.trim().length > 0 || statusFilter !== "all";

  const getMessageSortValue = useCallback((row: MessageRow, key: string) => {
    if (key === "channel") return row.channel;
    if (key === "subject") return row.subject;
    if (key === "sender") return row.sender;
    if (key === "received") return row.received;
    if (key === "status") return row.status;
    return "";
  }, []);
  const messageSort = useColumnSort({ rows: filteredMessages, getValue: getMessageSortValue });

  return (
    <div className="page message-box-page">
      <div className="message-box-topbar">
        <div>
          <div className="message-box-title">Message box</div>
          <div className="message-box-path">Track / Jobs & Messaging / Message box</div>
        </div>
        <div className="message-box-actions">
          <button
            type="button"
            className="message-box-btn ghost"
            onClick={() =>
              navigate(
                "/Analyze/insights/reports?category=Notification%20Reports&report=Overview%20Notification%20Report"
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
              Control queues
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
              <SortableColumnHeader as="span" label="Channel" {...messageSort.getHeaderProps("channel")} />
              <SortableColumnHeader as="span" label="Subject" {...messageSort.getHeaderProps("subject")} />
              <SortableColumnHeader as="span" label="Sender" {...messageSort.getHeaderProps("sender")} />
              <SortableColumnHeader as="span" label="Received" {...messageSort.getHeaderProps("received")} />
              <SortableColumnHeader as="span" label="Status" {...messageSort.getHeaderProps("status")} />
              <span>Actions</span>
            </div>
            {messageSort.sortedRows.length === 0 ? (
              <div className="message-box-empty">
                {hasActiveFilters ? "No messages match the filters." : "No records yet."}
              </div>
            ) : (
              messageSort.sortedRows.map((row) => (
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
