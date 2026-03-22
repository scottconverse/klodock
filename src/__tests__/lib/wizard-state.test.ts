/**
 * Tests for the useWizardState hook.
 *
 * The hook returns { currentStep, completedSteps, stepOrder, isLoading,
 * formData } and calls getSetupState() via Tauri IPC on mount.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useWizardState } from "@/lib/wizard-state";
import type { SetupState } from "@/lib/types";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("useWizardState", () => {
  it("starts with isLoading true", () => {
    // Never-resolving promise keeps loading state
    vi.mocked(invoke).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useWizardState());
    expect(result.current.isLoading).toBe(true);
  });

  it("finds the first incomplete step after loading", async () => {
    const mockState: SetupState = {
      steps: {
        node_install: { status: "completed" },
        open_claw_install: { status: "completed" },
        api_key_setup: { status: "not_started" },
        personality_setup: { status: "not_started" },
        channel_setup: { status: "not_started" },
        skill_install: { status: "not_started" },
      },
    };
    vi.mocked(invoke).mockResolvedValueOnce(mockState);

    const { result } = renderHook(() => useWizardState());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.currentStep).toBe("api_key_setup");
  });

  it("sets currentStep to 'done' when all steps are completed", async () => {
    const mockState: SetupState = {
      steps: {
        node_install: { status: "completed" },
        open_claw_install: { status: "completed" },
        api_key_setup: { status: "completed" },
        personality_setup: { status: "completed" },
        channel_setup: { status: "completed" },
        skill_install: { status: "completed" },
      },
    };
    vi.mocked(invoke).mockResolvedValueOnce(mockState);

    const { result } = renderHook(() => useWizardState());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.currentStep).toBe("done");
  });

  it("exposes stepOrder array and formData", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHook(() => useWizardState());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stepOrder).toContain("welcome");
    expect(result.current.stepOrder).toContain("done");
    expect(result.current.formData).toHaveProperty("providerKeys");
    expect(result.current.formData).toHaveProperty("selectedSkills");
  });

  it("falls back to 'welcome' on IPC error", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("IPC failed"));

    const { result } = renderHook(() => useWizardState());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.currentStep).toBe("welcome");
  });
});
