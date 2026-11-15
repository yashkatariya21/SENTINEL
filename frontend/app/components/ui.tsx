"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/* ==========================================================================
   The shared primitives, cut for the Proof desk.

   House rules kept in every export below:
   · surfaces are sheets — a 1.5px hairline, square-ish 10px corners, no blur,
     no soft drop shadow; depth comes from the rule and from one offset sheet.
   · the interface is Inter + IBM Plex Mono. The serif is reserved for the draft.
   · every state carries a word or a glyph, never colour alone.
   · nothing animates past 420ms and everything is killed by reduced-motion
     (globals.css does the killing once, globally).
   Public props are unchanged from the chancery build — pages did not move.
   ========================================================================== */

/* ------------------------------------------------------------------ basics */
export function Card({ className = "", children, ornament, ...rest }:
  React.HTMLAttributes<HTMLDivElement> & { ornament?: boolean }) {
  return (
    <div
      className={`group/sheet relative rounded-[10px] border border-[color:var(--hairline)] bg-[color:var(--paper)] transition-colors duration-200 hover:border-[color:var(--hairline-strong)] ${
        ornament ? "desk-sheet" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionHeading({ title, subtitle, action, className = "", as = "h2" }: {
  title: string; subtitle?: string; action?: React.ReactNode; className?: string;
  /** "h1" when this heading is the page's own title — a document needs one h1. */
  as?: "h1" | "h2";
}) {
  const Heading = as;
  return (
    <div className={`mb-5 flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <Heading className={`font-semibold tracking-tight text-[color:var(--ink)] ${as === "h1" ? "text-[1.9rem] leading-tight tracking-[-0.03em] sm:text-[2.1rem]" : "text-lg"}`}>{title}</Heading>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[color:var(--ink-2)]">{subtitle}</p>}
        {/* the red pen rule draws itself in, once, on mount */}
        <span aria-hidden="true" className="mt-2.5 block h-[2px] w-10 origin-left bg-[color:var(--mark)] animate-[rule-draw_620ms_cubic-bezier(0.16,1,0.3,1)_both]" />
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

/**
 * Button — a solid plate of ink that the highlighter wipes across on hover.
 * The wipe is a pseudo-element behind the label, so the label keeps its contrast
 * at every point of the animation (ink on paper → ink on highlighter: 14.3:1).
 */
export function Button({ variant = "secondary", size = "md", loading, className = "", children, ...rest }: ButtonProps) {
  const base =
    "group relative isolate inline-flex items-center justify-center gap-2 overflow-hidden rounded-[6px] font-semibold tracking-tight " +
    "transition-[transform,background-color,border-color,color] duration-150 ease-out " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--canvas)] " +
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-45";
  const wipe =
    "before:absolute before:inset-0 before:-z-10 before:origin-left before:scale-x-0 before:bg-[color:var(--highlight)] before:transition-transform before:duration-200 before:ease-out hover:before:scale-x-100 focus-visible:before:scale-x-100";
  const variants = {
    primary:
      "border border-[color:var(--ink)] bg-[color:var(--ink)] text-[color:var(--paper)]",
    secondary: `border border-[color:var(--hairline-strong)] bg-transparent text-[color:var(--ink)] hover:text-[#111318] ${wipe}`,
    ghost: `border border-transparent bg-transparent text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:bg-[color:var(--highlight-tint)]`,
    danger:
      "border border-[color:var(--mark)] bg-[color:var(--mark)] text-[color:var(--paper)] hover:brightness-105",
  };
  const sizes = { sm: "min-h-[36px] px-3 py-1.5 text-xs", md: "min-h-[44px] px-4 py-2 text-xs" };
  const label = typeof children === "string" ? <RollText>{children}</RollText> : children;
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {loading && <Spinner small />}
      {label}
    </button>
  );
}

