import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../index.css";

type ThreadRow = {
  id: string;
  name: string;
  members: number;
  lastMessage: string;
  unread: number;
  status: "active" | "muted";
};

type Message = {
  id: string;
  author: string;
  time: string;
  body: string;
  outbound?: boolean;
};

const threads: ThreadRow[] = [
  {
    id: "thr-1",
    name: "Dispatch - Northern Region",
    members: 8,
    lastMessage: "Driver 204 confirmed ETA update.",
    unread: 2,
    status: "active"
  },
  {
    id: "thr-2",
    name: "Workshop Updates",
    members: 5,
    lastMessage: "Parts order arriving 14:00.",
    unread: 0,
    status: "muted"
  },
  {
    id: "thr-3",
    name: "Route 17 - Live ops",
    members: 11,
    lastMessage: "Road closure: alternative path shared.",
    unread: 4,
    status: "active"
  }
];

const messages: Message[] = [
  { id: "m-1", author: "Dispatch", time: "09:42", body: "Morning team, any updates on Route 17?" },
  { id: "m-2", author: "Driver 105", time: "09:45", body: "Delayed 15 mins due to congestion.", outbound: true },
  { id: "m-3", author: "Dispatch", time: "09:47", body: "Copy that. Please send new ETA once clear." },
  { id: "m-4", author: "Driver 105", time: "09:50", body: "ETA updated to 10:25.", outbound: true }
];

export default function InstantMessaging() {
  const navigate = useNavigate();
  const [activeThread, setActiveThread] = useState(threads[0].id);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => thread.name.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

  const active = threads.find((thread) => thread.id === activeThread) ?? threads[0];

  return (
    <div className="page instant-page">
      <div className="instant-topbar">
        <div>
          <div className="instant-title">Instant messaging</div>
          <div className="instant-path">Monitor / Jobs & Messaging / Instant messaging</div>
        </div>
        <div className="instant-actions">
          <button
            type="button"
            className="instant-btn ghost"
            onClick={() =>
              navigate(
                "/measure/insights/reports?category=List%20Reports&report=Job%20Detail%20Report"
              )
            }
          >
            View job reports
          </button>
          <button
            type="button"
            className="instant-btn ghost"
            data-modal="Create group"
            data-modal-sub="Set group name and participants."
            data-modal-fields="Group name|Owner|Members"
          >
            New group
          </button>
          <button
            type="button"
            className="instant-btn"
            data-modal="Start conversation"
            data-modal-sub="Open a new dispatch conversation."
            data-modal-fields="Recipient|Topic|Priority"
          >
            Start conversation
          </button>
        </div>
      </div>

      <section className="instant-layout">
        <aside className="instant-panel">
          <div className="instant-panel-header">
            <div>
              <div className="instant-panel-title">Threads</div>
              <div className="instant-panel-sub">Active teams & routed channels.</div>
            </div>
            <button type="button" className="instant-link">Manage</button>
          </div>
          <input
            className="instant-search"
            placeholder="Search threads"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="instant-thread-list">
            {filteredThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`instant-thread ${activeThread === thread.id ? "active" : ""}`}
                onClick={() => setActiveThread(thread.id)}
              >
                <div>
                  <div className="instant-thread-title">{thread.name}</div>
                  <div className="instant-thread-meta">{thread.members} members · {thread.lastMessage}</div>
                </div>
                <div className="instant-thread-badges">
                  {thread.unread > 0 && <span className="instant-badge">{thread.unread}</span>}
                  <span className={`instant-pill ${thread.status}`}>{thread.status}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className="instant-panel instant-chat">
          <div className="instant-panel-header">
            <div>
              <div className="instant-panel-title">{active.name}</div>
              <div className="instant-panel-sub">{active.members} members online · Routed via Dispatch</div>
            </div>
            <div className="instant-chat-actions">
              <button type="button" className="instant-link">Escalate</button>
              <button type="button" className="instant-link">Add member</button>
              <button type="button" className="instant-link">Export</button>
            </div>
          </div>

          <div className="instant-chat-body">
            {messages.map((msg) => (
              <div key={msg.id} className={`instant-bubble ${msg.outbound ? "out" : "in"}`}>
                <div className="instant-bubble-meta">
                  <span>{msg.author}</span>
                  <span>{msg.time}</span>
                </div>
                <div className="instant-bubble-text">{msg.body}</div>
              </div>
            ))}
          </div>

          <div className="instant-compose">
            <textarea
              placeholder="Write a quick update or tag a team…"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="instant-compose-actions">
              <button type="button" className="instant-btn ghost">Attach</button>
              <button type="button" className="instant-btn">Send message</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
