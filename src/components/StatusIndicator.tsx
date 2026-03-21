import type { DaemonStatus } from "@/lib/types";

interface StatusIndicatorProps {
  status: DaemonStatus;
}

const statusConfig: Record<
  DaemonStatus,
  { color: string; pulse: string; label: string }
> = {
  Running: {
    color: "bg-success-500",
    pulse: "animate-pulse bg-success-400",
    label: "Running",
  },
  Stopped: {
    color: "bg-neutral-400",
    pulse: "",
    label: "Stopped",
  },
  Error: {
    color: "bg-error-500",
    pulse: "",
    label: "Error",
  },
};

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const cfg = statusConfig[status];

  return (
    <span
      className="inline-flex items-center gap-2 text-sm font-medium"
      role="status"
      aria-label={`Agent status: ${cfg.label}`}
    >
      <span className="relative flex h-2.5 w-2.5">
        {cfg.pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 motion-reduce:animate-none ${cfg.pulse}`}
            aria-hidden="true"
          />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cfg.color}`}
          aria-hidden="true"
        />
      </span>
      {cfg.label}
    </span>
  );
}
