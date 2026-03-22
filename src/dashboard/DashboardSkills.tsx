import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { SafetyBadge } from "@/components/SafetyBadge";
import { listAllSkills } from "@/lib/tauri";
import { open } from "@tauri-apps/plugin-shell";
import type { SkillMetadata } from "@/lib/types";

export function DashboardSkills() {
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    listAllSkills()
      .then(setSkills)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  async function openClawHub() {
    try {
      await open("https://clawhub.ai");
    } catch {
      window.open("https://clawhub.ai", "_blank");
    }
  }

  // Split into ready and needs-setup
  const ready = skills.filter((s) => s.install_count === 0 && s.safety_rating === "Verified");
  const totalReady = skills.filter((_, i) => {
    // We don't have an "eligible" field in SkillMetadata on the frontend,
    // so we show all skills and let the user browse.
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <XCircle className="mx-auto h-10 w-10 text-neutral-300" />
        <p className="mt-3 text-sm text-neutral-500">
          Could not load skills. Make sure OpenClaw is installed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Skills</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {skills.length} skills available. Browse thousands more on ClawHub.
          </p>
        </div>
        <button
          type="button"
          onClick={openClawHub}
          className="
            inline-flex items-center gap-1.5 rounded-lg border
            border-neutral-200 px-3 py-1.5 text-sm font-medium
            text-neutral-700 transition-colors hover:bg-neutral-50
          "
        >
          Browse ClawHub
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => (
          <div
            key={skill.slug}
            className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-900">
                {skill.name}
              </h3>
              <SafetyBadge rating={skill.safety_rating} />
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-neutral-600">
              {skill.description}
            </p>
            <p className="text-xs text-neutral-400">{skill.author}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
