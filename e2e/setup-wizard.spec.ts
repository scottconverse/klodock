/**
 * E2E: Setup Wizard — full first-run flow.
 *
 * This test walks through the entire setup wizard from a fresh install:
 *
 *   1. App launches and detects no setup-state.json -> shows wizard.
 *   2. Node.js check screen:
 *      - If node >= 22 is on PATH, shows "detected" and proceeds.
 *      - If not, triggers install and waits for progress bar to reach 100%.
 *   3. OpenClaw install screen:
 *      - Runs `npm install -g openclaw` via the managed node.
 *      - Progress events update the UI.
 *   4. API key screen:
 *      - User selects a provider card (e.g., Anthropic).
 *      - Enters an API key in the input field.
 *      - Clicks "Validate" — test_api_key invoke returns true.
 *      - "Next" button becomes enabled.
 *   5. Personality screen:
 *      - User picks a role card.
 *      - Adjusts tone slider.
 *      - Clicks "Next".
 *   6. Channel setup screen:
 *      - Picks default channel (e.g., Slack, Discord, or "None").
 *      - Clicks "Next".
 *   7. Skill install screen:
 *      - Shows recommended skills from ClawHub.
 *      - User toggles a few on/off.
 *      - Clicks "Finish".
 *   8. Wizard completes — dashboard is shown.
 *
 * Prerequisites:
 *   - Tauri dev server running (or built binary).
 *   - WebDriver or Tauri test driver configured.
 *
 * TODO: Implement once e2e framework (e.g., @tauri-apps/e2e or Playwright
 *       with Tauri) is chosen and configured.
 */

import { describe, it } from "vitest";

describe("Setup Wizard E2E", () => {
  it.todo("launches wizard on fresh install");
  it.todo("detects existing Node.js and skips install");
  it.todo("installs Node.js when not present");
  it.todo("installs OpenClaw via npm");
  it.todo("validates API key and enables next button");
  it.todo("configures personality and tone");
  it.todo("configures channels");
  it.todo("installs selected skills");
  it.todo("completes wizard and shows dashboard");
});
