import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Puzzle,
  User,
  Radio,
  Settings,
  RefreshCw,
  MessageCircle,
} from "lucide-react";
import { KloDockLogo } from "@/components/KloDockLogo";
import { StatusIndicator } from "@/components/StatusIndicator";
import { getDaemonStatus, onDaemonStatus, runHealthCheck } from "@/lib/tauri";
import type { DaemonStatus } from "@/lib/types";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/chat", label: "Chat", icon: MessageCircle, end: false },
  { to: "/dashboard/skills", label: "Skills", icon: Puzzle, end: false },
  {
    to: "/dashboard/personality",
    label: "Personality",
    icon: User,
    end: false,
  },
  { to: "/dashboard/channels", label: "Channels", icon: Radio, end: false },
  {
    to: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    end: false,
  },
  { to: "/dashboard/updates", label: "Updates", icon: RefreshCw, end: false },
];

export function DashboardLayout() {
  const location = useLocation();
  const isChat = location.pathname.endsWith("/chat");
  const [status, setStatus] = useState<DaemonStatus>({ status: "stopped" });

  useEffect(() => {
    // Use health check (HTTP ping) as the source of truth for daemon status.
    // getDaemonStatus checks PID file which can be stale.
    function checkStatus() {
      runHealthCheck()
        .then((h) => setStatus({ status: h.daemon_alive ? "running" : "stopped" }))
        .catch(() => setStatus({ status: "stopped" }));
    }

    checkStatus();

    // Poll every 2 seconds for responsive status updates
    const interval = setInterval(checkStatus, 2000);

    // Also listen for daemon events (instant updates from start/stop)
    let unlistenFn: (() => void) | null = null;
    onDaemonStatus((s) => setStatus(s)).then((fn) => { unlistenFn = fn; });

    return () => {
      clearInterval(interval);
      unlistenFn?.();
    };
  }, []);

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-neutral-200 bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-neutral-200 px-5">
          <KloDockLogo size={28} />
          <span className="text-sm font-bold text-neutral-900">KloDock</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Dashboard">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm
                 font-medium transition-colors
                 focus-visible:outline-2 focus-visible:outline-offset-2
                 focus-visible:outline-primary-500
                 ${
                   isActive
                     ? "bg-primary-50 text-primary-700"
                     : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                 }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-neutral-200 px-5 py-3">
          <StatusIndicator status={status} />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-6">
          <h1 className="text-sm font-semibold text-neutral-900">Dashboard</h1>
          <StatusIndicator status={status} />
        </header>

        <main className={`flex-1 ${isChat ? "overflow-hidden p-0" : "overflow-y-auto p-6"}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
