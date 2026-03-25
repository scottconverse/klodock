# KloDock™

Desktop GUI for [OpenClaw](https://github.com/openclaw/openclaw) — zero terminal, zero complexity.

KloDock lets non-technical users install, configure, personalize, and manage an OpenClaw AI agent through a visual interface. No command line, no JSON files, no markdown editing. Download, run the wizard, talk to your agent.

> **Windows:** SmartScreen may show "Windows protected your PC" — click **More info → Run anyway**. This is normal for unsigned open-source apps.
> **macOS:** Right-click the app → **Open** on first launch (Gatekeeper warning for unsigned apps).

> **Important:** AI agents can execute code, access files, and interact with external services. Read the [Security and Safety documentation](https://scottconverse.github.io/klodock/terms.html) and [Terms of Service](https://scottconverse.github.io/klodock/terms.html) before use.

## Why KloDock?

OpenClaw is powerful but hard to set up. It requires Node.js, terminal fluency, manual config files, and API key management. Hosted alternatives charge $10-40/month for what is free software — and hold your keys.

KloDock fills the gap: **easy + local + free.**

```
                More Control / Local

                    ★ KloDock
                 (free, local, GUI)

  Easier ────                          ──── Harder

  Clawnify      OneClaw      KiwiClaw
  ($$$)         ($10/mo)     ($15-39/mo)

                  OpenClaw CLI
                (free but terminal)

                Less Control / Cloud
```

## Features

- **7-step setup wizard** — from download to a working agent in minutes, not hours
- **Full dashboard with 7 pages** — Overview, Chat, Skills, Personality, Channels, Settings, Updates
- **52 bundled skills with skill status badges** — categorized into Communication, Productivity, Developer Tools, Media & Audio, Smart Home, AI Services, Images & Video, System & Security — with search, category filtering, status indicators (Bundled/Published/Unlisted), and actionable requirements (download buttons, navigation to Settings/Channels). Bundled JSON fallback ensures skills load even on first run when the live query is slow
- **Dashboard Settings** — full AI provider card grid (same as wizard), provider switching with "Set as Primary", gateway config, uninstall from Settings
- **Dashboard Channels** — full token setup flow (same as wizard), disconnect capability
- **Dashboard Personality** — inline edit with name, role, tone, live preview
- **Dashboard Updates** — real version checking via npm registry, "Update now" button
- **Toast notification system** — global error/success/warning/info toasts
- **Auto-updater** — checks npm registry for latest OpenClaw version, updates via npm
- **Silent Node.js install** — detects existing installs, handles nvm/volta/homebrew
- **API key management** — OS keychain (DPAPI on Windows, Keychain on macOS, libsecret on Linux), keys never stored in plaintext
- **Ollama integration** — auto-detection, model listing, model picker dropdown, no-models guard, writes base_url and selected model to openclaw.json. **Important:** Ollama requires a model that supports **tool calling** (function calling). Not all Ollama models support this. Recommended tool-capable models:
  - `qwen2.5:7b` — 4.7 GB, good balance of speed and capability
  - `llama3.1:8b` — 4.7 GB, Meta's flagship small model with tool support
  - `mistral:7b` — 4.1 GB, fast inference, solid tool calling
- **Channel setup with verification** — guided Telegram and Discord configuration with API-level token testing (Telegram `getMe`, Discord `users/@me`) before saving
- **Daemon auto-restart** — managed child process with backoff (up to 3 attempts), health monitoring
- **Start on login** — optional system tray launcher (no system service required)
- **Clean uninstall** — removes all KloDock data (Node.js, OpenClaw, config, workspace, secrets, registry entries)
- **Accessible** — WCAG 2.1 AA, keyboard navigation, screen reader tested

## Tech Stack

| Layer | Choice |
|-------|--------|
| Desktop framework | [Tauri v2](https://v2.tauri.app/) (Rust backend, system webview) |
| Frontend | React 19 + TypeScript + Tailwind CSS v4 |
| Routing | React Router v7 |
| Icons | Lucide React |
| Secret storage | DPAPI (Windows), Keychain (macOS), libsecret (Linux) |
| Testing | Vitest (frontend), Cargo test (backend) |
| CI/CD | GitHub Actions (cross-platform build, test, release) |

## Project Structure

```
klodock/
├── src-tauri/src/         # Rust backend
│   ├── installer/         # Node.js + OpenClaw + skill installation
│   ├── config/            # SOUL.md, openclaw.json, .env management
│   ├── secrets/           # OS keychain integration (DPAPI/Keychain/libsecret)
│   ├── setup/             # Wizard state persistence + step verification
│   ├── process/           # Daemon lifecycle, health checks, autostart
│   ├── clawhub/           # Skill registry client + skill status indicators
│   └── update/            # Version checking + updates
├── src/                   # React frontend
│   ├── wizard/            # 7-step setup wizard
│   ├── dashboard/         # Agent management dashboard
│   │   ├── DashboardLayout.tsx
│   │   ├── Overview.tsx
│   │   ├── DashboardChat.tsx
│   │   ├── DashboardSkills.tsx
│   │   ├── DashboardPersonality.tsx
│   │   ├── DashboardChannels.tsx
│   │   ├── DashboardSettings.tsx
│   │   └── DashboardUpdates.tsx
│   ├── components/        # Shared UI components (incl. Toast.tsx)
│   └── lib/               # Tauri IPC wrappers, types, templates
└── .github/workflows/     # CI/CD (build, test, release, nightly compat)
```

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22 (v24.14.0 LTS pinned for managed installs)
- [Rust](https://rustup.rs/) stable
- Visual Studio Build Tools with C++ workload (Windows)
- Xcode Command Line Tools (macOS)
- `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev` (Linux/Ubuntu)

### Setup

```bash
git clone https://github.com/scottconverse/klodock.git
cd klodock
npm install
```

### Dev server

```bash
npx tauri dev
```

### Run tests

```bash
# Frontend unit tests (20 tests)
npx vitest run

# Rust integration tests
cd src-tauri && cargo test

# Puppeteer E2E tests (107 tests — every page, button, and edge case)
npm run test:e2e

# QA shell suite (47 checks — security, versions, docs, build artifacts)
bash scripts/qa-test.sh
```

### Build

```bash
npx tauri build
```

Produces platform-specific installers in `src-tauri/target/release/bundle/`.

## Security

- API keys stored in OS credential store, never in plaintext at rest
- `.env` file exists only while the daemon is running, scrubbed on stop and on every launch
- Node.js downloaded from nodejs.org with SHA256 checksum verification
- OpenClaw installed from official npm registry only
- Skills installed via official `clawhub install` only
- Tauri capabilities restricted to minimum required permissions
- No telemetry by default

## License

MIT

## Status

**v1.3.0** — In-app Ollama download and model pull, full dashboard, auto-updater, 52 categorized skills with skill status badges, channel token verification, first-message onboarding greeting, system tray icon with context menu (close minimizes to tray, right-click for Show/WebChat/Start Agent/Quit), corrected WebChat URLs to OpenClaw canvas endpoint, WCAG 2.1 AA accessibility pass, pre-commit API key leak prevention hook, toast notifications, resumable uninstall with step-by-step progress (survives crashes and resumes on next launch), plain-English error messages throughout (85+ technical errors rewritten for non-technical users), "Keep API keys on disk" toggle in Settings for terminal users, automatic config backup (openclaw.json + SOUL.md) before every OpenClaw update, activity feed on dashboard Overview (timestamped agent events with color-coded levels), per-skill update detection (banner on Skills page when OpenClaw update brings new skills), Tauri auto-updater with Ed25519 signed releases and in-app restart, cross-platform CI via GitHub Actions (Windows/macOS/Linux builds on every push), comprehensive Rust test suite, Ollama model pull progress bar with percent and completion state, embedded chat UI via CLI agent (type a message → agent responds inline, no browser needed, no gateway auth required), auto-set primary provider on connect (connecting an API key automatically makes it the active provider), Stop/Restart/Open Chat agent controls on Overview, "Key stored securely" display for connected providers, real-time status bar sync via 2-second polling + event listener, active model name shown in activity feed, model tier persistence across navigation (Fast/Smart/Pro selection survives page changes), 107 Puppeteer E2E tests covering all 7 dashboard pages + accessibility, chat history persistence via localStorage (survives navigation, Clear button to reset).
