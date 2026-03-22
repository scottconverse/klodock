/**
 * Vitest global setup file for KloDock frontend tests.
 *
 * Referenced in vitest.config.ts via `setupFiles`.
 * Provides DOM matchers and mocks the Tauri IPC bridge.
 */
import "@testing-library/jest-dom";
import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @tauri-apps/api/core — the `invoke` function is the primary bridge
// between the React frontend and the Rust backend.
// ---------------------------------------------------------------------------
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, _args?: Record<string, unknown>) => {
    // Default mock: return undefined for any command.
    // Individual tests should override this via:
    //   vi.mocked(invoke).mockResolvedValueOnce(...)
    console.warn(
      `[test] Tauri invoke("${cmd}") called without a per-test mock. ` +
        "Returning undefined."
    );
    return undefined;
  }),
}));

// ---------------------------------------------------------------------------
// Mock @tauri-apps/api/event — listen/emit for Tauri events.
// ---------------------------------------------------------------------------
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => {
    // Return an unlisten function.
    return () => {};
  }),
  emit: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Mock @tauri-apps/plugin-shell — used by ProviderCard to open URLs.
// ---------------------------------------------------------------------------
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(async () => {}),
}));
