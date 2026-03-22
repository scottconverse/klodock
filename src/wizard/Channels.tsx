import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Loader2,
  Star,
  Send,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { storeSecret, completeStep } from "@/lib/tauri";

/* ── Channel definitions ─────────────────────────────────── */

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
  /** Client-side token format validation. */
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
        link: {
          label: "Open @BotFather",
          url: "https://t.me/BotFather",
        },
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
        link: {
          label: "Open Developer Portal",
          url: "https://discord.com/developers/applications",
        },
      },
      {
        text: 'Click "New Application" and give it a name (e.g., "My AI Agent").',
      },
      {
        text: 'Go to the "Bot" tab on the left, then click "Reset Token" to generate a new token.',
      },
      {
        text: "Copy the token and paste it below.",
      },
    ],
    tokenPlaceholder: "MTIzNDU2Nzg5MDEyMzQ1...",
    helpUrl: "https://discord.com/developers/docs/intro",
    validate: (t) => /^[A-Za-z0-9_\-.]{50,}$/.test(t.trim()),
  },
];

/* ── Expandable channel card (inline) ────────────────────── */

interface CardState {
  token: string;
  testing: boolean;
  success: boolean;
  error: string | null;
}

function ChannelSection({
  channel,
  expanded,
  onToggleExpand,
  state,
  onStateChange,
  onValidated,
}: {
  channel: ChannelDef;
  expanded: boolean;
  onToggleExpand: () => void;
  state: CardState;
  onStateChange: (s: CardState) => void;
  onValidated: () => void;
}) {
  const Icon = channel.icon;

  async function handleOpenLink(url: string) {
    try {
      await open(url);
    } catch {
      window.open(url, "_blank");
    }
  }

  async function handleTest() {
    const trimmed = state.token.trim();
    if (!trimmed) return;

    onStateChange({ ...state, testing: true, error: null });

    // Client-side format validation
    if (!channel.validate(trimmed)) {
      onStateChange({
        ...state,
        testing: false,
        error:
          "That doesn't look like a valid token. Make sure you copied the full token from step 4.",
      });
      return;
    }

    try {
      await storeSecret(channel.secretKey, trimmed);
      onStateChange({ ...state, testing: false, success: true, error: null });
      onValidated();
    } catch {
      onStateChange({
        ...state,
        testing: false,
        error: "Failed to store the token. Please try again.",
      });
    }
  }

  return (
    <div
      className={`
        rounded-xl border bg-white shadow-sm transition-all
        ${
          state.success
            ? "border-success-300 ring-2 ring-success-100"
            : "border-neutral-200"
        }
      `}
    >
      {/* Header / expand toggle */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="
          flex w-full items-center justify-between rounded-xl p-5
          text-left transition-colors hover:bg-neutral-50
          focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-primary-500
        "
        aria-expanded={expanded}
        aria-controls={`channel-detail-${channel.id}`}
        aria-label={`${channel.name} channel setup${state.success ? " (connected)" : ""}`}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100"
            aria-hidden="true"
          >
            <Icon className="h-4.5 w-4.5 text-neutral-600" />
          </div>
          <h3 className="text-base font-semibold text-neutral-900">
            {channel.name}
          </h3>
          {channel.recommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-600">
              <Star className="h-3 w-3" aria-hidden="true" />
              Recommended
            </span>
          )}
          {state.success && (
            <CheckCircle2
              className="h-5 w-5 text-success-500"
              aria-label="Connected"
            />
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-neutral-400" aria-hidden="true" />
        ) : (
          <ChevronDown
            className="h-5 w-5 text-neutral-400"
            aria-hidden="true"
          />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div
          id={`channel-detail-${channel.id}`}
          className="space-y-4 px-5 pb-5"
          role="region"
          aria-label={`${channel.name} setup instructions`}
        >
          {/* What is it + Why connect */}
          <div className="rounded-lg bg-primary-50 border border-primary-100 p-3 space-y-1.5">
            <p className="text-sm text-primary-800">{channel.whatIsIt}</p>
            <p className="text-sm font-medium text-primary-900">
              {channel.whyConnect}
            </p>
          </div>

          {/* Step-by-step instructions with links */}
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-neutral-800">
              How to get your bot token:
            </h4>
            <ol className="space-y-2.5">
              {channel.instructions.map((step, idx) => (
                <li
                  key={idx}
                  className="flex gap-2.5 text-sm leading-relaxed text-neutral-600"
                >
                  <span
                    className="
                      flex h-5 w-5 shrink-0 items-center justify-center
                      rounded-full bg-primary-100 text-xs font-semibold
                      text-primary-700 mt-0.5
                    "
                    aria-hidden="true"
                  >
                    {idx + 1}
                  </span>
                  <div className="space-y-1">
                    <span>{step.text}</span>
                    {step.link && (
                      <button
                        type="button"
                        onClick={() => handleOpenLink(step.link!.url)}
                        className="
                          flex items-center gap-1 text-xs font-medium
                          text-primary-600 hover:text-primary-700
                          hover:underline
                        "
                        aria-label={step.link.label}
                      >
                        {step.link.label}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Token input */}
          <div className="space-y-2">
            <label
              htmlFor={`token-${channel.id}`}
              className="block text-sm font-medium text-neutral-700"
            >
              Paste your bot token here
            </label>
            <input
              id={`token-${channel.id}`}
              type="password"
              value={state.token}
              onChange={(e) =>
                onStateChange({
                  ...state,
                  token: e.target.value,
                  error: null,
                  success: false,
                })
              }
              placeholder={channel.tokenPlaceholder}
              className="
                w-full rounded-lg border border-neutral-300 bg-neutral-50
                px-3 py-2 text-sm placeholder:text-neutral-400
                focus:border-primary-400 focus:outline-none focus:ring-2
                focus:ring-primary-100
              "
              aria-describedby={
                state.error ? `chan-error-${channel.id}` : undefined
              }
              aria-label={`${channel.name} bot token`}
            />
          </div>

          {/* Error message */}
          {state.error && (
            <p
              id={`chan-error-${channel.id}`}
              className="flex items-center gap-1.5 text-sm text-error-600"
              role="alert"
            >
              <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {state.error}
            </p>
          )}

          {/* Success message */}
          {state.success && (
            <p
              className="flex items-center gap-1.5 text-sm text-success-600"
              role="status"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Token saved successfully!
            </p>
          )}

          {/* Actions row */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={!state.token.trim() || state.testing}
              className="
                inline-flex items-center justify-center gap-1.5 rounded-lg
                bg-primary-600 px-4 py-2 text-sm font-medium text-white
                transition-colors hover:bg-primary-700
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-primary-500
                disabled:cursor-not-allowed disabled:opacity-50
              "
              aria-label={`Save ${channel.name} token`}
            >
              {state.testing ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Saving...
                </>
              ) : (
                "Save Token"
              )}
            </button>

            <button
              type="button"
              onClick={() => handleOpenLink(channel.helpUrl)}
              className="
                inline-flex items-center gap-1 text-xs font-medium
                text-neutral-500 hover:text-neutral-700
              "
              aria-label={`${channel.name} setup help`}
            >
              Need help?
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Channels page ───────────────────────────────────────── */

export function Channels() {
  const navigate = useNavigate();
  // Telegram expanded by default so the user sees instructions immediately
  const [expandedId, setExpandedId] = useState<string | null>("telegram");
  const [cardStates, setCardStates] = useState<Record<string, CardState>>(
    () => {
      const init: Record<string, CardState> = {};
      for (const ch of CHANNELS) {
        init[ch.id] = { token: "", testing: false, success: false, error: null };
      }
      return init;
    }
  );
  const [skipped, setSkipped] = useState(false);

  const hasAnyConnected = Object.values(cardStates).some((s) => s.success);
  const canProceed = hasAnyConnected || skipped;

  function updateCardState(id: string, state: CardState) {
    setCardStates((prev) => ({ ...prev, [id]: state }));
  }

  async function handleNext() {
    try {
      await completeStep("channel_setup");
    } catch {
      // Non-critical
    }
    navigate("/wizard/skills");
  }

  function handleSkip() {
    setSkipped(true);
    handleNext();
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900">
        Connect a Channel
      </h2>
      <p className="mt-2 text-neutral-600">
        A channel is how you'll talk to your AI agent — through a messaging app
        you already use. Pick one below and follow the steps, or skip this for
        now and use the built-in WebChat instead.
      </p>

      <div className="mt-6 space-y-4">
        {CHANNELS.map((ch) => (
          <ChannelSection
            key={ch.id}
            channel={ch}
            expanded={expandedId === ch.id}
            onToggleExpand={() =>
              setExpandedId((prev) => (prev === ch.id ? null : ch.id))
            }
            state={cardStates[ch.id]}
            onStateChange={(s) => updateCardState(ch.id, s)}
            onValidated={() =>
              updateCardState(ch.id, {
                ...cardStates[ch.id],
                success: true,
              })
            }
          />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={handleSkip}
          className="
            rounded text-sm font-medium text-neutral-500
            underline decoration-neutral-300 underline-offset-2
            transition-colors hover:text-neutral-700
            focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-primary-500
          "
          aria-label="Skip channel setup and use WebChat instead"
        >
          Skip — I'll use WebChat
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={!canProceed}
          aria-label="Next: choose skills"
          className="
            rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold
            text-white shadow-lg shadow-primary-200 transition-all
            hover:bg-primary-700
            focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-primary-500
            disabled:cursor-not-allowed disabled:opacity-50
            disabled:shadow-none
          "
        >
          Next
        </button>
      </div>
    </div>
  );
}
