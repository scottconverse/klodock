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

export function Chat({ fullPage = false, onClose }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [startingAgent, setStartingAgent] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionKeyRef = useRef(`klodock-${Date.now()}`);
  const streamBufferRef = useRef("");
  const streamMsgIdRef = useRef<string | null>(null);

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
                  version: "1.2.0",
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
            setError(msg.error?.message || "Connection failed");
            setConnecting(false);
          }
        }

        // Handle chat.send response
        if (msg.type === "res" && msg.id?.startsWith("chat-")) {
          if (!msg.ok) {
            setError(msg.error?.message || "Couldn't send message");
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
