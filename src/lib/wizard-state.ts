import { useState, useEffect, useCallback } from "react";
import type { SetupStep, WizardFormData } from "./types";
import { getSetupState } from "./tauri";

/**
 * WizardStep includes the backend SetupStep values plus
 * frontend-only navigation steps (welcome, done).
 */
export type WizardStep = SetupStep | "welcome" | "done";

const STEP_ORDER: WizardStep[] = [
  "welcome",
  "node_install",
  "open_claw_install",
  "api_key_setup",
  "personality_setup",
  "channel_setup",
  "skill_install",
  "done",
];

const emptyFormData: WizardFormData = {
  providerKeys: {},
  soulConfig: {},
  selectedSkills: [],
  channelTokens: {},
};

export function useWizardState() {
  const [currentStep, setCurrentStep] = useState<WizardStep>("welcome");
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState<WizardFormData>(emptyFormData);

  useEffect(() => {
    setIsLoading(true);
    getSetupState()
      .then((state) => {
        const completed = new Set<WizardStep>();

        for (const [step, stepStatus] of Object.entries(state.steps)) {
          if (stepStatus.status === "completed") {
            completed.add(step as SetupStep);
          }
        }

        setCompletedSteps(completed);

        // Find the first incomplete backend step to determine current position
        const backendSteps: SetupStep[] = [
          "node_install",
          "open_claw_install",
          "api_key_setup",
          "personality_setup",
          "channel_setup",
          "skill_install",
        ];

        let firstIncomplete: WizardStep = "done";
        for (const step of backendSteps) {
          const status = state.steps[step];
          if (!status || status.status !== "completed") {
            firstIncomplete = step;
            break;
          }
        }

        setCurrentStep(firstIncomplete);
      })
      .catch(() => {
        setCurrentStep("welcome");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step);
  }, []);

  const markComplete = useCallback((step: WizardStep) => {
    setCompletedSteps((prev) => new Set([...prev, step]));
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) {
      setCurrentStep(STEP_ORDER[idx + 1]);
    }
  }, []);

  const updateFormData = useCallback(
    (patch: Partial<WizardFormData>) => {
      setFormData((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  return {
    currentStep,
    completedSteps,
    stepOrder: STEP_ORDER,
    goToStep,
    markComplete,
    isLoading,
    formData,
    updateFormData,
  };
}
