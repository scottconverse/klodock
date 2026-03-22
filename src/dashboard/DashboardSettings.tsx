import { useEffect, useState } from "react";
import {
  Loader2, Server, Key, Cpu, Plus, Trash2, CheckCircle2,
  XCircle, Eye, EyeOff,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { storeSecret, testApiKey } from "@/lib/tauri";

interface ConfigData {
  agents?: {
    defaults?: {
      model?: { primary: string };
      workspace?: string;
    };
  };
  gateway?: {
    port?: number;
    mode?: string;
    auth?: { mode: string };
  };
}

const PROVIDERS = [
  { id: "openai", name: "OpenAI", envVar: "OPENAI_API_KEY", prefix: "sk-" },
  { id: "anthropic", name: "Anthropic", envVar: "ANTHROPIC_API_KEY", prefix: "sk-ant-" },
  { id: "gemini", name: "Google Gemini", envVar: "GOOGLE_API_KEY", prefix: "AIzaSy" },
  { id: "groq", name: "Groq", envVar: "GROQ_API_KEY", prefix: "gsk_" },
  { id: "openrouter", name: "OpenRouter", envVar: "OPENROUTER_API_KEY", prefix: "sk-or-" },
];

export function DashboardSettings() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState(false);

  // API key state
  const [storedKeys, setStoredKeys] = useState<string[]>([]);
  const [addingKey, setAddingKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [newKey, setNewKey] = useState("");
  const [keyTesting, setKeyTesting] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    Promise.all([
      invoke<ConfigData>("read_config").catch(() => null),
      invoke<string[]>("list_secrets").catch(() => []),
    ]).then(([cfg, keys]) => {
      setConfig(cfg);
      setStoredKeys(keys);
      if (!cfg) setConfigError(true);
    }).finally(() => setLoading(false));
  }, []);

  async function handleDeleteKey(envVar: string) {
    try {
      await invoke("delete_secret", { name: envVar });
      setStoredKeys((prev) => prev.filter((k) => k !== envVar));
    } catch {
      // ignore
    }
  }

  async function handleAddKey() {
    if (!selectedProvider || !newKey.trim()) return;
    const provider = PROVIDERS.find((p) => p.id === selectedProvider);
    if (!provider) return;

    setKeyTesting(true);
    setKeyError(null);

    try {
      const valid = await testApiKey(selectedProvider, newKey.trim());
      if (valid) {
        await storeSecret(provider.envVar, newKey.trim());
        setStoredKeys((prev) => [...new Set([...prev, provider.envVar])]);
        setAddingKey(false);
        setNewKey("");
        setSelectedProvider("");
        setKeySaved(true);
        setTimeout(() => setKeySaved(false), 3000);
      } else {
        setKeyError("Invalid key — please check and try again.");
      }
    } catch {
      setKeyError("Could not verify the key. Please try again.");
    } finally {
      setKeyTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const model = config?.agents?.defaults?.model?.primary ?? "Not configured";
  const port = config?.gateway?.port ?? 18789;
  const mode = config?.gateway?.mode ?? "local";
  const authMode = config?.gateway?.auth?.mode ?? "none";

  // Map stored key names to provider display names
  const configuredProviders = PROVIDERS.filter((p) => storedKeys.includes(p.envVar));
  const availableProviders = PROVIDERS.filter((p) => !storedKeys.includes(p.envVar));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Settings</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Current agent configuration.
        </p>
      </div>

      {/* Model */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="h-4 w-4 text-neutral-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-neutral-700">AI Model</h3>
        </div>
        <p className="text-sm text-neutral-900 font-mono bg-neutral-50 px-3 py-2 rounded-lg">
          {model}
        </p>
      </div>

      {/* Gateway */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-neutral-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-neutral-700">Gateway</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <p className="text-xs text-neutral-500">Port</p>
            <p className="text-sm font-medium text-neutral-900">{port}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Mode</p>
            <p className="text-sm font-medium text-neutral-900 capitalize">{mode}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Auth</p>
            <p className="text-sm font-medium text-neutral-900 capitalize">{authMode}</p>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-neutral-500" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-neutral-700">API Keys</h3>
          </div>
          {!addingKey && availableProviders.length > 0 && (
            <button
              type="button"
              onClick={() => setAddingKey(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              <Plus className="h-3 w-3" />
              Add Key
            </button>
          )}
        </div>

        {keySaved && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-success-50 border border-success-200 p-2">
            <CheckCircle2 className="h-4 w-4 text-success-500" />
            <p className="text-xs text-success-700">API key saved and verified!</p>
          </div>
        )}

        {/* Configured keys */}
        {configuredProviders.length > 0 ? (
          <div className="space-y-2">
            {configuredProviders.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success-500" />
                  <span className="text-sm font-medium text-neutral-900">{provider.name}</span>
                  <span className="text-xs text-neutral-400 font-mono">{provider.prefix}***</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteKey(provider.envVar)}
                  className="rounded p-1 text-neutral-400 hover:text-error-500 hover:bg-error-50"
                  aria-label={`Remove ${provider.name} key`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : !addingKey ? (
          <p className="text-sm text-neutral-500">
            No API keys configured. Using Ollama (local) — no key needed.
          </p>
        ) : null}

        {/* Add key form */}
        {addingKey && (
          <div className="mt-3 space-y-3 rounded-lg border border-primary-200 bg-primary-50 p-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-neutral-700">Provider</label>
              <select
                value={selectedProvider}
                onChange={(e) => { setSelectedProvider(e.target.value); setKeyError(null); }}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select a provider...</option>
                {availableProviders.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-neutral-700">API Key</label>
              <input
                type="password"
                value={newKey}
                onChange={(e) => { setNewKey(e.target.value); setKeyError(null); }}
                placeholder={selectedProvider ? PROVIDERS.find((p) => p.id === selectedProvider)?.prefix + "..." : "Select a provider first"}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            {keyError && (
              <p className="flex items-center gap-1.5 text-xs text-error-600">
                <XCircle className="h-3.5 w-3.5" />
                {keyError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setAddingKey(false); setNewKey(""); setSelectedProvider(""); setKeyError(null); }}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddKey}
                disabled={!selectedProvider || !newKey.trim() || keyTesting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {keyTesting ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Verifying...</>
                ) : (
                  "Save & Verify"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Config path */}
      <p className="text-xs text-neutral-400">
        Configuration file: ~/.openclaw/openclaw.json
      </p>
    </div>
  );
}
