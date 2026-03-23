import { ShieldCheck, Users, Circle } from "lucide-react";
import type { SafetyRating } from "@/lib/types";

interface SafetyBadgeProps {
  rating: SafetyRating;
}

const config: Record<
  SafetyRating,
  {
    icon: typeof ShieldCheck;
    label: string;
    classes: string;
  }
> = {
  Verified: {
    icon: ShieldCheck,
    label: "Verified",
    classes: "bg-success-50 text-success-700 border-success-200",
  },
  Community: {
    icon: Users,
    label: "Community",
    classes: "bg-primary-50 text-primary-700 border-primary-200",
  },
  Unreviewed: {
    icon: Circle,
    label: "Unreviewed",
    classes: "bg-neutral-100 text-neutral-600 border-neutral-200",
  },
};

export function SafetyBadge({ rating }: SafetyBadgeProps) {
  const entry = config[rating] ?? config.Unreviewed;
  const { icon: Icon, label, classes } = entry;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border
        px-2.5 py-0.5 text-xs font-medium ${classes}
      `}
      role="status"
      aria-label={`Safety rating: ${label}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
