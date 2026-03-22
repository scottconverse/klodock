import { useEffect, useState } from "react";
import { Clock, Radio, Puzzle, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { runHealthCheck } from "@/lib/tauri";
import type { HealthStatus } from "@/lib/types";

export function Overview() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    runHealthCheck()
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Overview</h2>
        <p className="mt-1 text-sm text-neutral-500">
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
            </div>
          )}

          {/* Quick stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-neutral-500">
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium uppercase tracking-wider">Status</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-neutral-900">
                {health.daemon_alive ? "Online" : "Offline"}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-neutral-500">
                <Radio className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium uppercase tracking-wider">Channels</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-neutral-900">
                {Object.values(health.channels).filter(Boolean).length}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-neutral-500">
                <Puzzle className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium uppercase tracking-wider">Issues</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-neutral-900">
                {health.issues.length}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="flex justify-center py-12" role="status" aria-label="Loading dashboard data">
          <div className="h-6 w-6 animate-spin motion-reduce:animate-none rounded-full border-2 border-neutral-200 border-t-primary-600" />
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-neutral-500">
          More dashboard features coming in v1.5
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Conversation history, analytics, and skill management will live here.
        </p>
      </div>
    </div>
  );
}
