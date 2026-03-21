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
} from "lucide-react";
import { startDaemon, onDaemonStatus, retrieveSecret } from "@/lib/tauri";
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
  const mountedRef = useRef(true);

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

      // Start the daemon
      try {
        const result = await startDaemon();
        if (mountedRef.current) {
          setDaemonStatus(result);
        }
      } catch (err) {
        if (mountedRef.current) {
          setDaemonStatus({
            status: "error",
            message:
              err instanceof Error ? err.message : "Failed to start agent",
          });
        }
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
              Starting your agent...
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
          <p className="text-sm text-neutral-500">Agent is stopped.</p>
        )}
      </div>

      {/* Channel-specific guidance */}
      <div className="mt-8 w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50"
            aria-hidden="true"
          >
            {configuredChannel ? (
              <MessageCircle className="h-5 w-5 text-primary-500" />
            ) : (
              <LayoutDashboard className="h-5 w-5 text-primary-500" />
            )}
          </div>
          <div className="text-left">
            {configuredChannel ? (
              <>
                <p className="text-sm font-semibold text-neutral-900">
                  Say hi to your bot!
                </p>
                <p className="text-xs text-neutral-500">
                  Send a message to your bot on {configuredChannel} to get
                  started.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-neutral-900">
                  Connect a channel
                </p>
                <p className="text-xs text-neutral-500">
                  Head to the dashboard to connect a messaging channel.
                </p>
              </>
            )}
          </div>
        </div>
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
