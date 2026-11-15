"use client";
/** The key map, shown on "?" — a sheet, not a modal with a close button hunt. */
import { useEffect } from "react";
import { visibleNav } from "@/lib/nav";
import type { Me } from "@/lib/api";

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid min-w-[22px] place-items-center rounded-[2px] border border-ink/25 bg-white px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft shadow-[0_1px_0_rgba(11,20,55,0.18)]">
      {children}
    </kbd>
  );
}

export function ShortcutsSheet({ open, onClose, me }: { open: boolean; onClose: () => void; me: Me | null }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const pages = visibleNav(me).filter((item) => item.key);

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-navy/45 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-md rounded-t-[3px] border border-gold/45 bg-ivory p-5 shadow-herald sm:rounded-[3px]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Keyboard</p>
            <h2 id="shortcuts-title" className="mt-1 font-display text-lg font-semibold text-navy">
              Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-mute hover:bg-paper focus-visible:ring-2 focus-visible:ring-gold"
            aria-label="Close shortcuts"
          >
            ✕
          </button>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-soft">Command palette</dt>
            <dd className="flex gap-1"><Key>⌘</Key><Key>K</Key><span className="px-1 text-ink-mute">or</span><Key>/</Key></dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-soft">This sheet</dt>
            <dd><Key>?</Key></dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-soft">Skip the opening sequence</dt>
            <dd><Key>esc</Key></dd>
          </div>
        </dl>

        <p className="mt-5 eyebrow">Pages</p>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {pages.map((item) => (
            <li key={item.href} className="flex items-center justify-between gap-2">
              <span className="truncate text-ink-soft">{item.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                <Key>g</Key>
                <Key>{item.key}</Key>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs leading-relaxed text-ink-mute">
          Press <Key>g</Key> then the number, anywhere in the app. Nothing here changes a rule or publishes
          anything — these are doors, not decisions.
        </p>
      </div>
    </div>
  );
}
