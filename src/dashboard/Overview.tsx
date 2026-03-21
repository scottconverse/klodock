import { useEffect, useState } from "react";
import { Clock, Puzzle, Radio, AlertCircle } from "lucide-react";
import { getDaemonStatus } from "@/lib/tauri";
import type { HealthStatus } from "@/lib/types";

export function Overview() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getDaemonStatus()
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  function formatUptime(seconds: number | null): string {
    if (seconds === null) return "N/A";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

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
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-neutral-500">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Uptime
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {formatUptime(health.uptime_seconds)}
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-neutral-500">
              <Radio className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Channels
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {health.connected_channels.length}
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-neutral-500">
              <Puzzle className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Active Skills
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {health.active_skills}
            </p>
          </div>
        </div>
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
