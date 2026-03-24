import { useEffect, useState, useCallback } from "react";
import {
  Loader2, Server, Key, Cpu, Brain, Bot, Globe, Zap, Router,
  CheckCircle2, AlertTriangle, RefreshCw,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ProviderCard } from "@/components/ProviderCard";
import { useToast } from "@/components/Toast";
import {
  readConfig, writeConfig, listSecrets, deleteSecret,
  checkOllama, listOllamaModels, runHealthCheck,
  restartDaemon, startDaemon, uninstallKlodock,
} from "@/lib/tauri";
import type { OpenClawConfig } from "@/lib/types";

/* ── Provider definitions (same as wizard ModelProvider) ── */

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    cost: "~$5-20/mo",
    envVar: "OPENAI_API_KEY",
    keyUrl: "https://platform.openai.com/api-keys",
    icon: <Brain className="h-5 w-5 text-primary-500" />,
    isLocal: false,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    cost: "~$5-20/mo",
    envVar: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com/settings/keys",
    icon: <Bot className="h-5 w-5 text-primary-500" />,
    isLocal: false,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    cost: "Free tier available",
    envVar: "GOOGLE_API_KEY",
    keyUrl: "https://aistudio.google.com/apikey",
    icon: <Globe className="h-5 w-5 text-primary-500" />,
    isLocal: false,
  },
  {
    id: "groq",
    name: "Groq",
    cost: "Free tier available",
    envVar: "GROQ_API_KEY",
    keyUrl: "https://console.groq.com/keys",
    icon: <Zap className="h-5 w-5 text-primary-500" />,
    isLocal: false,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    cost: "Pay per use",
    envVar: "OPENROUTER_API_KEY",
    keyUrl: "https://openrouter.ai/keys",
    icon: <Router className="h-5 w-5 text-primary-500" />,
    isLocal: false,
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    cost: "Free — runs on your computer",
    envVar: null,
    keyUrl: "https://ollama.com/download",
    icon: <Server className="h-5 w-5 text-primary-500" />,
    isLocal: true,
  },
] as const;

const PROVIDER_MODEL_REFS: Record<string, string> = {
  openai: "openai/gpt-4o",
  anthropic: "anthropic/claude-sonnet-4-6",
  gemini: "google/gemini-2.5-flash",
  groq: "groq/llama-3.3-70b-versatile",
  openrouter: "anthropic/claude-sonnet-4",
  ollama: "ollama/llama3",
};

/** Detect which provider ID is currently active from a model ref like "ollama/qwen2.5:7b" */
function detectActiveProvider(modelRef: string): string | null {
  if (modelRef.startsWith("ollama/")) return "ollama";
  if (modelRef.startsWith("openai/")) return "openai";
  if (modelRef.startsWith("anthropic/")) return "anthropic";
  if (modelRef.startsWith("google/")) return "gemini";
  if (modelRef.startsWith("groq/")) return "groq";
  // OpenRouter uses various prefixes — check if an OpenRouter key is stored
  return null;
}

