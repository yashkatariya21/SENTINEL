"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ basics */
export function Card({ className = "", children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border border-ink/10 bg-white shadow-card ${className}`} {...rest}>{children}</div>;
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-mute">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({ variant = "secondary", size = "md", loading, className = "", children, ...rest }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary: "bg-navy-700 text-white hover:bg-navy-900 border border-transparent",
    secondary: "bg-white text-ink border border-ink/15 hover:bg-paper",
    ghost: "bg-transparent text-navy-700 border border-transparent hover:bg-navy-50",
    danger: "bg-danger-500 text-white border border-transparent hover:bg-danger-700",
  };
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${small ? "h-3 w-3" : "h-4 w-4"}`}
    />
  );
}

export function Field({ label, hint, children, htmlFor, required }: {
  label: string; hint?: string; children: React.ReactNode; htmlFor?: string; required?: boolean;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label} {required && <span className="text-danger-500" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-mute/70 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/30";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className || ""}`} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-28 ${props.className || ""}`} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className || ""}`} />;
}

/* ------------------------------------------------------- semantic badges */
const SEVERITY = {
  critical: { label: "Critical", dot: "bg-danger-700", chip: "bg-danger-50 text-danger-700 border-danger-500/40", glyph: "■" },
  high: { label: "High", dot: "bg-danger-500", chip: "bg-danger-50 text-danger-700 border-danger-500/30", glyph: "▲" },
  medium: { label: "Medium", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700 border-amber-500/40", glyph: "◆" },
  low: { label: "Low", dot: "bg-navy-500", chip: "bg-navy-50 text-navy-700 border-navy-500/30", glyph: "●" },
} as const;

export function SeverityChip({ severity, compact }: { severity: keyof typeof SEVERITY | string; compact?: boolean }) {
  const s = SEVERITY[(severity as keyof typeof SEVERITY)] ?? SEVERITY.low;
  // severity is communicated by glyph + text, never by colour alone
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${s.chip}`}>
      <span aria-hidden="true" className="text-[10px] leading-none">{s.glyph}</span>
      <span className="sr-only">Severity: </span>
      {compact ? s.label[0] : s.label}
    </span>
  );
}

export function LabelChip({ label }: { label: "confirmed" | "possible" }) {
  return label === "confirmed" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-ok-600/30 bg-ok-50 px-2 py-0.5 text-xs font-medium text-ok-600">
      <span aria-hidden="true">✓</span> Confirmed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-ink-mute/40 bg-paper px-2 py-0.5 text-xs font-medium text-ink-soft">
      <span aria-hidden="true">?</span> Possible
    </span>
  );
}

export function ConfidenceChip({ band, value }: { band: "low" | "medium" | "high"; value: number }) {
  const bars = band === "high" ? 3 : band === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
      <span className="inline-flex items-end gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`w-1 rounded-sm ${i < bars ? "bg-ink-soft" : "bg-ink/15"}`} style={{ height: 5 + i * 3 }} />
        ))}
      </span>
      <span className="capitalize">{band} confidence</span>
      <span className="text-ink-mute">({Math.round(value * 100)}%)</span>
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "border-ink/20 bg-paper text-ink-soft",
    in_review: "border-navy-500/30 bg-navy-50 text-navy-700",
    changes_requested: "border-amber-500/40 bg-amber-100 text-amber-700",
    approved: "border-ok-600/30 bg-ok-50 text-ok-600",
    rejected: "border-danger-500/30 bg-danger-50 text-danger-700",
  };
  const labels: Record<string, string> = {
    draft: "Draft", in_review: "In review", changes_requested: "Changes requested",
    approved: "Approved", rejected: "Rejected",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] || map.draft}`}>
      {labels[status] || status}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "navy" | "amber" }) {
  const tones = {
    neutral: "border-ink/15 bg-paper text-ink-soft",
    navy: "border-navy-500/30 bg-navy-50 text-navy-700",
    amber: "border-amber-500/40 bg-amber-100 text-amber-700",
  };
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

/* --------------------------------------------------------------- overlays */
export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const nodes = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input,textarea,button")?.focus(), 40);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" role="presentation" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 id="modal-title" className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="rounded p-1 text-ink-mute hover:bg-paper focus-visible:ring-2 focus-visible:ring-navy-500">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- toasts */
type Toast = { id: number; message: string; tone: "ok" | "error" | "info" };
const ToastCtx = createContext<{ push: (message: string, tone?: Toast["tone"]) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg border px-3 py-2 text-sm shadow-card ${
              t.tone === "ok" ? "border-ok-600/30 bg-ok-50 text-ok-600"
              : t.tone === "error" ? "border-danger-500/40 bg-danger-50 text-danger-700"
              : "border-ink/15 bg-white text-ink"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink/20 bg-white/60 p-8 text-center">
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-ink-mute">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink/10 ${className}`} />;
}

export function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-ink-mute">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}
