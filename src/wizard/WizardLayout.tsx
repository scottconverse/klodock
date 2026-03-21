import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ProgressBar } from "@/components/ProgressBar";
import { useWizardState, type WizardStep } from "@/lib/wizard-state";

const PATH_TO_STEP: Record<string, WizardStep> = {
  "/wizard": "welcome",
  "/wizard/dependencies": "node_install",
  "/wizard/install": "open_claw_install",
  "/wizard/model-provider": "api_key_setup",
  "/wizard/personality": "personality_setup",
  "/wizard/channels": "channel_setup",
  "/wizard/skills": "skill_install",
  "/wizard/done": "done",
};

const STEP_TO_PATH: Record<WizardStep, string> = {
  welcome: "/wizard",
  node_install: "/wizard/dependencies",
  open_claw_install: "/wizard/install",
  api_key_setup: "/wizard/model-provider",
  personality_setup: "/wizard/personality",
  channel_setup: "/wizard/channels",
  skill_install: "/wizard/skills",
  done: "/wizard/done",
};

const NO_BACK_STEPS = new Set<string>(["/wizard", "/wizard/done"]);

export function WizardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { stepOrder, completedSteps } = useWizardState();

  const currentStep = PATH_TO_STEP[location.pathname] ?? "welcome";
  const currentIdx = stepOrder.indexOf(currentStep);
  const showBack = !NO_BACK_STEPS.has(location.pathname) && currentIdx > 0;

  function handleBack() {
    if (currentIdx > 0) {
      navigate(STEP_TO_PATH[stepOrder[currentIdx - 1]]);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-3xl">
          <ProgressBar
            steps={stepOrder}
            currentStep={currentStep}
            completedSteps={completedSteps}
          />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
          {showBack && (
            <button
              type="button"
              onClick={handleBack}
              className="
                mb-6 inline-flex items-center gap-1.5 rounded text-sm
                font-medium text-neutral-500 transition-colors
                hover:text-neutral-700
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-primary-500
              "
              aria-label="Go to previous step"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
          )}

          <Outlet />
        </div>
      </main>
    </div>
  );
}
