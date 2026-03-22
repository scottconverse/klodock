import { useEffect, useState } from "react";
import {
  Send, MessageSquare, CheckCircle2, XCircle, ExternalLink,
  Loader2, ChevronDown, ChevronUp, Star, Trash2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { storeSecret, deleteSecret, listSecrets, runHealthCheck } from "@/lib/tauri";
import { useToast } from "@/components/Toast";

/* ── Channel definitions (same as wizard Channels.tsx) ──── */

interface InstructionStep {
  text: string;
  link?: { label: string; url: string };
}

interface ChannelDef {
  id: string;
  name: string;
  icon: typeof Send;
  recommended: boolean;
  secretKey: string;
  whatIsIt: string;
  whyConnect: string;
  instructions: InstructionStep[];
  tokenPlaceholder: string;
  helpUrl: string;
  validate: (token: string) => boolean;
}

const CHANNELS: ChannelDef[] = [
  {
    id: "telegram",
    name: "Telegram",
    icon: Send,
    recommended: true,
    secretKey: "TELEGRAM_BOT_TOKEN",
    whatIsIt:
      "Telegram is a free messaging app. A \"bot\" is an automated account your AI agent uses to chat with you there.",
    whyConnect:
      "Once connected, you can message your AI agent anytime from your phone or computer — just like texting a friend.",
    instructions: [
      {
        text: "Download Telegram if you don't have it",
        link: { label: "Get Telegram", url: "https://telegram.org/apps" },
      },
      {
        text: "Open Telegram and search for @BotFather (Telegram's built-in bot creator)",
        link: { label: "Open @BotFather", url: "https://t.me/BotFather" },
      },
      {
        text: 'Send the message /newbot — BotFather will ask you for a name and username. Pick anything you like.',
      },
      {
        text: "BotFather will reply with a token (a long string of numbers and letters). Copy it and paste it below.",
      },
    ],
    tokenPlaceholder: "123456:ABC-DEF1234ghIkl-zyx...",
    helpUrl: "https://core.telegram.org/bots/tutorial",
    validate: (t) => /^\d+:.+$/.test(t.trim()),
  },
  {
    id: "discord",
    name: "Discord",
    icon: MessageSquare,
    recommended: false,
    secretKey: "DISCORD_BOT_TOKEN",
    whatIsIt:
      "Discord is a chat platform popular with communities and teams. A bot lets your AI agent join your Discord server.",
    whyConnect:
      "Your AI agent will appear as a member of your Discord server and respond when you message it.",
    instructions: [
      {
        text: "Go to the Discord Developer Portal and log in",
        link: { label: "Open Developer Portal", url: "https://discord.com/developers/applications" },
      },
      { text: 'Click "New Application" and give it a name (e.g., "My AI Agent").' },
      { text: 'Go to the "Bot" tab on the left, then click "Reset Token" to generate a new token.' },
      { text: "Copy the token and paste it below." },
    ],
    tokenPlaceholder: "MTIzNDU2Nzg5MDEyMzQ1...",
    helpUrl: "https://discord.com/developers/docs/intro",
    validate: (t) => /^[A-Za-z0-9_\-.]{50,}$/.test(t.trim()),
  },
];

/* ── Card state ─────────────────────────────────────────── */

interface CardState {
  token: string;
  testing: boolean;
  success: boolean;
  error: string | null;
  hasStoredToken: boolean;
}

function emptyState(): CardState {
  return { token: "", testing: false, success: false, error: null, hasStoredToken: false };
}

/* ── Channel section (same UX as wizard) ────────────────── */

function ChannelSection({
  channel, expanded, onToggleExpand, state, onStateChange, onDisconnect,
}: {
  channel: ChannelDef;
  expanded: boolean;
  onToggleExpand: () => void;
  state: CardState;
  onStateChange: (s: CardState) => void;
  onDisconnect: () => void;
}) {
  const Icon = channel.icon;

  async function handleOpenLink(url: string) {
    try { await open(url); } catch { window.open(url, "_blank"); }
  }

  async function handleSave() {
    const trimmed = state.token.trim();
    if (!trimmed) return;

    onStateChange({ ...state, testing: true, error: null });

    if (!channel.validate(trimmed)) {
      onStateChange({
        ...state, testing: false,
        error: "That doesn't look like a valid token. Make sure you copied the full token.",
      });
      return;
    }

    try {
      await storeSecret(channel.secretKey, trimmed);
      onStateChange({ ...state, testing: false, success: true, error: null, hasStoredToken: true });
    } catch {
      onStateChange({ ...state, testing: false, error: "Failed to store the token. Please try again." });
    }
  }

  const isConnected = state.success || state.hasStoredToken;

  return (
    <div className={`
      rounded-xl border bg-white shadow-sm transition-all
      ${isConnected ? "border-success-300 ring-2 ring-success-100" : "border-neutral-200"}
    `}>
      {/* Header */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="
          flex w-full items-center justify-between rounded-xl p-5
          text-left transition-colors hover:bg-neutral-50
        "
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100">
            <Icon className="h-4.5 w-4.5 text-neutral-600" />
          </div>
          <h3 className="text-base font-semibold text-neutral-900">{channel.name}</h3>
          {channel.recommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-600">
              <Star className="h-3 w-3" />
              Recommended
            </span>
          )}
          {isConnected && (
            <CheckCircle2 className="h-5 w-5 text-success-500" />
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-neutral-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-neutral-400" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-4 px-5 pb-5">
          {/* Already connected — show status + disconnect */}
          {isConnected && !state.token && (
            <div className="flex items-center justify-between rounded-lg bg-success-50 border border-success-200 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success-500" />
                <p className="text-sm text-success-700">Connected — token stored securely.</p>
              </div>
              <button
                type="button"
                onClick={onDisconnect}
                className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-error-600"
              >
                <Trash2 className="h-3 w-3" />
                Disconnect
              </button>
            </div>
          )}

          {/* What is it + Why connect */}
          <div className="rounded-lg bg-primary-50 border border-primary-100 p-3 space-y-1.5">
            <p className="text-sm text-primary-800">{channel.whatIsIt}</p>
            <p className="text-sm font-medium text-primary-900">{channel.whyConnect}</p>
          </div>

          {/* Step-by-step instructions */}
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-neutral-800">
              {isConnected ? "To update your token:" : "How to get your bot token:"}
            </h4>
            <ol className="space-y-2.5">
              {channel.instructions.map((step, idx) => (
                <li key={idx} className="flex gap-2.5 text-sm leading-relaxed text-neutral-600">
                  <span className="
                    flex h-5 w-5 shrink-0 items-center justify-center
                    rounded-full bg-primary-100 text-xs font-semibold
                    text-primary-700 mt-0.5
                  ">
                    {idx + 1}
                  </span>
                  <div className="space-y-1">
                    <span>{step.text}</span>
                    {step.link && (
                      <button
                        type="button"
                        onClick={() => handleOpenLink(step.link!.url)}
                        className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        {step.link.label}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Token input */}
          <div className="space-y-2">
            <label htmlFor={`token-${channel.id}`} className="block text-sm font-medium text-neutral-700">
              {isConnected ? "Replace token" : "Paste your bot token here"}
            </label>
            <input
              id={`token-${channel.id}`}
              type="password"
              value={state.token}
              onChange={(e) =>
                onStateChange({ ...state, token: e.target.value, error: null, success: false })
              }
              placeholder={channel.tokenPlaceholder}
              className="
                w-full rounded-lg border border-neutral-300 bg-neutral-50
                px-3 py-2 text-sm placeholder:text-neutral-400
                focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100
              "
            />
          </div>

          {/* Error / Success */}
          {state.error && (
            <p className="flex items-center gap-1.5 text-sm text-error-600" role="alert">
              <XCircle className="h-4 w-4 shrink-0" />
              {state.error}
            </p>
          )}
          {state.success && state.token && (
            <p className="flex items-center gap-1.5 text-sm text-success-600" role="status">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Token saved successfully!
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!state.token.trim() || state.testing}
              className="
                inline-flex items-center justify-center gap-1.5 rounded-lg
                bg-primary-600 px-4 py-2 text-sm font-medium text-white
                hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50
              "
            >
              {state.testing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                "Save Token"
              )}
            </button>
            <button
              type="button"
              onClick={() => handleOpenLink(channel.helpUrl)}
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
            >
              Need help?
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Dashboard Channels page ────────────────────────────── */

export function DashboardChannels() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cardStates, setCardStates] = useState<Record<string, CardState>>(() => {
    const init: Record<string, CardState> = {};
    for (const ch of CHANNELS) init[ch.id] = emptyState();
    return init;
  });

  useEffect(() => {
    // Check which channels already have stored tokens
    Promise.all([
      listSecrets().catch(() => [] as string[]),
      runHealthCheck().catch(() => null),
    ]).then(([keys, health]) => {
      const updated = { ...cardStates };
      for (const ch of CHANNELS) {
        const hasKey = keys.includes(ch.secretKey);
        const healthOk = health?.channels?.[ch.id] ?? false;
        if (hasKey || healthOk) {
          updated[ch.id] = { ...updated[ch.id], hasStoredToken: true, success: true };
        }
      }
      setCardStates(updated);
    }).finally(() => setLoading(false));
  }, []);

  function updateCardState(id: string, state: CardState) {
    setCardStates((prev) => ({ ...prev, [id]: state }));
  }

  async function handleDisconnect(channelId: string) {
    const ch = CHANNELS.find((c) => c.id === channelId);
    if (!ch) return;
    try {
      await deleteSecret(ch.secretKey);
      setCardStates((prev) => ({
        ...prev,
        [channelId]: emptyState(),
      }));
      toast.info(`${ch.name} disconnected.`);
    } catch {
      toast.error(`Failed to disconnect ${ch.name}.`);
    }
  }

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

  const connectedCount = Object.values(cardStates).filter((s) => s.success || s.hasStoredToken).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Channels</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {connectedCount > 0
            ? `${connectedCount} channel${connectedCount > 1 ? "s" : ""} connected. Expand a channel to update or disconnect it.`
            : "Connect a messaging channel so you can talk to your agent from your phone or desktop."}
        </p>
      </div>

      {/* WebChat — always available */}
      <div className="rounded-xl border border-primary-200 bg-primary-50 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-primary-900">WebChat (Built-in)</h3>
            <p className="text-xs text-primary-700">
              Always available — no setup needed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openLink("http://127.0.0.1:18789")}
            className="
              inline-flex items-center gap-1.5 rounded-lg bg-primary-600
              px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700
            "
          >
            Open
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Channel setup cards */}
      <div className="space-y-4">
        {CHANNELS.map((ch) => (
          <ChannelSection
            key={ch.id}
            channel={ch}
            expanded={expandedId === ch.id}
            onToggleExpand={() => setExpandedId((prev) => (prev === ch.id ? null : ch.id))}
            state={cardStates[ch.id]}
            onStateChange={(s) => updateCardState(ch.id, s)}
            onDisconnect={() => handleDisconnect(ch.id)}
          />
        ))}
      </div>
    </div>
  );
}
