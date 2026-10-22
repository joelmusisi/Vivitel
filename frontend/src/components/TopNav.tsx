import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { TrackNav, ControlNav, AnalyzeNav, DeliverNav } from "../navData";
import DropdownMenu from "./DropdownMenu";
import { AdaAssistant } from "./AdaAssistant";
import ViviLogo from "./ViviLogo";
import ThemeToggleButton from "./ThemeToggleButton";
import { ChatConversation, endChatConversation, getChatConversation, getCurrentAccountLabel, getSupportAgents, isImpersonating, isOwnSupportPrincipal, postSupportAgentHeartbeat, readPrincipalIdentity, sendChatMessage, sendSupportChatReply, setStoredApiKey, stopImpersonationSession, SupportAgent } from "../utils/api";
import { rememberPostLoginPath } from "../utils/phoneMode";
import { getSharedRealtimeClient } from "../utils/realtimeWs";
import { isStreamsBackgroundEnabled, startStreamsBackground } from "../utils/streamBackground";
import { showToast } from "../utils/toast";
import { clearSessionClientState, readActiveTenantId } from "../utils/tenantContext";
import {
  clearActiveAssetPrefs,
  clearUserPref,
  USER_PREF_KEYS
} from "../utils/userAppPrefs";

export function TopNav() {
  const [openMenu, setOpenMenu] = useState<"Track" | "Control" | "Analyze" | "Deliver" | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatConversation, setChatConversation] = useState<ChatConversation | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatEnded, setChatEnded] = useState(false);
  const [chatName, setChatName] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("vivi.chat.name") ?? ""
  );
  const [chatEmail, setChatEmail] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("vivi.chat.email") ?? ""
  );
  const [chatConversationId, setChatConversationId] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("vivi.chat.conversationId") ?? ""
  );
  const [accountLabel, setAccountLabel] = useState(() => getCurrentAccountLabel());
  const [impersonating, setImpersonating] = useState(() => isImpersonating());
  const [, setNavAccessStamp] = useState(0);
  const [chatAgent, setChatAgent] = useState<{ id: string; name: string; category: string } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("vivi.chat.agent") ?? "";
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.id || !parsed?.name) return null;
      return { id: String(parsed.id), name: String(parsed.name), category: String(parsed.category ?? "") };
    } catch {
      return null;
    }
  });
  const [onlineAgents, setOnlineAgents] = useState<SupportAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const isSupportAgent = isOwnSupportPrincipal();
  const principalIdentity = readPrincipalIdentity();

  useEffect(() => {
    const syncAccountLabel = () => {
      setAccountLabel(getCurrentAccountLabel());
      setImpersonating(isImpersonating());
      setNavAccessStamp((value) => value + 1);
    };
    syncAccountLabel();
    window.addEventListener("vivi:authchange", syncAccountLabel);
    window.addEventListener("vivi:orgchange", syncAccountLabel);
    return () => {
      window.removeEventListener("vivi:authchange", syncAccountLabel);
      window.removeEventListener("vivi:orgchange", syncAccountLabel);
    };
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (openMenu && navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
      if (quickMenuRef.current && !quickMenuRef.current.contains(event.target as Node)) {
        setQuickMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setQuickMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!showChat) return;
    if (!chatConversationId) return;
    let active = true;
    setChatLoading(true);
    void getChatConversation(chatConversationId).then((conversation) => {
      if (!active) return;
      if (conversation) setChatConversation(conversation);
      setChatLoading(false);
    });
    return () => {
      active = false;
    };
  }, [showChat, chatConversationId]);

  useEffect(() => {
    if (isStreamsBackgroundEnabled()) startStreamsBackground();
  }, []);

  useEffect(() => {
    if (!showChat || !chatConversationId || chatEnded) return;
    let active = true;
    let wsOpen = false;
    const client = getSharedRealtimeClient();
    const unsub = client.subscribe({
      channels: ["support"],
      userId: principalIdentity.userId,
      onStatus: (status) => {
        wsOpen = status === "open";
        if (wsOpen) client.watchConversation(chatConversationId);
      },
      onMessage: (message) => {
        if (!active) return;
        if (message.type === "support.conversation") {
          const conversation = message.payload as ChatConversation;
          if (conversation?.id === chatConversationId) {
            setChatConversation(conversation);
            setChatEnded(conversation.status === "closed");
          }
          return;
        }
        if (message.type === "support.snapshot") {
          const conversations = (message.payload as any)?.conversations;
          if (!Array.isArray(conversations)) return;
          const match = conversations.find((row: ChatConversation) => row.id === chatConversationId);
          if (match) {
            setChatConversation(match);
            setChatEnded(match.status === "closed");
          }
        }
      }
    });
    client.watchConversation(chatConversationId);

    const poll = () => {
      if (wsOpen) return;
      void getChatConversation(chatConversationId).then((conversation) => {
        if (!active || !conversation) return;
        setChatConversation(conversation);
        setChatEnded(conversation.status === "closed");
      });
    };
    const timer = window.setInterval(poll, 4000);
    return () => {
      active = false;
      unsub();
      window.clearInterval(timer);
    };
  }, [showChat, chatConversationId, chatEnded, principalIdentity.userId]);

  useEffect(() => {
    if (!showChat || isSupportAgent) return;
    let active = true;
    setAgentsLoading(true);
    void getSupportAgents().then((response) => {
      if (!active) return;
      const flat: SupportAgent[] = [];
      const categories = response?.categories ?? {};
      for (const list of Object.values(categories)) {
        if (!Array.isArray(list)) continue;
        for (const agent of list) {
          if (agent?.online && agent?.id && agent?.name) flat.push(agent);
        }
      }
      flat.sort((a, b) => a.name.localeCompare(b.name));
      setOnlineAgents(flat);
      setAgentsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [showChat, isSupportAgent]);

  useEffect(() => {
    if (!showChat || !isSupportAgent) return;
    const userId = principalIdentity.userId;
    if (!userId) return;
    void postSupportAgentHeartbeat(userId);
    const timer = window.setInterval(() => {
      void postSupportAgentHeartbeat(userId);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [showChat, isSupportAgent, principalIdentity.userId]);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const shouldOpen = sp.get("chat") === "1";
    if (!shouldOpen) return;

    const agentId = String(sp.get("agentId") ?? "").trim();
    const agentName = String(sp.get("agentName") ?? "").trim();
    const agentCategory = String(sp.get("agentCategory") ?? "").trim();
    if (agentId && agentName) {
      const nextAgent = { id: agentId, name: agentName, category: agentCategory };
      setChatAgent(nextAgent);
      try {
        window.localStorage.setItem("vivi.chat.agent", JSON.stringify(nextAgent));
      } catch {
        // ignore
      }
    }

    setShowChat(true);
    sp.delete("chat");
    sp.delete("agentId");
    sp.delete("agentName");
    sp.delete("agentCategory");
    const next = sp.toString();
    navigate(next ? `${location.pathname}?${next}` : location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    let conversation: ChatConversation | null = null;
    if (isSupportAgent && chatConversationId) {
      conversation = await sendSupportChatReply({
        conversationId: chatConversationId,
        message: chatInput.trim(),
        agentId: principalIdentity.userId || undefined,
        agentName: principalIdentity.name || undefined
      });
    } else {
      conversation = await sendChatMessage({
        conversationId: chatConversationId || undefined,
        message: chatInput.trim(),
        userName: chatName || undefined,
        userEmail: chatEmail || undefined,
        agentId: chatAgent?.id || undefined,
        agentName: chatAgent?.name || undefined,
        agentCategory: chatAgent?.category || undefined
      });
    }
    if (conversation) {
      setChatConversation(conversation);
      setChatConversationId(conversation.id);
      if (typeof window !== "undefined") {
        localStorage.setItem("vivi.chat.conversationId", conversation.id);
      }
      setChatEnded(conversation.status === "closed");
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("vivi.chat.name", chatName);
      localStorage.setItem("vivi.chat.email", chatEmail);
    }
    setChatInput("");
    setChatLoading(false);
  };

  const handleSelectAgent = (agentId: string) => {
    const selected = onlineAgents.find((agent) => agent.id === agentId) ?? null;
    if (!selected) return;
    const nextAgent = { id: selected.id, name: selected.name, category: selected.category };
    setChatAgent(nextAgent);
    try {
      window.localStorage.setItem("vivi.chat.agent", JSON.stringify(nextAgent));
    } catch {
      // ignore
    }
  };

  const handleEndChat = async () => {
    if (!chatConversationId) return;
    setChatLoading(true);
    const ended = await endChatConversation(chatConversationId);
    if (ended) {
      setChatEnded(true);
      setChatConversation(null);
      setChatConversationId("");
      if (typeof window !== "undefined") {
        localStorage.removeItem("vivi.chat.conversationId");
      }
    }
    setChatLoading(false);
  };

  const toggleMenu = (menu: "Track" | "Control" | "Analyze" | "Deliver") => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  const currentSection = location.pathname.startsWith("/Track")
    ? "Track"
    : location.pathname.startsWith("/Control")
      ? "Control"
      : location.pathname.startsWith("/Analyze")
        ? "Analyze"
        : location.pathname.startsWith("/Deliver")
          ? "Deliver"
          : null;

  const handleLogout = () => {
    try {
      rememberPostLoginPath();
      const previousTenantId = readActiveTenantId();
      // Wipe site/tenant/session data before clearing the key so the next login
      // cannot paint leftover UI even if navigation is client-side only.
      clearSessionClientState(previousTenantId);
      clearUserPref(USER_PREF_KEYS.contextType);
      clearUserPref(USER_PREF_KEYS.contextName);
      clearActiveAssetPrefs(previousTenantId);
      setStoredApiKey("");
      if (typeof window !== "undefined") {
        // If this build has a baked-in VITE_API_KEY, mark the user as explicitly logged out
        // so the app doesn't instantly re-auth on refresh.
        window.localStorage.setItem("vivi.apiKey.disabled", "true");
      }
      setChatConversation(null);
      setChatConversationId("");
      setShowChat(false);
    } finally {
      // Force a full reload so App() recomputes `authed` from storage.
      if (typeof window !== "undefined") window.location.assign("/login");
      else navigate("/login");
    }
  };

  const handleStopImpersonation = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("vivi.org.dealers");
    }
    const result = await stopImpersonationSession();
    if (!result.ok) {
      showToast(result.error ?? "Could not restore the original session. You are still signed in.", "error");
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <nav className="topnav" ref={navRef}>
      <div className="brand">
        <ViviLogo />
      </div>

      <div className="topnav-links">
        <DropdownMenu
          label="TRACK"
          groups={TrackNav}
          isOpen={openMenu === "Track"}
          isCurrent={currentSection === "Track"}
          onToggle={() => toggleMenu("Track")}
          onItemSelect={() => setOpenMenu(null)}
        />

        <DropdownMenu
          label="CONTROL"
          groups={ControlNav}
          isOpen={openMenu === "Control"}
          isCurrent={currentSection === "Control"}
          onToggle={() => toggleMenu("Control")}
          onItemSelect={() => setOpenMenu(null)}
        />

        <DropdownMenu
          label="ANALYZE"
          groups={AnalyzeNav}
          isOpen={openMenu === "Analyze"}
          isCurrent={currentSection === "Analyze"}
          onToggle={() => toggleMenu("Analyze")}
          onItemSelect={() => setOpenMenu(null)}
        />

        <DropdownMenu
          label="DELIVER"
          groups={DeliverNav}
          isOpen={openMenu === "Deliver"}
          isCurrent={currentSection === "Deliver"}
          onToggle={() => toggleMenu("Deliver")}
          onItemSelect={() => setOpenMenu(null)}
        />
      </div>

      <div className="topnav-actions">
        {impersonating && (
          <button type="button" className="topnav-stop-impersonation" onClick={() => void handleStopImpersonation()}>
            Stop impersonating
          </button>
        )}
        <div className="topnav-icons-group" ref={quickMenuRef}>
          <button
            type="button"
            className="topnav-quick-toggle"
            aria-haspopup="true"
            aria-expanded={quickMenuOpen}
            aria-label="Quick actions"
            title="Quick actions"
            onClick={() => setQuickMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <rect x="3" y="3" width="8" height="8" rx="1.5" />
              <rect x="3" y="13" width="8" height="8" rx="1.5" />
              <rect x="13" y="13" width="8" height="8" rx="1.5" />
              <rect x="14.2" y="2.2" width="7" height="7" rx="1.5" transform="rotate(45 17.7 5.7)" />
            </svg>
          </button>
          <div className="topnav-user">Welcome {accountLabel || "User"}</div>
          {quickMenuOpen && (
          <div className="topnav-icons-row topnav-quick-menu">
            <button
              type="button"
              className="topnav-chat"
              onClick={() => setShowChat(true)}
              title="Chat with live agent"
            >
              <ChatIcon />
            </button>
            <AdaAssistant />
            <div className="icon-button" title="Favorite">
              <StarIcon />
            </div>
            <div
              className={`icon-button${location.pathname === "/" ? " is-current" : ""}`}
              title="Home"
              aria-current={location.pathname === "/" ? "page" : undefined}
              role="button"
              tabIndex={0}
              onClick={() => navigate("/")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate("/");
                }
              }}
            >
              <HomeIcon />
            </div>
            <div className="icon-button" title="Info">
              <InfoIcon />
            </div>
            <ThemeToggleButton compact className="topnav-theme-toggle" />
            <div
              className="icon-button"
              title="Power"
              role="button"
              tabIndex={0}
              onClick={handleLogout}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleLogout();
                }
              }}
            >
              <PowerIcon />
            </div>
          </div>
          )}
        </div>
      </div>
      {showChat && (
        <div className="chat-modal" role="dialog" aria-modal="true" aria-label="Live chat">
          <div className="chat-card">
            <div className="chat-header">
              <div>
                <div className="chat-title">Live support</div>
                <div className="chat-sub">
                  {chatAgent?.name ? `Agent: ${chatAgent.name}${chatAgent.category ? ` • ${chatAgent.category}` : ""}` : "We respond in a few minutes"}
                </div>
              </div>
              <button type="button" className="chat-close" onClick={() => setShowChat(false)}>
                ×
              </button>
            </div>
            <div className="chat-body">
              {!isSupportAgent && (
                <div className="chat-meta">
                  <label>
                    Support agent
                    <select
                      value={chatAgent?.id ?? ""}
                      onChange={(event) => handleSelectAgent(event.target.value)}
                      disabled={agentsLoading || chatEnded}
                    >
                      <option value="">
                        {agentsLoading ? "Loading online agents..." : "Select an online support agent"}
                      </option>
                      {onlineAgents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} ({agent.category})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Name
                    <input
                      type="text"
                      value={chatName}
                      onChange={(event) => setChatName(event.target.value)}
                      placeholder="Your name"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={chatEmail}
                      onChange={(event) => setChatEmail(event.target.value)}
                      placeholder="you@example.com"
                    />
                  </label>
                </div>
              )}
              {isSupportAgent && (
                <div className="chat-meta chat-meta--support">
                  <span>Replying as {principalIdentity.name || "Support agent"}</span>
                </div>
              )}
              <div className="chat-thread">
                {chatLoading && <div className="chat-status">Loading...</div>}
                {!chatLoading && (!chatConversation || chatConversation.messages.length === 0) && (
                  <div className="chat-status">Start a conversation with support.</div>
                )}
                {chatConversation?.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`chat-message chat-${message.role}`}
                  >
                    <div className="chat-bubble">
                      <div>{message.text}</div>
                      <span>{new Date(message.at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="chat-footer">
              <input
                type="text"
                placeholder={chatEnded ? "Chat ended" : isSupportAgent ? "Reply to customer" : "Type your message"}
                value={chatInput}
                disabled={chatEnded || (!isSupportAgent && onlineAgents.length > 0 && !chatAgent?.id)}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSendMessage();
                  }
                }}
              />
              <div className="chat-actions">
                <button
                  type="button"
                  className="chat-end"
                  onClick={handleEndChat}
                  disabled={!chatConversationId || chatEnded}
                >
                  End chat
                </button>
                <button
                  type="button"
                  className="chat-send"
                  onClick={handleSendMessage}
                  disabled={chatEnded || chatLoading}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

export default TopNav;

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.5l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.9-5.4 2.9 1-6-4.3-4.2 6-.9z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 01-1 1h-4v-5H9v5H5a1 1 0 01-1-1v-9.5z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 9v.5M11.5 11h1v5h-1z" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v8" />
      <path d="M7.5 5.5a8 8 0 1013 6.5 8 8 0 00-3-6.5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5h16v10H7l-3 3z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}