/** Label that rolls up and is replaced by itself from below on hover. */
export function RollText({ children }: { children: React.ReactNode }) {
  return (
    /* both copies sit inside one clipped box; the inner track moves up by exactly one
       line so the duplicate takes the first copy's place. Decorative: the button's own
       text stays the accessible name, so this subtree is hidden from screen readers. */
    <span className="roll h-[1.15em] leading-[1.15]">
      <span className="block transition-transform duration-150 ease-out group-hover:-translate-y-[1.15em] group-focus-visible:-translate-y-[1.15em]">
        <span className="block">{children}</span>
        <span className="block" aria-hidden="true">{children}</span>
      </span>
    </span>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  /* a nib going round, not a browser spinner: a square that unfolds */
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-[2px] border-[1.5px] border-current border-r-transparent ${
        small ? "h-3 w-3" : "h-4 w-4"}`}
      style={{ animationTimingFunction: "cubic-bezier(0.5,0,0.5,1)" }}
    />
  );
}

export function Field({ label, hint, children, htmlFor, required }: {
  label: string; hint?: string; children: React.ReactNode; htmlFor?: string; required?: boolean;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-2)]">
        {label} {required && <span className="text-[color:var(--mark-text)]" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-[color:var(--ink-3)]">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-[6px] border border-[color:var(--hairline-strong)] bg-[color:var(--paper)] px-3 py-2 text-xs text-[color:var(--ink)] " +
  "placeholder:text-[color:var(--ink-3)] transition-colors duration-150 " +
  "hover:border-[color:var(--ink)] focus:border-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] " +
  "disabled:opacity-55";

/**
 * FloatField — the label lifts into a mono eyebrow when the control is focused or
 * filled, and an ink rule draws in beneath it. Errors slide in from the left with a
 * glyph. Wraps any single input/textarea/select child (the child keeps its own
 * id/name/autocomplete).
 */
export function FloatField({ label, hint, error, htmlFor, required, children }: {
  label: string; hint?: string; error?: string; htmlFor?: string; required?: boolean;
  children: React.ReactNode;
}) {
  const [filled, setFilled] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = wrapRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
    if (!node) return;
    const update = () => setFilled(Boolean(node.value));
    update();
    node.addEventListener("input", update);
    node.addEventListener("change", update);
    node.addEventListener("focus", () => setFocused(true));
    node.addEventListener("blur", () => setFocused(false));
    return () => {
      node.removeEventListener("input", update);
      node.removeEventListener("change", update);
    };
  }, []);

  const lifted = filled || focused;

  return (
    <div className="group/field relative mb-3">
      <div ref={wrapRef} className="relative pt-4">
        <label
          htmlFor={htmlFor}
          className={`pointer-events-none absolute left-0 origin-left font-mono uppercase transition-[transform,color,letter-spacing] duration-200 ease-out ${
            lifted
              ? "-translate-y-4 scale-[0.92] tracking-[0.16em] text-[color:var(--ink-2)]"
              : "translate-y-0 scale-100 tracking-[0.06em] text-[color:var(--ink-3)]"
          }`}
        >
          {label}
          {required && <span className="ml-1 text-[color:var(--mark-text)]" aria-hidden="true">*</span>}
        </label>
        <div className="[&_input]:border-x-0 [&_input]:border-t-0 [&_input]:rounded-none [&_input]:bg-transparent [&_input]:px-0
                        [&_select]:border-x-0 [&_select]:border-t-0 [&_select]:rounded-none [&_select]:bg-transparent [&_select]:px-0
                        [&_textarea]:border-x-0 [&_textarea]:border-t-0 [&_textarea]:rounded-none [&_textarea]:bg-transparent [&_textarea]:px-0">
          {children}
        </div>
        {/* the rule under the field: hairline at rest, ink when focused */}
        <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-[2px] w-full origin-left">
          <span className="absolute inset-0 bg-[color:var(--hairline)]" />
          <span className="absolute inset-0 origin-left scale-x-0 bg-[color:var(--ink)] transition-transform duration-200 ease-out group-focus-within/field:scale-x-100" />
        </span>
        {error ? (
          <p className="mt-1.5 flex animate-[slide-in-left_200ms_ease-out_both] items-center gap-1.5 text-xs text-[color:var(--mark-text)]">
            <Icon name="alert" size={13} /> {error}
          </p>
        ) : hint ? (
          <p className="mt-1.5 text-xs text-[color:var(--ink-3)]">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className || ""}`} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-28 ${props.className || ""}`} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className || ""}`} />;
}

/* ------------------------------------------------------- semantic badges
   Severity is a printer's mark: a filled square (critical), a triangle (high),
   a diamond (medium), a circle (low). Shape first, then the word.            */
