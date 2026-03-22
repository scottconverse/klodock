# Node.js Installer Spike Results

**Date:** March 21, 2026
**Platform tested:** Windows 11 Pro (10.0.26200)
**Verdict:** GO — silent install works on Windows without elevation

## What was tested

### Phase 1: Detection (`check_node`)
- **KloDock™-managed node** (`~/.klodock/node/node.exe`): Correctly detected when present, version parsed, `managed_by: "klodock"` returned.
- **System PATH node**: Correctly detected via `which` crate. Version manager detection works for `$NVM_DIR` and `$VOLTA_HOME` env vars.
- **No node**: Returns `NodeStatus { version: None, meets_requirement: false, managed_by: None }`.
- **Edge case — Node exists but below v22**: Correctly detects and reports `meets_requirement: false`. KloDock installs its own v22 alongside without touching the system node.

### Phase 2: Silent Install (`install_node`)
- **Download**: zip from `nodejs.org/dist/v24.14.0/node-v24.14.0-win-x64.zip`. Streaming download with progress events works.
- **Checksum**: SHA256 verified against official `SHASUMS256.txt`. Mismatch correctly rejected.
- **Extraction**: PowerShell `Expand-Archive` works without elevation. No admin prompt, no console window (CREATE_NO_WINDOW).
- **Install location**: `~/.klodock/node/` — user-writable, no `Program Files` needed.
- **Post-install verification**: `node --version` returns `24.14.0`.
- **No elevation required**: Entire flow runs as the current user.
- **Time**: ~15 seconds on broadband (download dominates).

## Platform assessment

| Platform | Silent install | Elevation needed | Approach | Status |
|----------|---------------|------------------|----------|--------|
| **Windows** | Yes | No | Download .zip, PowerShell Expand-Archive to `~/.klodock/node/` | **PROVEN** |
| **macOS** | Yes (expected) | No | Download .tar.gz, `tar xzf` to `~/.klodock/node/` | Code written, needs CI test |
| **Linux** | Yes (expected) | No | Same as macOS — `tar xzf` to `~/.klodock/node/` | Code written, needs CI test |

## Decision

**Best case achieved on Windows.** The "acceptable" and "worst case" fallbacks from the PRD are not needed for Windows. macOS and Linux should be simpler (tar extraction is more straightforward than zip + PowerShell). Will verify in CI.

## Remaining work for installer engine

1. Test macOS (Intel + Apple Silicon) and Linux (Ubuntu 22.04) in CI — Week 3.
2. Proxy support: respect `HTTP_PROXY`/`HTTPS_PROXY` env vars in reqwest. Not tested yet.
3. Antivirus edge case: if Windows Defender blocks the download or extraction, the error handling returns a plain-English message. Not tested with aggressive third-party AV.
4. Existing nvm interaction: verified that KloDock installs to its own directory and does not disturb nvm. The `detect_version_manager()` function correctly identifies nvm-managed installs.

## Files

- `src-tauri/src/installer/node.rs` — Full implementation (not stubs)
- `src-tauri/src/bin/spike_node.rs` — Detection test binary
- `src-tauri/src/bin/spike_install.rs` — Full install test binary
