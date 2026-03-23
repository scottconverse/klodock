import { Check } from "lucide-react";
import type { WizardStep } from "@/lib/wizard-state";

const STEP_LABELS: Record<WizardStep, string> = {
  welcome: "Welcome",
  node_install: "Prerequisites",
  open_claw_install: "Install",
  api_key_setup: "AI Provider",
  personality_setup: "Personality",
  channel_setup: "Channels",
  skill_install: "Skills",
  done: "Done",
};

interface ProgressBarProps {
  steps: WizardStep[];
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
}

export function ProgressBar({
  steps,
  currentStep,
  completedSteps,
}: ProgressBarProps) {
  const currentIdx = steps.indexOf(currentStep);

  return (
    <nav aria-label="Setup progress" className="w-full px-4 py-6">
      <ol className="flex items-center justify-between">
        {steps.map((step, idx) => {
          const isCompleted = completedSteps.has(step);
          const isCurrent = step === currentStep;
          const isPast = idx < currentIdx;

          return (
            <li
              key={step}
              className="flex flex-1 items-center last:flex-none"
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`
                    flex h-8 w-8 items-center justify-center rounded-full
                    text-sm font-semibold transition-colors
                    ${
                      isCompleted
                        ? "bg-success-500 text-white"
                        : isCurrent
                          ? "bg-primary-600 text-white ring-4 ring-primary-100"
                          : isPast
                            ? "bg-primary-200 text-primary-700"
                            : "bg-neutral-200 text-neutral-500"
                    }
                  `}
                  aria-current={isCurrent ? "step" : undefined}
                  role="img"
                  aria-label={
                    isCompleted
                      ? `${STEP_LABELS[step]}: completed`
                      : isCurrent
                        ? `${STEP_LABELS[step]}: current step`
                        : `${STEP_LABELS[step]}: upcoming`
                  }
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`
                    hidden text-xs font-medium sm:block
                    ${
                      isCurrent
                        ? "text-primary-700"
                        : isCompleted
                          ? "text-success-700"
                          : "text-neutral-600"
                    }
                  `}
                >
                  {STEP_LABELS[step]}
                </span>
              </div>

              {idx < steps.length - 1 && (
                <div
                  className={`
                    mx-2 h-0.5 flex-1 rounded-full transition-colors
                    ${
                      idx < currentIdx
                        ? "bg-success-400"
                        : "bg-neutral-200"
                    }
                  `}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
