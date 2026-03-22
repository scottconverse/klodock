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

- **Quick setup wizard** — from download to a working agent in minutes, not hours
- **Silent Node.js install** — detects existing installs, handles nvm/volta/homebrew
- **Visual personality builder** — name, role, tone slider, live SOUL.md preview
- **API key management** — OS keychain (DPAPI on Windows, Keychain on macOS, libsecret on Linux), keys never stored in plaintext
- **Ollama integration** — auto-detection, model listing, model picker dropdown, no-models guard, writes base_url and selected model to openclaw.json
- **Channel setup** — guided Telegram and Discord configuration
- **Skill browser** — safety-rated skills from ClawHub with one-click install
- **Agent lifecycle** — managed child process with auto-restart, health monitoring
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
| Testing | Vitest (frontend), Cargo test (backend), WebdriverIO + tauri-driver (E2E) |
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
│   ├── wizard/            # 8-screen setup wizard
│   ├── dashboard/         # Agent management dashboard (Phase 2)
│   ├── components/        # Shared UI components
│   └── lib/               # Tauri IPC wrappers, types, templates
├── e2e/                   # End-to-end tests (WebdriverIO + tauri-driver)
└── .github/workflows/     # CI/CD (build, test, release, nightly compat)
```

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22
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
# Frontend (26 tests)
npx vitest run

# Rust (12 tests + 7 ignored)
cd src-tauri && cargo test

# E2E (13 tests — requires built app + msedgedriver)
npm run test:e2e
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

**Phase 1 (v0.1.0)** — Setup wizard functional, all core modules implemented. CI passes on all 3 platforms (Windows, macOS, Ubuntu). 51 tests passing (26 frontend + 12 Rust + 13 E2E), 0 failures. See [SPIKE-RESULTS.md](SPIKE-RESULTS.md) for installer spike findings.
