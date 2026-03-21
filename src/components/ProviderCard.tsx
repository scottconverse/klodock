import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { storeSecret, testApiKey } from "@/lib/tauri";
import type { ReactNode } from "react";

export interface ProviderCardProps {
  id: string;
  name: string;
  cost: string;
  envVar: string | null;
  keyUrl: string;
  icon: ReactNode;
  isLocal?: boolean;
  validated?: boolean;
  onValidated: (providerId: string) => void;
}

export function ProviderCard({
  id,
  name,
  cost,
  envVar,
  keyUrl,
  icon,
  isLocal = false,
  validated = false,
  onValidated,
}: ProviderCardProps) {
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(validated);

  async function handleOpenUrl() {
    try {
      await open(keyUrl);
    } catch {
      // Fallback: let the browser handle it
      window.open(keyUrl, "_blank");
    }
  }

  async function handleTest() {
    if (!apiKey.trim() || !envVar) return;
    setTesting(true);
    setError(null);

    try {
      const ok = await testApiKey(id, apiKey.trim());
      if (ok) {
        await storeSecret(envVar, apiKey.trim());
        setSuccess(true);
        onValidated(id);
      } else {
        setError("Invalid key — please check and try again.");
      }
    } catch {
      setError("Could not verify the key. Please check it and try again.");
    } finally {
      setTesting(false);
    }
  }

  function handleKeyChange(value: string) {
    setApiKey(value);
    setError(null);
    if (success) setSuccess(false);
  }

  return (
    <div
      className={`
        relative flex flex-col gap-4 rounded-xl border bg-white p-5
        shadow-sm transition-all
        ${
          success
            ? "border-success-300 ring-2 ring-success-100"
            : "border-neutral-200 hover:shadow-md"
        }
      `}
    >
      {/* Success badge */}
      {success && (
        <div
          className="absolute -right-2 -top-2"
          aria-label={`${name}: connected`}
        >
          <CheckCircle2
            className="h-6 w-6 text-success-500"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Header: icon, name, cost */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50"
          aria-hidden="true"
        >
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-neutral-900">{name}</h3>
          <p className="text-xs text-neutral-500">{cost}</p>
        </div>
      </div>

      {/* ── Local provider (Ollama) ──────────────────── */}
      {isLocal ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">
            Free — runs on your computer. No API key needed.
          </p>
          <button
            type="button"
            onClick={handleOpenUrl}
            className="
              inline-flex items-center gap-1.5 rounded-lg border
              border-neutral-200 px-3 py-1.5 text-sm font-medium
              text-neutral-700 transition-colors hover:bg-neutral-50
              focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-primary-500
            "
            aria-label={`Download ${name}`}
          >
            Download Ollama
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        /* ── API key provider ─────────────────────────── */
        <>
          <div className="space-y-2">
            <label
              htmlFor={`apikey-${id}`}
              className="block text-sm font-medium text-neutral-700"
            >
              API Key
            </label>
            <input
              id={`apikey-${id}`}
              type="password"
              value={apiKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="Paste your key here..."
              disabled={success}
              className="
                w-full rounded-lg border border-neutral-300 bg-neutral-50
                px-3 py-2 text-sm placeholder:text-neutral-400
                focus:border-primary-400 focus:outline-none focus:ring-2
                focus:ring-primary-100
                disabled:cursor-not-allowed disabled:opacity-60
              "
              aria-describedby={error ? `error-${id}` : undefined}
              aria-label={`${name} API key`}
            />
          </div>

          {/* Error message */}
          {error && (
            <p
              id={`error-${id}`}
              className="flex items-center gap-1.5 text-sm text-error-600"
              role="alert"
            >
              <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleOpenUrl}
              className="
                inline-flex items-center gap-1.5 rounded-lg border
                border-neutral-200 px-3 py-1.5 text-sm font-medium
                text-neutral-700 transition-colors hover:bg-neutral-50
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-primary-500
              "
              aria-label={`Get API key for ${name}`}
            >
              Get Key
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleTest}
              disabled={!apiKey.trim() || testing || success}
              className="
                inline-flex flex-1 items-center justify-center gap-1.5
                rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium
                text-white transition-colors hover:bg-primary-700
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-primary-500
                disabled:cursor-not-allowed disabled:opacity-50
              "
              aria-label={`Test ${name} API key`}
            >
              {testing ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Testing...
                </>
              ) : success ? (
                <>
                  <CheckCircle2
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                  Connected
                </>
              ) : (
                "Test Connection"
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
