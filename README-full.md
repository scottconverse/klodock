# KloDock™

**Desktop GUI for OpenClaw --- zero terminal, zero complexity.**

| | |
|---|---|
| **Version** | 1.2.0 |
| **Author** | Scott Converse |
| **License** | MIT |
| **Date** | March 2026 |
| **Repository** | [github.com/scottconverse/klodock](https://github.com/scottconverse/klodock) |

---

## 1. Overview

KloDock is a native desktop application that wraps the open-source OpenClaw AI agent framework in a visual, point-and-click interface. OpenClaw has amassed over 250,000 stars on GitHub and is one of the most capable open-source agent platforms available, but it demands terminal fluency, manual JSON and Markdown configuration, and comfortable API key management --- skills that put it out of reach for most non-technical users. Meanwhile, hosted alternatives like Clawnify, OneClaw, and KiwiClaw charge between $10 and $40 per month for what is fundamentally free software, and they hold your API keys on their servers.

KloDock fills that gap. It packages the entire OpenClaw setup and management lifecycle into a guided wizard that takes minutes, not hours, from download to a running agent. There is no command line, no config file editing, and no Markdown to write. The user downloads a lightweight installer, runs the wizard, and talks to their agent. Everything stays local: keys are stored in the operating system's native credential store, the agent process runs on the user's machine, and no data leaves the device except what the user's chosen AI provider requires.

The application is built on Tauri v2, producing a 5.1 MB NSIS installer on Windows. It targets Windows, macOS, and Linux, with all three platforms passing CI builds and tests. KloDock is designed for accessibility from the ground up, meeting WCAG 2.1 AA requirements with full keyboard navigation, screen reader support, and high-contrast theming.

---

## 2. Key Features

- **Quick setup wizard** --- A 7-step guided flow that takes a new user from first launch to a running AI agent in minutes, not hours. No terminal, no manual steps.

- **Silent Node.js installation** --- Automatically detects existing Node.js installs, nvm, Volta, and Homebrew-managed versions. If Node.js is missing or below v22, KloDock silently downloads v24.14.0 LTS and extracts it to `~/.klodock/node/` with no elevation prompt and no visible console window on any platform.

- **Visual personality builder** --- Choose from role templates (assistant, creative writer, coder, etc.), adjust a tone slider from formal to casual, and watch a live SOUL.md preview update in real time.

- **Secure API key management** --- Keys are stored in the OS credential store: DPAPI on Windows, Keychain on macOS, libsecret on Linux. Keys never exist in plaintext at rest.

- **Ollama integration** --- Auto-detection of a local Ollama instance, model listing via `/api/tags`, model picker dropdown, no-models guard (prompts user to `ollama pull`), and writes `base_url` (`http://localhost:11434`) and selected model to `openclaw.json`. **Ollama requires a model that supports tool calling** (function calling). Models without tool support will fail at runtime with an error like `"does not support tools"`. Recommended tool-capable models:

  | Model | Size | Notes |
  |-------|------|-------|
  | `qwen2.5:7b` | 4.7 GB | Good balance of speed and capability |
  | `llama3.1:8b` | 4.7 GB | Meta's flagship small model with tool support |
  | `mistral:7b` | 4.1 GB | Fast inference, solid tool calling |

  Pull one with: `ollama pull qwen2.5:7b`

- **Channel setup with API verification** --- Guided configuration flows for Telegram and Discord, with token entry, format validation, and live API verification (Telegram `getMe`, Discord `users/@me`) before saving. Shows bot name on successful connection.

- **Skill browser with safety badges** --- Browse 52 skills across 8 categories (Communication, Productivity, Developer Tools, etc.) with search, filtering, and three-tier safety ratings: **Bundled** (ships with OpenClaw), **Published** (listed on ClawHub), **Unlisted** (not in any registry). Each skill shows what it needs to work — with download buttons and navigation links to close the gap. Bundled JSON fallback ensures the skill list loads even on first run when the live query is slow.

- **Agent lifecycle management** --- The OpenClaw agent runs as a managed child process with automatic restart on crash, periodic health monitoring, and graceful shutdown.

- **Start on login** --- Optional system tray launcher that starts the agent at login. Uses a registry key (Windows), launch agent (macOS), or XDG autostart entry (Linux) --- no system service required.

- **Resumable setup and uninstall** --- Both the setup wizard and the uninstall flow persist their progress to disk as JSON. If the app crashes mid-operation, it picks up where it left off on the next launch.

- **WCAG 2.1 AA accessible** --- Full keyboard navigation, ARIA labels, screen reader testing, and high-contrast support throughout the interface.

- **Lightweight** --- Windows NSIS installer: 5.1 MB. The entire application leverages the system webview rather than bundling a browser engine.

- **Full management dashboard** --- Seven dedicated pages (Overview, Chat, Skills, Personality, Channels, Settings, Updates) replace the earlier "coming soon" placeholders. Every setting configurable in the wizard is also editable from the dashboard.

- **52 categorized skills** --- Skills are grouped into 8 categories (Communication, Productivity, Developer Tools, Media & Audio, Smart Home, AI Services, Images & Video, System & Security) with search, filtering, and actionable setup buttons. Active skills show a green badge; unavailable skills show exactly what's needed with a download link or navigation button.

- **Auto-updater** --- Checks the npm registry for the latest OpenClaw version and offers a one-click "Update now" button. Stops the daemon, updates via npm, restarts automatically.

- **Toast notification system** --- Global success, error, warning, and info notifications across all dashboard pages. Auto-dismiss with manual close.

- **Uninstall from UI** --- Danger Zone section in Settings with full 7-step resumable uninstall. The Windows uninstaller (Add/Remove Programs) also removes all KloDock data: managed Node.js, OpenClaw, config, workspace, secrets, and registry entries.

---

## 3. Architecture

### System Architecture Diagram

```
+-----------------------------------------------------------+
|                       KloDock (Tauri v2)                  |
|                                                           |
|  +-------------------------+   +------------------------+ |
|  |    React Frontend       |   |    Rust Backend        | |
|  |                         |   |                        | |
|  |  Wizard (7 steps)       |   |  installer/            | |
|  |  Dashboard (7 pages)    |<->|    node.rs             | |
|  |  Components             |IPC|    openclaw.rs          | |
|  |  Lib (types, state)     |   |    skills.rs           | |
|  |                         |   |    uninstall.rs         | |
|  +-------------------------+   |  config/                | |
|                                |    soul.rs              | |
|                                |    openclaw_json.rs     | |
|                                |    env.rs               | |
|                                |  secrets/               | |
|                                |    keychain.rs          | |
|                                |  setup/                 | |
|                                |    setup_state.rs       | |
|                                |  process/               | |
|                                |    daemon.rs            | |
|                                |    health.rs            | |
|                                |    autostart/           | |
|                                |  clawhub/               | |
|                                |    registry.rs          | |
|                                |    safety.rs            | |
|                                |  update/                | |
|                                |    openclaw_update.rs   | |
|                                |    skill_update.rs      | |
|                                +------------------------+ |
+-----------------------------------------------------------+
         |                              |
         v                              v
  +-------------+              +------------------+
  | System      |              | ~/.klodock/      |
  | Webview     |              |   node/          |
  | (WRY/Edge/  |              |   secrets/       |
  |  WebKitGTK) |              |   setup-state.json|
  +-------------+              +------------------+
                                        |
                                        v
                               +------------------+
                               | OpenClaw Agent   |
                               | (child process)  |
                               |   ~/.openclaw/   |
                               |     .env         |
                               |     SOUL.md      |
                               |     openclaw.json|
                               +------------------+
```

### Why Tauri v2

KloDock uses Tauri v2 rather than Electron for three reasons:

1. **Bundle size.** Tauri leverages the operating system's native webview (Edge WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS) instead of shipping Chromium. This keeps the installer around 5 MB versus the typical 80--150 MB Electron bundle.

2. **Memory footprint.** A Tauri app's baseline memory consumption is roughly 30--50 MB compared to 150--300 MB for an equivalent Electron app, which matters because KloDock runs alongside the OpenClaw agent process itself.

3. **Security.** Tauri's capability-based permission model restricts the frontend to only the IPC commands explicitly registered in the Rust backend. There is no Node.js runtime in the main process, eliminating an entire class of supply-chain attacks.

### Rust Backend Modules

| Module | Files | Purpose |
|--------|-------|---------|
| `installer/` | `node.rs`, `openclaw.rs`, `skills.rs`, `uninstall.rs` | Downloads, extracts, and verifies Node.js; installs OpenClaw from npm; installs skills from ClawHub; manages uninstall lifecycle |
| `config/` | `soul.rs`, `openclaw_json.rs`, `env.rs` | Reads and writes SOUL.md personality files, openclaw.json configuration, and the ephemeral .env file |
| `secrets/` | `keychain.rs` | OS credential store integration --- DPAPI on Windows, keyring crate (Keychain/libsecret) on macOS/Linux |
| `setup/` | `setup_state.rs` | Wizard state persistence, step completion tracking, crash-safe resume |
| `process/` | `daemon.rs`, `health.rs`, `autostart/` | Child process lifecycle (start/stop/restart), periodic health checks, platform-specific login-item registration |
| `clawhub/` | `registry.rs`, `safety.rs` | Skill registry client, search, recommendations, and status lookup |
| `update/` | `openclaw_update.rs`, `skill_update.rs` | Version checking and update logic for OpenClaw and installed skills |

### Frontend Stack

| Technology | Version | Role |
|------------|---------|------|
| React | 19 | UI framework |
| TypeScript | 5.9 | Type safety |
| Tailwind CSS | v4 | Utility-first styling |
| React Router | v7 | Client-side routing |
| Lucide React | 0.577 | Icon library |
| Vite | 8 | Build tooling and dev server |
| Vitest | 4.1 | Unit and component testing |

---

## 4. Security, Safety, and Trust

### 4.1 What KloDock Does to Protect You

KloDock is designed with the principle that your data and credentials should never leave your machine unless you explicitly choose a cloud AI provider, and even then, only the minimum necessary data (your message to the AI) is transmitted.

**Your API keys are encrypted at rest.** Keys are stored in your operating system's native credential store --- Windows DPAPI, macOS Keychain, or Linux libsecret. They are never saved as plain text files. When the agent needs a key, it is temporarily materialized in a protected file, used, and immediately scrubbed.

**Everything runs locally.** KloDock installs and runs entirely on your computer. There is no KloDock server, no account to create, no cloud service to trust. The KloDock application itself never transmits any data anywhere.

**No telemetry.** KloDock collects and transmits no usage data, analytics, crash reports, or diagnostic information. What you do with KloDock stays on your machine.

**Downloads are verified.** The Node.js runtime is downloaded from the official nodejs.org distribution and verified against SHA-256 checksums before installation. This prevents tampered or corrupted downloads from being installed.

**The application is sandboxed.** KloDock is built with Tauri, which enforces a capability-based permission model. The user interface can only call specific, pre-registered functions in the Rust backend. There is no shell access, no arbitrary file system access, and no unrestricted network access from the application window.

**Note:** Users who choose Ollama (local AI) skip the entire key management flow. No API key is stored, no `.env` is materialized, and no credentials exist anywhere. The agent talks directly to Ollama on your machine.

### 4.2 Understanding the Risks of AI Agents

KloDock makes it easy to run an AI agent on your computer. It is important to understand what this means and what risks are involved.

**An AI agent can take actions on your behalf.** Unlike a simple chatbot that only responds to questions, an AI agent powered by OpenClaw can read and write files in its workspace, execute code, browse the web, and interact with external services through skills. This is what makes it powerful, but it also means the agent can make mistakes, misunderstand instructions, or take actions you did not intend.

**AI models can produce incorrect, misleading, or harmful output.** All AI language models --- whether from Anthropic, OpenAI, Google, or running locally via Ollama --- can generate responses that sound confident but are factually wrong, biased, or inappropriate. Never rely on an AI agent for medical, legal, financial, or safety-critical decisions without independent verification.

**Your AI provider receives your messages.** When you use a cloud AI provider (Anthropic, OpenAI, Google Gemini, Groq, or OpenRouter), your messages are sent to that provider's servers for processing. Each provider has its own privacy policy, data retention practices, and terms of service. KloDock does not control what these providers do with your data. Review your provider's privacy policy before sharing sensitive information.

**API usage costs money.** Cloud AI providers charge per token (roughly per word) for both input and output. A long conversation or complex agent task can consume significant tokens. KloDock does not track or limit your spending. Monitor your usage on your provider's dashboard and set spending limits there.

### 4.3 Skill Safety and the Trust Model

KloDock ships with access to 52 skills from the OpenClaw skill registry. Skills extend what your agent can do --- from sending messages on Telegram to managing GitHub issues to controlling smart home devices.

**Skills are code that runs on your machine with your agent's permissions.** When you enable a skill, you are allowing the agent to use that skill's capabilities. A skill that manages files can read and write files. A skill that sends messages can send messages on your behalf. Understand what a skill does before enabling it.

Every skill in KloDock displays a status badge. **These badges indicate distribution status, not security audit results.** KloDock does not independently audit, verify, or guarantee the safety of any skill.

- **Bundled** (green) --- Ships with the OpenClaw distribution. These skills are included in the official OpenClaw package. They have not been independently security-audited by KloDock. "Bundled" means the OpenClaw project chose to include them, not that they have been formally reviewed for vulnerabilities.

- **Published** (amber) --- Listed on the ClawHub skill registry. These skills are publicly available and may have been created by any developer. They have not been audited for security by KloDock or by ClawHub. The ClawHub registry operates on a "no gatekeeping, just signal" policy --- skills are moderated for outright abuse but are not vetted before listing.

- **Unlisted** (grey) --- Not listed in any known registry. The origin and safety of these skills is unknown. Use only if you understand exactly what the skill does and trust its author.

**Important:** These badges are informational labels about where a skill comes from. They are not security certifications. No automated security scanning, code review, or community voting process is required for any badge level. You are responsible for evaluating whether a skill is safe to use in your environment.

### 4.4 What KloDock Cannot Protect You From

- **Compromised AI providers.** If your AI provider's service is breached or compromised, KloDock cannot prevent exposure of messages you sent to that provider.

- **Malicious skills.** KloDock displays status badges (Bundled/Published/Unlisted) but these are distribution labels, not security certifications. KloDock does not independently audit any skill. Any skill --- including Bundled skills --- could contain bugs, vulnerabilities, or malicious code. You are trusting the individual skill author when you enable a skill.

- **Agent mistakes.** AI agents can misinterpret instructions, hallucinate information, or take unintended actions. Always review agent output before acting on it, especially for important tasks.

- **Local machine compromise.** If your computer is already compromised by malware, KloDock's security measures (encrypted key storage, file permissions) may be bypassed by the malware. KloDock is not a security tool and does not protect against pre-existing threats on your system.

- **API key theft via physical access.** If someone has physical access to your unlocked computer, they can potentially extract your API keys from the OS credential store. Lock your computer when you step away.

### 4.5 Technical Security Measures (Developer Reference)

**Secret Materialization Flow (Cloud Providers):**

1. User enters API key in the wizard or Settings page
2. Key is sent to the Rust backend via Tauri IPC (type-safe, no HTTP)
3. Rust backend encrypts and stores in the OS credential store (DPAPI / Keychain / libsecret)
4. Key exists at rest only in encrypted form
5. When the agent needs the key, Rust retrieves it from the credential store
6. An ephemeral `.env` file is written with restricted permissions (600 / icacls owner-only)
7. The agent process reads the `.env` on startup
8. The `.env` is scrubbed (deleted) immediately after use

**Additional measures:**
- Crash recovery scrub removes any stale `.env` on every KloDock launch
- SHA-256 checksum verification on Node.js downloads
- Windows file permissions via `icacls` with inheritance removed
- Git pre-commit hook blocks commits containing API key patterns
- Tauri capability restrictions limit IPC to registered commands only
- Secret filenames are SHA-256 hashed (file names do not reveal key names)
- Config backup before every OpenClaw update (automatic copy of openclaw.json and SOUL.md)

---

## 5. Project Structure

```
klodock/
├── .github/
│   └── workflows/
│       ├── build.yml              # Cross-platform build (Ubuntu, macOS, Windows)
│       ├── test.yml               # Cross-platform test suite
│       ├── release.yml            # Tag-triggered release with GitHub assets
│       └── compat.yml             # Nightly OpenClaw compatibility check
├── src/                           # React frontend
│   ├── __tests__/
│   │   ├── components/
│   │   │   ├── SafetyBadge.test.tsx
│   │   │   └── ToneSlider.test.tsx
│   │   ├── lib/
│   │   │   └── wizard-state.test.ts
│   │   ├── wizard/
│   │   │   ├── ModelProvider.test.tsx
│   │   │   └── Personality.test.tsx
│   │   └── setup.ts               # Test setup (mocks)
│   ├── components/
│   │   ├── ProgressBar.tsx         # Animated progress indicator
│   │   ├── ProviderCard.tsx        # AI provider selection card
│   │   ├── SafetyBadge.tsx         # Skill skill status badge
│   │   ├── StatusIndicator.tsx     # Agent status light
│   │   ├── Toast.tsx               # Global toast notification component
│   │   └── ToneSlider.tsx          # Personality tone range slider
│   ├── dashboard/
│   │   ├── DashboardLayout.tsx     # Dashboard shell with sidebar navigation
│   │   ├── Overview.tsx            # Agent overview panel (status, health, quick actions)
│   │   ├── DashboardChat.tsx      # Embedded agent chat with WebSocket streaming
│   │   ├── DashboardSkills.tsx     # 52 skills across 8 categories with search/filter
│   │   ├── DashboardPersonality.tsx # Role, tone, and SOUL.md editing
│   │   ├── DashboardChannels.tsx   # Telegram/Discord channel management
│   │   ├── DashboardSettings.tsx   # App settings + Danger Zone uninstall
│   │   └── DashboardUpdates.tsx    # OpenClaw version check + one-click update
│   ├── lib/
│   │   ├── friendly-error.ts      # User-friendly error messages
│   │   ├── tauri.ts               # Tauri IPC wrappers
│   │   ├── templates.ts           # Personality role templates
│   │   ├── types.ts               # Shared TypeScript types
│   │   └── wizard-state.ts        # Wizard state management
│   ├── wizard/
│   │   ├── Welcome.tsx            # Screen 1: Welcome + system check
│   │   ├── Dependencies.tsx       # Screen 2: Node.js detection/install
│   │   ├── Install.tsx            # Screen 3: OpenClaw installation
│   │   ├── ModelProvider.tsx      # Screen 4: AI provider + API key
│   │   ├── Personality.tsx        # Screen 5: Role, tone, SOUL.md
│   │   ├── Channels.tsx           # Screen 6: Telegram/Discord setup
│   │   ├── Skills.tsx             # Screen 7: Skill browser + install
│   │   ├── Done.tsx               # Screen 8: Summary + launch
│   │   └── WizardLayout.tsx       # Wizard chrome (progress bar, nav)
│   ├── styles/                    # Global CSS
│   ├── App.tsx                    # Root component + router
│   ├── main.tsx                   # React entry point
│   └── vite-env.d.ts             # Vite type declarations
├── src-tauri/
│   ├── src/
│   │   ├── bin/
│   │   │   ├── spike_daemon.rs    # Daemon spike binary
│   │   │   ├── spike_dpapi.rs     # DPAPI spike binary
│   │   │   ├── spike_install.rs   # Node install spike binary
│   │   │   ├── spike_kc2.rs       # Keychain v2 spike binary
│   │   │   ├── spike_keychain.rs  # Keychain spike binary
│   │   │   └── spike_node.rs      # Node detection spike binary
│   │   ├── installer/
│   │   │   ├── mod.rs
│   │   │   ├── node.rs            # Node.js detection + silent install
│   │   │   ├── openclaw.rs        # OpenClaw npm installation
│   │   │   ├── skills.rs          # Skill installation from ClawHub
│   │   │   └── uninstall.rs       # Resumable uninstall engine
│   │   ├── config/
│   │   │   ├── mod.rs
│   │   │   ├── soul.rs            # SOUL.md read/write/generate
│   │   │   ├── openclaw_json.rs   # openclaw.json configuration
│   │   │   └── env.rs             # Ephemeral .env management
│   │   ├── secrets/
│   │   │   ├── mod.rs
│   │   │   └── keychain.rs        # DPAPI / Keychain / libsecret
│   │   ├── setup/
│   │   │   ├── mod.rs
│   │   │   └── setup_state.rs     # Wizard state persistence
│   │   ├── process/
│   │   │   ├── mod.rs
│   │   │   ├── daemon.rs          # Child process lifecycle
│   │   │   ├── health.rs          # Periodic health checks
│   │   │   └── autostart/
│   │   │       ├── mod.rs
│   │   │       ├── windows.rs     # Registry Run key
│   │   │       ├── macos.rs       # LaunchAgent plist
│   │   │       └── linux.rs       # XDG autostart / systemd
│   │   ├── clawhub/
│   │   │   ├── mod.rs
│   │   │   ├── registry.rs        # Skill search + recommendations
│   │   │   └── safety.rs          # Safety rating lookup
│   │   ├── update/
│   │   │   ├── mod.rs
│   │   │   ├── openclaw_update.rs # OpenClaw version check + update
│   │   │   └── skill_update.rs    # Skill version check + update
│   │   ├── lib.rs                 # Module registration + Tauri setup
│   │   └── main.rs                # Binary entry point
│   ├── tests/
│   │   ├── fixtures/              # Test fixture data
│   │   ├── installer_test.rs      # Node installer integration tests
│   │   ├── setup_state_test.rs    # Setup state persistence tests
│   │   ├── daemon_test.rs         # Daemon lifecycle tests
│   │   ├── keychain_test.rs       # OS keychain tests (ignored by default)
│   │   ├── autostart_test.rs      # Platform-specific autostart tests
│   │   └── uninstall_test.rs      # Uninstall state persistence tests
│   ├── Cargo.toml                 # Rust dependencies
│   └── Cargo.lock
├── package.json                   # Node dependencies + scripts
├── vite.config.ts                 # Vite configuration
├── tsconfig.json                  # TypeScript configuration
├── SPIKE-RESULTS.md               # Node.js installer spike findings
└── README.md                      # Project README (concise version)
```

---

## 6. Development Guide

### Prerequisites

| Requirement | Details |
|-------------|---------|
| Node.js | >= 22 (v24.14.0 LTS pinned, [nodejs.org](https://nodejs.org/)) |
| Rust | Stable toolchain ([rustup.rs](https://rustup.rs/)) |
| Windows | Visual Studio Build Tools with C++ workload |
| macOS | Xcode Command Line Tools |
| Linux (Ubuntu) | `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev` |

### Initial Setup

```bash
git clone https://github.com/scottconverse/klodock.git
cd klodock
npm install
```

### Development Server

Start the Tauri dev server with hot-reload for both the frontend and backend:

```bash
npx tauri dev
```

This compiles the Rust backend, starts the Vite dev server for the React frontend, and opens the application window. Changes to `.tsx` files trigger instant HMR; changes to `.rs` files trigger a Rust recompile.

### Code Structure Conventions

- **Frontend IPC calls** go through `src/lib/tauri.ts`, which wraps `@tauri-apps/api/core.invoke()` with typed function signatures.
- **Rust commands** are `#[tauri::command]` async functions registered in `lib.rs`.
- **Shared types** are defined in `src/lib/types.ts` (frontend) and as `serde`-derived structs in each Rust module.

### Running Tests

```bash
# Frontend unit and component tests (vitest)
npx vitest run

# Rust integration tests (skips ignored tests)
cd src-tauri && cargo test

# Rust ignored tests (requires real system state: keychain, network, etc.)
cd src-tauri && cargo test -- --ignored

# Watch mode for frontend tests
npx vitest
```

### Building for Production

```bash
npx tauri build
```

This compiles an optimized Rust binary, bundles the Vite-built frontend, and produces platform-specific installers in `src-tauri/target/release/bundle/`.

### Useful Commands

| Command | Purpose |
|---------|---------|
| `npx tauri dev` | Dev server with hot-reload |
| `npx vitest run` | Run frontend tests once |
| `npx vitest` | Run frontend tests in watch mode |
| `cd src-tauri && cargo test` | Run Rust tests |
| `cd src-tauri && cargo test -- --ignored` | Run ignored Rust tests |
| `cd src-tauri && cargo check` | Fast Rust type-check without building |
| `npx tauri build` | Production build with installers |
| `npm run build` | Build frontend only (Vite) |

---

## 7. Testing

### Test Summary

| Layer | Framework | Count | Status |
|-------|-----------|-------|--------|
| Frontend unit/component | Vitest + Testing Library | 20 | Passing |
| Rust integration | Cargo test | ~27 | Passing |
| End-to-end | E2E tests planned | -- | Planned |
| **Total** | | **~47** | **0 failures** |

### Frontend Tests (Vitest)

Tests are located in `src/__tests__/` and cover:

- **Component tests** --- `ToneSlider` (rendering, interaction, ARIA attributes), `SafetyBadge` (rating display)
- **Wizard screen tests** --- `ModelProvider` (provider card rendering, validation gating), `Personality` (role cards, tone slider, preview updates)
- **Library tests** --- `wizard-state` (initial state, step detection, completion logic)

Run with: `npx vitest run`

### Rust Integration Tests (Cargo)

Tests are located in `src-tauri/tests/` and cover:

- **installer_test** --- Node.js detection, version manager detection, KloDock node path validation
- **setup_state_test** --- Fresh state generation, step completion persistence
- **daemon_test** --- Stale `.env` scrubbing, daemon status when not running
- **uninstall_test** --- Uninstall state serialization, partial uninstall resume detection
- **autostart_test** --- Default-disabled check (platform-gated)

Run with: `cd src-tauri && cargo test`

### Ignored Tests (Require Real System State)

These tests are marked `#[ignore]` because they interact with real OS resources:

- **keychain_test** (3 tests) --- Store/retrieve round-trip, delete, list. Interacts with the real OS keychain. Uses a Mutex for serial execution to avoid race conditions on the shared DPAPI key index.
- **installer_test** (2 tests) --- Full Node.js download and install. Requires network and writes to `~/.klodock/node/`.
- **autostart_test** (1 test per platform) --- Enable/disable round-trip. Modifies registry keys, launch agents, or systemd units.
- **setup_state_test** (1 test) --- `verify_all_steps` calls real system checks.

Run with: `cd src-tauri && cargo test -- --ignored`

---

## 8. Build Artifacts

### What `npx tauri build` Produces

| Platform | Artifact | Format | Notes |
|----------|----------|--------|-------|
| Windows | MSI installer | `.msi` | Standard Windows Installer package |
| Windows | NSIS installer | `.exe` | Lighter-weight NSIS setup executable |
| macOS | App bundle | `.app` in `.dmg` | Universal binary (Intel + Apple Silicon) |
| Linux | AppImage | `.AppImage` | Portable, no install required |
| Linux | Debian package | `.deb` | For apt-based distributions |

### Verified Windows Build Sizes

| Artifact | Size |
|----------|------|
| `KloDock_1.2.0_x64-setup.exe` (NSIS) | 5.1 MB |

These sizes reflect the Tauri advantage: no bundled browser engine. The application uses the system's Edge WebView2 (Windows), WebKitGTK (Linux), or WKWebView (macOS).

Output directory: `src-tauri/target/release/bundle/`

---

## 9. CI/CD

Four GitHub Actions workflows automate building, testing, releasing, and compatibility monitoring.

### Workflows

| Workflow | File | Trigger | Platforms | Purpose |
|----------|------|---------|-----------|---------|
| **Build** | `build.yml` | Push/PR to `main` | Ubuntu, macOS, Windows | Compiles the full Tauri application on all three platforms. Catches compilation errors before merge. |
| **Test** | `test.yml` | Push/PR to `main` | Ubuntu, macOS, Windows | Runs Rust integration tests (`cargo test`) and frontend unit tests (`vitest`) on all platforms. All passing. |
| **Release** | `release.yml` | Tag push (`v*`) | Ubuntu, macOS, Windows | Builds platform-specific installers via `tauri-action` and publishes them as GitHub Release assets. |
| **Compatibility** | `compat.yml` | Nightly (06:00 UTC) + manual | Ubuntu | Installs the latest OpenClaw from npm and runs the Rust test suite against it. On failure, automatically creates a GitHub Issue tagged `bug` + `compatibility`. |

### Dependency Caching

All workflows cache:
- `~/.cargo/registry` and `~/.cargo/git` (Cargo registry)
- `src-tauri/target` (Rust build artifacts)
- `node_modules` (via `setup-node` cache)

Cache keys are based on `Cargo.lock` hash for Rust and npm lockfile for Node.

---

## 10. Roadmap

### Phase 1: Setup Wizard (Shipped)

- 7-step setup wizard from download to running agent
- Silent Node.js detection and installation
- OpenClaw installation from npm
- API key management with OS credential store
- Personality builder with SOUL.md preview
- Channel configuration (Telegram, Discord)
- Skill browser with safety ratings
- Agent lifecycle management (start, stop, restart, health monitoring)
- System tray autostart
- Resumable setup and uninstall
- Accessibility (WCAG 2.1 AA)
- Cross-platform CI/CD with nightly compatibility checks

### Phase 2: Dashboard and Ecosystem (Shipped in v1.2.0)

- ~~**Agent dashboard** --- Real-time status, log viewer, conversation history~~ **SHIPPED**
- ~~**Skill marketplace** --- Full ClawHub integration with install, update, and review flows~~ **SHIPPED**
- ~~**Settings panel** --- Advanced configuration without editing JSON~~ **SHIPPED**
- ~~**First-message onboarding** --- Agent greeting bubble on Done screen so users see their agent respond immediately~~ **SHIPPED**
- ~~**WCAG 2.1 AA accessibility** --- ARIA labels, keyboard navigation, contrast ratios, screen reader support~~ **SHIPPED**
- ~~**Pre-commit security hook** --- Automated API key leak prevention on every commit~~ **SHIPPED**
- ~~**System tray icon** --- Minimize to tray on close, right-click menu (Show/WebChat/Start Agent/Quit), tooltip shows daemon status~~ **SHIPPED**
- ~~**Activity feed** --- Timestamped agent event log on dashboard Overview with color-coded levels and refresh~~ **SHIPPED**
- ~~**Per-skill updates** --- Detect when OpenClaw update brings new skills, banner on Skills page with link to Updates~~ **SHIPPED**
- ~~**Ollama model pull progress** --- Progress bar with percent, downloaded/total bytes, completion state~~ **SHIPPED**
- ~~**Plain-English errors** --- 85+ technical error messages rewritten for non-technical users across 13 Rust modules~~ **SHIPPED**
- ~~**Keep API keys toggle** --- Settings toggle for terminal users who want .env preserved on daemon stop~~ **SHIPPED**
- ~~**Config backup** --- Automatic backup of openclaw.json and SOUL.md before every OpenClaw update~~ **SHIPPED**
- ~~**Cross-platform CI** --- GitHub Actions builds and tests on Windows, macOS, and Linux on every push~~ **SHIPPED**
- ~~**Rust integration tests** --- Comprehensive test suite covering config, env, SHA256, settings, uninstall state~~ **SHIPPED**
- **E2E tests** --- Planned (WebdriverIO + tauri-driver)
- **WhatsApp integration** --- Deferred from Phase 1 due to Baileys library fragility; evaluating alternatives
- **Multi-agent support** --- Run and manage multiple OpenClaw instances

### Phase 3: Future Considerations

- ~~**Auto-update** --- Silent background updates for KloDock itself via Tauri's updater~~ **SHIPPED in v1.2.0** (OpenClaw auto-update from npm with one-click UI)
- **Plugin system** --- Community-developed UI extensions
- **Team management** --- Shared configurations for organizations
- **Analytics dashboard** --- Usage metrics and conversation insights (local only)
- **Mobile companion** --- Status monitoring and quick replies from mobile devices

---

## 11. Competitive Positioning

```
                More Control / Local

                    * KloDock
                 (free, local, GUI)

  Easier ----                          ---- Harder

  Clawnify      OneClaw      KiwiClaw
  ($$$)         ($10/mo)     ($15-39/mo)

                  OpenClaw CLI
                (free but terminal)

                Less Control / Cloud
```

| Product | Price | Local/Cloud | GUI | Terminal Required |
|---------|-------|-------------|-----|-------------------|
| **KloDock** | Free | Local | Yes | No |
| OpenClaw CLI | Free | Local | No | Yes |
| Clawnify | $20+/mo | Cloud | Yes | No |
| OneClaw | $10/mo | Cloud | Yes | No |
| KiwiClaw | $15--39/mo | Cloud | Yes | No |

KloDock occupies the unique position of being both free and easy to use while keeping all data local. The only product in the "free + local" space is the OpenClaw CLI, which requires terminal proficiency. All GUI alternatives are cloud-hosted and paid.

---

## 12. Known Limitations

- **OpenClaw is fictional.** This project is a proof-of-concept demonstrating the architecture, UI patterns, and security model for wrapping a complex CLI tool in a native desktop GUI. The "OpenClaw" agent framework, "ClawHub" skill registry, and competing services referenced throughout are not real products.

- **WhatsApp integration deferred.** The original PRD included WhatsApp as a channel option. This was deferred because the Baileys library (the primary open-source WhatsApp Web API) is fragile and breaks frequently with WhatsApp protocol changes.

- **No code signing.** Windows and macOS builds are not code-signed, which will trigger OS security warnings on first launch. Code signing certificates are needed for production distribution.

---

## 13. License

MIT License

Copyright (c) 2026 Scott Converse

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
