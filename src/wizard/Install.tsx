import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import {
  checkOpenClaw,
  installOpenClaw,
  completeStep,
  onOpenclawInstallProgress,
} from "@/lib/tauri";
import type { OpenClawInstallProgress } from "@/lib/types";

type Phase = "checking" | "installing" | "success" | "error";

export function Install() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<OpenClawInstallProgress>({
    message: "",
    fraction: null,
  });
  const unlistenRef = useRef<(() => void) | null>(null);

  async function run() {
    setPhase("checking");
    setErrorMsg(null);
    setProgress({ message: "", fraction: null });

    try {
      // Check if already installed
      const status = await checkOpenClaw();
      if (status.version) {
        setPhase("success");
        await completeStep("open_claw_install");
        setTimeout(() => navigate("/wizard/model-provider"), 1500);
        return;
      }

      // Subscribe to progress events before starting install
      unlistenRef.current = await onOpenclawInstallProgress((p) => {
        setProgress(p);
      });

      setPhase("installing");
      await installOpenClaw();

      // Clean up listener
      unlistenRef.current?.();
      unlistenRef.current = null;

      setPhase("success");
      await completeStep("open_claw_install");
      setTimeout(() => navigate("/wizard/model-provider"), 1500);
    } catch (err) {
      // Clean up listener on error
      unlistenRef.current?.();
      unlistenRef.current = null;

      setPhase("error");
      setErrorMsg(friendlyError(err));
    }
  }

  useEffect(() => {
    run();

    return () => {
      unlistenRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const percent = progress.fraction != null ? progress.fraction * 100 : null;

  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="text-2xl font-bold text-neutral-900">
        Installing Your AI Framework
      </h2>
      <p className="mt-2 text-neutral-600">
        Setting up the engine that powers your AI agent.
      </p>

      <div
        className="mt-10 flex w-full max-w-md flex-col items-center gap-4"
        aria-live="polite"
      >
        {/* ── Checking ──────────────────────────────────── */}
        {phase === "checking" && (
          <>
            <Loader2
              className="h-10 w-10 animate-spin motion-reduce:animate-none text-primary-500"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-neutral-600" role="status">
              Checking for existing installation...
            </p>
          </>
        )}

        {/* ── Installing ───────────────────────────────── */}
        {phase === "installing" && (
          <>
            <Loader2
              className="h-10 w-10 animate-spin motion-reduce:animate-none text-primary-500"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-neutral-600" role="status">
              {progress.message || "Installing your AI agent framework..."}
            </p>
            <div className="w-full">
              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-200"
                role="progressbar"
                aria-label="Installation progress"
                aria-valuenow={percent != null ? Math.round(percent) : undefined}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                {percent != null ? (
                  <div
                    className="h-full rounded-full bg-primary-500 transition-all duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${Math.max(percent, 2)}%` }}
                  />
                ) : (
                  <div className="h-full w-2/3 animate-pulse motion-reduce:animate-none rounded-full bg-primary-500" />
                )}
              </div>
              {percent != null && (
                <p className="mt-1.5 text-xs text-neutral-600">
                  {Math.round(percent)}% complete
                </p>
              )}
            </div>
            <p className="text-xs text-neutral-600">
              This usually takes about a minute.
            </p>
          </>
        )}

        {/* ── Success ──────────────────────────────────── */}
        {phase === "success" && (
          <>
            <CheckCircle2
              className="h-10 w-10 text-success-500"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-success-700" role="status">
              AI framework installed successfully!
            </p>
          </>
        )}

        {/* ── Error ────────────────────────────────────── */}
        {phase === "error" && (
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-error-200 bg-error-50 p-6">
            <AlertCircle
              className="h-10 w-10 text-error-500"
              aria-hidden="true"
            />
            <p className="text-sm text-error-700" role="alert">
              {errorMsg}
            </p>
            <button
              type="button"
              onClick={run}
              className="
                inline-flex items-center gap-1.5 rounded-lg bg-error-600
                px-4 py-2 text-sm font-medium text-white
                transition-colors hover:bg-error-700
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-error-500
              "
              aria-label="Try installing again"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Convert raw errors into plain-English messages. */
function friendlyError(err: unknown): string {
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

  return "Installation failed. Please check your internet connection and try again. If the problem continues, contact support.";
}
