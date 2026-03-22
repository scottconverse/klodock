import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

export function DashboardPersonality() {
  const [soulContent, setSoulContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<string>("read_soul")
      .then(setSoulContent)
      .catch(() => setSoulContent(null))
      .finally(() => setLoading(false));
  }, []);

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
        <h2 className="text-xl font-bold text-neutral-900">Personality</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Your agent's identity and behavior are defined in SOUL.md.
        </p>
      </div>

      {soulContent ? (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-3">
            <FileText className="h-4 w-4 text-neutral-500" aria-hidden="true" />
            <span className="text-sm font-medium text-neutral-700">SOUL.md</span>
          </div>
          <pre className="overflow-x-auto p-5 text-sm leading-relaxed text-neutral-700 whitespace-pre-wrap font-mono">
            {soulContent}
          </pre>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <FileText className="mx-auto h-10 w-10 text-neutral-300" aria-hidden="true" />
          <p className="mt-3 text-sm text-neutral-500">
            No personality configured yet. Run the setup wizard to create one.
          </p>
        </div>
      )}

      <p className="text-xs text-neutral-400">
        To edit your agent's personality, modify ~/.openclaw/workspace/SOUL.md directly
        or re-run the setup wizard from Settings.
      </p>
    </div>
  );
}
