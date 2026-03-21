import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  NodeStatus,
  OpenClawStatus,
  OpenClawConfig,
  InstalledSkill,
  SoulConfig,
  SetupState,
  SetupStep,
  DaemonStatus,
  HealthStatus,
  SkillMetadata,
  SafetyReport,
  UpdateInfo,
  SkillUpdateInfo,
  InstallProgress,
  OpenClawInstallProgress,
} from "./types";

/* ── Dependencies ────────────────────────────────────── */

export async function checkNode(): Promise<NodeStatus> {
  return invoke<NodeStatus>("check_node");
}

export async function installNode(): Promise<string> {
  return invoke<string>("install_node");
}

export async function checkOpenClaw(): Promise<OpenClawStatus> {
  return invoke<OpenClawStatus>("check_openclaw");
}

export async function installOpenClaw(): Promise<string> {
  return invoke<string>("install_openclaw");
}

/* ── Skills ──────────────────────────────────────────── */

export async function installSkill(slug: string): Promise<string> {
  return invoke<string>("install_skill", { slug });
}

export async function listInstalledSkills(): Promise<InstalledSkill[]> {
  return invoke<InstalledSkill[]>("list_installed_skills");
}

export async function searchSkills(query: string): Promise<SkillMetadata[]> {
  return invoke<SkillMetadata[]>("search_skills", { query });
}

export async function getSkillDetails(slug: string): Promise<SkillMetadata> {
  return invoke<SkillMetadata>("get_skill_details", { slug });
}

export async function getRecommendedSkills(
  goals: string[]
): Promise<SkillMetadata[]> {
  return invoke<SkillMetadata[]>("get_recommended_skills", { goals });
}

export async function getSafetyRating(slug: string): Promise<SafetyReport> {
  return invoke<SafetyReport>("get_safety_rating", { slug });
}

/* ── Soul / Personality ─────────────────────────────── */

export async function readSoul(): Promise<string> {
  return invoke<string>("read_soul");
}

export async function writeSoul(content: string): Promise<void> {
  return invoke("write_soul", { content });
}

export async function generateSoul(config: SoulConfig): Promise<string> {
  return invoke<string>("generate_soul", { config });
}

/* ── Config ─────────────────────────────────────────── */

export async function readConfig(): Promise<OpenClawConfig> {
  return invoke<OpenClawConfig>("read_config");
}

export async function writeConfig(config: OpenClawConfig): Promise<void> {
  return invoke("write_config", { config });
}

/* ── Secrets ─────────────────────────────────────────── */

export async function storeSecret(
  key: string,
  value: string
): Promise<void> {
  return invoke("store_secret", { key, value });
}

export async function retrieveSecret(key: string): Promise<string> {
  return invoke<string>("retrieve_secret", { key });
}

export async function deleteSecret(key: string): Promise<void> {
  return invoke("delete_secret", { key });
}

export async function testApiKey(
  provider: string,
  key: string
): Promise<boolean> {
  return invoke<boolean>("test_api_key", { provider, key });
}

export async function checkOllama(): Promise<boolean> {
  return invoke<boolean>("check_ollama");
}

/* ── Setup State ─────────────────────────────────────── */

export async function getSetupState(): Promise<SetupState> {
  return invoke<SetupState>("get_setup_state");
}

export async function completeStep(step: SetupStep): Promise<SetupState> {
  return invoke<SetupState>("complete_step", { step });
}

export async function verifyAllSteps(): Promise<SetupState> {
  return invoke<SetupState>("verify_all_steps");
}

/* ── Daemon ──────────────────────────────────────────── */

export async function startDaemon(): Promise<DaemonStatus> {
  return invoke<DaemonStatus>("start_daemon");
}

export async function stopDaemon(): Promise<DaemonStatus> {
  return invoke<DaemonStatus>("stop_daemon");
}

export async function restartDaemon(): Promise<DaemonStatus> {
  return invoke<DaemonStatus>("restart_daemon");
}

export async function getDaemonStatus(): Promise<DaemonStatus> {
  return invoke<DaemonStatus>("get_daemon_status");
}

export async function runHealthCheck(): Promise<HealthStatus> {
  return invoke<HealthStatus>("run_health_check");
}

/* ── Autostart ──────────────────────────────────────── */

export async function enableAutostart(): Promise<void> {
  return invoke("enable_autostart");
}

export async function disableAutostart(): Promise<void> {
  return invoke("disable_autostart");
}

export async function isAutostartEnabled(): Promise<boolean> {
  return invoke<boolean>("is_autostart_enabled");
}

/* ── Uninstall ──────────────────────────────────────── */

export async function uninstallClawpad(removeUserData: boolean): Promise<void> {
  return invoke("uninstall_clawpad", { removeUserData });
}

export async function resumeUninstall(): Promise<boolean> {
  return invoke<boolean>("resume_uninstall");
}

/* ── Updates ─────────────────────────────────────────── */

export async function checkOpenclawUpdate(): Promise<UpdateInfo> {
  return invoke<UpdateInfo>("check_openclaw_update");
}

export async function updateOpenclaw(): Promise<string> {
  return invoke<string>("update_openclaw");
}

export async function checkSkillUpdates(): Promise<SkillUpdateInfo[]> {
  return invoke<SkillUpdateInfo[]>("check_skill_updates");
}

export async function updateSkill(slug: string): Promise<string> {
  return invoke<string>("update_skill", { slug });
}

/* ── Event listeners ─────────────────────────────────── */

export function onInstallProgress(
  callback: (progress: InstallProgress) => void
): Promise<UnlistenFn> {
  return listen<InstallProgress>("install-progress", (event) => {
    callback(event.payload);
  });
}

export function onOpenclawInstallProgress(
  callback: (progress: OpenClawInstallProgress) => void
): Promise<UnlistenFn> {
  return listen<OpenClawInstallProgress>("openclaw-install-progress", (event) => {
    callback(event.payload);
  });
}

export function onDaemonStatus(
  callback: (status: DaemonStatus) => void
): Promise<UnlistenFn> {
  return listen<DaemonStatus>("daemon-status", (event) => {
    callback(event.payload);
  });
}
