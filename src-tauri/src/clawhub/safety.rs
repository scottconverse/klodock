use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Distribution status of a skill. These are NOT security audits.
/// KloDock does not independently audit any skill for security.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SafetyRating {
    /// Ships with the OpenClaw distribution. Not independently audited.
    Bundled,
    /// Listed on the ClawHub registry. Not audited for security.
    Published,
    /// Not listed in any registry.
    Unlisted,

    // Legacy variants — kept for backward compatibility with existing data.
    // The frontend maps these to the new names via SafetyBadge.tsx.
    #[serde(alias = "Verified")]
    Verified,
    #[serde(alias = "Community")]
    Community,
    #[serde(alias = "Unreviewed")]
    Unreviewed,
}

/// Permissions that can pose a security risk when granted to a skill.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DangerousPermission {
    /// Execute arbitrary shell commands.
    ShellAccess,
    /// Make outbound network requests.
    NetworkAccess,
    /// Read or write environment variables.
    EnvVarAccess,
    /// Read or write arbitrary filesystem paths.
    FileSystemAccess,
}

/// Response payload for [`get_safety_rating`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyReport {
    pub slug: String,
    pub rating: SafetyRating,
    pub dangerous_permissions: Vec<DangerousPermission>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Map well-known permission strings to their [`DangerousPermission`] variant.
const DANGEROUS_PERMISSION_MAP: &[(&str, DangerousPermission)] = &[
    ("shell", DangerousPermission::ShellAccess),
    ("network", DangerousPermission::NetworkAccess),
    ("env", DangerousPermission::EnvVarAccess),
    ("filesystem", DangerousPermission::FileSystemAccess),
];

/// Inspect `skill.required_permissions` and return any that are considered
/// dangerous.
pub fn has_dangerous_permissions(
    skill: &super::registry::SkillMetadata,
) -> Vec<DangerousPermission> {
    let mut found = Vec::new();
    for perm in &skill.required_permissions {
        let lower = perm.to_lowercase();
        for (key, variant) in DANGEROUS_PERMISSION_MAP {
            if lower.contains(key) && !found.contains(variant) {
                found.push(variant.clone());
            }
        }
    }
    found
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Look up the safety rating and dangerous permissions for a given skill slug.
///
/// Queries the ClawHub registry API and cross-references the skill's declared
/// permissions against the known dangerous-permission list.
#[tauri::command]
pub async fn get_safety_rating(slug: String) -> Result<SafetyReport, String> {
    // 1. Fetch full skill metadata from registry.
    let skill = super::registry::get_skill_details(slug.clone())
        .await
        .map_err(|e| format!("Failed to fetch skill details: {e}"))?;

    // 2. Derive dangerous permissions from declared required_permissions.
    let dangerous = has_dangerous_permissions(&skill);

    Ok(SafetyReport {
        slug,
        rating: skill.safety_rating,
        dangerous_permissions: dangerous,
    })
}
