import { Download, Trash2 } from "lucide-react";
import { SafetyBadge } from "./SafetyBadge";
import type { SkillMetadata } from "@/lib/types";

interface SkillCardProps {
  skill: SkillMetadata;
  installed?: boolean;
  onToggle: (slug: string) => void;
  loading?: boolean;
}

export function SkillCard({
  skill,
  installed = false,
  onToggle,
  loading = false,
}: SkillCardProps) {
  return (
    <div
      className="
        flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white
        p-5 shadow-sm transition-shadow hover:shadow-md
      "
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-neutral-900">
            {skill.name}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">by {skill.author}</p>
        </div>
        <SafetyBadge rating={skill.safety_rating} />
      </div>

      <p className="line-clamp-2 text-sm leading-relaxed text-neutral-600">
        {skill.description}
      </p>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-neutral-600">
          {skill.install_count.toLocaleString()} installs
        </span>

        <button
          type="button"
          onClick={() => onToggle(skill.slug)}
          disabled={loading}
          className={`
            inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5
            text-sm font-medium transition-colors
            focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-primary-500
            disabled:cursor-not-allowed disabled:opacity-50
            ${
              installed
                ? "bg-error-50 text-error-600 hover:bg-error-100"
                : "bg-primary-600 text-white hover:bg-primary-700"
            }
          `}
          aria-label={installed ? `Uninstall ${skill.name}` : `Install ${skill.name}`}
        >
          {installed ? (
            <>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Install
            </>
          )}
        </button>
      </div>
    </div>
  );
}
