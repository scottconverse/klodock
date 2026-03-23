import { useEffect, useState } from "react";
import {
  CheckCircle2, Loader2, Package, ExternalLink,
  AlertCircle, RefreshCw, ArrowUpCircle, RotateCcw,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { checkOpenClaw, checkOpenclawUpdate, updateOpenclaw } from "@/lib/tauri";
import { useToast } from "@/components/Toast";

interface VersionState {
  klodock: string;
  klodockUpdateAvailable: boolean;
  klodockLatest: string | null;
  openclawCurrent: string | null;
  openclawLatest: string | null;
  updateAvailable: boolean;
}

export function DashboardUpdates() {
  const toast = useToast();
  const [versions, setVersions] = useState<VersionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [klodockUpdating, setKlodockUpdating] = useState(false);
  const [klodockUpdateReady, setKlodockUpdateReady] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  async function loadVersions(isRecheck = false) {
    if (isRecheck) setChecking(true); else setLoading(true);
    setUpdateError(null);

    try {
      const [oc, updateInfo, appVersion, klodockUpdate] = await Promise.all([
        checkOpenClaw().catch(() => ({ installed: false, version: null as string | null })),
        checkOpenclawUpdate().catch(() => null),
        getVersion().catch(() => "unknown"),
        check().catch(() => null),
      ]);

      setVersions({
        klodock: appVersion,
        klodockUpdateAvailable: klodockUpdate?.available ?? false,
        klodockLatest: klodockUpdate?.version ?? null,
        openclawCurrent: updateInfo?.current_version ?? oc.version ?? null,
        openclawLatest: updateInfo?.latest_version ?? null,
        updateAvailable: updateInfo?.update_available ?? false,
      });
    } catch {
      const fallbackVersion = await getVersion().catch(() => "unknown");
      setVersions({
        klodock: fallbackVersion,
        klodockUpdateAvailable: false,
        klodockLatest: null,
        openclawCurrent: null,
        openclawLatest: null,
        updateAvailable: false,
      });
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }

  useEffect(() => { loadVersions(); }, []);

  async function handleUpdate() {
    setUpdating(true);
    setUpdateError(null);
    try {
      const version = await updateOpenclaw();
      setUpdateSuccess(true);
      toast.success(`OpenClaw updated to ${version}!`);
      await loadVersions(true);
    } catch (err: any) {
      const msg = err?.toString() ?? "Update failed. Please try again.";
      setUpdateError(msg);
      toast.error("Update failed. See details below.");
    } finally {
      setUpdating(false);
    }
  }

  async function handleKlodockUpdate() {
    setKlodockUpdating(true);
    setUpdateError(null);
    try {
      const update = await check();
      if (update?.available) {
        await update.downloadAndInstall();
        setKlodockUpdateReady(true);
        toast.success("KloDock updated! Restart to apply.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "KloDock update failed.";
      setUpdateError(msg);
      toast.error("KloDock update failed.");
    } finally {
      setKlodockUpdating(false);
    }
  }

  async function handleRelaunch() {
    try {
      await relaunch();
    } catch {
      toast.error("Couldn't restart. Please close and reopen KloDock.");
    }
  }

  async function openLink(url: string) {
    try { await open(url); } catch { window.open(url, "_blank"); }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" aria-hidden="true" />
      </div>
    );
  }

  const isUpToDate = versions && !versions.updateAvailable && versions.openclawCurrent;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Updates</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {isUpToDate
              ? "Everything is up to date."
              : versions?.updateAvailable
                ? "An update is available."
                : "Check if updates are available."
            }
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadVersions(true)}
          disabled={checking}
          className="
            inline-flex items-center gap-1.5 rounded-lg border
            border-neutral-200 px-3 py-1.5 text-xs font-medium
            text-neutral-600 hover:bg-neutral-50 disabled:opacity-50
            focus:ring-2 focus:ring-blue-500 focus:outline-none
          "
        >
          <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} aria-hidden="true" />
          {checking ? "Checking..." : "Check for updates"}
        </button>
      </div>

      <div className="space-y-4">
        {/* KloDock */}
        <div className={`rounded-xl border p-5 shadow-sm ${
          versions?.klodockUpdateAvailable
            ? "border-primary-300 bg-primary-50/30"
            : "border-neutral-200 bg-white"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-primary-500" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">KloDock</h3>
                <p className="text-xs text-neutral-600">Desktop application</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-neutral-700">
                v{versions?.klodock ?? "?"}
              </span>
              {!versions?.klodockUpdateAvailable && !klodockUpdateReady && (
                <CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden="true" />
              )}
              {versions?.klodockUpdateAvailable && !klodockUpdateReady && (
                <ArrowUpCircle className="h-4 w-4 text-primary-500" aria-hidden="true" />
              )}
            </div>
          </div>

          {/* KloDock update available */}
          {versions?.klodockUpdateAvailable && !klodockUpdateReady && (
            <div className="mt-4 flex items-center justify-between rounded-lg bg-primary-100 border border-primary-200 p-3">
              <div>
                <p className="text-sm font-medium text-primary-900">
                  KloDock {versions.klodockLatest} available
                </p>
                <p className="text-xs text-primary-700">
                  You have v{versions.klodock}
                </p>
              </div>
              <button
                type="button"
                onClick={handleKlodockUpdate}
                disabled={klodockUpdating}
                className="
                  inline-flex items-center gap-1.5 rounded-lg bg-primary-600
                  px-4 py-2 text-sm font-medium text-white
                  hover:bg-primary-700 disabled:opacity-50
                  focus:ring-2 focus:ring-blue-500 focus:outline-none
                "
              >
                {klodockUpdating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Downloading...</>
                ) : (
                  <><ArrowUpCircle className="h-4 w-4" aria-hidden="true" /> Update KloDock</>
                )}
              </button>
            </div>
          )}

          {/* KloDock update ready — restart prompt */}
          {klodockUpdateReady && (
            <div className="mt-4 flex items-center justify-between rounded-lg bg-success-100 border border-success-200 p-3">
              <div>
                <p className="text-sm font-medium text-success-900">
                  Update downloaded — restart to apply
                </p>
              </div>
              <button
                type="button"
                onClick={handleRelaunch}
                className="
                  inline-flex items-center gap-1.5 rounded-lg bg-success-600
                  px-4 py-2 text-sm font-medium text-white
                  hover:bg-success-700
                  focus:ring-2 focus:ring-green-500 focus:outline-none
                "
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Restart now
              </button>
            </div>
          )}
        </div>

        {/* OpenClaw */}
        <div className={`rounded-xl border p-5 shadow-sm ${
          versions?.updateAvailable
            ? "border-primary-300 bg-primary-50/30"
            : "border-neutral-200 bg-white"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-neutral-500" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">OpenClaw</h3>
                <p className="text-xs text-neutral-600">AI agent framework</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-neutral-700">
                {versions?.openclawCurrent ?? "Not installed"}
              </span>
              {isUpToDate ? (
                <CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden="true" />
              ) : versions?.updateAvailable ? (
                <ArrowUpCircle className="h-4 w-4 text-primary-500" aria-hidden="true" />
              ) : null}
            </div>
          </div>

          {/* Update available banner */}
          {versions?.updateAvailable && (
            <div className="mt-4 flex items-center justify-between rounded-lg bg-primary-100 border border-primary-200 p-3">
              <div>
                <p className="text-sm font-medium text-primary-900">
                  Update available: {versions.openclawLatest}
                </p>
                <p className="text-xs text-primary-700">
                  You have {versions.openclawCurrent}
                </p>
              </div>
              <button
                type="button"
                onClick={handleUpdate}
                disabled={updating}
                className="
                  inline-flex items-center gap-1.5 rounded-lg bg-primary-600
                  px-4 py-2 text-sm font-medium text-white
                  hover:bg-primary-700 disabled:opacity-50
                  focus:ring-2 focus:ring-blue-500 focus:outline-none
                "
              >
                {updating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Updating...</>
                ) : (
                  <><ArrowUpCircle className="h-4 w-4" aria-hidden="true" /> Update now</>
                )}
              </button>
            </div>
          )}

          {/* Up to date message */}
          {isUpToDate && (
            <div className="mt-3 flex items-center gap-2 text-sm text-success-600">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Up to date
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {updateError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-amber-700">{updateError}</p>
        </div>
      )}

      {/* Success */}
      {updateSuccess && (
        <div className="rounded-lg border border-success-200 bg-success-50 p-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden="true" />
          <p className="text-xs text-success-700">OpenClaw updated successfully!</p>
        </div>
      )}

      {/* Resources */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-neutral-700 mb-2">Resources</h3>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => openLink("https://docs.openclaw.ai")}
            className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 focus:ring-2 focus:ring-blue-500 focus:outline-none rounded"
          >
            OpenClaw Documentation
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => openLink("https://clawhub.ai")}
            className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 focus:ring-2 focus:ring-blue-500 focus:outline-none rounded"
          >
            ClawHub Skill Registry
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
