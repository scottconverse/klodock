import { useEffect, useState } from "react";
import {
  Loader2, Server, Key, Cpu, Brain, Sparkles, Globe, Zap, Router,
  CheckCircle2, AlertTriangle, RefreshCw,
} from "lucide-react";
import { ProviderCard } from "@/components/ProviderCard";
import { useToast } from "@/components/Toast";
import {
  readConfig, writeConfig, listSecrets, deleteSecret,
  checkOllama, listOllamaModels, runHealthCheck,
  restartDaemon, uninstallKlodock,
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
    icon: <Sparkles className="h-5 w-5 text-primary-500" />,
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
      const model = (cfg as any)?.agents?.defaults?.model?.primary ?? "";
      const active = detectActiveProvider(model);
      if (active) setActiveProvider(active);
      if (active === "ollama") validSet.add("ollama");

      // If we have an openrouter key, mark it
      if (keys.includes("OPENROUTER_API_KEY")) validSet.add("openrouter");

      setValidated(validSet);

      // Gateway
      const gw = (cfg as any)?.gateway;
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
        : PROVIDER_MODEL_REFS[providerId] ?? providerId;

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
      } as any);

      setActiveProvider(providerId);
      setSaved(true);

      // Restart daemon to pick up new config
      try { await restartDaemon(); } catch { /* best effort */ }

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
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const currentModel = (config as any)?.agents?.defaults?.model?.primary ?? "Not configured";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Settings</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Manage your AI provider, API keys, and gateway configuration.
        </p>
      </div>

      {/* Current model indicator */}
      <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-primary-600" />
            <div>
              <p className="text-sm font-semibold text-primary-900">Active Model</p>
              <p className="text-xs font-mono text-primary-700">{currentModel}</p>
            </div>
          </div>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-success-600">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
          {saving && (
            <span className="inline-flex items-center gap-1.5 text-sm text-primary-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-error-500" />
          <p className="text-sm text-error-700">{error}</p>
        </div>
      )}

      {/* AI Provider cards — same grid as wizard */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-3">AI Providers</h3>
        <p className="text-xs text-neutral-500 mb-4">
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
              />
              {/* Action row below card */}
              <div className="mt-2 flex gap-2">
                {validated.has(p.id) && activeProvider !== p.id && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(p.id)}
                    disabled={saving}
                    className="
                      flex-1 rounded-lg bg-primary-600 px-3 py-1.5
                      text-xs font-medium text-white
                      hover:bg-primary-700 disabled:opacity-50
                    "
                  >
                    Set as Primary
                  </button>
                )}
                {activeProvider === p.id && (
                  <span className="
                    flex-1 inline-flex items-center justify-center gap-1.5
                    rounded-lg bg-success-100 border border-success-200
                    px-3 py-1.5 text-xs font-medium text-success-700
                  ">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Primary Provider
                  </span>
                )}
                {validated.has(p.id) && !p.isLocal && (
                  <button
                    type="button"
                    onClick={() => handleRemoveKey(p.id)}
                    className="
                      rounded-lg border border-neutral-200 px-3 py-1.5
                      text-xs font-medium text-neutral-500
                      hover:text-error-600 hover:border-error-200 hover:bg-error-50
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
          <Server className="h-4 w-4 text-neutral-500" />
          <h3 className="text-sm font-semibold text-neutral-700">Gateway</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Mode</label>
            <p className="text-sm font-medium text-neutral-900 bg-neutral-50 px-3 py-2 rounded-lg border border-neutral-300">
              Local
            </p>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Authentication</label>
            <select
              value={authMode}
              onChange={(e) => setAuthMode(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm"
            >
              <option value="password">Password</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-error-200 bg-error-50/30 p-5">
        <h3 className="text-sm font-semibold text-error-700 mb-1">Danger Zone</h3>
        <p className="text-xs text-error-600 mb-3">
          Uninstall KloDock and remove all managed dependencies (Node.js, OpenClaw, API keys).
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!confirm("Uninstall KloDock? This will stop your agent and remove all managed software. Your personal data (conversations, SOUL.md) will be kept unless you choose otherwise.")) return;
              const removeData = confirm("Also remove your personal data (conversations, personality)?");
              try {
                await uninstallKlodock(removeData);
                toast.success("Uninstall complete. You can close KloDock now.");
              } catch (err: any) {
                toast.error(`Uninstall failed: ${err}`);
              }
            }}
            className="
              rounded-lg border border-error-300 bg-white
              px-4 py-2 text-xs font-medium text-error-700
              hover:bg-error-50
            "
          >
            Uninstall KloDock
          </button>
        </div>
      </div>
    </div>
  );
}
