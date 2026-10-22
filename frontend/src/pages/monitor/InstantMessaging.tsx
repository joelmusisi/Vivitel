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

export default function InstantMessaging() {
  const navigate = useNavigate();
  const threads: ThreadRow[] = [];
  const messages: Message[] = [];
  const [activeThread, setActiveThread] = useState("");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => thread.name.toLowerCase().includes(search.toLowerCase()));
  }, [threads, search]);

  const active = threads.find((thread) => thread.id === activeThread) ?? null;
  const hasActiveFilters = search.trim().length > 0;

  return (
    <div className="page instant-page">
      <div className="instant-topbar">
        <div>
          <div className="instant-title">Instant messaging</div>
          <div className="instant-path">Track / Jobs & Messaging / Instant messaging</div>
        </div>
        <div className="instant-actions">
          <button
            type="button"
            className="instant-btn ghost"
            onClick={() =>
              navigate(
                "/Analyze/insights/reports?category=List%20Reports&report=Job%20Detail%20Report"
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
            <button type="button" className="instant-link">Control</button>
          </div>
          <input
            className="instant-search"
            placeholder="Search threads"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="instant-thread-list">
            {filteredThreads.length === 0 ? (
              <div className="instant-empty">
                {hasActiveFilters ? "No threads match your search." : "No records yet."}
              </div>
            ) : (
              filteredThreads.map((thread) => (
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
              ))
            )}
          </div>
        </aside>

        <div className="instant-panel instant-chat">
          <div className="instant-panel-header">
            <div>
              <div className="instant-panel-title">{active?.name ?? "No conversation selected"}</div>
              <div className="instant-panel-sub">
                {active
                  ? `${active.members} members online · Routed via Dispatch`
                  : "Select a thread or start a new conversation."}
              </div>
            </div>
            <div className="instant-chat-actions">
              <button type="button" className="instant-link" disabled={!active}>Escalate</button>
              <button type="button" className="instant-link" disabled={!active}>Add member</button>
              <button type="button" className="instant-link" disabled={!active}>Export</button>
            </div>
          </div>

          <div className="instant-chat-body">
            {!active || messages.length === 0 ? (
              <div className="instant-empty">No messages yet.</div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`instant-bubble ${msg.outbound ? "out" : "in"}`}>
                  <div className="instant-bubble-meta">
                    <span>{msg.author}</span>
                    <span>{msg.time}</span>
                  </div>
                  <div className="instant-bubble-text">{msg.body}</div>
                </div>
              ))
            )}
          </div>

          <div className="instant-compose">
            <textarea
              placeholder="Write a quick update or tag a team…"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={!active}
            />
            <div className="instant-compose-actions">
              <button type="button" className="instant-btn ghost" disabled={!active}>Attach</button>
              <button type="button" className="instant-btn" disabled={!active || !note.trim()}>
                Send message
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
