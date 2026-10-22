import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SortableColumnHeader from "../components/SortableColumnHeader";
import { useColumnSort } from "../hooks/useColumnSort";
import "../index.css";
import {
  ChatConversation,
  getSupportAgents,
  getSupportChatInbox,
  isOwnSupportPrincipal,
  postSupportAgentHeartbeat,
  readPrincipalIdentity,
  type SupportAgent
} from "../utils/api";
import { getSharedRealtimeClient, type RealtimeWsClient } from "../utils/realtimeWs";
import { useLocation, useNavigate } from "react-router-dom";

const AGENT_CATEGORIES = [
  "Sales",
  "Technical Support Telematics",
  "Support Vide Telematics",
  "Admins",
  "Support Deliver",
  "Support Maintenace"
] as const;

export default function FleetOverview() {
  const [agentCategories, setAgentCategories] = useState<Record<string, SupportAgent[]>>({});
  const [agentError, setAgentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inbox, setInbox] = useState<ChatConversation[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [wsSupportOpen, setWsSupportOpen] = useState(false);
  const wsSupportOpenRef = useRef(false);
  const agentsPollTimer = useRef<number | null>(null);
  const wsClientRef = useRef<RealtimeWsClient | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isSupportAgent = isOwnSupportPrincipal();
  const principal = readPrincipalIdentity();

  const supportRoster = useMemo(() => {
    const preferred = [
      ...(agentCategories["Technical Support Telematics"] ?? []),
      ...(agentCategories.Admins ?? [])
    ];
    const byId = new Map<string, SupportAgent>();
    for (const agent of preferred) {
      const id = String(agent?.id ?? "").trim();
      if (!id) continue;
      byId.set(id, agent);
    }
    // Include any other categories in case Own Support was filed elsewhere.
    for (const list of Object.values(agentCategories)) {
      for (const agent of list ?? []) {
        const id = String(agent?.id ?? "").trim();
        if (!id || byId.has(id)) continue;
        byId.set(id, agent);
      }
    }
    return Array.from(byId.values()).sort((left, right) =>
      String(left.name ?? "").localeCompare(String(right.name ?? ""))
    );
  }, [agentCategories]);

  const getInboxSortValue = useCallback((conversation: ChatConversation, key: string) => {
    const last = conversation.messages[conversation.messages.length - 1];
    if (key === "customer") return conversation.user?.name || conversation.user?.email || "Customer";
    if (key === "lastMessage") return last?.text ?? "";
    if (key === "assignedAgent") return conversation.assignedAgent?.name ?? "Unassigned";
    return "";
  }, []);
  const inboxSort = useColumnSort({ rows: inbox, getValue: getInboxSortValue });

  const getSupportAgentSortValue = useCallback((agent: SupportAgent, key: string) => {
    const isYou = String(agent.id) === principal.userId;
    const online = Boolean(agent.online) || (isYou && wsSupportOpen);
    if (key === "status") return online ? "Online" : "Offline";
    if (key === "agent") return String(agent.name ?? "");
    if (key === "category") return String(agent.category ?? "");
    return "";
  }, [principal.userId, wsSupportOpen]);
  const supportRosterSort = useColumnSort({ rows: supportRoster, getValue: getSupportAgentSortValue });

  const loadAgents = async () => {
    setLoading(true);
    setAgentError(null);
    const response = await getSupportAgents();
    if (!response) {
      setAgentError("Unable to load live agents.");
      setLoading(false);
      return;
    }
    setAgentCategories(response.categories ?? {});
    setLoading(false);
  };

  const loadInbox = async () => {
    if (!isSupportAgent) return;
    setInboxLoading(true);
    const conversations = await getSupportChatInbox(50);
    setInbox(conversations);
    setInboxLoading(false);
  };

  useEffect(() => {
    const client = getSharedRealtimeClient();
    wsClientRef.current = client;
    const unsub = client.subscribe({
      channels: ["support"],
      userId: principal.userId,
      onStatus: (status) => {
        const open = status === "open";
        wsSupportOpenRef.current = open;
        setWsSupportOpen(open);
      },
      onMessage: (message) => {
        if (message.type !== "support.snapshot") return;
        const payload = (message.payload ?? {}) as {
          categories?: Record<string, SupportAgent[]>;
          conversations?: ChatConversation[];
        };
        if (payload.categories) {
          setAgentCategories(payload.categories);
          setAgentError(null);
          setLoading(false);
        }
        if (isSupportAgent && Array.isArray(payload.conversations)) {
          setInbox(payload.conversations);
          setInboxLoading(false);
        }
      }
    });
    return () => {
      unsub();
      wsClientRef.current = null;
      wsSupportOpenRef.current = false;
      setWsSupportOpen(false);
    };
  }, [isSupportAgent, principal.userId]);

  useEffect(() => {
    void loadAgents();
    void loadInbox();
    if (agentsPollTimer.current) window.clearInterval(agentsPollTimer.current);
    agentsPollTimer.current = window.setInterval(() => {
      if (wsSupportOpenRef.current) return;
      void loadAgents();
      void loadInbox();
    }, 10_000);
    return () => {
      if (agentsPollTimer.current) window.clearInterval(agentsPollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupportAgent, wsSupportOpen]);

  useEffect(() => {
    if (!isSupportAgent || !principal.userId) return;
    const sendHeartbeat = () => {
      if (wsSupportOpenRef.current && wsClientRef.current) {
        wsClientRef.current.heartbeat(principal.userId);
        return;
      }
      void postSupportAgentHeartbeat(principal.userId);
    };
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 30_000);
    return () => window.clearInterval(timer);
  }, [isSupportAgent, principal.userId, wsSupportOpen]);

  const startChatWithAgent = (agent: { id: string; name: string; category: string }) => {
    try {
      const payload = {
        id: String(agent.id ?? "").trim(),
        name: String(agent.name ?? "").trim(),
        category: String(agent.category ?? "").trim()
      };
      if (payload.id && payload.name) {
        window.localStorage.setItem("vivi.chat.agent", JSON.stringify(payload));
        window.localStorage.removeItem("vivi.chat.conversationId");
      }
    } catch {
      // ignore
    }

    const sp = new URLSearchParams(location.search);
    sp.set("chat", "1");
    sp.set("agentId", String(agent.id ?? ""));
    sp.set("agentName", String(agent.name ?? ""));
    sp.set("agentCategory", String(agent.category ?? ""));
    navigate(`${location.pathname}?${sp.toString()}`, { replace: true });
  };

  const openSupportConversation = (conversationId: string) => {
    try {
      window.localStorage.setItem("vivi.chat.conversationId", conversationId);
    } catch {
      // ignore
    }
    const sp = new URLSearchParams(location.search);
    sp.set("chat", "1");
    navigate(`${location.pathname}?${sp.toString()}`, { replace: true });
  };

  return (
    <main className="page">
      <div className="overview-header">
        <div>
          <div className="overview-eyebrow">Command Center</div>
          <h1>{isSupportAgent ? "Support desk" : "Live agents"}</h1>
          <p className="overview-lead">
            {isSupportAgent
              ? "Respond to open customer conversations and see who else from Own Support / Admin is online. Your status is shown as online while this page is open."
              : "Choose a category and start a chat with a live agent. Status turns green when the agent is online."}
            {wsSupportOpen ? " · Live via websocket" : ""}
          </p>
        </div>
        <div className="overview-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              void loadAgents();
              void loadInbox();
            }}
            disabled={loading || inboxLoading}
          >
            {loading || inboxLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {isSupportAgent && (
        <section className="panel overview-card command-inbox-card">
          <div className="overview-card-header">
            <h3>Open conversations</h3>
            <span>{inbox.length} active</span>
          </div>
          <div className="overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "1.2fr 1.4fr 1fr 0.8fr" }}>
              <SortableColumnHeader as="span" label="Customer" {...inboxSort.getHeaderProps("customer")} />
              <SortableColumnHeader as="span" label="Last message" {...inboxSort.getHeaderProps("lastMessage")} />
              <SortableColumnHeader as="span" label="Assigned agent" {...inboxSort.getHeaderProps("assignedAgent")} />
              <span>Open</span>
            </div>
            {inboxLoading ? (
              <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>
                <span style={{ color: "#64748b" }}>Loading conversations...</span>
              </div>
            ) : inboxSort.sortedRows.length ? (
              inboxSort.sortedRows.map((conversation) => {
                const last = conversation.messages[conversation.messages.length - 1];
                return (
                  <div key={conversation.id} className="overview-row" style={{ gridTemplateColumns: "1.2fr 1.4fr 1fr 0.8fr" }}>
                    <span style={{ fontWeight: 700 }}>
                      {conversation.user?.name || conversation.user?.email || "Customer"}
                    </span>
                    <span style={{ color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {last?.text || "—"}
                    </span>
                    <span>{conversation.assignedAgent?.name || "Unassigned"}</span>
                    <span>
                      <button type="button" className="btn ghost" onClick={() => openSupportConversation(conversation.id)}>
                        Reply
                      </button>
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>
                <span style={{ color: "#64748b" }}>No open conversations right now.</span>
              </div>
            )}
          </div>
        </section>
      )}

      {isSupportAgent && (
        <section className="panel overview-card">
          <div className="overview-card-header">
            <h3>Own Support &amp; Admin agents</h3>
            <span>
              {supportRoster.filter((agent) => agent.online).length} online · {supportRoster.length} total
            </span>
          </div>
          <div className="overview-table">
            <div className="overview-row overview-head" style={{ gridTemplateColumns: "0.9fr 1.6fr 1.1fr 0.9fr" }}>
              <SortableColumnHeader as="span" label="Status" {...supportRosterSort.getHeaderProps("status")} />
              <SortableColumnHeader as="span" label="Agent" {...supportRosterSort.getHeaderProps("agent")} />
              <SortableColumnHeader as="span" label="Category" {...supportRosterSort.getHeaderProps("category")} />
              <span>Actions</span>
            </div>
            {loading && !supportRoster.length ? (
              <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>
                <span style={{ color: "#64748b" }}>Loading agents…</span>
              </div>
            ) : supportRosterSort.sortedRows.length ? (
              supportRosterSort.sortedRows.map((agent) => {
                const isYou = String(agent.id) === principal.userId;
                // While this page is open over websocket, treat the current agent as online immediately.
                const online = Boolean(agent.online) || (isYou && wsSupportOpen);
                return (
                  <div key={String(agent.id)} className="overview-row" style={{ gridTemplateColumns: "0.9fr 1.6fr 1.1fr 0.9fr" }}>
                    <span className={online ? "overview-pill online" : "overview-pill critical"}>
                      {online ? "Online" : "Offline"}
                    </span>
                    <span style={{ fontWeight: 800 }}>{String(agent.name ?? "")}</span>
                    <span>{String(agent.category ?? "")}</span>
                    <span style={{ color: "#64748b", fontWeight: 700 }}>{isYou ? "You" : "—"}</span>
                  </div>
                );
              })
            ) : (
              <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>
                <span style={{ color: "#64748b", whiteSpace: "normal" }}>
                  No Own Support or Admin agents found yet. Assign the Own Support role under Control / User admin / Users → Access.
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {agentError && (
        <div className="panel overview-empty">
          <h3>Unable to load agents</h3>
          <p>{agentError}</p>
        </div>
      )}

      {!isSupportAgent && (
        <section className="overview-grid">
          {AGENT_CATEGORIES.map((category) => {
            const list = agentCategories?.[category] ?? [];
            return (
              <div key={category} className="panel overview-card">
                <div className="overview-card-header">
                  <h3>{category}</h3>
                  <span>{Array.isArray(list) ? list.length : 0} agents</span>
                </div>

                <div className="overview-table">
                  <div className="overview-row overview-head" style={{ gridTemplateColumns: "0.9fr 1.6fr 0.9fr" }}>
                    <span>Status</span>
                    <span>Agent</span>
                    <span>Chat</span>
                  </div>
                  {Array.isArray(list) && list.length ? (
                    list.map((a) => {
                      const online = Boolean(a?.online);
                      return (
                        <div key={String(a.id)} className="overview-row" style={{ gridTemplateColumns: "0.9fr 1.6fr 0.9fr" }}>
                          <span className={online ? "overview-pill online" : "overview-pill critical"}>
                            {online ? "Online" : "Offline"}
                          </span>
                          <span style={{ fontWeight: 800 }}>{String(a?.name ?? "")}</span>
                          <span>
                            <button
                              type="button"
                              className="btn ghost"
                              disabled={!online}
                              onClick={() => startChatWithAgent({ id: String(a.id), name: String(a.name), category })}
                            >
                              Chat
                            </button>
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="overview-row" style={{ gridTemplateColumns: "1fr" }}>
                      <span style={{ color: "#64748b", whiteSpace: "normal" }}>No agents configured in this category.</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
