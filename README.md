# KloDock™

Desktop GUI for [OpenClaw](https://github.com/openclaw/openclaw) — zero terminal, zero complexity.

KloDock lets non-technical users install, configure, personalize, and manage an OpenClaw AI agent through a visual interface. No command line, no JSON files, no markdown editing. Download, run the wizard, talk to your agent.

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
- **52 bundled skills with safety badges** — categorized into Communication, Productivity, Developer Tools, Media & Audio, Smart Home, AI Services, Images & Video, System & Security — with search, category filtering, safety ratings (Verified/Community/Unreviewed), and actionable requirements (download buttons, navigation to Settings/Channels). Bundled JSON fallback ensures skills load even on first run when the live query is slow
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
- **Clean uninstall** — resumable, leaves user data intact by default
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
│   ├── clawhub/           # Skill registry client + safety ratings
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
# Frontend (20 tests)
npx vitest run

# Rust (comprehensive test suite)
cd src-tauri && cargo test
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

**v1.2.0** — In-app Ollama download and model pull, full dashboard, auto-updater, 52 categorized skills with safety badges, channel token verification, first-message onboarding greeting, system tray icon with context menu (close minimizes to tray, right-click for Show/WebChat/Start Agent/Quit), corrected WebChat URLs to OpenClaw canvas endpoint, WCAG 2.1 AA accessibility pass, pre-commit API key leak prevention hook, toast notifications, resumable uninstall with step-by-step progress (survives crashes and resumes on next launch), plain-English error messages throughout (85+ technical errors rewritten for non-technical users), "Keep API keys on disk" toggle in Settings for terminal users, automatic config backup (openclaw.json + SOUL.md) before every OpenClaw update, activity feed on dashboard Overview (timestamped agent events with color-coded levels), per-skill update detection (banner on Skills page when OpenClaw update brings new skills), Tauri auto-updater with Ed25519 signed releases and in-app restart, cross-platform CI via GitHub Actions (Windows/macOS/Linux builds on every push), comprehensive Rust test suite, Ollama model pull progress bar with percent and completion state, embedded chat UI with WebSocket streaming (no external browser needed), Stop/Restart/Open Chat agent controls on Overview, "Key stored securely" display for connected providers, real-time status bar sync via polling + event listener, active model name shown in activity feed.
