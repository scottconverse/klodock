# KloDock Forensic QA Test Prompt

**Purpose:** Hand this to a QA engineer (human or AI agent) and let them destroy it. Every item below is a specific, testable assertion grounded in the actual codebase. No hand-waving, no "check for general quality." This is a surgical audit.

**Ground rules:** Fail LOUD. If something passes, move on. If something fails, document the exact file, line, input, expected output, and actual output. No "it seemed fine." Screenshots or terminal output required for every failure.

---

## SECTION 1: KNOWN BUGS (Verify These Are Still Broken)

These bugs exist in the codebase right now. If the developer claims they're fixed, prove it.

### 1.1 Dashboard Type Mismatches (CRITICAL - Runtime Crashes)

**Bug 1: StatusIndicator.tsx renders nothing**
- File: `src/components/StatusIndicator.tsx`
- The `statusConfig` record has keys `"Running"`, `"Stopped"`, `"Error"` (capitalized)
- The `DaemonStatus` type in `src/lib/types.ts` is a tagged union: `{ status: "running" | "stopped" | "starting" | "error", message?: string }`
- `DashboardLayout.tsx` passes the DaemonStatus *object* to StatusIndicator
- **Test:** Build the app, complete the wizard, navigate to the dashboard. Does the status indicator show anything? It should show a colored dot with "Running" / "Stopped" text. If it shows nothing or "Unknown", this bug is confirmed.

**Bug 2: DashboardLayout.tsx accesses non-existent property**
- File: `src/dashboard/DashboardLayout.tsx`
- Code does `.then((h) => setStatus(h.daemon))` but `getDaemonStatus()` returns `DaemonStatus` which has no `.daemon` property
- `useState<DaemonStatus>("Stopped")` initializes with a string, not the object `{ status: "stopped" }`
- **Test:** Open browser devtools console on the dashboard. Look for `TypeError: Cannot read property 'daemon' of undefined` or similar. Check that the status indicator is not permanently stuck on the initial value.

**Bug 3: Overview.tsx uses wrong type entirely**
- File: `src/dashboard/Overview.tsx`
- Calls `getDaemonStatus()` but treats result as `HealthStatus`
- Accesses `health.uptime_seconds`, `health.connected_channels`, `health.active_skills` -- none of these fields exist on either `DaemonStatus` or `HealthStatus` (which has `daemon_alive`, `api_key_valid`, `channels`, `issues`)
- **Test:** Navigate to Dashboard > Overview. Do the stats cards show actual numbers or `undefined`/`NaN`/blank?

### 1.2 Missing Dashboard Routes

- `DashboardLayout.tsx` renders 6 sidebar nav links: Overview, Skills, Personality, Channels, Settings, Updates
- `App.tsx` only defines a route for `/dashboard` (index = Overview)
- Routes `/dashboard/skills`, `/dashboard/personality`, `/dashboard/channels`, `/dashboard/settings`, `/dashboard/updates` are NOT defined
- **Test:** Click each sidebar link. Do Skills, Personality, Channels, Settings, and Updates render a component, or do they show a blank content area / 404?

### 1.3 Unit Tests Test Placeholder Components

Every frontend unit test imports a placeholder, NOT the real component:

| Test File | What It Tests | What It Should Test |
|-----------|--------------|-------------------|
| `Personality.test.tsx` | Placeholder with roles "Coder"/"Writer"/"Analyst" | Real component with "General Assistant"/"Research Helper"/"Writing Partner"/"Productivity Bot"/"Custom" |
| `ModelProvider.test.tsx` | Placeholder with `role="list"` | Real component with CSS grid |
| `SafetyBadge.test.tsx` | Placeholder with ratings "safe"/"caution"/"danger"/"unknown" | Real component with "Verified"/"Community"/"Unreviewed" |
| `ToneSlider.test.tsx` | Placeholder with integer range 0-100 | Real component with float range 0-1 |
| `wizard-state.test.ts` | Local `loadWizardState` function | Real `useWizardState` hook |

