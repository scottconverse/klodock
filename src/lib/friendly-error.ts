/**
 * Convert a raw error into a plain-English message for non-technical users.
 * Shared by wizard screens that run installation steps.
 */
export function friendlyError(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";

  if (raw.includes("network") || raw.includes("fetch") || raw.includes("DNS")) {
    return "Could not download the required files. Please check your internet connection and try again.";
  }
  if (raw.includes("permission") || raw.includes("EACCES")) {
    return "The installer did not have the right permissions. Please close other programs and try again, or contact support.";
  }
  if (raw.includes("disk") || raw.includes("ENOSPC")) {
    return "There is not enough disk space to complete the installation. Please free up some space and try again.";
  }
  if (raw.includes("node") || raw.includes("Node")) {
    return "The prerequisite setup may not have finished correctly. Try going back and running that step again.";
  }

  return "Something went wrong during installation. Please try again, and if the problem continues, contact support.";
}
