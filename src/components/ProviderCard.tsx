import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  Download,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { storeSecret, testApiKey, checkOllama, listOllamaModels } from "@/lib/tauri";
import type { ReactNode } from "react";
import type { OllamaModel } from "@/lib/types";

export interface ProviderCardProps {
  id: string;
  name: string;
  cost: string;
  envVar: string | null;
  keyUrl: string;
  icon: ReactNode;
  isLocal?: boolean;
  validated?: boolean;
  onValidated: (providerId: string, selectedModel?: string) => void;
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

  // Ollama-specific state
  const [ollamaDetected, setOllamaDetected] = useState<boolean | null>(null);
  const [ollamaChecking, setOllamaChecking] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");

  // Auto-detect Ollama on mount if this is the local provider
  useEffect(() => {
    if (isLocal && !success) {
      detectOllama();
    }
  }, [isLocal]);

  async function detectOllama() {
    setOllamaChecking(true);
    try {
      const running = await checkOllama();
      setOllamaDetected(running);
      if (running) {
        // Fetch available models
        const models = await listOllamaModels();
        setOllamaModels(models);
        if (models.length > 0) {
          const defaultModel = models[0].name;
          setSelectedModel(defaultModel);
          setSuccess(true);
          onValidated(id, defaultModel);
        }
        // If running but no models pulled, don't validate — user needs to pull one
      }
    } catch {
      setOllamaDetected(false);
    } finally {
      setOllamaChecking(false);
    }
  }

  function handleModelChange(modelName: string) {
    setSelectedModel(modelName);
    onValidated(id, modelName);
  }

  async function handleOpenUrl() {
    try {
      await open(keyUrl);
    } catch {
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
        setError("Invalid key \u2014 please check and try again.");
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
          {ollamaChecking ? (
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Checking if Ollama is running...
            </div>
          ) : ollamaDetected && ollamaModels.length > 0 ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-success-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Ollama detected — {ollamaModels.length} model{ollamaModels.length !== 1 ? "s" : ""} available
              </p>
              <div className="space-y-1">
                <label htmlFor="ollama-model" className="block text-xs font-medium text-neutral-600">
                  Choose a model
                </label>
                <select
                  id="ollama-model"
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="
                    w-full rounded-lg border border-neutral-300 bg-neutral-50
                    px-3 py-2 text-sm
                    focus:border-primary-400 focus:outline-none focus:ring-2
                    focus:ring-primary-100
                  "
                  aria-label="Select Ollama model"
                >
                  {ollamaModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({m.size})
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-neutral-500">
                Free, local AI — no API key needed. Your data never leaves your machine.
              </p>
            </div>
          ) : ollamaDetected && ollamaModels.length === 0 ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                <p className="text-sm font-medium text-amber-800">
                  Ollama is running but has no models downloaded.
                </p>
                <p className="text-xs text-amber-700">
                  Open a terminal and run: <code className="bg-amber-100 px-1 rounded">ollama pull qwen2.5:7b</code> (tool-capable, 4.7 GB)
                </p>
                <p className="text-xs text-amber-700">
                  Then click "Check Again" below.
                </p>
              </div>
              <button
                type="button"
                onClick={detectOllama}
                disabled={ollamaChecking}
                className="
                  inline-flex w-full items-center justify-center gap-1.5
                  rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium
                  text-white transition-colors hover:bg-primary-700
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-primary-500
                  disabled:cursor-not-allowed disabled:opacity-50
                "
                aria-label="Check for Ollama models again"
              >
                {ollamaChecking ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    Checking...
                  </>
                ) : (
                  "Check Again"
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-neutral-600">
                Free — runs AI models on your computer. No API key, no cost, no data sent anywhere.
              </p>

              {ollamaDetected === false && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                  <p className="text-sm text-amber-800">
                    Ollama isn't running. To use it:
                  </p>
                  <ol className="text-xs text-amber-700 list-decimal list-inside space-y-1">
                    <li>Download and install Ollama from the link below</li>
                    <li>Open Ollama (it runs in the background)</li>
                    <li>Click "Check Again" to detect it</li>
                  </ol>
                </div>
              )}

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
                  aria-label="Download Ollama"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download Ollama
                </button>

                <button
                  type="button"
                  onClick={detectOllama}
                  disabled={ollamaChecking}
                  className="
                    inline-flex flex-1 items-center justify-center gap-1.5
                    rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium
                    text-white transition-colors hover:bg-primary-700
                    focus-visible:outline-2 focus-visible:outline-offset-2
                    focus-visible:outline-primary-500
                    disabled:cursor-not-allowed disabled:opacity-50
                  "
                  aria-label="Check if Ollama is running"
                >
                  {ollamaChecking ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      Checking...
                    </>
                  ) : (
                    "Check Again"
                  )}
                </button>
              </div>
            </div>
          )}
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

            {success ? (
              <div
                className="
                  inline-flex flex-1 items-center justify-center gap-1.5
                  rounded-lg bg-success-600 px-3 py-1.5 text-sm font-medium
                  text-white
                "
                aria-label={`${name} connected`}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Connected
              </div>
            ) : (
              <button
                type="button"
                onClick={handleTest}
                disabled={!apiKey.trim() || testing}
                className={`
                  inline-flex flex-1 items-center justify-center gap-1.5
                  rounded-lg px-3 py-1.5 text-sm font-medium
                  text-white transition-colors
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-primary-500
                  ${apiKey.trim()
                    ? "bg-primary-600 hover:bg-primary-700 cursor-pointer"
                    : "bg-neutral-300 cursor-not-allowed"
                  }
                  disabled:cursor-not-allowed
                `}
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
                ) : (
                  "Test Connection"
                )}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