- **Test:** Open each test file. Confirm the import is commented out with a TODO. Run `npm test` and verify these tests pass -- then verify they pass for the WRONG REASONS (they test components that don't exist in the shipping app).

### 1.4 Version Mismatch

- `package.json`: version `1.0.0`
- `Cargo.toml`: version `0.1.0`
- `tauri.conf.json`: version `0.1.0`
- `website/index.html`: hardcoded `"Download v0.1.0"`
- **Test:** Which is it? 0.1.0 or 1.0.0? The MSI/DMG installer will show one version, the npm package another. The Windows "Add/Remove Programs" will show the Cargo version.

### 1.5 package.json Metadata

- `"author": ""` -- empty
- `"description": ""` -- empty
- `"license": "ISC"` -- should be `"MIT"` per the PRD and LICENSE file
- `"keywords": []` -- empty
- **Test:** Verify these fields. The license mismatch between ISC (package.json) and MIT (LICENSE, Cargo.toml, README) is a real legal ambiguity.

---

## SECTION 2: SECURITY AUDIT

### 2.1 Gemini API Key in URL Query Parameter

- File: `src-tauri/src/secrets/keychain.rs`, line ~208
- Code: `format!("https://generativelanguage.googleapis.com/v1beta/models?key={}", key)`
- The API key is passed as a URL query parameter, meaning it appears in:
  - Server access logs
  - Proxy/CDN logs (corporate environments)
  - Any network monitoring tool
  - Browser/network history if ever exposed
- **Test:** Set up a Gemini API key. Click "Test Connection" on the Gemini provider card. Use Wireshark or a proxy (Charles/mitmproxy) to capture the request. Is the API key visible in the URL? Compare with OpenAI/Anthropic which use Authorization headers.

### 2.2 .env Newline Injection

- File: `src-tauri/src/config/env.rs`
- The `write_env` function writes `key=value` pairs but does NOT validate or sanitize values
- A value containing `\n` followed by `MALICIOUS_KEY=evil` would inject an additional environment variable
- **Test:** Store a secret with value `"real_key\nINJECTED_VAR=malicious_value"` via the keychain. Start the daemon (which materializes .env). Read the .env file. Are there two lines?

### 2.3 PowerShell Injection in Windows Keychain

- File: `src-tauri/src/secrets/keychain.rs`, Windows platform module
- Values are escaped with `value.replace('\'', "''")` for PowerShell single quotes
- But values containing `$()` or backticks could potentially be interpreted by PowerShell despite `-AsPlainText`
- **Test (Windows only):** Store a secret with value `$(whoami)` or `` `whoami` ``. Retrieve it. Is the value the literal string, or was it executed?

### 2.4 Windows icacls Silently Ignored

- File: `src-tauri/src/config/env.rs`, line ~36
- On Windows, `icacls` failure is wrapped in `let _ = ...` -- silently ignored
- If icacls fails, the .env file has default permissions (potentially world-readable)
- **Test (Windows only):** Create a .env file via the daemon start flow. Check its ACL with `icacls %USERPROFILE%\.openclaw\.env`. Are permissions restricted to the current user only?

### 2.5 Stale .env Scrub Timing

- The PRD says .env is scrubbed on every launch (Phase 2, Step 1)
- **Test:** Start KloDock, let the daemon run. Force-kill KloDock (Task Manager / `kill -9`). Verify .env exists on disk with plaintext keys. Relaunch KloDock. Is the stale .env scrubbed BEFORE any other operation?
- **Timing test:** Add a 5-second sleep to the Rust startup before scrub. During those 5 seconds, can another process read the .env? (This tests whether the scrub is truly the FIRST thing that happens.)

### 2.6 DPAPI Secret Filenames Leak Key Names

- File: `src-tauri/src/secrets/keychain.rs`, Windows module
- Encrypted files stored at `~/.klodock/secrets/{key}.enc`
- The filenames reveal which API keys are stored (e.g., `OPENAI_API_KEY.enc`, `ANTHROPIC_API_KEY.enc`)
- **Test (Windows only):** Store API keys for multiple providers. List the contents of `%USERPROFILE%\.klodock\secrets\`. Can you determine which providers the user has accounts with just from the filenames?

---

## SECTION 3: CROSS-PLATFORM INSTALLER

### 3.1 Node.js Detection Edge Cases

For each scenario below, test on the target platform:

| Scenario | Expected Behavior | How to Set Up |
|----------|------------------|--------------|
| No Node.js at all | Silent install to `~/.klodock/node/` | Fresh VM or `rm -rf` all Node installations |
| Node 18 via nvm | Install Node 22 alongside, don't disturb nvm | `nvm install 18 && nvm use 18` |
| Node 18 at `/usr/local/bin/node` (no version manager) | Install Node 22 to `~/.klodock/node/`, leave system Node alone | Install Node 18 from nodejs.org package |
| Node 22 via Homebrew (macOS) | Detect and use it, don't install another copy | `brew install node@22` |
| Node 22 via Volta | Detect and use it | `volta install node@22` |
| Corporate HTTP proxy | Downloads should respect `HTTP_PROXY` / `HTTPS_PROXY` env vars | Set env vars pointing to a Squid proxy |
| Antivirus blocking unsigned binary (Windows) | Show friendly error: "Your antivirus might be blocking it" | Enable Windows SmartScreen, try installing unsigned Node.js binary |

**For every scenario:** After the wizard completes, run `~/.klodock/node/bin/node --version` (or `~/.klodock/node/node.exe --version` on Windows). Is it Node 22? Did the system Node survive untouched?

### 3.2 SHA256 Checksum Verification

- File: `src-tauri/src/installer/node.rs`
- Downloads Node.js binary and verifies SHA256 checksum
- **Test:** Download the Node.js archive manually. Corrupt one byte. Replace the legitimate download with the corrupted file (intercept via proxy or replace in `~/.klodock/tmp/`). Does the installer reject it with a checksum error, or does it proceed?

### 3.3 Autostart Per-Platform

| Platform | Mechanism | Verification |
|----------|-----------|-------------|
| Windows | Registry `HKCU\...\Run` with value `"KloDock"` | `reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v KloDock` |
| macOS | Login Item via `osascript` | System Settings > General > Login Items, or `osascript -e 'tell application "System Events" to get the name of every login item'` |
| Linux | `~/.config/autostart/klodock.desktop` | `cat ~/.config/autostart/klodock.desktop` and verify `Exec=` path exists |

**For each platform:**
1. Enable autostart via Settings toggle
2. Verify the artifact exists using the command above
3. Log out and log back in (or reboot)
4. Does KloDock launch minimized to tray? Or does it open a full window? (PRD says tray-only)
5. Disable autostart
6. Verify the artifact is removed
7. Log out and back in -- KloDock should NOT launch

### 3.4 Uninstall Completeness

Run the uninstall flow. Then verify ALL of the following are gone:

| Artifact | Expected State After Uninstall |
|----------|-------------------------------|
| `~/.klodock/` | Removed |
| `~/.klodock/node/` | Removed (if KloDock installed it) |
| `~/.klodock/secrets/` (Windows) | Removed |
| `~/.klodock/daemon.pid` | Removed |
| `~/.klodock/setup-state.json` | Removed |
| `~/.klodock/settings.json` | Removed |
| OpenClaw global npm package | Removed (`npm list -g openclaw` should show nothing) |
| Autostart artifact | Removed (check per platform above) |
| OS keychain entries | Removed (check via Keychain Access / cmdkey / secret-tool) |
| `~/.openclaw/.env` | Scrubbed |
| `~/.openclaw/` (user data) | **PRESERVED by default** (SOUL.md, skills, openclaw.json) |
| `~/.openclaw/` (if user chose "remove all") | Removed |

### 3.5 Partial Uninstall Resume

1. Start uninstall
2. Force-kill KloDock after step 3 (ScrubEnv) but before step 4 (ClearKeychain)
3. Verify `~/.klodock/uninstall-state.json` exists with steps 1-3 completed
4. Relaunch KloDock
5. Does it detect the partial uninstall and offer to resume?
6. Does it resume from step 4 (ClearKeychain), not restart from step 1?

---

## SECTION 4: IPC BOUNDARY AUDIT

Every Tauri command in `lib.rs` must have a matching TypeScript wrapper in `tauri.ts`. Every TypeScript wrapper must be called by at least one component (or be documented as "reserved for Phase 2").

### 4.1 Registered vs. Implemented Commands

These commands are registered in `lib.rs` invoke_handler but their implementations return stub errors:

| Command | File | What It Returns |
|---------|------|----------------|
| `search_skills` | `clawhub/registry.rs` | `Err("ClawHub registry search not yet implemented")` |
| `get_skill_details` | `clawhub/registry.rs` | `Err("ClawHub detail endpoint not yet implemented")` |
| `update_openclaw` | `update/openclaw_update.rs` | `Err("OpenClaw update not yet implemented")` |
| `update_skill` | `update/skill_update.rs` | `Err("Skill update not yet implemented")` |

**Test:** Call each of these from the browser devtools console via `window.__TAURI__.invoke("search_skills", { query: "test" })`. Do they return the expected error, or do they crash?

### 4.2 Commands NOT Registered in invoke_handler

These commands have `#[tauri::command]` but are NOT in the `generate_handler![]` macro in `lib.rs`:

- `write_env`
- `delete_env`
- `read_env`

**Test:** Call `window.__TAURI__.invoke("write_env", { entries: {} })` from devtools. It should return an error like "command not found", NOT succeed.

### 4.3 IPC Argument Mismatches

Check that the TypeScript `invoke()` call sends arguments in the exact format the Rust command expects:

| TS Call | Rust Expects | Match? |
|---------|-------------|--------|
| `invoke("complete_step", { step: "node_install" })` | `fn complete_step(step: SetupStep)` where SetupStep is `#[serde(rename_all = "snake_case")]` | Verify -- does `"node_install"` deserialize to `SetupStep::NodeInstall`? |
| `invoke("generate_soul", { config: {...} })` | `fn generate_soul(config: SoulConfig)` | Verify -- does the frontend pass `config` as a named arg or as the first positional? Tauri uses named args. |
| `invoke("install_skill", { slug: "..." })` | `fn install_skill(slug: String)` | Verify |
| `invoke("write_config", { config: {...} })` | `fn write_config(config: OpenClawConfig)` | Verify -- does the `channels: {}` from TS deserialize to `HashMap<String, serde_json::Value>`? |

---

## SECTION 5: ACCESSIBILITY (WCAG 2.1 AA)

The PRD claims WCAG 2.1 AA compliance (R-13). Verify:

### 5.1 Keyboard Navigation

- **Test the entire wizard using ONLY the keyboard (Tab, Enter, Escape, Arrow keys):**
  1. Welcome screen: Can you Tab to "Get Started" and press Enter?
  2. Dependencies: Can you Tab to Retry if an error occurs?
  3. Model Provider: Can you Tab through all 6 provider cards? Can you Tab into the API key field and type? Can you Tab to "Test Connection"?
  4. Personality: Can you Tab to the name field, type, Tab to role cards and select with Enter/Space, use the tone slider with Arrow keys, Tab to instructions textarea?
  5. Channels: Can you Tab to expand/collapse channel sections? Can you Tab to the token field and paste? Can you Tab to "Test Connection"?
  6. Skills: Can you Tab to each skill toggle and press Space to toggle?
  7. Done: Can you Tab to "Open Dashboard"?
  8. Dashboard: Can you Tab through sidebar nav items and press Enter to navigate?

### 5.2 Screen Reader

- Run VoiceOver (macOS) or NVDA (Windows) through the entire wizard
- Every interactive element must be announced with its purpose
- The progress bar must announce current step
- Safety badges must announce the rating text (not just color)
- Error messages must be announced when they appear (`role="alert"`)
- Status changes must be announced (`aria-live="polite"`)

### 5.3 Contrast Ratios

- Use a contrast checker tool (e.g., axe DevTools, Lighthouse) on every screen
- Minimum 4.5:1 for normal text, 3:1 for large text
- **Pay special attention to:** disabled buttons (often fail contrast), placeholder text, the tone slider labels, safety badge text on colored backgrounds

### 5.4 High Contrast Mode

- Enable Windows High Contrast mode
- Enable macOS "Increase Contrast" in Accessibility settings
- Navigate the entire wizard. Is everything still legible? Do borders and focus indicators survive?

---

## SECTION 6: EDGE CASES & STRESS TESTS

### 6.1 Wizard Resumption

1. Complete steps 1-3 (Node, OpenClaw, API key). Force-kill KloDock.
2. Relaunch. Does it offer to resume from step 4?
3. Now manually delete `~/.openclaw/SOUL.md` (simulating a step that was previously completed but is now broken).
4. Does `verify_all_steps` detect the missing SOUL.md and mark PersonalitySetup as failed?
5. Does the wizard let you re-do that step?

### 6.2 Concurrent Wizard Launches

1. Launch KloDock
2. Launch a second instance of KloDock
3. Both try to write `~/.klodock/setup-state.json` simultaneously
4. Does one crash? Corrupt the file? Handle it gracefully?

### 6.3 Disk Full

1. Fill the disk to capacity (or use a tiny ramdisk)
2. Start the wizard, get to the Node.js download step
3. Download starts but disk fills mid-download
4. Does it show a friendly error ("Not enough disk space") or crash with a raw IO error?

### 6.4 Network Interruption

1. Start the wizard, begin Node.js download
2. Disconnect the network mid-download
3. Does it show a friendly error? Can you retry when the network comes back?
4. Does the partial download get cleaned up, or does it leave a corrupt file in `~/.klodock/tmp/`?

### 6.5 Unicode in Inputs

1. Set agent name to: `"Zer0 Cool 🤖"` (emoji)
2. Set agent name to: `"助手"` (Chinese characters)
3. Set agent name to: `"Test\nInjection"` (newline in name)
4. Set custom instructions to a 10,000-character string
5. Does the SOUL.md generate correctly for each? Does the frontend render them correctly?

### 6.6 Ollama Edge Cases

1. Ollama is installed but NOT running. Does `check_ollama()` return false with a helpful message, or does it timeout/crash?
2. Ollama is running but has ZERO models downloaded. Does `list_ollama_models()` return an empty list? Does the UI tell the user to `ollama pull llama3`?
3. Ollama is running, has models, but the user also enters an OpenAI API key. Which provider takes precedence in `openclaw.json`?

### 6.7 API Key Edge Cases

1. Enter a valid OpenAI key. Click "Test Connection." It passes. Now revoke the key on OpenAI's dashboard. Does the health check (30s interval) detect the invalid key and show a warning?
2. Enter a key with leading/trailing whitespace. Does `store_secret` trim it? Or does the validation fail because of whitespace?
3. Enter a key that's 500 characters of random garbage. Does validation timeout gracefully, or does it hang?

---

## SECTION 7: CONFIGURATION INTEGRITY

### 7.1 SOUL.md Generation

For each role template (GeneralAssistant, ResearchHelper, WritingPartner, ProductivityBot, Custom), generate a SOUL.md and verify:

1. It's valid Markdown
2. It contains the agent name exactly as entered
3. The tone is reflected (formal vs. casual language)
4. Custom instructions appear verbatim
5. The file is written to `~/.openclaw/SOUL.md` (not `~/.klodock/SOUL.md`)
6. File permissions are appropriate

### 7.2 openclaw.json Generation

After completing the wizard with each provider, verify `~/.openclaw/openclaw.json` contains:

| Provider | Expected `model_provider` | Expected `default_model` | Expected `base_url` |
|----------|--------------------------|--------------------------|-------------------|
| OpenAI | `"openai"` | `"gpt-4o"` | null/absent |
| Anthropic | `"anthropic"` | `"claude-sonnet-4-20250514"` | null/absent |
| Gemini | `"gemini"` | `"gemini-pro"` | null/absent |
| Groq | `"groq"` | `"llama-3.3-70b-versatile"` | null/absent |
| OpenRouter | `"openrouter"` | `"anthropic/claude-sonnet-4"` | null/absent |
| Ollama | `"ollama"` | user-selected model name | `"http://localhost:11434"` |

### 7.3 Three Copies of klodock_base_dir()

Files `installer/node.rs`, `installer/uninstall.rs`, and `process/daemon.rs` each define their own `klodock_base_dir()` function that resolves to `~/.klodock/`.

**Test:** What happens if `dirs::home_dir()` returns `None` (theoretically possible on misconfigured systems)? All three will panic with `.expect()`. Is this the correct behavior for a user-facing app, or should it return an error?

---

## SECTION 8: LANDING PAGE & DOCS

### 8.1 Broken or Misleading Claims

Verify each claim on `website/index.html` against reality:

| Claim | Verification |
|-------|-------------|
| "Setup in minutes" | Time the full wizard from launch to running daemon. Is it under 5 minutes with an API key? |
| "672 KB Windows installer" | Check the actual MSI size. Is it still 672KB? Or has it grown? |
| "6 AI Providers" | Count the provider cards in ModelProvider.tsx. Are there exactly 6? |
| "2 Channels" | Count the channels in Channels.tsx. Are there exactly 2 (Telegram, Discord)? Landing page says "Telegram & Discord" |
| "13,700+ ClawHub skills" | Is this number sourced, or made up? Does it match the PRD? |
| "250,000+ GitHub stars" (for OpenClaw) | Verify against OpenClaw's actual GitHub |
| "Ollama integration" | Is it actually functional end-to-end, or just detection? |

### 8.2 Landing Page Accessibility

1. No skip-to-content link
2. Nav disappears on mobile with no hamburger menu
3. Fade-in elements are invisible if JavaScript is disabled
4. Comparison chart uses `role="img"` which hides child content from screen readers
5. Run Lighthouse accessibility audit. Score must be 90+.

---

## SECTION 9: CODE HYGIENE

### 9.1 Dead Code

Verify these are truly unused:

| File | Evidence of Non-Use |
|------|-------------------|
| `src/components/SkillCard.tsx` | Not imported by any file. Skills.tsx uses inline cards. |
| `src/components/ChannelCard.tsx` | Not imported by any file. Channels.tsx uses inline ChannelSection. Also uses different secret key format (`${id}_token` vs `TELEGRAM_BOT_TOKEN`). |
| `src/lib/wizard-state.ts` exports: `formData`, `updateFormData`, `goToStep`, `markComplete` | Not imported by any component. Each wizard screen manages its own state. |
| `WizardFormData` type in `types.ts` | Not used by any component. |

### 9.2 Duplicated Logic

| Pattern | Occurrences |
|---------|------------|
| `klodock_base_dir()` returning `~/.klodock/` | 3 separate implementations in node.rs, uninstall.rs, daemon.rs |
| `dirs::home_dir().expect(...)` | 11 occurrences across the codebase, each with slightly different error messages |
| `friendlyError()` error message converter | Duplicated in Dependencies.tsx and Install.tsx with slightly different error patterns |
| `InstallProgress` struct name | Defined in both `installer/node.rs` and `installer/openclaw.rs` (different fields) |

### 9.3 Spike Binaries in Production

6 spike binaries exist in `src-tauri/src/bin/`:
- `spike_node.rs`, `spike_install.rs`, `spike_keychain.rs`, `spike_kc2.rs`, `spike_dpapi.rs`, `spike_daemon.rs`

These are development artifacts with `.unwrap()` and `.expect()` everywhere. They ship with the crate. Are they excluded from the release build? Does `cargo build --release` compile them? They shouldn't be in the final distribution.

---

## PASS/FAIL CRITERIA

- **SECTION 1 (Known Bugs):** Every bug in 1.1-1.5 must be CONFIRMED or FIXED. No "we'll get to it."
- **SECTION 2 (Security):** Any finding in 2.1-2.6 that allows key exfiltration or injection is a SHIP BLOCKER.
- **SECTION 3 (Installer):** Must work on at least: clean Windows 11, clean macOS 14+, clean Ubuntu 22.04. Edge cases (nvm, proxy) can be documented as known limitations.
- **SECTION 4 (IPC):** All stub commands must return clean errors, not panics. No argument deserialization failures.
- **SECTION 5 (Accessibility):** Lighthouse score >= 90. Full keyboard navigation must work. Screen reader must announce all interactive elements.
- **SECTION 6 (Edge Cases):** No panics. No raw error messages. Every failure shows a plain-English message.
- **SECTION 7 (Config):** Generated files must be valid and match expectations exactly.
- **SECTION 8 (Landing Page):** All claims must be verifiable. Accessibility audit must pass.
- **SECTION 9 (Code Hygiene):** Dead code documented. Spike binaries excluded from release. Duplicated logic tracked.

**Total test cases: 87**
**Estimated execution time: 6-8 hours (one person, all platforms)**
**Required environments: Windows 11, macOS 14+, Ubuntu 22.04, each with clean and pre-existing-Node variants**
