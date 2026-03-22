import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Package, ExternalLink } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { checkOpenClaw } from "@/lib/tauri";

interface VersionInfo {
  klodock: string;
  openclaw: string | null;
  node: string | null;
}

export function DashboardUpdates() {
  const [versions, setVersions] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadVersions() {
      try {
        const oc = await checkOpenClaw();
        setVersions({
          klodock: "0.1.0",
          openclaw: oc.version ?? null,
          node: null, // Could query but not critical
        });
      } catch {
        setVersions({
          klodock: "0.1.0",
          openclaw: null,
          node: null,
        });
      } finally {
        setLoading(false);
      }
    }
    loadVersions();
  }, []);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Updates</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Current versions of KloDock and its dependencies.
        </p>
      </div>

      <div className="space-y-4">
        {/* KloDock version */}
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-primary-500" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">KloDock</h3>
              <p className="text-xs text-neutral-500">Desktop application</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-neutral-700">
              v{versions?.klodock ?? "?"}
            </span>
            <CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden="true" />
          </div>
        </div>

        {/* OpenClaw version */}
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-neutral-500" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">OpenClaw</h3>
              <p className="text-xs text-neutral-500">AI agent framework</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-neutral-700">
              {versions?.openclaw ?? "Not installed"}
            </span>
            {versions?.openclaw && (
              <CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-neutral-700 mb-2">Resources</h3>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => openLink("https://docs.openclaw.ai")}
            className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700"
          >
            OpenClaw Documentation
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => openLink("https://clawhub.ai")}
            className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700"
          >
            ClawHub Skill Registry
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
