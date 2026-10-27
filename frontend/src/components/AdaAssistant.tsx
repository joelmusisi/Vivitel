import { useState } from "react";

export function AdaAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: "I'm Ada Assistant, your AI guide for the fleet management system. How can I help you today?"
    }
  ]);
  const [inputValue, setInputValue] = useState("");

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: inputValue }
    ]);

    // Simulate AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I'm here to help! This is a sample response. For more detailed assistance, please visit the help section." }
      ]);
    }, 500);

    setInputValue("");
  };

  return (
    <>
      {/* Header Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="ada-header-button"
        title="Open Ada Assistant"
        aria-label="Ada Assistant"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          <circle cx="9" cy="10" r="1"></circle>
          <circle cx="12" cy="10" r="1"></circle>
          <circle cx="15" cy="10" r="1"></circle>
        </svg>
      </button>

      {/* Assistant Panel */}
      {isOpen && (
        <div className="ada-assistant-panel">
          <div className="ada-assistant-header">
            <div className="ada-assistant-title">
              <div className="ada-assistant-avatar">A</div>
              <div>
                <h3>Ada Assistant</h3>
                <p>AI powered guidance</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="ada-assistant-close"
              aria-label="Close Ada Assistant"
            >
              ✕
            </button>
          </div>

          <div className="ada-assistant-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`ada-message ada-message--${msg.role}`}>
                {msg.role === "assistant" && <div className="ada-message-icon">A</div>}
                <div className="ada-message-content">
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          <div className="ada-assistant-input-area">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendMessage();
              }}
              placeholder="Ask Ada anything..."
              className="ada-assistant-input"
            />
            <button
              onClick={handleSendMessage}
              className="ada-assistant-send"
              disabled={!inputValue.trim()}
              aria-label="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>

          <div className="ada-assistant-suggestions">
            <div className="ada-suggestions-label">Suggestions</div>
            <div className="ada-suggestions-grid">
              <button className="ada-suggestion-pill">Fleet Overview</button>
              <button className="ada-suggestion-pill">Asset Status</button>
              <button className="ada-suggestion-pill">Reports</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
