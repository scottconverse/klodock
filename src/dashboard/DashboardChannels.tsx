import { useEffect, useState } from "react";
import { Send, MessageSquare, CheckCircle2, XCircle, ExternalLink, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { runHealthCheck } from "@/lib/tauri";

interface ChannelInfo {
  id: string;
  name: string;
  icon: typeof Send;
  connected: boolean | null;
  helpUrl: string;
  description: string;
}

export function DashboardChannels() {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    runHealthCheck()
      .then((health) => {
        const channelList: ChannelInfo[] = [
          {
            id: "telegram",
            name: "Telegram",
            icon: Send,
            connected: health.channels["telegram"] ?? null,
            helpUrl: "https://t.me/BotFather",
            description: "Chat with your agent via Telegram bot.",
          },
          {
            id: "discord",
            name: "Discord",
            icon: MessageSquare,
            connected: health.channels["discord"] ?? null,
            helpUrl: "https://discord.com/developers/applications",
            description: "Add your agent to a Discord server.",
          },
        ];
        setChannels(channelList);
      })
      .catch(() => {
        setChannels([
          {
            id: "telegram", name: "Telegram", icon: Send,
            connected: null, helpUrl: "https://t.me/BotFather",
            description: "Chat with your agent via Telegram bot.",
          },
          {
            id: "discord", name: "Discord", icon: MessageSquare,
            connected: null, helpUrl: "https://discord.com/developers/applications",
            description: "Add your agent to a Discord server.",
          },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  async function openLink(url: string) {
    try { await open(url); } catch { window.open(url, "_blank"); }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const connectedCount = channels.filter((c) => c.connected === true).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Channels</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {connectedCount > 0
            ? `${connectedCount} channel${connectedCount > 1 ? "s" : ""} connected.`
            : "No channels connected. Your agent is available via WebChat."}
        </p>
      </div>

      {/* WebChat — always available */}
      <div className="rounded-xl border border-primary-200 bg-primary-50 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-primary-900">WebChat (Built-in)</h3>
            <p className="text-xs text-primary-700">
              Always available at http://127.0.0.1:18789
            </p>
          </div>
          <button
            type="button"
            onClick={() => openLink("http://127.0.0.1:18789")}
            className="
              inline-flex items-center gap-1.5 rounded-lg bg-primary-600
              px-3 py-1.5 text-sm font-medium text-white
              hover:bg-primary-700
            "
          >
            Open
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Channel cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {channels.map((ch) => {
          const Icon = ch.icon;
          return (
            <div
              key={ch.id}
              className={`rounded-xl border p-5 shadow-sm ${
                ch.connected
                  ? "border-success-200 bg-white"
                  : "border-neutral-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100">
                  <Icon className="h-4.5 w-4.5 text-neutral-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-neutral-900">{ch.name}</h3>
                  <p className="text-xs text-neutral-500">{ch.description}</p>
                </div>
                {ch.connected === true ? (
                  <CheckCircle2 className="h-5 w-5 text-success-500" />
                ) : ch.connected === false ? (
                  <XCircle className="h-5 w-5 text-warning-500" />
                ) : (
                  <span className="text-xs text-neutral-400">Not configured</span>
                )}
              </div>
              {ch.connected !== true && (
                <button
                  type="button"
                  onClick={() => openLink(ch.helpUrl)}
                  className="
                    mt-3 inline-flex items-center gap-1 text-xs font-medium
                    text-primary-600 hover:text-primary-700
                  "
                >
                  Set up {ch.name}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
