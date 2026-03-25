import { Package, Globe, HelpCircle } from "lucide-react";
import type { SafetyRating } from "@/lib/types";

interface SafetyBadgeProps {
  rating: SafetyRating;
}

const BADGE_CONFIG: Record<
  string,
  {
    icon: typeof Package;
    label: string;
    tooltip: string;
    classes: string;
  }
> = {
  Bundled: {
    icon: Package,
    label: "Bundled",
    tooltip: "Ships with OpenClaw. Not independently audited by KloDock.",
    classes: "bg-success-50 text-success-700 border-success-200",
  },
  Published: {
    icon: Globe,
    label: "Published",
    tooltip: "Listed on the ClawHub registry. Not audited for security.",
    classes: "bg-warning-50 text-warning-700 border-warning-200",
  },
  Unlisted: {
    icon: HelpCircle,
    label: "Unlisted",
    tooltip: "Not listed in any registry. Use at your own risk.",
    classes: "bg-neutral-100 text-neutral-600 border-neutral-200",
  },
  // Legacy mappings — old data uses these names
  Verified: {
    icon: Package,
    label: "Bundled",
    tooltip: "Ships with OpenClaw. Not independently audited by KloDock.",
    classes: "bg-success-50 text-success-700 border-success-200",
  },
  Community: {
    icon: Globe,
    label: "Published",
    tooltip: "Listed on the ClawHub registry. Not audited for security.",
    classes: "bg-warning-50 text-warning-700 border-warning-200",
  },
  Unreviewed: {
    icon: HelpCircle,
    label: "Unlisted",
    tooltip: "Not listed in any registry. Use at your own risk.",
    classes: "bg-neutral-100 text-neutral-600 border-neutral-200",
  },
};

export function SafetyBadge({ rating }: SafetyBadgeProps) {
  const entry = BADGE_CONFIG[rating] ?? BADGE_CONFIG.Unlisted;
  const { icon: Icon, label, tooltip, classes } = entry;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border
        px-2.5 py-0.5 text-xs font-medium ${classes}
      `}
      role="status"
      aria-label={`Skill status: ${label}`}
      title={tooltip}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
