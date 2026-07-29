import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { ProgressBar } from "@/components/ProgressBar";
import { useWizardState, type WizardStep } from "@/lib/wizard-state";
import {
  getSetupState,
  completeStep,
  verifyStep,
  checkNode,
  installNode,
  checkOpenClaw,
  installOpenClaw,
} from "@/lib/tauri";
import { useState, useEffect } from "react";

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
  const [setupState, setSetupState] = useState<any>(null);

  useEffect(() => {
    getSetupState().then(setSetupState).catch(console.error);
  }, []);

  const currentStep = PATH_TO_STEP[location.pathname] ?? "welcome";
  const currentIdx = stepOrder.indexOf(currentStep);
  const showBack = !NO_BACK_STEPS.has(location.pathname) && currentIdx > 0;

  function handleBack() {
    if (currentIdx > 0) {
      navigate(STEP_TO_PATH[stepOrder[currentIdx - 1]]);
    }
  }

  const [retryingStep, setRetryingStep] = useState<string | null>(null);
  const failedSteps = setupState?.steps ? Object.entries(setupState.steps).filter(([_, status]) => status.status === "Failed") : [];

  async function handleRetry(step: string) {
    setRetryingStep(step);
    try {
      if (step === "node_install") {
        const status = await checkNode();
        if (!status.meets_requirement || status.managed_by !== "klodock") {
          await installNode();
        }
        const newState = await completeStep("node_install");
        setSetupState(newState);
      } else if (step === "open_claw_install") {
        const status = await checkOpenClaw();
        if (!status.version) {
          await installOpenClaw();
        }
        const newState = await completeStep("open_claw_install");
        setSetupState(newState);
      } else {
        const newState = await verifyStep(step);
        setSetupState(newState);
      }
    } catch (err) {
      console.error(`Failed to retry step ${step}:`, err);
    } finally {
      setRetryingStep(null);
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
        <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-6">
          {showBack && (
            <button
              type="button"
              onClick={handleBack}
              className="
                mb-6 inline-flex items-center gap-1.5 rounded text-sm
                font-medium text-neutral-600 transition-colors
                hover:text-neutral-700
                focus:ring-2 focus:ring-blue-500 focus:outline-none
              "
              aria-label="Go to previous step"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
          )}

          {failedSteps.length > 0 && (
            <div className="mb-6 rounded-lg border border-error-200 bg-error-50 p-3">
              <h4 className="text-sm font-bold text-error-700 mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                Repair Failed Steps
              </h4>
              <ul className="space-y-1">
                {failedSteps.map(([step, status]) => (
                  <li key={step} className="flex items-center justify-between text-xs">
                    <span className="text-error-800">{status.message}</span>
                    <button
                      type="button"
                      onClick={() => handleRetry(step)}
                      disabled={retryingStep === step}
                      className="rounded bg-error-600 px-2 py-1 text-white hover:bg-error-700 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                    >
                      {retryingStep === step ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        "Retry"
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Outlet />
        </div>
      </main>
    </div>
  );
}
