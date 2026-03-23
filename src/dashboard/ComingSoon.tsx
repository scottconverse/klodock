import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Construction className="h-12 w-12 text-neutral-300" aria-hidden="true" />
      <h2 className="mt-4 text-xl font-bold text-neutral-900">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-neutral-600">{description}</p>
      <span className="mt-4 inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
        Coming in v1.5
      </span>
    </div>
  );
}
