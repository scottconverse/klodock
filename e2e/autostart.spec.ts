/**
 * E2E: Autostart — enable/disable launch-on-login.
 *
 * Verifies the autostart toggle in the settings UI:
 *
 *   1. Navigate to Settings > General.
 *   2. Autostart toggle is visible and reflects current OS state.
 *   3. Toggle ON:
 *      - Calls enable_autostart.
 *      - Platform-specific entry is created:
 *        - Windows: HKCU\Software\Microsoft\Windows\CurrentVersion\Run
 *        - macOS: ~/Library/LaunchAgents/com.clawpad.plist
 *        - Linux: ~/.config/autostart/clawpad.desktop or systemd unit
 *      - Toggle visually shows "enabled" state.
 *   4. Toggle OFF:
 *      - Calls disable_autostart.
 *      - Platform-specific entry is removed.
 *      - Toggle visually shows "disabled" state.
 *   5. Close and re-open settings — toggle state persists from OS.
 *
 * NOTE: These tests modify real OS autostart configuration and should
 * only be run in controlled environments.
 *
 * TODO: Implement once e2e framework is configured.
 */

import { describe, it } from "vitest";

describe("Autostart E2E", () => {
  it.todo("shows autostart toggle in settings");
  it.todo("enables autostart on toggle ON");
  it.todo("disables autostart on toggle OFF");
  it.todo("persists state across settings reopen");
});
