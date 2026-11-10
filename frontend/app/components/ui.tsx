"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ basics */
export function Card({ className = "", children, ornament, ...rest }:
  React.HTMLAttributes<HTMLDivElement> & { ornament?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-ink/12 bg-white/90 shadow-card backdrop-blur-[2px] ${
        ornament ? "corner-ornament" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionHeading({ title, subtitle, action, className = "" }: {
  title: string; subtitle?: string; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={`mb-4 flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div className="rule-double">
        <h2 className="font-display text-lg font-semibold tracking-tight text-navy">{title}</h2>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{subtitle}</p>}
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
    "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition duration-200 ease-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-navy disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";
  const variants = {
    primary:
      "bg-gradient-gold text-navy border border-gold-deep/60 shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_2px_6px_-2px_rgba(143,116,24,0.6)] hover:brightness-[1.04] hover:-translate-y-px",
    secondary: "bg-white/70 text-navy border border-navy/30 hover:bg-ivory-deep hover:border-navy/50",
    ghost: "bg-transparent text-navy border border-transparent hover:bg-navy/[0.06]",
    danger: "bg-critical text-white border border-critical hover:brightness-110",
  };
  const sizes = { sm: "min-h-[36px] px-3 py-1.5 text-xs", md: "min-h-[44px] px-4 py-2 text-xs" };
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
        {label} {required && <span className="text-critical" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-xs text-ink placeholder:text-ink-mute/70 transition duration-200 ease-royal focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-60";

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
  critical: { label: "Critical", dot: "bg-critical", chip: "bg-critical-tint text-critical border-critical/40", glyph: "■" },
  high: { label: "High", dot: "bg-critical", chip: "bg-critical-tint text-critical border-critical/30", glyph: "▲" },
  medium: { label: "Medium", dot: "bg-possible", chip: "bg-possible-tint text-possible border-possible/40", glyph: "◆" },
  low: { label: "Low", dot: "bg-royal", chip: "bg-info-tint text-info border-info/30", glyph: "●" },
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
    <span className="inline-flex items-center gap-1 rounded-full border border-confirmed/40 bg-confirmed-tint px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-confirmed">
      <span aria-hidden="true">✓</span> Confirmed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-possible/40 bg-possible-tint px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-possible">
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
          <span key={i} className={`w-1.5 rounded-sm ${i < bars ? "bg-gold-deep" : "bg-ink/15"}`} style={{ height: 5 + i * 3 }} />
        ))}
      </span>
      <span className="capitalize">{band} confidence</span>
      <span className="font-mono text-2xs text-ink-mute">({Math.round(value * 100)}%)</span>
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "border-ink/20 bg-ivory-deep text-ink-soft",
    in_review: "border-royal/30 bg-info-tint text-info",
    changes_requested: "border-possible/40 bg-possible-tint text-possible",
    approved: "border-confirmed/40 bg-confirmed-tint text-confirmed",
    rejected: "border-critical/30 bg-critical-tint text-critical",
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
    neutral: "border-ink/15 bg-ivory-deep text-ink-soft",
    navy: "border-royal/30 bg-info-tint text-info",
    amber: "border-gold/50 bg-gold/10 text-gold-deep",
  };
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
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
        className="corner-ornament max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-xl border border-gold/40 bg-ivory p-5 shadow-herald sm:rounded-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 id="modal-title" className="font-display text-base font-semibold text-navy">{title}</h2>
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
              t.tone === "ok" ? "border-confirmed/40 bg-confirmed-tint text-confirmed"
              : t.tone === "error" ? "border-critical/40 bg-critical-tint text-critical"
              : "border-gold/40 bg-ivory text-ink"}`}
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
    <div className="relative isolate overflow-hidden rounded-xl border border-dashed border-gold/50 bg-ivory/70 p-8 text-center">
      <svg className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-gold" aria-hidden focusable="false" opacity={0.08}>
        <defs>
          <pattern id="snt-empty-damask" width="64" height="64" patternUnits="userSpaceOnUse">
            <path d="M32 8c6 8 14 10 14 20s-9 14-14 20c-5-6-14-10-14-20S26 16 32 8z" fill="currentColor" opacity="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#snt-empty-damask)" />
      </svg>
      <p className="font-display text-base font-semibold text-navy">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-soft">{body}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gradient-to-r from-ink/[0.06] via-ink/[0.11] to-ink/[0.06] ${className}`}
      aria-hidden
    />
  );
}

export function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-mute">{label}</dt>
      <dd className="text-xs text-ink">{children}</dd>
    </div>
  );
}
