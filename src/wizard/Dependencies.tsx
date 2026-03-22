import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { friendlyError } from "@/lib/friendly-error";
import {
  checkNode,
  installNode,
  completeStep,
  onInstallProgress,
} from "@/lib/tauri";
import type { InstallProgress } from "@/lib/types";

type Phase =
  | "checking"
  | "found_outdated"
  | "installing"
  | "success"
  | "error";

export function Dependencies() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<InstallProgress>({
    phase: "",
    percent: 0,
    message: "",
  });
  const [foundVersion, setFoundVersion] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  async function run() {
    setPhase("checking");
    setErrorMsg(null);
    setProgress({ phase: "", percent: 0, message: "" });
    setFoundVersion(null);

    try {
      const status = await checkNode();

      // Only skip install if KloDock's own managed copy exists and meets requirements.
      // We never rely on the user's system Node — KloDock controls its own stack.
      if (status.meets_requirement && status.managed_by === "klodock") {
        setPhase("success");
        await completeStep("node_install");
        setTimeout(() => navigate("/wizard/install"), 1500);
        return;
      }

      // Node exists on system but KloDock-managed copy is missing or outdated
      if (status.version && status.managed_by !== "klodock") {
        setFoundVersion(status.version);
        // Don't show "outdated" message — just silently install managed copy
      } else if (status.version) {
        setFoundVersion(status.version);
        setPhase("found_outdated");
        // Brief pause so user can read the message
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Subscribe to progress events before starting install
      unlistenRef.current = await onInstallProgress((p) => {
        setProgress(p);
      });

      setPhase("installing");
      await installNode();

      // Clean up listener
      unlistenRef.current?.();
      unlistenRef.current = null;

      setPhase("success");
      await completeStep("node_install");
      setTimeout(() => navigate("/wizard/install"), 1500);
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

  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="text-2xl font-bold text-neutral-900">
        Checking Prerequisites
      </h2>
      <p className="mt-2 text-neutral-600">
        We need a small runtime to power your AI agent behind the scenes.
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
              Looking for prerequisites on your system...
            </p>
          </>
        )}

        {/* ── Outdated version message ─────────────────── */}
        {phase === "found_outdated" && (
          <>
            <Loader2
              className="h-10 w-10 animate-spin motion-reduce:animate-none text-primary-500"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-neutral-600" role="status">
              Found version {foundVersion}, but KloDock needs a newer version.
              Installing the latest alongside your current one...
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
              {progress.message || "Installing prerequisites..."}
            </p>
            <div className="w-full">
              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-200"
                role="progressbar"
                aria-label="Installation progress"
                aria-valuenow={Math.round(progress.percent)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary-500 transition-all duration-300 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.max(progress.percent, 2)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-neutral-600">
                {Math.round(progress.percent)}% complete
              </p>
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
              All prerequisites are ready!
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
              aria-label="Try installing prerequisites again"
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
// Error conversion is shared across wizard steps — see lib/friendly-error.ts
