/**
 * E2E: Uninstall — clean removal of ClawPad and dependencies.
 *
 * Verifies the uninstall flow:
 *
 *   1. User opens Settings > Uninstall.
 *   2. Confirmation dialog appears with option to "Remove personal data".
 *   3. User confirms — uninstall begins.
 *   4. Progress bar updates as each step completes:
 *      - Stop daemon
 *      - Remove autostart entries
 *      - Scrub PATH/env
 *      - Clear keychain
 *      - Remove managed Node.js
 *      - npm uninstall -g openclaw
 *      - Remove ~/.clawpad/
 *   5. On completion, app shows "Uninstall complete" and closes.
 *
 * Resume scenario:
 *   6. If the app is force-quit mid-uninstall, re-launching should detect
 *      uninstall-state.json and offer to resume.
 *
 * TODO: Implement once e2e framework is configured.
 */

import { describe, it } from "vitest";

describe("Uninstall E2E", () => {
  it.todo("shows confirmation dialog before uninstalling");
  it.todo("displays progress for each uninstall step");
  it.todo("removes all ClawPad artifacts on completion");
  it.todo("optionally removes personal data when selected");
  it.todo("resumes partial uninstall on re-launch");
});
