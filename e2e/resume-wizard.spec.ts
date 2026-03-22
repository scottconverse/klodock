/**
 * E2E: Resume Wizard — interrupted setup recovery.
 *
 * Verifies that KloDock correctly resumes the setup wizard when the app
 * was closed mid-setup:
 *
 *   1. Pre-condition: setup-state.json exists with some steps Completed,
 *      others NotStarted.
 *   2. App launches, reads state, and jumps to the first incomplete step
 *      (not step 1).
 *   3. Previously completed steps show checkmarks / are skippable.
 *   4. User can navigate back to review completed steps (read-only).
 *   5. Completing the remaining steps updates setup-state.json.
 *   6. On final step completion, wizard closes and dashboard appears.
 *
 * TODO: Implement once e2e framework is configured.
 */

import { describe, it } from "vitest";

describe("Resume Wizard E2E", () => {
  it.todo("resumes at first incomplete step");
  it.todo("shows completed steps as done");
  it.todo("allows reviewing previous steps");
  it.todo("completes remaining steps and reaches dashboard");
});
