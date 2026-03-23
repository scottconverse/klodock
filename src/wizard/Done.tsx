import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  PartyPopper,
  ArrowRight,
  MessageCircle,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  LayoutDashboard,
  Globe,
  ExternalLink,
} from "lucide-react";
import { startDaemon, onDaemonStatus, retrieveSecret, readSoul } from "@/lib/tauri";
import type { DaemonStatus } from "@/lib/types";

export function Done() {
  const navigate = useNavigate();
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus>({
    status: "starting",
  });
  const [configuredChannel, setConfiguredChannel] = useState<string | null>(
    null
  );
  const [retrying, setRetrying] = useState(false);
  const [agentName, setAgentName] = useState("Your agent");
  const [showGreeting, setShowGreeting] = useState(false);
  const mountedRef = useRef(true);

  // Read agent name from SOUL.md
  useEffect(() => {
    readSoul()
      .then((soul) => {
        const match = soul.match(/Name:\s*(.+)/i);
        if (match?.[1]?.trim()) {
          setAgentName(match[1].trim());
        }
      })
      .catch(() => {});
  }, []);

  // Show greeting bubble with a slight delay once running (for emotional impact)
  useEffect(() => {
    if (daemonStatus.status === "running" && !showGreeting) {
      const timer = setTimeout(() => {
        if (mountedRef.current) setShowGreeting(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [daemonStatus.status, showGreeting]);

  // Check which channel (if any) was configured
  useEffect(() => {
    mountedRef.current = true;

    async function detectChannel() {
      try {
        const tgToken = await retrieveSecret("TELEGRAM_BOT_TOKEN").catch(
          () => ""
        );
        if (tgToken) {
          if (mountedRef.current) setConfiguredChannel("Telegram");
          return;
        }
        const dcToken = await retrieveSecret("DISCORD_BOT_TOKEN").catch(
          () => ""
        );
        if (dcToken) {
          if (mountedRef.current) setConfiguredChannel("Discord");
          return;
        }
      } catch {
        // No channel configured
      }
    }

    detectChannel();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Start daemon and listen for status events
  useEffect(() => {
    mountedRef.current = true;
    let unlistenFn: (() => void) | null = null;

    async function init() {
      // Subscribe to daemon status events
      const unlisten = await onDaemonStatus((status) => {
        if (mountedRef.current) {
          setDaemonStatus(status);
        }
      });
      unlistenFn = unlisten;

      // Start the daemon with retries — on clean install, OpenClaw's first
      // run can take 30-60s as Node loads 500+ modules for the first time.
      const maxRetries = 3;
      const retryDelays = [0, 5000, 10000]; // 0s, 5s, 10s
      let lastError = "";
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (!mountedRef.current) break;
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, retryDelays[attempt]));
        }
        try {
          const result = await startDaemon();
          if (mountedRef.current) {
            setDaemonStatus(result);
          }
          lastError = "";
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Failed to start agent";
          console.warn(`Daemon start attempt ${attempt + 1}/${maxRetries} failed: ${lastError}`);
          // Show user-visible feedback during retries
          if (attempt < maxRetries - 1 && mountedRef.current) {
            setDaemonStatus({
              status: "starting",
              message: `Starting your agent (attempt ${attempt + 2} of ${maxRetries})...`,
            });
          }
        }
      }
      if (lastError && mountedRef.current) {
        setDaemonStatus({ status: "error", message: lastError });
      }
    }

    init();

    return () => {
      mountedRef.current = false;
      unlistenFn?.();
    };
  }, []);

  async function handleRetry() {
    setRetrying(true);
    setDaemonStatus({ status: "starting" });
    try {
      const result = await startDaemon();
      if (mountedRef.current) setDaemonStatus(result);
    } catch (err) {
      if (mountedRef.current) {
        setDaemonStatus({
          status: "error",
          message:
            err instanceof Error ? err.message : "Failed to start agent",
        });
      }
    } finally {
      if (mountedRef.current) setRetrying(false);
    }
  }

  const isRunning = daemonStatus.status === "running";
  const isStarting = daemonStatus.status === "starting";
  const isError = daemonStatus.status === "error";

  return (
    <div className="flex flex-col items-center text-center">
      {/* Celebration icon */}
      <div
        className={`
          mb-6 flex h-16 w-16 items-center justify-center rounded-2xl
          ${isError ? "bg-error-100" : "bg-success-100"}
        `}
        aria-hidden="true"
      >
        {isError ? (
          <AlertTriangle className="h-8 w-8 text-error-600" />
        ) : (
          <PartyPopper className="h-8 w-8 text-success-600" />
        )}
      </div>

      {/* Title */}
      <h2 className="text-3xl font-bold tracking-tight text-neutral-900">
        {isError
          ? "Almost there!"
          : isRunning
            ? "Your agent is ready!"
            : "Setting things up..."}
      </h2>

      {/* Daemon status indicator */}
      <div
        className="mt-4 flex items-center justify-center gap-2"
        role="status"
        aria-live="polite"
        aria-label={`Agent status: ${daemonStatus.status}`}
      >
        {isStarting && (
          <>
            <Loader2
              className="h-5 w-5 animate-spin motion-reduce:animate-none text-primary-500"
              aria-hidden="true"
            />
            <p className="text-sm text-neutral-600">
              {daemonStatus.status === "starting" && daemonStatus.message
                ? daemonStatus.message
                : "Starting your agent..."}
            </p>
          </>
        )}
        {isRunning && (
          <>
            <CheckCircle2
              className="h-5 w-5 text-success-500"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-success-700">
              Your agent is running!
            </p>
          </>
        )}
        {isError && (
          <div className="flex flex-col items-center gap-3">
            <p className="max-w-sm text-sm text-error-600">
              {daemonStatus.status === "error"
                ? daemonStatus.message
                : "Something went wrong starting the agent."}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="
                inline-flex items-center gap-1.5 rounded-lg bg-error-50
                px-4 py-2 text-sm font-medium text-error-700
                transition-colors hover:bg-error-100
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-primary-500
                disabled:cursor-not-allowed disabled:opacity-50
              "
              aria-label="Retry starting the agent"
            >
              {retrying ? (
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              {retrying ? "Retrying..." : "Try Again"}
            </button>
          </div>
        )}
        {daemonStatus.status === "stopped" && (
          <p className="text-sm text-neutral-600">Agent is stopped.</p>
        )}
      </div>

      {/* Agent greeting bubble — the "Say hi!" moment */}
      {showGreeting && (
        <div
          className="mt-6 w-full max-w-md animate-fade-in"
          role="status"
          aria-label={`${agentName} says hello`}
        >
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                {agentName.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-neutral-500 mb-1">{agentName}</p>
                <p className="text-sm text-neutral-800 leading-relaxed">
                  Hey! I&apos;m {agentName}, your new AI assistant. I&apos;m running locally on your machine — ask me anything, or open WebChat to start a conversation.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WebChat — always shown, primary way to talk */}
      <div className="mt-8 w-full max-w-md space-y-3">
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100"
              aria-hidden="true"
            >
              <Globe className="h-5 w-5 text-primary-600" aria-hidden="true" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-neutral-900">
                Chat in your browser
              </p>
              <p className="text-xs text-neutral-600">
                OpenClaw has a built-in web chat — no apps needed.
              </p>
            </div>
          </div>
          {isRunning && (
            <a
              href="http://127.0.0.1:18789/__openclaw__/canvas/"
              target="_blank"
              rel="noopener noreferrer"
              className="
                mt-3 inline-flex w-full items-center justify-center gap-2
                rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium
                text-white transition-colors hover:bg-primary-700
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-primary-500
              "
              aria-label="Open WebChat in browser"
            >
              Open WebChat
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>

        {/* Channel-specific guidance */}
        {configuredChannel && (
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-50"
                aria-hidden="true"
              >
                <MessageCircle className="h-5 w-5 text-neutral-500" aria-hidden="true" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-neutral-900">
                  Also on {configuredChannel}
                </p>
                <p className="text-xs text-neutral-600">
                  Send a message to your bot on {configuredChannel} to chat there
                  too.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Open Dashboard button */}
      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        aria-label="Open the dashboard"
        className="
          mt-10 inline-flex items-center gap-2 rounded-xl bg-primary-600
          px-8 py-3.5 text-base font-semibold text-white shadow-lg
          shadow-primary-200 transition-all hover:bg-primary-700
          hover:shadow-xl hover:shadow-primary-200
          focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-primary-500
        "
      >
        Open Dashboard
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
