import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Radio, Puzzle, AlertCircle, CheckCircle, XCircle, MessageSquare, Activity, RefreshCw } from "lucide-react";
import { runHealthCheck, getActivityLog, startDaemon, stopDaemon, restartDaemon } from "@/lib/tauri";
import type { HealthStatus } from "@/lib/types";
import type { ActivityEntry } from "@/lib/tauri";

export function Overview() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    runHealthCheck()
      .then(setHealth)
      .catch(() => setError(true));
    getActivityLog(20)
      .then(setActivityLog)
      .catch(() => {});
  }, []);

  function refreshActivity() {
    getActivityLog(20).then(setActivityLog).catch(() => {});
  }

  function openChat() {
    navigate("/dashboard/chat");
  }

  async function handleStartAgent() {
    setStarting(true);
    try {
      await startDaemon();
      // Refresh health and activity after starting
      const newHealth = await runHealthCheck();
      setHealth(newHealth);
      refreshActivity();
    } catch {
      runHealthCheck().then(setHealth).catch(() => {});
    } finally {
      setStarting(false);
    }
  }

  async function handleStopAgent() {
    setStopping(true);
    try {
      await stopDaemon();
      const newHealth = await runHealthCheck();
      setHealth(newHealth);
      refreshActivity();
    } catch {
      runHealthCheck().then(setHealth).catch(() => {});
    } finally {
      setStopping(false);
    }
  }

  async function handleRestartAgent() {
    setRestarting(true);
    try {
      await restartDaemon();
      // Wait a moment for the daemon to fully start
      await new Promise((r) => setTimeout(r, 3000));
      const newHealth = await runHealthCheck();
      setHealth(newHealth);
      refreshActivity();
    } catch {
      runHealthCheck().then(setHealth).catch(() => {});
    } finally {
      setRestarting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Overview</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Your agent at a glance.
        </p>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-xl border border-error-200 bg-error-50 p-4">
          <AlertCircle className="h-5 w-5 text-error-500" aria-hidden="true" />
          <p className="text-sm text-error-700" role="alert">
            Could not fetch agent status. Is the daemon running?
          </p>
        </div>
      ) : health ? (
        <>
          {/* Health checks */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">Health Checks</h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm">
                {health.daemon_alive ? (
                  <CheckCircle className="h-4 w-4 text-success-500" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 text-error-500" aria-hidden="true" />
                )}
                <span>Agent daemon {health.daemon_alive ? "running" : "stopped"}</span>
              </li>
              {health.api_key_valid !== null && (
                <li className="flex items-center gap-2 text-sm">
                  {health.api_key_valid ? (
                    <CheckCircle className="h-4 w-4 text-success-500" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4 text-error-500" aria-hidden="true" />
                  )}
                  <span>API key {health.api_key_valid ? "valid" : "invalid or expired"}</span>
                </li>
              )}
              {Object.entries(health.channels).map(([name, connected]) => (
                <li key={name} className="flex items-center gap-2 text-sm">
                  {connected ? (
                    <CheckCircle className="h-4 w-4 text-success-500" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4 text-warning-500" aria-hidden="true" />
                  )}
                  <span className="capitalize">{name} {connected ? "connected" : "disconnected"}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Agent controls — visible when running */}
          {health.daemon_alive && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleStopAgent}
                disabled={stopping || restarting}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Stop your agent"
              >
                {stopping ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> Stopping...</>
                ) : (
                  <><XCircle className="h-4 w-4" aria-hidden="true" /> Stop Agent</>
                )}
              </button>
              <button
                type="button"
                onClick={handleRestartAgent}
                disabled={stopping || restarting}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Restart your agent"
              >
                {restarting ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> Restarting...</>
                ) : (
                  <><RefreshCw className="h-4 w-4" aria-hidden="true" /> Restart Agent</>
                )}
              </button>
              <button
                type="button"
                onClick={openChat}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                aria-label="Open chat with your agent"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Open Chat
              </button>
            </div>
          )}

          {/* Issues */}
          {health.issues.length > 0 && (
            <div className="rounded-xl border border-warning-200 bg-warning-50 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-warning-700 mb-2">Issues</h3>
              <ul className="space-y-1">
                {health.issues.map((issue, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-warning-700">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {issue}
                  </li>
                ))}
              </ul>
              {!health.daemon_alive && (
                <button
                  type="button"
                  onClick={handleStartAgent}
                  disabled={starting}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Start your agent"
                >
                  {starting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Activity className="h-4 w-4" aria-hidden="true" />
                      Start Agent
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Start Agent when no issues card but daemon stopped */}
          {health.issues.length === 0 && !health.daemon_alive && (
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm text-center">
              <p className="text-sm text-neutral-600 mb-3">Your agent is not running.</p>
              <button
                type="button"
                onClick={handleStartAgent}
                disabled={starting}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Start your agent"
              >
                {starting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Activity className="h-4 w-4" aria-hidden="true" />
                    Start Agent
                  </>
                )}
              </button>
            </div>
          )}

          {/* Quick stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-neutral-600">
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium uppercase tracking-wider">Status</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-neutral-900">
                {health.daemon_alive ? "Online" : "Offline"}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-neutral-600">
                <Radio className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium uppercase tracking-wider">Channels</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-neutral-900">
                {Object.values(health.channels).filter(Boolean).length}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-neutral-600">
                <Puzzle className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium uppercase tracking-wider">Issues</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-neutral-900">
                {health.issues.length}
              </p>
            </div>
          </div>

          {/* Activity feed */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-neutral-700">Recent Activity</h3>
              </div>
              <button
                type="button"
                onClick={refreshActivity}
                className="p-1 rounded hover:bg-neutral-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                aria-label="Refresh activity log"
              >
                <RefreshCw className="h-3.5 w-3.5 text-neutral-400" aria-hidden="true" />
              </button>
            </div>
            {activityLog.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4 text-center">
                No activity yet. Start your agent to see events here.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto" role="log" aria-label="Agent activity log">
                {[...activityLog].reverse().map((entry, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 font-mono text-neutral-400 mt-0.5 w-14">
                      {entry.timestamp.split(" ")[1] ?? entry.timestamp}
                    </span>
                    <span className={`shrink-0 mt-0.5 h-1.5 w-1.5 rounded-full ${
                      entry.level === "error" ? "bg-error-500" :
                      entry.level === "warn" ? "bg-warning-500" :
                      entry.level === "success" ? "bg-success-500" :
                      "bg-neutral-400"
                    }`} aria-hidden="true" />
                    <span className={`${
                      entry.level === "error" ? "text-error-700" :
                      entry.level === "warn" ? "text-warning-700" :
                      "text-neutral-700"
                    }`}>
                      {entry.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* WebChat quick access */}
          {health.daemon_alive && (
            <div className="rounded-xl border border-primary-200 bg-primary-50 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-primary-600" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-primary-900">Chat with your agent</h3>
                    <p className="text-xs text-primary-700">Chat with your agent right here</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openChat}
                  className="
                    inline-flex items-center gap-1.5 rounded-lg bg-primary-600
                    px-4 py-2 text-sm font-medium text-white
                    transition-colors hover:bg-primary-700
                    focus:ring-2 focus:ring-blue-500 focus:outline-none
                  "
                >
                  Open Chat
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex justify-center py-12" role="status" aria-label="Loading dashboard data">
          <div className="h-6 w-6 animate-spin motion-reduce:animate-none rounded-full border-2 border-neutral-200 border-t-primary-600" />
        </div>
      )}
    </div>
  );
}
