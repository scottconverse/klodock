import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { SafetyBadge } from "@/components/SafetyBadge";
import {
  getRecommendedSkills,
  listAllSkills,
  installSkill,
  completeStep,
} from "@/lib/tauri";
import type { SkillMetadata } from "@/lib/types";

export function Skills() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [allSkills, setAllSkills] = useState<SkillMetadata[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<{
    done: number;
    total: number;
    currentSkill: string;
  } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    getRecommendedSkills(["general", "productivity"])
      .then((list) => {
        if (!mountedRef.current) return;
        setSkills(list);
        // Pre-select all recommended skills
        setSelected(new Set(list.map((s) => s.slug)));
        setLoadError(false);
      })
      .catch((err) => {
        console.error("Failed to load skills:", err);
        if (!mountedRef.current) return;
        setSkills([]);
        setLoadError(true);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleBrowseAll() {
    if (allSkills.length > 0) {
      setShowAll(!showAll);
      return;
    }
    setLoadingAll(true);
    try {
      const all = await listAllSkills();
      // Filter out skills already in the recommended list
      const recommendedSlugs = new Set(skills.map((s) => s.slug));
      const additional = all.filter((s) => !recommendedSlugs.has(s.slug));
      setAllSkills(additional);
      setShowAll(true);
    } catch {
      // Silently fail — browse is optional
    } finally {
      setLoadingAll(false);
    }
  }

  function handleToggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }

  async function handleFinish() {
    const slugs = Array.from(selected);

    if (slugs.length === 0) {
      // Nothing to install, just proceed
      try {
        await completeStep("skill_install");
      } catch {
        // Non-critical
      }
      navigate("/wizard/done");
      return;
    }

    setInstalling(true);
    setInstallProgress({ done: 0, total: slugs.length, currentSkill: "" });

    let completed = 0;
    for (const slug of slugs) {
      // Show which skill is being installed
      const skillName = skills.find((s) => s.slug === slug)?.name ?? slug;
      if (mountedRef.current) {
        setInstallProgress({ done: completed, total: slugs.length, currentSkill: skillName });
      }
      try {
        await installSkill(slug);
      } catch {
        // Continue installing others even if one fails
      }
      completed++;
      if (mountedRef.current) {
        setInstallProgress({ done: completed, total: slugs.length, currentSkill: "" });
      }
    }

    try {
      await completeStep("skill_install");
    } catch {
      // Non-critical
    }

    // Show success confirmation before advancing
    setInstalling(false);
    setInstallProgress({ done: completed, total: slugs.length, currentSkill: "done" });
    await new Promise((r) => setTimeout(r, 2000));
    navigate("/wizard/done");
  }

  async function handleSkip() {
    try {
      await completeStep("skill_install");
    } catch {
      // Non-critical
    }
    navigate("/wizard/done");
  }

  // Loading state
  if (loading) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-neutral-900">
          Add Starter Skills
        </h2>
        <p className="mt-2 text-neutral-600">
          Skills give your agent new abilities. Finding recommendations for
          you...
        </p>
        <div
          className="mt-12 flex flex-col items-center gap-3"
          role="status"
          aria-label="Loading skill recommendations"
        >
          <Loader2
            className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary-500"
            aria-hidden="true"
          />
          <p className="text-sm text-neutral-500">
            Finding skills for you...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-neutral-900">
          Add Starter Skills
        </h2>
        <p className="mt-2 text-neutral-600">
          Skills give your agent new abilities.
        </p>
        <div
          className="mt-12 flex flex-col items-center gap-4 text-center"
          role="alert"
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-100"
            aria-hidden="true"
          >
            <AlertTriangle className="h-6 w-6 text-warning-600" />
          </div>
          <p className="max-w-sm text-sm text-neutral-600">
            Couldn't load skill recommendations. You can always add skills later
            from the dashboard.
          </p>
          <button
            type="button"
            onClick={handleSkip}
            className="
              rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold
              text-white shadow-lg shadow-primary-200 transition-all
              hover:bg-primary-700
              focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-primary-500
            "
            aria-label="Skip skill installation and finish setup"
          >
            Skip &amp; Finish
          </button>
        </div>
      </div>
    );
  }

  // Normal state: show skill cards
  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900">
        Add Starter Skills
      </h2>
      <p className="mt-2 text-neutral-600">
        Skills give your agent new abilities. These are bundled with OpenClaw
        and ready to use. Browse thousands more at clawhub.ai.
      </p>

      {skills.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-neutral-500">
            No skill recommendations available right now.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {skills.map((skill) => {
            const isSelected = selected.has(skill.slug);
            return (
              <div
                key={skill.slug}
                className={`
                  flex flex-col gap-3 rounded-xl border p-5 shadow-sm
                  transition-all
                  ${
                    isSelected
                      ? "border-primary-300 bg-primary-50/30 ring-1 ring-primary-200"
                      : "border-neutral-200 bg-white hover:shadow-md"
                  }
                `}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-neutral-900">
                      {skill.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {skill.author}
                    </p>
                  </div>
                  <SafetyBadge rating={skill.safety_rating} />
                </div>

                <p className="line-clamp-2 text-sm leading-relaxed text-neutral-600">
                  {skill.description}
                </p>

                <div className="flex items-center justify-between pt-1">
                  <span className={`text-xs font-medium ${
                    skill.install_count === 0
                      ? "text-neutral-500"
                      : "text-neutral-500"
                  }`}>
                    {skill.install_count > 0
                      ? `${skill.install_count.toLocaleString()} installs`
                      : "Bundled with OpenClaw"}
                  </span>

                  {/* Toggle switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isSelected}
                    aria-label={`${isSelected ? "Exclude" : "Include"} ${skill.name}`}
                    onClick={() => handleToggle(skill.slug)}
                    disabled={installing}
                    className={`
                      relative inline-flex h-6 w-11 shrink-0 cursor-pointer
                      items-center rounded-full transition-colors
                      focus-visible:outline-2 focus-visible:outline-offset-2
                      focus-visible:outline-primary-500
                      disabled:cursor-not-allowed disabled:opacity-50
                      ${isSelected ? "bg-primary-600" : "bg-neutral-300"}
                    `}
                  >
                    <span
                      className={`
                        inline-flex h-4 w-4 items-center justify-center
                        rounded-full bg-white shadow-sm transition-transform
                        ${isSelected ? "translate-x-6" : "translate-x-1"}
                      `}
                      aria-hidden="true"
                    >
                      {isSelected && (
                        <Check className="h-2.5 w-2.5 text-primary-600" />
                      )}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Browse all skills */}
      {!installing && !installProgress && skills.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleBrowseAll}
            disabled={loadingAll}
            className="
              inline-flex items-center gap-1.5 text-sm font-medium
              text-primary-600 hover:text-primary-700 transition-colors
              disabled:opacity-50
            "
            aria-expanded={showAll}
            aria-label={showAll ? "Hide additional skills" : "Browse all available skills"}
          >
            {loadingAll ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading...
              </>
            ) : showAll ? (
              <>
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
                Hide additional skills
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                Browse all {allSkills.length > 0 ? allSkills.length : ""} available skills
              </>
            )}
          </button>

          {showAll && allSkills.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {allSkills.map((skill) => {
                const isSelected = selected.has(skill.slug);
                return (
                  <div
                    key={skill.slug}
                    className={`
                      flex flex-col gap-3 rounded-xl border p-5 shadow-sm
                      transition-all
                      ${
                        isSelected
                          ? "border-primary-300 bg-primary-50/30 ring-1 ring-primary-200"
                          : "border-neutral-200 bg-white hover:shadow-md"
                      }
                    `}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-neutral-900">
                          {skill.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {skill.author}
                        </p>
                      </div>
                      <SafetyBadge rating={skill.safety_rating} />
                    </div>

                    <p className="line-clamp-2 text-sm leading-relaxed text-neutral-600">
                      {skill.description}
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-medium text-neutral-500">
                        Bundled with OpenClaw
                      </span>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={isSelected}
                        aria-label={`${isSelected ? "Exclude" : "Include"} ${skill.name}`}
                        onClick={() => handleToggle(skill.slug)}
                        disabled={installing}
                        className={`
                          relative inline-flex h-6 w-11 shrink-0 cursor-pointer
                          items-center rounded-full transition-colors
                          focus-visible:outline-2 focus-visible:outline-offset-2
                          focus-visible:outline-primary-500
                          disabled:cursor-not-allowed disabled:opacity-50
                          ${isSelected ? "bg-primary-600" : "bg-neutral-300"}
                        `}
                      >
                        <span
                          className={`
                            inline-flex h-4 w-4 items-center justify-center
                            rounded-full bg-white shadow-sm transition-transform
                            ${isSelected ? "translate-x-6" : "translate-x-1"}
                          `}
                          aria-hidden="true"
                        >
                          {isSelected && (
                            <Check className="h-2.5 w-2.5 text-primary-600" />
                          )}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Success confirmation */}
      {!installing && installProgress && installProgress.currentSkill === "done" && (
        <div
          className="mt-6 flex flex-col items-center gap-3"
          role="status"
          aria-label="Skills enabled successfully"
        >
          <CheckCircle2
            className="h-10 w-10 text-success-500"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-success-700">
            {installProgress.total} skill{installProgress.total !== 1 ? "s" : ""} enabled!
          </p>
        </div>
      )}

      {/* Install progress */}
      {installing && installProgress && (
        <div
          className="mt-6 flex flex-col items-center gap-2"
          role="status"
          aria-label={`Installing skills: ${installProgress.done} of ${installProgress.total} complete`}
        >
          <div className="flex items-center gap-2">
            <Loader2
              className="h-5 w-5 animate-spin motion-reduce:animate-none text-primary-500"
              aria-hidden="true"
            />
            <p className="text-sm text-neutral-600">
              {installProgress.currentSkill
                ? `Installing ${installProgress.currentSkill}... (${installProgress.done + 1} of ${installProgress.total})`
                : `Installed ${installProgress.done} of ${installProgress.total}`}
            </p>
          </div>
          <div
            className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-neutral-200"
            role="progressbar"
            aria-label="Skill installation progress"
            aria-valuenow={installProgress.done}
            aria-valuemin={0}
            aria-valuemax={installProgress.total}
          >
            <div
              className="h-full rounded-full bg-primary-500 transition-all motion-reduce:transition-none"
              style={{
                width: `${(installProgress.done / installProgress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleFinish}
          disabled={installing}
          aria-label={
            selected.size > 0
              ? `Install ${selected.size} skill${selected.size > 1 ? "s" : ""} and finish`
              : "Skip and finish"
          }
          className="
            inline-flex items-center gap-2 rounded-xl bg-primary-600
            px-6 py-3 text-sm font-semibold text-white shadow-lg
            shadow-primary-200 transition-all hover:bg-primary-700
            focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-primary-500
            disabled:cursor-not-allowed disabled:opacity-50
          "
        >
          {installing && (
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {selected.size > 0
            ? `Install ${selected.size} Skill${selected.size > 1 ? "s" : ""} & Finish`
            : "Skip & Finish"}
        </button>
      </div>
    </div>
  );
}
