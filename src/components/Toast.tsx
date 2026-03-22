import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

/* ── Types ──────────────────────────────────────────────── */

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

/* ── Context ────────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    // Auto-dismiss after 5s (errors stay longer)
    const duration = type === "error" ? 8000 : 5000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    toast: addToast,
    success: (msg) => addToast("success", msg),
    error: (msg) => addToast("error", msg),
    warning: (msg) => addToast("warning", msg),
    info: (msg) => addToast("info", msg),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container — fixed bottom-right */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

/* ── Toast item ─────────────────────────────────────────── */

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; text: string; icon: typeof CheckCircle2 }> = {
  success: { bg: "bg-success-50", border: "border-success-200", text: "text-success-800", icon: CheckCircle2 },
  error:   { bg: "bg-error-50",   border: "border-error-200",   text: "text-error-800",   icon: XCircle },
  warning: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-800",   icon: AlertTriangle },
  info:    { bg: "bg-primary-50", border: "border-primary-200", text: "text-primary-800", icon: Info },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const style = TOAST_STYLES[toast.type];
  const Icon = style.icon;

  return (
    <div
      className={`
        flex items-start gap-2.5 rounded-lg border ${style.border} ${style.bg}
        p-3 shadow-lg animate-in slide-in-from-right
      `}
      role="alert"
    >
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${style.text}`} />
      <p className={`text-sm ${style.text} flex-1`}>{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 text-neutral-400 hover:text-neutral-600"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
