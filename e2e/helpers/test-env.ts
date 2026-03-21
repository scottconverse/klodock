/**
 * E2E Test Environment Helper
 *
 * Provides platform-specific setup and teardown utilities for e2e tests.
 * Handles creating isolated test environments so e2e tests don't interfere
 * with the user's real ClawPad installation.
 */

import { platform } from "os";
import { join } from "path";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export type Platform = "windows" | "macos" | "linux";

export function detectPlatform(): Platform {
  const p = platform();
  if (p === "win32") return "windows";
  if (p === "darwin") return "macos";
  return "linux";
}

// ---------------------------------------------------------------------------
// Test environment paths
// ---------------------------------------------------------------------------

/** Base directory for test isolation. Uses a separate `.clawpad-test/` dir. */
export function testBaseDir(): string {
  const home =
    process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || "";
  return join(home, ".clawpad-test");
}

/** Path to the test setup-state.json. */
export function testSetupStatePath(): string {
  return join(testBaseDir(), "setup-state.json");
}

/** Path to the test uninstall-state.json. */
export function testUninstallStatePath(): string {
  return join(testBaseDir(), "uninstall-state.json");
}

/** Path to the test .env file. */
export function testEnvPath(): string {
  return join(testBaseDir(), ".env");
}

/** Path to the test daemon.pid file. */
export function testPidPath(): string {
  return join(testBaseDir(), "daemon.pid");
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

/**
 * Create an isolated test environment directory.
 *
 * Call this in `beforeAll` or `beforeEach` to ensure a clean test directory
 * exists. Sets the `CLAWPAD_HOME` env var so the app uses the test directory
 * instead of `~/.clawpad/`.
 */
export function setupTestEnv(): void {
  const base = testBaseDir();
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true });
  }

  // Point ClawPad at the test directory.
  process.env.CLAWPAD_HOME = base;
}

/**
 * Remove the isolated test environment directory.
 *
 * Call this in `afterAll` or `afterEach` to clean up test artifacts.
 */
export function teardownTestEnv(): void {
  const base = testBaseDir();
  if (existsSync(base)) {
    rmSync(base, { recursive: true, force: true });
  }

  delete process.env.CLAWPAD_HOME;
}

/**
 * Write a pre-configured setup-state.json to simulate a partially
 * completed wizard.
 */
export function writeTestSetupState(state: Record<string, unknown>): void {
  const path = testSetupStatePath();
  writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Write a pre-configured uninstall-state.json to simulate a partially
 * completed uninstall.
 */
export function writeTestUninstallState(state: Record<string, unknown>): void {
  const path = testUninstallStatePath();
  writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Platform-specific helpers
// ---------------------------------------------------------------------------

/**
 * Returns the expected autostart artifact path for the current platform.
 *
 * Useful for verifying that enable_autostart/disable_autostart correctly
 * create or remove the platform-specific entry.
 */
export function autostartArtifactPath(): string {
  const p = detectPlatform();
  const home =
    process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || "";

  switch (p) {
    case "windows":
      // Registry key path (not a file, but useful for documentation).
      return "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\ClawPad";
    case "macos":
      return join(home, "Library", "LaunchAgents", "com.clawpad.plist");
    case "linux":
      return join(
        process.env.XDG_CONFIG_HOME || join(home, ".config"),
        "autostart",
        "clawpad.desktop"
      );
  }
}
