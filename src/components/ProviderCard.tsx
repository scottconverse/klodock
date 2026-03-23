import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  Download,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import {
  storeSecret, testApiKey, checkOllama, listOllamaModels,
  checkOllamaInstalled, downloadOllama, installOllamaApp,
  pullOllamaModel, onOllamaInstallProgress, onOllamaModelProgress,
} from "@/lib/tauri";
import type { ReactNode } from "react";
import type { OllamaModel } from "@/lib/types";

/** Minimum key-format rules per provider — prevents accidental "Test" clicks. */
const KEY_PATTERNS: Record<string, { prefix: string; minLen: number }> = {
  anthropic: { prefix: "sk-ant-", minLen: 40 },
  openai:    { prefix: "sk-",     minLen: 30 },
  gemini:    { prefix: "AIzaSy",  minLen: 35 },
  groq:      { prefix: "gsk_",    minLen: 30 },
  openrouter:{ prefix: "sk-or-",  minLen: 30 },
};

function isKeyFormatValid(providerId: string, key: string): boolean {
  const rule = KEY_PATTERNS[providerId];
  if (!rule) return key.trim().length > 10; // fallback: any 10+ char key
  return key.startsWith(rule.prefix) && key.length >= rule.minLen;
}

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
  const [ollamaIsInstalled, setOllamaIsInstalled] = useState<boolean | null>(null);
  const [ollamaChecking, setOllamaChecking] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [ollamaInstalling, setOllamaInstalling] = useState(false);
  const [ollamaInstallMsg, setOllamaInstallMsg] = useState("");
  const [ollamaInstallPct, setOllamaInstallPct] = useState(0);
  const [modelPulling, setModelPulling] = useState(false);
  const [modelPullMsg, setModelPullMsg] = useState("");
  const [modelPullPct, setModelPullPct] = useState(0);

  // Auto-detect Ollama on mount if this is the local provider.
  // Always run detection — even when previously validated — because
  // Ollama may have been stopped since last check.
  useEffect(() => {
    if (isLocal) {
      detectOllama();
    }
  }, [isLocal]);

  async function detectOllama() {
    setOllamaChecking(true);
    try {
      // Check if Ollama binary is installed (separate from running)
      const status = await checkOllamaInstalled().catch(() => null);
      setOllamaIsInstalled(status?.installed ?? false);

      // Check if Ollama is running
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

  async function handleInstallOllama() {
    setOllamaInstalling(true);
    setOllamaInstallMsg("Preparing...");
    setOllamaInstallPct(0);
    setError(null);

    const unlisten = await onOllamaInstallProgress((p) => {
      setOllamaInstallMsg(p.message);
      setOllamaInstallPct(p.percent);
    });

    try {
      const installerPath = await downloadOllama();
      await installOllamaApp(installerPath);
      // Ollama should be running now — detect it
      await detectOllama();
    } catch (e) {
      setError(String(e));
    } finally {
      setOllamaInstalling(false);
      unlisten();
    }
  }

  async function handlePullModel(model: string) {
    setModelPulling(true);
    setModelPullMsg(`Pulling ${model}...`);
    setModelPullPct(0);

    const unlisten = await onOllamaModelProgress((p) => {
      setModelPullMsg(p.message);
      setModelPullPct(p.percent);
    });

    try {
      await pullOllamaModel(model);
      // Re-detect to refresh model list
      await detectOllama();
    } catch (e) {
      setError(String(e));
    } finally {
      setModelPulling(false);
      unlisten();
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
    if (!isKeyFormatValid(id, apiKey) || !envVar) return;
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
        shadow-sm transition-all overflow-hidden
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
          <p className="text-xs text-neutral-600">{cost}</p>
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
              <p className="text-xs text-neutral-600">
                Free, local AI — no API key needed. Your data never leaves your machine.
              </p>
            </div>
          ) : ollamaDetected && ollamaModels.length === 0 ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                <p className="text-sm font-medium text-amber-800">
                  Ollama is running but has no models yet.
                </p>
                <p className="text-xs text-amber-700">
                  Click below to download a recommended model (qwen2.5:7b — 4.7 GB, supports tool calling).
                </p>
              </div>

              {modelPulling ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-neutral-700">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {modelPullMsg}
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all duration-300"
                      style={{ width: `${Math.min(modelPullPct, 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handlePullModel("qwen2.5:7b")}
                    className="
                      inline-flex flex-1 items-center justify-center gap-1.5
                      rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium
                      text-white transition-colors hover:bg-primary-700
                      focus-visible:outline-2 focus-visible:outline-offset-2
                      focus-visible:outline-primary-500
                    "
                    aria-label="Download qwen2.5 model"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Pull qwen2.5:7b (4.7 GB)
                  </button>
                  <button
                    type="button"
                    onClick={detectOllama}
                    disabled={ollamaChecking}
                    className="
                      inline-flex items-center gap-1.5 rounded-lg border
                      border-neutral-200 px-3 py-1.5 text-sm font-medium
                      text-neutral-700 transition-colors hover:bg-neutral-50
                      disabled:cursor-not-allowed disabled:opacity-50
                    "
                    aria-label="Check for Ollama models again"
                  >
                    {ollamaChecking ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      "Check Again"
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-neutral-600">
                Free — runs AI models on your computer. No API key, no cost, no data sent anywhere.
              </p>

              {ollamaInstalling ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-neutral-700">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {ollamaInstallMsg}
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all duration-300"
                      style={{ width: `${Math.min(ollamaInstallPct, 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {ollamaDetected === false && ollamaIsInstalled && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                      <p className="text-sm text-blue-800">
                        Ollama is installed but not running. Start Ollama, then click "Check Again."
                      </p>
                    </div>
                  )}
                  {ollamaDetected === false && ollamaIsInstalled === false && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                      <p className="text-sm text-amber-800">
                        Ollama isn't installed. Click below to install it automatically.
                      </p>
                    </div>
                  )}

                  {error && (
                    <p className="flex items-center gap-1.5 text-sm text-error-600" role="alert">
                      <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {error}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {!ollamaIsInstalled && (
                    <button
                      type="button"
                      onClick={handleInstallOllama}
                      disabled={ollamaInstalling}
                      className="
                        inline-flex flex-1 items-center justify-center gap-1.5
                        rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium
                        text-white transition-colors hover:bg-primary-700
                        focus-visible:outline-2 focus-visible:outline-offset-2
                        focus-visible:outline-primary-500
                        disabled:cursor-not-allowed disabled:opacity-50
                      "
                      aria-label="Install Ollama"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Install Ollama
                    </button>
                    )}

                    <button
                      type="button"
                      onClick={detectOllama}
                      disabled={ollamaChecking}
                      className="
                        inline-flex items-center gap-1.5 rounded-lg border
                        border-neutral-200 px-3 py-1.5 text-sm font-medium
                        text-neutral-700 transition-colors hover:bg-neutral-50
                        focus-visible:outline-2 focus-visible:outline-offset-2
                        focus-visible:outline-primary-500
                        disabled:cursor-not-allowed disabled:opacity-50
                      "
                      aria-label="Check if Ollama is already installed"
                    >
                      {ollamaChecking ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        "Check Again"
                      )}
                    </button>
                  </div>
                </>
              )}
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

          {/* Action buttons — flex-wrap prevents overflow on narrow cards */}
          <div className="flex flex-wrap gap-2">
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
                disabled={!isKeyFormatValid(id, apiKey) || testing}
                className={`
                  inline-flex flex-1 items-center justify-center gap-1.5
                  rounded-lg px-3 py-1.5 text-sm font-medium
                  text-white transition-colors
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-primary-500
                  ${isKeyFormatValid(id, apiKey)
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