const SEVERITY = {
  critical: { label: "Critical", shape: "square", tone: "critical" },
  high: { label: "High", shape: "triangle", tone: "critical" },
  medium: { label: "Medium", shape: "diamond", tone: "possible" },
  low: { label: "Low", shape: "circle", tone: "info" },
} as const;

function SeverityShape({ shape, tone }: { shape: string; tone: string }) {
  const color = tone === "critical" ? "var(--mark)" : tone === "possible" ? "var(--warn)" : "var(--ink-3)";
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className="shrink-0">
      {shape === "square" && <rect width="8" height="8" rx="0.5" fill={color} />}
      {shape === "triangle" && <path d="M4 0.6 7.6 7.4H0.4Z" fill={color} />}
      {shape === "diamond" && <path d="M4 0.4 7.6 4 4 7.6 0.4 4Z" fill={color} />}
      {shape === "circle" && <circle cx="4" cy="4" r="3.6" fill={color} />}
    </svg>
  );
}

export function SeverityChip({ severity, compact }: { severity: keyof typeof SEVERITY | string; compact?: boolean }) {
  const s = SEVERITY[(severity as keyof typeof SEVERITY)] ?? SEVERITY.low;
  const tones: Record<string, string> = {
    critical: "border-[color:var(--mark)] text-[color:var(--mark-text)]",
    possible: "border-[color:var(--warn)] text-[color:var(--warn)]",
    info: "border-[color:var(--ink-3)] text-[color:var(--ink-2)]",
  };
  // severity is communicated by shape + text, never by colour alone
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 font-mono text-2xs uppercase tracking-[0.1em] ${tones[s.tone]}`}>
      <SeverityShape shape={s.shape} tone={s.tone} />
      <span className="sr-only">Severity: </span>
      {compact ? s.label[0] : s.label}
    </span>
  );
}

export function LabelChip({ label }: { label: "confirmed" | "possible" }) {
  return label === "confirmed" ? (
    <span className="inline-flex items-center gap-1 rounded-[3px] border border-[color:var(--pass)] px-2 py-0.5 font-mono text-2xs uppercase tracking-[0.1em] text-[color:var(--pass)]">
      <Icon name="check" size={11} /> Confirmed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-[3px] border border-[color:var(--warn)] px-2 py-0.5 font-mono text-2xs uppercase tracking-[0.1em] text-[color:var(--warn)]">
      <span aria-hidden="true" className="font-semibold">?</span> Possible
    </span>
  );
}

export function ConfidenceChip({ band, value }: { band: "low" | "medium" | "high"; value: number }) {
  const bars = band === "high" ? 3 : band === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--ink-2)]">
      <span className="inline-flex items-end gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-1.5 rounded-[1px] ${i < bars ? "bg-[color:var(--ink)]" : "bg-[color:var(--hairline)]"}`}
            style={{ height: 5 + i * 3 }}
          />
        ))}
      </span>
      <span className="capitalize">{band} confidence</span>
      <span className="font-mono text-2xs text-[color:var(--ink-3)]">({Math.round(value * 100)}%)</span>
    </span>
  );
}

/**
 * StatusPill — a small stamp rather than a rounded badge: mono, tracked, square.
 * The dot before the word is the only colour, and the word carries the meaning.
 */
