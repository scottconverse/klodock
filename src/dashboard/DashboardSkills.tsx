import { useEffect, useState } from "react";
import {
  Loader2, CheckCircle2, XCircle, ExternalLink, AlertCircle,
  Check, Save,
} from "lucide-react";
import { listAllSkills, installSkill } from "@/lib/tauri";
import { open } from "@tauri-apps/plugin-shell";
import type { SkillMetadata } from "@/lib/types";

export function DashboardSkills() {
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialSelected, setInitialSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState<"all" | "ready" | "needs-setup">("all");

  useEffect(() => {
    listAllSkills()
      .then((list) => {
        setSkills(list);
        // Pre-select eligible (ready) skills
        const readySlugs = new Set(list.filter((s) => s.eligible).map((s) => s.slug));
        setSelected(readySlugs);
        setInitialSelected(readySlugs);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  function handleToggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
    setSaved(false);
  }

  // Check if selection changed from initial state
  const hasChanges = (() => {
    if (selected.size !== initialSelected.size) return true;
    for (const s of selected) if (!initialSelected.has(s)) return true;
    return false;
  })();

  async function handleSave() {
    setSaving(true);
    // Enable newly selected skills
    const newlySelected = [...selected].filter((s) => !initialSelected.has(s));
    for (const slug of newlySelected) {
      try {
        await installSkill(slug);
      } catch {
        // continue
      }
    }
    setInitialSelected(new Set(selected));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function openClawHub() {
    try { await open("https://clawhub.ai"); }
    catch { window.open("https://clawhub.ai", "_blank"); }
  }

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

  const readyCount = skills.filter((s) => s.eligible).length;
  const needsSetupCount = skills.filter((s) => !s.eligible).length;

  const filtered = filter === "all"
    ? skills
    : filter === "ready"
      ? skills.filter((s) => s.eligible)
      : skills.filter((s) => !s.eligible);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Skills</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {readyCount} ready, {needsSetupCount} need setup. Browse thousands more on ClawHub.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><Save className="h-4 w-4" /> Save Changes</>
              )}
            </button>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-success-600">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
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
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {([
          { key: "all" as const, label: `All (${skills.length})` },
          { key: "ready" as const, label: `Ready (${readyCount})` },
          { key: "needs-setup" as const, label: `Needs Setup (${needsSetupCount})` },
        ]).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Skills grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((skill) => {
          const isSelected = selected.has(skill.slug);
          const isMacOnly = skill.missing_requirements.some((r) => r.includes("darwin"));

          return (
            <div
              key={skill.slug}
              className={`flex flex-col gap-2 rounded-xl border p-4 shadow-sm transition-all ${
                isSelected
                  ? "border-primary-300 bg-primary-50/30"
                  : skill.eligible
                    ? "border-neutral-200 bg-white"
                    : "border-neutral-200 bg-neutral-50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-neutral-900">
                  {skill.name}
                </h3>
                {/* Toggle switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isSelected}
                  aria-label={`${isSelected ? "Disable" : "Enable"} ${skill.name}`}
                  onClick={() => !isMacOnly && handleToggle(skill.slug)}
                  disabled={isMacOnly}
                  className={`
                    relative inline-flex h-5 w-9 shrink-0 cursor-pointer
                    items-center rounded-full transition-colors
                    disabled:cursor-not-allowed disabled:opacity-40
                    ${isSelected ? "bg-primary-600" : "bg-neutral-300"}
                  `}
                >
                  <span
                    className={`
                      inline-flex h-3.5 w-3.5 items-center justify-center
                      rounded-full bg-white shadow-sm transition-transform
                      ${isSelected ? "translate-x-4.5" : "translate-x-0.5"}
                    `}
                    aria-hidden="true"
                  >
                    {isSelected && (
                      <Check className="h-2 w-2 text-primary-600" />
                    )}
                  </span>
                </button>
              </div>
              <p className="line-clamp-2 text-xs leading-relaxed text-neutral-600">
                {skill.description}
              </p>
              {skill.eligible ? (
                <p className="mt-auto text-xs font-medium text-success-600">
                  Ready to use
                </p>
              ) : isMacOnly ? (
                <p className="mt-auto text-xs text-neutral-400">
                  macOS only
                </p>
              ) : skill.missing_requirements.length > 0 ? (
                <p className="mt-auto text-xs text-amber-600">
                  {skill.missing_requirements[0]}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
