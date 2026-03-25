/* ── Node & OpenClaw ─────────────────────────────────── */

export interface NodeStatus {
  version: string | null;
  meets_requirement: boolean;
  managed_by: string | null;
  node_path: string | null;
}

/** Progress events emitted during Node.js installation. */
export interface InstallProgress {
  phase: string;
  percent: number;
  message: string;
}

export interface OpenClawStatus {
  version: string | null;
  bin_path: string | null;
  managed_by_klodock: boolean;
}

/** Progress events emitted during OpenClaw installation. */
export interface OpenClawInstallProgress {
  message: string;
  fraction: number | null;
}

/* ── Skills ──────────────────────────────────────────── */

export interface InstalledSkill {
  slug: string;
  version: string;
  content_hash: string;
}

export interface SkillMetadata {
  slug: string;
  name: string;
  description: string;
  author: string;
  version: string;
  install_count: number;
  safety_rating: SafetyRating;
  required_permissions: string[];
  updated_at: string;
  /** Whether this skill is ready to use (all requirements met). */
  eligible: boolean;
  /** What's missing for this skill to work (empty array if eligible). */
  missing_requirements: string[];
}

export type SafetyRating = "Bundled" | "Published" | "Unlisted" | "Verified" | "Community" | "Unreviewed";

export type DangerousPermission =
  | "ShellAccess"
  | "NetworkAccess"
  | "EnvVarAccess"
  | "FileSystemAccess";

export interface SafetyReport {
  slug: string;
  rating: SafetyRating;
  dangerous_permissions: DangerousPermission[];
}

/* ── Soul / Personality ─────────────────────────────── */

export interface SoulConfig {
  name: string;
  role: Role;
  tone: number;
  custom_instructions: string | null;
}

/**
 * Tagged union serialized by serde as `{ type: "...", value: "..." }`.
 * Variants without data omit the `value` field.
 */
export type Role =
  | { type: "GeneralAssistant" }
  | { type: "ResearchHelper" }
  | { type: "WritingPartner" }
  | { type: "ProductivityBot" }
  | { type: "Custom"; value: string };

/* ── Config ─────────────────────────────────────────── */

export interface OpenClawConfig {
  agents?: {
    defaults?: {
      workspace?: string;
      model?: {
        primary: string;
        fallbacks?: string[];
      };
    };
  };
  channels?: {
    telegram?: { enabled: boolean; bot_token: string; dm_policy?: string };
    discord?: { enabled: boolean; bot_token: string; dm_policy?: string };
    [key: string]: unknown;
  };
  gateway?: {
    mode?: string;
    port?: number;
    auth?: {
      mode: string;
      password?: string;
      token?: string;
    };
  };
  [key: string]: unknown;
}

export interface OllamaModel {
  name: string;
  size: string;
}

/* ── Setup / Wizard ─────────────────────────────────── */

/** serde rename_all = "snake_case" */
export type SetupStep =
  | "node_install"
  | "open_claw_install"
  | "api_key_setup"
  | "personality_setup"
  | "channel_setup"
  | "skill_install";

/**
 * Tagged enum: `{ status: "...", message?: "..." }`.
 * serde(tag = "status", content = "message")
 */
export type StepStatus =
  | { status: "not_started" }
  | { status: "in_progress" }
  | { status: "completed" }
  | { status: "failed"; message: string };

export interface SetupState {
  steps: Record<SetupStep, StepStatus>;
}

/* ── Daemon ──────────────────────────────────────────── */

/**
 * Tagged enum: `{ status: "...", message?: "..." }`.
 * serde(tag = "status", content = "message")
 */
export type DaemonStatus =
  | { status: "running" }
  | { status: "stopped" }
  | { status: "starting"; message?: string }
  | { status: "error"; message: string };

export interface HealthStatus {
  daemon_alive: boolean;
  api_key_valid: boolean | null;
  channels: Record<string, boolean>;
  issues: string[];
}

/* ── Updates ─────────────────────────────────────────── */

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
}

export interface SkillUpdateInfo {
  slug: string;
  current_version: string;
  latest_version: string;
  update_available: boolean;
}

/* ── Frontend-only state ─────────────────────────────── */

export interface WizardFormData {
  providerKeys: Record<string, string>;
  soulConfig: Partial<SoulConfig>;
  selectedSkills: string[];
  channelTokens: Record<string, string>;
}
