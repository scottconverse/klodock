import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Loader2,
  Star,
} from "lucide-react";
import { storeSecret, testApiKey } from "@/lib/tauri";

interface ChannelCardProps {
  id: string;
  name: string;
  recommended?: boolean;
  instructions: string[];
  tokenPlaceholder: string;
  validated?: boolean;
  onValidated: (channelId: string) => void;
}

export function ChannelCard({
  id,
  name,
  recommended = false,
  instructions,
  tokenPlaceholder,
  validated = false,
  onValidated,
}: ChannelCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(validated);

  async function handleTest() {
    if (!token.trim()) return;
    setTesting(true);
    setError(null);

    try {
      const ok = await testApiKey(id, token);
      if (ok) {
        await storeSecret(`${id}_token`, token);
        setSuccess(true);
        onValidated(id);
      } else {
        setError("Token invalid. Please check and try again.");
      }
    } catch {
      setError("Connection test failed. Try again.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div
      className={`
        rounded-xl border bg-white shadow-sm transition-all
        ${
          success
            ? "border-success-300 ring-2 ring-success-100"
            : "border-neutral-200"
        }
      `}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="
          flex w-full items-center justify-between p-5 text-left
          focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-primary-500 rounded-xl
        "
        aria-expanded={expanded}
        aria-controls={`channel-detail-${id}`}
        aria-label={`${name} channel setup${success ? " (connected)" : ""}`}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-neutral-900">{name}</h3>
          {recommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-600">
              <Star className="h-3 w-3" aria-hidden="true" />
              Recommended
            </span>
          )}
          {success && (
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

      {expanded && (
        <div id={`channel-detail-${id}`} className="space-y-4 px-5 pb-5" role="region" aria-label={`${name} setup instructions`}>
          <ol className="space-y-2">
            {instructions.map((step, idx) => (
              <li
                key={idx}
                className="flex gap-2.5 text-sm leading-relaxed text-neutral-600"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                  {idx + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          <div className="space-y-2">
            <label
              htmlFor={`token-${id}`}
              className="block text-sm font-medium text-neutral-700"
            >
              Bot Token
            </label>
            <input
              id={`token-${id}`}
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setError(null);
                setSuccess(false);
              }}
              placeholder={tokenPlaceholder}
              className="
                w-full rounded-lg border border-neutral-300 bg-neutral-50
                px-3 py-2 text-sm placeholder:text-neutral-400
                focus:border-primary-400 focus:outline-none focus:ring-2
                focus:ring-primary-100
              "
              aria-describedby={error ? `chan-error-${id}` : undefined}
              aria-label={`${name} bot token`}
            />
          </div>

          {error && (
            <p
              id={`chan-error-${id}`}
              className="flex items-center gap-1.5 text-sm text-error-600"
              role="alert"
            >
              <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleTest}
            disabled={!token.trim() || testing}
            className="
              inline-flex items-center justify-center gap-1.5 rounded-lg
              bg-primary-600 px-4 py-2 text-sm font-medium text-white
              transition-colors hover:bg-primary-700
              focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-primary-500
              disabled:cursor-not-allowed disabled:opacity-50
            "
            aria-label={`Test ${name} connection`}
          >
            {testing ? (
              <>
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Testing...
              </>
            ) : (
              "Test Connection"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