export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, { cls: string; dot: string }> = {
    draft: { cls: "border-[color:var(--hairline)] text-[color:var(--ink-2)]", dot: "dot-ink3" },
    in_review: { cls: "border-[color:var(--ink)] text-[color:var(--ink)]", dot: "dot-ink" },
    changes_requested: { cls: "border-[color:var(--warn)] text-[color:var(--warn)]", dot: "dot-warn" },
    approved: { cls: "border-[color:var(--pass)] text-[color:var(--pass)]", dot: "dot-pass" },
    rejected: { cls: "border-[color:var(--mark)] text-[color:var(--mark-text)]", dot: "dot-mark" },
  };
  const labels: Record<string, string> = {
    draft: "Draft", in_review: "In review", changes_requested: "Changes requested",
    approved: "Approved", rejected: "Rejected",
  };
  const s = tone[status] || tone.draft;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[3px] border bg-[color:var(--paper)] px-2 py-0.5 font-mono text-2xs uppercase tracking-[0.12em] ${s.cls}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      {labels[status] || status}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "navy" | "amber" }) {
  const tones = {
    neutral: "border-[color:var(--hairline)] text-[color:var(--ink-3)]",
    navy: "border-[color:var(--ink)] text-[color:var(--ink)]",
    amber: "border-[color:var(--warn)] text-[color:var(--warn)]",
  };
  return (
    <span className={`inline-flex items-center rounded-[3px] border px-1.5 py-0.5 font-mono text-2xs uppercase tracking-[0.12em] ${tones[tone]}`}>
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#111318]/45 p-0 backdrop-blur-[1px] sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="desk-sheet max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-[14px] border-[1.5px] border-[color:var(--hairline-strong)] bg-[color:var(--paper)] p-5 animate-[modal-rise_260ms_cubic-bezier(0.16,1,0.3,1)_both] sm:rounded-[12px]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-[color:var(--hairline)] pb-3">
          <h2 id="modal-title" className="text-base font-semibold tracking-tight text-[color:var(--ink)]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-[4px] p-1 text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--highlight-tint)] hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- toasts
   Toasts land as a torn slip of paper in the desk's bottom-right corner: the
   left edge is a 3px ink bar, the glyph is drawn, and a hairline timer drains. */
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
      <div aria-live="polite" className="pointer-events-none fixed bottom-12 right-4 z-[60] flex w-[22rem] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto relative overflow-hidden rounded-[6px] border bg-[color:var(--paper)] pl-3 pr-3 py-2.5 text-sm text-[color:var(--ink)] animate-[toast-in_260ms_cubic-bezier(0.16,1,0.3,1)_both] ${
              t.tone === "ok" ? "border-[color:var(--pass)]"
              : t.tone === "error" ? "border-[color:var(--mark)]"
              : "border-[color:var(--hairline-strong)]"}`}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 left-0 w-[3px] ${
                t.tone === "ok" ? "bg-[color:var(--pass)]"
                : t.tone === "error" ? "bg-[color:var(--mark)]"
                : "bg-[color:var(--ink)]"}`}
            />
            <span className="flex items-start gap-2">
              <span aria-hidden="true" className={`mt-0.5 shrink-0 ${
                t.tone === "ok" ? "text-[color:var(--pass)]"
                : t.tone === "error" ? "text-[color:var(--mark-text)]"
                : "text-[color:var(--ink-2)]"}`}>
                {t.tone === "ok" ? <Icon name="check" size={15} />
                  : t.tone === "error" ? <Icon name="alert" size={15} />
                  : <Icon name="mark" size={15} />}
              </span>
              <span className="min-w-0 leading-snug">{t.message}</span>
            </span>
            {/* hairline timer: how long the slip has left */}
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-0 h-[1.5px] w-full origin-left bg-current opacity-25 animate-[toast-timer_5s_linear_forwards]"
            />
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/**
 * EmptyState — a blank proof sheet: a ruled page with nothing written on it and
 * the mascot's pencil resting at the top. Deliberately quiet; the action carries
 * the invitation.
 */
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden rounded-[10px] border border-dashed border-[color:var(--hairline-strong)] bg-[color:var(--paper-2)] p-8 text-center">
      <svg className="pointer-events-none absolute inset-0 -z-10 h-full w-full" aria-hidden focusable="false">
        <defs>
          <pattern id="snt-empty-rules" width="100%" height="22" patternUnits="userSpaceOnUse">
            <line x1="0" y1="21.5" x2="100%" y2="21.5" stroke="var(--hairline)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#snt-empty-rules)" opacity="0.75" />
      </svg>
      <span aria-hidden="true" className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-[6px] border border-[color:var(--hairline-strong)] bg-[color:var(--paper)] text-[color:var(--ink-2)]">
        <Icon name="pen" size={17} />
      </span>
      <p className="text-base font-semibold tracking-tight text-[color:var(--ink)]">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[color:var(--ink-2)]">{body}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  /* a single ink hairline sweeps across the block — no grey pulsing boxes */
  return <div className={`skeleton-gold rounded-[2px] ${className}`} aria-hidden />;
}

export function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">{label}</dt>
      <dd className="font-mono text-xs text-[color:var(--ink)]">{children}</dd>
    </div>
  );
}
