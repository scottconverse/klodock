use std::path::PathBuf;

/// Returns `~/.klodock/` — KloDock's own config/state directory.
///
/// Returns `Err` instead of panicking if the home directory can't be resolved.
pub fn klodock_base_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".klodock"))
        .ok_or_else(|| "Cannot determine home directory".to_string())
}

/// Returns `~/.openclaw/` — OpenClaw's config directory.
pub fn openclaw_base_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".openclaw"))
        .ok_or_else(|| "Cannot determine home directory".to_string())
}
