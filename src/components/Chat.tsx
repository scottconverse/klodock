import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Loader2, AlertCircle, RefreshCw, X, Activity } from "lucide-react";
import { readConfig, startDaemon } from "@/lib/tauri";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface ChatProps {
  /** If true, render as a full page. If false, render as an overlay panel. */
  fullPage?: boolean;
  /** Called when the user closes the chat (overlay mode only). */
  onClose?: () => void;
}

const WS_PROTOCOL_VERSION = 3;
const CLIENT_ID = "openclaw-control-ui";
const CLIENT_MODE = "ui";
const ALL_SCOPES = [
  "operator.admin",
  "operator.read",
  "operator.write",
  "operator.approvals",
  "operator.pairing",
];

const STORAGE_KEY = "klodock-chat-history";

function loadChatHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((m: ChatMessage) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch { return []; }
}

function saveChatHistory(messages: ChatMessage[]) {
  try {
    // Keep last 100 messages
    const trimmed = messages.slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* localStorage full or unavailable */ }
}

export function Chat({ fullPage = false, onClose }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadChatHistory);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [startingAgent, setStartingAgent] = useState(false);
  const [isOllamaProvider, setIsOllamaProvider] = useState(false);
  const [streamingElapsed, setStreamingElapsed] = useState(0);
  const [firstOllamaQuery, setFirstOllamaQuery] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionKeyRef = useRef(`klodock-${Date.now()}`);
  const streamBufferRef = useRef("");
  const streamMsgIdRef = useRef<string | null>(null);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) saveChatHistory(messages);
  }, [messages]);

  // Detect if using Ollama provider
  useEffect(() => {
    readConfig().then((cfg) => {
      const model = (cfg as Record<string, unknown>)?.agents as Record<string, unknown>;
      const primary = (model?.defaults as Record<string, unknown>)?.model as Record<string, string>;
      if (primary?.primary?.startsWith("ollama/")) {
        setIsOllamaProvider(true);
      }
    }).catch(() => {});
  }, []);

  // Elapsed timer while streaming (shows user it's not frozen)
  useEffect(() => {
    if (!streaming) { setStreamingElapsed(0); return; }
    const interval = setInterval(() => setStreamingElapsed(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [streaming]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Connect to gateway WebSocket
  const connect = useCallback(async () => {
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnecting(true);
    setConnected(false);
    setError(null);

    try {
      // Read the gateway password from config
      const config = await readConfig();
      const gw = config.gateway as Record<string, unknown> | undefined;
      const auth = gw?.auth as Record<string, string> | undefined;
      const password = auth?.password;
      const port = (gw?.port as number) ?? 18789;

      if (!password) {
        setError("No gateway password configured. Check Settings.");
        setConnecting(false);
        return;
      }

      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Wait for challenge
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        // Handle challenge → send connect
        if (msg.type === "event" && msg.event === "connect.challenge") {
          ws.send(
            JSON.stringify({
              type: "req",
              id: "connect-1",
              method: "connect",
              params: {
                minProtocol: WS_PROTOCOL_VERSION,
                maxProtocol: WS_PROTOCOL_VERSION,
                auth: { password },
                client: {
                  id: CLIENT_ID,
                  version: "1.3.0",
                  platform: "web",
                  mode: CLIENT_MODE,
                },
                scopes: ALL_SCOPES,
              },
            })
          );
        }

        // Handle connect response
        if (msg.type === "res" && msg.id === "connect-1") {
          if (msg.ok) {
            setConnected(true);
            setConnecting(false);
          } else {
            const rawError = msg.error?.message || "Connection failed";
            // Translate technical errors to user-friendly messages
            const userError = rawError.includes("origin not allowed")
              ? "Couldn't connect — try restarting your agent from the Overview page."
              : rawError.includes("unauthorized") || rawError.includes("password")
                ? "Connection denied — your agent may need to be restarted."
                : rawError.includes("protocol mismatch")
                  ? "Version mismatch — try updating KloDock."
                  : rawError;
            setError(userError);
            setConnecting(false);
          }
        }

        // Handle chat.send response
        if (msg.type === "res" && msg.id?.startsWith("chat-")) {
          if (!msg.ok) {
            const rawError = msg.error?.message || "Couldn't send message";
            const userError = rawError.includes("missing scope")
              ? "Couldn't send — try restarting your agent from the Overview page."
              : rawError;
            setError(userError);
            setStreaming(false);
          }
        }

        // Handle agent events (the actual format OpenClaw gateway uses)
        if (msg.type === "event" && msg.event === "agent") {
          const p = msg.payload;
          const stream = p?.stream;
          const data = p?.data;

          // Assistant stream — text field has cumulative response
          if (stream === "assistant" && data?.text) {
            if (streamMsgIdRef.current) {
              const fullText = data.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgIdRef.current ? { ...m, content: fullText } : m
                )
              );
            }
          }

          // Content stream — alternative format
          if (stream === "content" && data?.type === "text" && data?.text) {
            streamBufferRef.current += data.text;
            if (streamMsgIdRef.current) {
              const text = streamBufferRef.current;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgIdRef.current ? { ...m, content: text } : m
                )
              );
            }
          }

          // Lifecycle end — agent finished
          if (stream === "lifecycle" && data?.phase === "end") {
            if (streaming) {
              setStreaming(false);
              setFirstOllamaQuery(false);
              streamMsgIdRef.current = null;
              streamBufferRef.current = "";
            }
          }

          // Error during agent run
          if (stream === "lifecycle" && data?.phase === "error") {
            const errMsg = data?.error || data?.message || "Agent encountered an error";
            if (streamMsgIdRef.current) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgIdRef.current ? { ...m, content: `Error: ${errMsg}` } : m
                )
              );
            }
            setStreaming(false);
            streamMsgIdRef.current = null;
            streamBufferRef.current = "";
          }
        }

        // Also handle chat events (legacy/alternative format)
        if (msg.type === "event" && msg.event === "chat") {
          const p = msg.payload;
          if (p?.state === "streaming" || p?.state === "final") {
            const textParts = p.message?.content?.filter(
              (c: { type: string }) => c.type === "text"
            );
            const fullText = textParts?.map((c: { text: string }) => c.text).join("") || "";
            if (fullText && streamMsgIdRef.current) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgIdRef.current ? { ...m, content: fullText } : m
                )
              );
            }
            if (p.state === "final") {
              setStreaming(false);
              streamMsgIdRef.current = null;
              streamBufferRef.current = "";
            }
          }
        }

        // Handle session.message events (yet another format)
        if (msg.type === "event" && msg.event === "session.message") {
          const p = msg.payload;
          if (p?.role === "assistant" && p?.content) {
            const text = typeof p.content === "string"
              ? p.content
              : Array.isArray(p.content)
                ? p.content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("")
                : "";
            if (text && streamMsgIdRef.current) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgIdRef.current ? { ...m, content: text } : m
                )
              );
            }
          }
        }
      };

      ws.onerror = () => {
        setError("Connection lost. Is your agent running?");
        setConnected(false);
        setConnecting(false);
      };

      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect to agent");
      setConnecting(false);
    }
  }, []);

  const handleStartAgent = useCallback(async () => {
    setStartingAgent(true);
    setError(null);
    try {
      await startDaemon();
    } catch {
      // Daemon may already be running — that's fine, try connecting anyway
    }
    // Wait for gateway to be ready, then try connecting
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        await connect();
        break;
      } catch {
        // Keep trying
      }
    }
    setStartingAgent(false);
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  // Auto-focus input when agent finishes responding or connection established
  useEffect(() => {
    if (!streaming && connected) {
      // Small delay to ensure DOM is ready after state update
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [streaming, connected]);

  function sendMessage() {
    const text = input.trim();
    if (!text || !connected || streaming) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    // Add placeholder for assistant response
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);
    streamMsgIdRef.current = assistantId;
    streamBufferRef.current = "";

    // Send via WebSocket
    const chatId = `chat-${Date.now()}`;
    wsRef.current?.send(
      JSON.stringify({
        type: "req",
        id: chatId,
        method: "chat.send",
        params: {
          sessionKey: sessionKeyRef.current,
          message: text,
          idempotencyKey: crypto.randomUUID(),
        },
      })
    );

    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const containerClass = fullPage
    ? "flex flex-col h-full"
    : "flex flex-col h-[500px] w-[400px] rounded-xl border border-neutral-200 bg-white shadow-2xl overflow-hidden";

  return (
    <div className={containerClass} role="log" aria-label="Chat with your agent">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? "bg-success-500" : connecting ? "bg-warning-400 animate-pulse" : "bg-neutral-300"
            }`}
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold text-neutral-800">
            {connected ? "Agent Chat" : connecting ? "Connecting..." : "Disconnected"}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {!connected && !connecting && (
            <button
              type="button"
              onClick={connect}
              className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500"
              aria-label="Reconnect"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => { setMessages([]); localStorage.removeItem(STORAGE_KEY); }}
              className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400 text-xs"
              aria-label="Clear chat history"
              title="Clear chat"
            >
              Clear
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-error-50 border-b border-error-200 px-4 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-error-500 shrink-0" aria-hidden="true" />
          <p className="text-xs text-error-700 flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-error-400 hover:text-error-600"
            aria-label="Dismiss error"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {messages.length === 0 && connected && (
          <p className="text-center text-sm text-neutral-400 py-8">
            Send a message to start chatting with your agent.
          </p>
        )}

        {!connected && !connecting && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100">
              <Activity className="h-7 w-7 text-neutral-400" aria-hidden="true" />
            </div>
            <p className="text-sm text-neutral-500 text-center max-w-xs">
              Your agent isn't running. Start it to begin chatting.
            </p>
            <button
              type="button"
              onClick={handleStartAgent}
              disabled={startingAgent}
              className="
                inline-flex items-center gap-2 rounded-lg bg-primary-600
                px-5 py-2.5 text-sm font-medium text-white
                transition-colors hover:bg-primary-700
                disabled:opacity-50 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-primary-300
              "
              aria-label="Start your agent"
            >
              {startingAgent ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Activity className="h-4 w-4" aria-hidden="true" />
              )}
              {startingAgent ? "Starting..." : "Start Agent"}
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary-600 text-white rounded-br-md"
                  : "bg-neutral-100 text-neutral-800 rounded-bl-md"
              }`}
            >
              {msg.content || (
                <span className="flex flex-col gap-1 text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {isOllamaProvider && firstOllamaQuery && streamingElapsed < 5
                      ? "Loading AI model..."
                      : isOllamaProvider && firstOllamaQuery && streamingElapsed >= 5
                        ? `Loading AI model (${streamingElapsed}s)...`
                        : streamingElapsed >= 10
                          ? `Thinking (${streamingElapsed}s)...`
                          : "Thinking..."}
                  </span>
                  {isOllamaProvider && firstOllamaQuery && streamingElapsed >= 3 && (
                    <span className="text-[10px] text-neutral-300">
                      First response takes longer while the model loads into memory.
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-neutral-200 bg-white px-3 py-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? "Type a message..." : "Connecting..."}
            disabled={!connected || streaming}
            className="
              flex-1 rounded-lg border border-neutral-200 bg-neutral-50
              px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400
              focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            aria-label="Chat message input"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!connected || !input.trim() || streaming}
            className="
              flex h-9 w-9 shrink-0 items-center justify-center rounded-lg
              bg-primary-600 text-white transition-colors
              hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-primary-300
            "
            aria-label="Send message"
          >
            {streaming ? (
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
