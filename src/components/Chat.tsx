import { useEffect, useRef, useState } from "react";
import { Send, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatProps {
  fullPage?: boolean;
  onClose?: () => void;
}

const STORAGE_KEY = "klodock-chat-history";

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((m: ChatMessage) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  } catch {
    return [];
  }
}

function saveHistory(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50)));
  } catch {}
}

export function Chat({ fullPage = false }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Save to localStorage
  useEffect(() => {
    if (messages.length > 0) saveHistory(messages);
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Auto-focus after response
  useEffect(() => {
    if (!sending) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [sending]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setInput("");
    setSending(true);

    // Add user message
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    // Add placeholder for assistant
    const assistantId = `a-${Date.now()}`;
    const placeholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, placeholder]);

    try {
      const response = await invoke<string>("chat_send_message", {
        message: text,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: response } : m
        )
      );
    } catch (e) {
      const errMsg =
        e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `⚠️ ${errMsg}` }
            : m
        )
      );
      setError(errMsg);
    } finally {
      setSending(false);
    }
  }

  function clearChat() {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const height = fullPage ? "h-[calc(100vh-64px)]" : "h-[500px]";

  return (
    <div className={`flex flex-col ${height} bg-white`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-800">
          Agent Chat
        </h3>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            aria-label="Clear chat history"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="flex items-center gap-2 border-b border-error-200 bg-error-50 px-4 py-2 text-sm text-error-700"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-error-400 hover:text-error-600"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        role="log"
        aria-label="Chat messages"
      >
        {messages.length === 0 && (
          <p className="text-center text-sm text-neutral-400 mt-8">
            Send a message to start chatting with your agent.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-primary-600 text-white rounded-br-md"
                  : "bg-neutral-100 text-neutral-800 rounded-bl-md"
              }`}
            >
              {msg.content || (
                <span className="flex items-center gap-1.5 text-neutral-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Thinking...
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sending ? "Waiting for response..." : "Type a message..."}
            disabled={sending}
            className="
              flex-1 rounded-xl border border-neutral-300 px-4 py-2.5
              text-sm text-neutral-800 placeholder-neutral-400
              focus:border-primary-500 focus:ring-1 focus:ring-primary-500
              focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400
            "
            aria-label="Chat message input"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="
              flex h-10 w-10 items-center justify-center rounded-xl
              bg-primary-600 text-white transition-colors
              hover:bg-primary-700 disabled:bg-primary-300
              disabled:cursor-not-allowed
              focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-primary-500
            "
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