export function DashboardSettings() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<OpenClawConfig | null>(null);
  const [storedKeys, setStoredKeys] = useState<string[]>([]);
  const [validated, setValidated] = useState<Set<string>>(new Set());
  const [ollamaSelectedModel, setOllamaSelectedModel] = useState("");
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gateway state
  const [port, setPort] = useState(18789);
  const [authMode, setAuthMode] = useState("password");

  useEffect(() => {
    Promise.all([
      readConfig().catch(() => null),
      listSecrets().catch(() => [] as string[]),
    ]).then(([cfg, keys]) => {
      setConfig(cfg);
      setStoredKeys(keys);

      // Determine which providers are already validated
      const validSet = new Set<string>();

      // Check stored API keys
      for (const p of PROVIDERS) {
        if (p.envVar && keys.includes(p.envVar)) {
          validSet.add(p.id);
        }
      }

      // Check if Ollama is active
      const model = cfg?.agents?.defaults?.model?.primary ?? "";
      const active = detectActiveProvider(model);
      if (active) setActiveProvider(active);
      if (active === "ollama") validSet.add("ollama");

      // If we have an openrouter key, mark it
      if (keys.includes("OPENROUTER_API_KEY")) validSet.add("openrouter");

      setValidated(validSet);

      // Gateway
      const gw = cfg?.gateway;
      if (gw?.port) setPort(gw.port);
      if (gw?.auth?.mode) setAuthMode(gw.auth.mode);
    }).finally(() => setLoading(false));
  }, []);

  function handleValidated(providerId: string, selectedModel?: string) {
    setValidated((prev) => new Set([...prev, providerId]));
    if (providerId === "ollama" && selectedModel) {
      setOllamaSelectedModel(selectedModel);
    }
  }

  async function handleSetPrimary(providerId: string) {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const isOllama = providerId === "ollama";
      const primary = isOllama && ollamaSelectedModel
        ? `ollama/${ollamaSelectedModel}`
        : selectedModels[providerId] || PROVIDER_MODEL_REFS[providerId] || providerId;

      const gwPassword = crypto.randomUUID().slice(0, 12);
      await writeConfig({
        agents: {
          defaults: {
            workspace: "~/.openclaw/workspace",
            model: { primary },
          },
        },
        gateway: {
          mode: "local",
          port,
          auth: {
            mode: authMode,
            password: gwPassword,
          },
        },
      });

      setActiveProvider(providerId);
      setSaved(true);

      // Re-read config to update the "Active Model" display
      try {
        const newConfig = await readConfig();
        setConfig(newConfig);
      } catch { /* best effort */ }

      // Restart daemon to pick up new config (or start if not running)
      try {
        await restartDaemon();
      } catch {
        try { await startDaemon(); } catch { /* best effort */ }
      }

      toast.success(`Switched to ${PROVIDERS.find(p => p.id === providerId)?.name ?? providerId}`);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save configuration. Please try again.");
      toast.error("Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveKey(providerId: string) {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider?.envVar) return;

    try {
      await deleteSecret(provider.envVar);
      setStoredKeys((prev) => prev.filter((k) => k !== provider.envVar));
      setValidated((prev) => {
        const next = new Set(prev);
        next.delete(providerId);
        return next;
      });
      // If this was the active provider, clear it
      if (activeProvider === providerId) setActiveProvider(null);
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" aria-hidden="true" />
      </div>
    );
  }

  const currentModel = config?.agents?.defaults?.model?.primary ?? "Not configured";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Settings</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Manage your AI provider, API keys, and gateway configuration.
        </p>
      </div>

      {/* Current model indicator */}
      <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-primary-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-primary-900">Active Model</p>
              <p className="text-xs font-mono text-primary-700">{currentModel}</p>
            </div>
          </div>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-success-600">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Saved
            </span>
          )}
          {saving && (
            <span className="inline-flex items-center gap-1.5 text-sm text-primary-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving...
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-error-500" aria-hidden="true" />
          <p className="text-sm text-error-700">{error}</p>
        </div>
      )}

      {/* AI Provider cards — same grid as wizard */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-3">AI Providers</h3>
        <p className="text-xs text-neutral-600 mb-4">
          Connect a provider, then click "Set as Primary" to switch your agent's AI model.
          {validated.size > 0 && ` ${validated.size} provider${validated.size > 1 ? "s" : ""} connected.`}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <div key={p.id} className="relative">
              <ProviderCard
                id={p.id}
                name={p.name}
                cost={p.cost}
                envVar={p.envVar}
                keyUrl={p.keyUrl}
                icon={p.icon}
                isLocal={p.isLocal}
                validated={validated.has(p.id)}
                onValidated={handleValidated}
                onModelSelected={async (pid, modelId) => {
                  setSelectedModels(prev => ({ ...prev, [pid]: modelId }));
                  // Auto-save if this is the active provider
                  if (activeProvider === pid && modelId !== currentModel) {
                    try {
                      const gw = config?.gateway as Record<string, unknown> | undefined;
                      await writeConfig({
                        agents: { defaults: { workspace: "~/.openclaw/workspace", model: { primary: modelId } } },
                        gateway: {
                          mode: gw?.mode ?? "local",
                          port: gw?.port ?? 18789,
                          auth: gw?.auth ?? { mode: "password", password: crypto.randomUUID().slice(0, 12) },
                        },
                      });
                      const newConfig = await readConfig();
                      setConfig(newConfig);
                    } catch {
                      // Fallback: user can click "Apply" button
                    }
                  }
                }}
                activeModelId={currentModel}
              />
              {/* Action row below card */}
              <div className="mt-2 space-y-1.5">
                {validated.has(p.id) && activeProvider !== p.id && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(p.id)}
                    disabled={saving}
                    className="
                      w-full rounded-lg bg-primary-600 px-3 py-1.5
                      text-xs font-medium text-white
                      hover:bg-primary-700 disabled:opacity-50
                      focus:ring-2 focus:ring-blue-500 focus:outline-none
                    "
                  >
                    Set as Primary
                  </button>
                )}
                {activeProvider === p.id && selectedModels[p.id] && selectedModels[p.id] !== currentModel && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(p.id)}
                    disabled={saving}
                    className="
                      w-full rounded-lg bg-primary-600 px-3 py-1.5
                      text-xs font-medium text-white
                      hover:bg-primary-700 disabled:opacity-50
                      focus:ring-2 focus:ring-blue-500 focus:outline-none
                    "
                  >
                    {saving ? "Applying..." : "Apply Model Change"}
                  </button>
                )}
                {activeProvider === p.id && (
                  <div className="
                    w-full inline-flex items-center justify-center gap-1.5
                    rounded-lg bg-success-100 border border-success-200
                    px-3 py-1.5 text-xs font-medium text-success-700
                  ">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Primary Provider
                  </div>
                )}
                {validated.has(p.id) && !p.isLocal && (
                  <button
                    type="button"
                    onClick={() => handleRemoveKey(p.id)}
                    className="
                      w-full rounded-lg border border-neutral-200 px-3 py-1.5
                      text-xs font-medium text-neutral-600
                      hover:text-error-600 hover:border-error-200 hover:bg-error-50
                      focus:ring-2 focus:ring-blue-500 focus:outline-none
                    "
                  >
                    Remove Key
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gateway settings */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-neutral-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-neutral-700">Gateway</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="gateway-port" className="block text-xs text-neutral-600 mb-1">Port</label>
            <input
              id="gateway-port"
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div>
            <label htmlFor="gateway-mode" className="block text-xs text-neutral-600 mb-1">Mode</label>
            <p className="text-sm font-medium text-neutral-900 bg-neutral-50 px-3 py-2 rounded-lg border border-neutral-300">
              Local
            </p>
          </div>
          <div>
            <label htmlFor="gateway-auth" className="block text-xs text-neutral-600 mb-1">Authentication</label>
            <select
              id="gateway-auth"
              value={authMode}
              onChange={(e) => setAuthMode(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              <option value="password">Password</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
      </div>

      {/* Keep API Keys toggle */}
      <KeepKeysToggle />

      {/* Uninstall — understated, not alarming */}
      <UninstallSection />
    </div>
  );
}

/* ── Keep API Keys toggle ── */

function KeepKeysToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    invoke<boolean>("get_keep_keys")
      .then((val) => setEnabled(val))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggle() {
    const next = !enabled;
    try {
      await invoke("set_keep_keys", { enabled: next });
      setEnabled(next);
      toast.success(next
        ? "API keys will stay on disk when the agent stops."
        : "API keys will be removed from disk when the agent stops."
      );
    } catch {
      toast.error("Couldn't save that setting. Try again.");
    }
  }

  if (loading) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            Keep API keys on disk
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">
            Leave your API keys in a file so you can use OpenClaw from the terminal.
            If you only use KloDock, leave this off.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Keep API keys accessible on disk"
          onClick={toggle}
          className={`
            relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full
            border-2 border-transparent transition-colors duration-200
            focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-primary-500
            ${enabled ? "bg-primary-600" : "bg-neutral-200"}
          `}
        >
          <span
            className={`
              pointer-events-none inline-block h-5 w-5 rounded-full
              bg-white shadow-sm ring-0 transition-transform duration-200
              ${enabled ? "translate-x-5" : "translate-x-0"}
            `}
          />
        </button>
      </div>
      {enabled && (
        <div className="mt-3 rounded-lg bg-warning-50 border border-warning-200 p-3">
          <p className="text-xs text-warning-700">
            ⚠ Your API keys will remain in a plain-text file on disk even when the agent is stopped.
            Anyone with access to your computer could read them.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Uninstall with step-by-step progress ── */

const STEP_LABELS: Record<string, string> = {
  StopDaemon: "Stopping agent",
  RemoveAutostart: "Removing autostart",
  ScrubEnv: "Cleaning environment",
  ClearKeychain: "Removing stored keys",
  RemoveNode: "Removing Node.js",
  RemoveOpenClaw: "Removing OpenClaw",
  RemoveKlodockConfig: "Removing configuration",
};

interface UninstallProgress {
  step: string;
  success: boolean;
  error: string | null;
  completed_count: number;
  total_count: number;
}

function UninstallSection() {
  const toast = useToast();
  const [uninstalling, setUninstalling] = useState(false);
  const [progress, setProgress] = useState<UninstallProgress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for uninstall-progress events from the backend
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<UninstallProgress>("uninstall-progress", (event) => {
      setProgress(event.payload);
      if (event.payload.error) {
        setError(event.payload.error);
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  const handleUninstall = useCallback(async () => {
    if (!confirm("Uninstall KloDock? This will stop your agent and remove all managed software.")) return;
    const removeData = confirm("Also remove your personal data (conversations, personality)?");

    setUninstalling(true);
    setProgress(null);
    setError(null);
    setDone(false);

    try {
      await uninstallKlodock(removeData);
      setDone(true);
      toast.success("Uninstall complete. You can close KloDock now.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(`Uninstall failed at a step. You can retry — it will resume where it left off.`);
    } finally {
      setUninstalling(false);
    }
  }, [toast]);

  return (
    <div className="border-t border-neutral-100 pt-4">
      <details className="group">
        <summary
          className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-600 select-none"
          aria-label="Expand uninstall options"
        >
          Uninstall KloDock...
        </summary>
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          {done ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success-600" aria-hidden="true" />
              <p className="text-xs text-success-700 font-medium">
                Uninstall complete. You can close KloDock now.
              </p>
            </div>
          ) : uninstalling || progress ? (
            <div className="space-y-3" role="status" aria-live="polite" aria-label="Uninstall progress">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary-500" aria-hidden="true" />
                <p className="text-xs font-medium text-neutral-700">
                  {progress
                    ? `${STEP_LABELS[progress.step] ?? progress.step}... (${progress.completed_count}/${progress.total_count})`
                    : "Starting uninstall..."}
                </p>
              </div>
              {/* Progress bar */}
              {progress && (
                <div className="w-full bg-neutral-200 rounded-full h-1.5" role="progressbar"
                  aria-valuenow={progress.completed_count} aria-valuemax={progress.total_count}>
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${error ? "bg-error-500" : "bg-primary-500"}`}
                    style={{ width: `${(progress.completed_count / progress.total_count) * 100}%` }}
                  />
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 mt-2">
                  <AlertTriangle className="h-4 w-4 text-error-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-error-600">
                    {error}. The next time KloDock launches, it will automatically resume.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-neutral-600 mb-3">
                This will stop your agent and remove Node.js, OpenClaw, and stored API keys.
                Your personal data (conversations, personality) is kept unless you choose otherwise.
              </p>
              <button
                type="button"
                onClick={handleUninstall}
                className="
                  rounded-lg border border-neutral-300 bg-white
                  px-4 py-2 text-xs font-medium text-neutral-600
                  hover:text-error-600 hover:border-error-200 hover:bg-error-50
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-primary-500
                "
                aria-label="Uninstall KloDock and all managed dependencies"
              >
                Uninstall
              </button>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
