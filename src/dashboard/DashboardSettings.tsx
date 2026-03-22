import { useEffect, useState } from "react";
import { Loader2, Server, Key, Cpu } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

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

export function DashboardSettings() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    invoke<ConfigData>("read_config")
      .then(setConfig)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Settings</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Current agent configuration.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-neutral-500">
            Could not load configuration. Run the setup wizard first.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
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
            <div className="flex items-center gap-2 mb-3">
              <Key className="h-4 w-4 text-neutral-500" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-neutral-700">API Keys</h3>
            </div>
            <p className="text-sm text-neutral-600">
              API keys are stored securely in your system keychain.
              To change providers or keys, re-run the setup wizard.
            </p>
          </div>

          {/* Config path */}
          <p className="text-xs text-neutral-400">
            Configuration file: ~/.openclaw/openclaw.json
          </p>
        </div>
      )}
    </div>
  );
}
