/**
 * Mock Tauri invoke commands for E2E tests running in the browser.
 *
 * This module produces a script string that, when injected into a page,
 * creates window.__TAURI__ and window.__TAURI_INTERNALS__ so that
 * `@tauri-apps/api/core` invoke() calls resolve with realistic data
 * instead of throwing "Tauri not found" errors.
 */

/* ── Skill catalogue (52 skills) ──────────────────────── */

const SKILL_SLUGS = [
  "telegram", "discord", "slack", "bluebubbles", "imsg", "wacli",
  "himalaya", "voice-call", "xurl",
  "notion", "obsidian", "apple-notes", "bear-notes", "apple-reminders",
  "things-mac", "trello", "gog", "session-logs", "summarize",
  "blogwatcher", "ordercli", "goplaces",
  "github", "gh-issues", "coding-agent", "skill-creator", "clawhub",
  "mcporter", "tmux", "nano-pdf",
  "spotify-player", "openai-whisper", "openai-whisper-api", "sag",
  "sherpa-onnx-tts", "songsee", "blucli", "sonoscli",
  "openhue", "eightctl", "camsnap",
  "gemini", "oracle", "model-usage",
  "openai-image-gen", "nano-banana-pro", "video-frames", "gifgrep", "peekaboo",
  "healthcheck", "node-connect", "1password", "weather",
];

function buildSkill(slug: string, idx: number) {
  const eligible = idx < 18; // first 18 are active
  return {
    slug,
    name: slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    description: `Integration for ${slug}.`,
    author: "openclaw",
    version: "1.0.0",
    install_count: 100 + idx * 10,
    safety_rating: idx % 3 === 0 ? "Verified" : idx % 3 === 1 ? "Community" : "Unreviewed",
    required_permissions: [],
    updated_at: "2025-06-01T00:00:00Z",
    eligible,
    missing_requirements: eligible ? [] : [`Requires: ${slug}-bin`],
  };
}

const ALL_SKILLS = SKILL_SLUGS.map(buildSkill);
const RECOMMENDED_SKILLS = ALL_SKILLS.slice(0, 8);

/* ── Activity log ─────────────────────────────────────── */

const ACTIVITY_LOG = [
  { timestamp: "2025-06-01 09:00:01", level: "info", message: "Agent started" },
  { timestamp: "2025-06-01 09:00:02", level: "success", message: "Health check passed" },
  { timestamp: "2025-06-01 09:01:00", level: "info", message: "Telegram channel connected" },
  { timestamp: "2025-06-01 09:05:00", level: "warn", message: "Rate limit approaching" },
  { timestamp: "2025-06-01 09:10:00", level: "info", message: "Processed 3 messages" },
];

/* ── Config ───────────────────────────────────────────── */

const CONFIG = {
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: {
        primary: "anthropic/claude-sonnet-4-6",
        fallbacks: [],
      },
    },
  },
  channels: {
    telegram: { enabled: true, bot_token: "test-placeholder-token", dm_policy: "open" },
  },
  gateway: {
    mode: "local",
    port: 18789,
    auth: {
      mode: "password",
      password: "test-placeholder-password",
    },
  },
};

/* ── Setup state ──────────────────────────────────────── */

const SETUP_STATE = {
  steps: {
    node_install: { status: "completed" },
    open_claw_install: { status: "completed" },
    api_key_setup: { status: "completed" },
    personality_setup: { status: "completed" },
    channel_setup: { status: "completed" },
    skill_install: { status: "completed" },
  },
};

/* ── SOUL.md content ──────────────────────────────────── */

const SOUL_MD = `# SOUL.md — Agent Personality

**Name:** Atlas
**Role:** General Assistant
**Tone:** Balanced (0.5)

You are Atlas, a helpful AI assistant. You communicate clearly and concisely.
You help with research, writing, productivity, and general questions.
`;

/* ── Daemon status tracker ────────────────────────────── */

// We track daemon status in the mock so start/stop/restart work correctly
let mockDaemonStatus = "running";

/* ── Build the injection script ───────────────────────── */

export function buildTauriMockScript(): string {
  return `
(function() {
  // Internal daemon status for mocking
  let _daemonStatus = "running";

  const MOCK_RESPONSES = {
    "run_health_check": function() {
      return {
        daemon_alive: _daemonStatus === "running",
        api_key_valid: true,
        channels: {},
        issues: []
      };
    },
    "get_daemon_status": function() {
      return { status: _daemonStatus };
    },
    "start_daemon": function() {
      _daemonStatus = "running";
      return { status: "running" };
    },
    "stop_daemon": function() {
      _daemonStatus = "stopped";
      return { status: "stopped" };
    },
    "restart_daemon": function() {
      _daemonStatus = "running";
      return { status: "running" };
    },
    "read_soul": function() {
      return ${JSON.stringify(SOUL_MD)};
    },
    "read_config": function() {
      return ${JSON.stringify(CONFIG)};
    },
    "write_config": function() { return null; },
    "list_all_skills": function() {
      return ${JSON.stringify(ALL_SKILLS)};
    },
    "get_recommended_skills": function() {
      return ${JSON.stringify(RECOMMENDED_SKILLS)};
    },
    "get_activity_log": function() {
      return ${JSON.stringify(ACTIVITY_LOG)};
    },
    "list_secrets": function() {
      return ["ANTHROPIC_API_KEY"];
    },
    "get_setup_state": function() {
      return ${JSON.stringify(SETUP_STATE)};
    },
    "check_ollama": function() { return true; },
    "list_ollama_models": function() {
      return [{ name: "qwen2.5:7b", size: "4.4 GB" }];
    },
    "check_ollama_installed": function() {
      return { installed: true, running: true, path: "/usr/local/bin/ollama", version: "0.5.0" };
    },
    "generate_soul": function() {
      return ${JSON.stringify(SOUL_MD)};
    },
    "write_soul": function() { return null; },
    "store_secret": function() { return null; },
    "retrieve_secret": function() { return "test-key-placeholder"; },
    "delete_secret": function() { return null; },
    "test_api_key": function() { return true; },
    "test_channel_token": function() { return "ok"; },
    "complete_step": function() {
      return ${JSON.stringify(SETUP_STATE)};
    },
    "verify_all_steps": function() {
      return ${JSON.stringify(SETUP_STATE)};
    },
    "check_openclaw": function() {
      return { version: "0.9.0", bin_path: "/usr/local/bin/openclaw", managed_by_klodock: true };
    },
    "check_openclaw_update": function() {
      return { current_version: "0.9.0", latest_version: "0.9.0", update_available: false };
    },
    "check_skill_updates": function() { return []; },
    "update_openclaw": function() { return "0.9.1"; },
    "update_skill": function() { return "1.0.1"; },
    "install_skill": function() { return "ok"; },
    "list_installed_skills": function() { return []; },
    "search_skills": function() { return []; },
    "enable_autostart": function() { return null; },
    "disable_autostart": function() { return null; },
    "is_autostart_enabled": function() { return false; },
    "get_keep_keys": function() { return false; },
    "set_keep_keys": function() { return null; },
    "resume_uninstall": function() { return false; },
    "download_ollama": function() { return "/tmp/ollama-installer"; },
    "install_ollama": function() { return null; },
    "pull_ollama_model": function() { return null; },
    "clear_activity_log": function() { return null; },
  };

  // Mock invoke
  function mockInvoke(cmd, args) {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        var handler = MOCK_RESPONSES[cmd];
        if (handler) {
          try {
            resolve(handler(args));
          } catch(e) {
            reject(e);
          }
        } else {
          console.warn("[tauri-mock] Unhandled command:", cmd);
          resolve(null);
        }
      }, 10);
    });
  }

  // Mock event listener (returns an unlisten function)
  function mockListen(event, callback) {
    return Promise.resolve(function() {});
  }

  // Build window.__TAURI_INTERNALS__ (used by @tauri-apps/api v2)
  window.__TAURI_INTERNALS__ = {
    invoke: mockInvoke,
    transformCallback: function(cb) { return cb; },
    convertFileSrc: function(path) { return path; },
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  };

  // Build window.__TAURI__ namespace
  window.__TAURI__ = {
    core: {
      invoke: mockInvoke,
      transformCallback: function(cb) { return cb; },
      convertFileSrc: function(path) { return path; },
    },
    event: {
      listen: mockListen,
      once: mockListen,
      emit: function() { return Promise.resolve(); },
    },
    app: {
      getVersion: function() { return Promise.resolve("1.2.0"); },
      getName: function() { return Promise.resolve("KloDock"); },
      getTauriVersion: function() { return Promise.resolve("2.0.0"); },
    },
    shell: {
      open: function(url) { return Promise.resolve(); },
    },
    process: {
      relaunch: function() { return Promise.resolve(); },
    },
    updater: {
      check: function() { return Promise.resolve({ available: false, version: "1.2.0" }); },
    },
  };

  // Also patch window.__TAURI_PLUGIN_SHELL__ for @tauri-apps/plugin-shell
  window.__TAURI_PLUGIN_SHELL__ = {
    open: function(url) { return Promise.resolve(); },
  };

  // Patch @tauri-apps/plugin-updater
  window.__TAURI_PLUGIN_UPDATER__ = {
    check: function() { return Promise.resolve({ available: false, version: "1.2.0" }); },
  };

  // Patch @tauri-apps/plugin-process
  window.__TAURI_PLUGIN_PROCESS__ = {
    relaunch: function() { return Promise.resolve(); },
  };

  console.log("[tauri-mock] Mocks installed");
})();
`;
}

export { ALL_SKILLS, RECOMMENDED_SKILLS, ACTIVITY_LOG, CONFIG, SETUP_STATE, SOUL_MD };
