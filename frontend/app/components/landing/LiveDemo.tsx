"use client";
/**
 * The demo that never needs a server.
 *
 * A fixed draft runs through the four findings it actually produces. Hold a finding (or
 * hold Space / Enter with the keyboard) to preview the suggested rewrite; release and it's
 * gone. There is no "apply" control on this page, and the copy says so — the point being
 * demonstrated is that Sentinel proposes and a person decides.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_DRAFT, DEMO_FINDINGS, DEMO_PASSES, type DemoFinding } from "@/lib/landing";
import { playSound } from "@/lib/sound";
import { usePrefs } from "@/lib/prefs";

const SEVERITY_ORDER = ["critical", "major", "moderate", "minor"] as const;

const SEVERITY_LABEL: Record<DemoFinding["severity"], string> = {
  critical: "Critical",
  major: "Major",
  moderate: "Moderate",
  minor: "Minor",
};

const SEVERITY_TONE: Record<DemoFinding["severity"], string> = {
  critical: "border-critical bg-critical-tint text-critical",
  major: "border-possible bg-possible-tint text-possible",
  moderate: "border-info bg-info-tint text-info",
  minor: "border-ink/30 bg-ivory-deep text-ink-soft",
};

/** Highlight the quoted span inside the draft without dangerouslySetInnerHTML. */
function DraftText({ quote }: { quote: string | null }) {
  if (!quote) return <>{DEMO_DRAFT}</>;
  const at = DEMO_DRAFT.indexOf(quote);
  if (at < 0) return <>{DEMO_DRAFT}</>;
  return (
    <>
      {DEMO_DRAFT.slice(0, at)}
      <mark className="relative bg-gold-tint/80 px-0.5 text-inherit decoration-[color:var(--mark)] decoration-2 underline-offset-4">
        {quote}
      </mark>
      {DEMO_DRAFT.slice(at + quote.length)}
    </>
  );
}

export function LiveDemo() {
  const [selected, setSelected] = useState<string>(DEMO_FINDINGS[0].id);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const { theme } = usePrefs();

  const finding = DEMO_FINDINGS.find((f) => f.id === selected) ?? DEMO_FINDINGS[0];
  const shown = previewing === finding.id || pinned;

  const start = useCallback((id: string) => {
    setPreviewing(id);
    playSound("key");
  }, []);
  const stop = useCallback(() => setPreviewing(null), []);

  // A pointer released anywhere (or a drag off the button) must end the preview.
  useEffect(() => {
    const end = () => stop();
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
    };
  }, [stop]);

  useEffect(() => {
    if (pinned) playSound("chime");
  }, [pinned]);

  useEffect(() => {
    // the hold timer belongs to this component; clear it on the way out
    const timers = holdTimer;
    return () => {
      if (timers.current) window.clearTimeout(timers.current);
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-[3px] border border-[color:var(--hairline)] bg-ivory shadow-herald">
      {/* window bar */}
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--hairline)] bg-ivory-deep/70 px-4 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">
          Review report · draft
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-2)]">
          {DEMO_FINDINGS.length} findings · 6 reviewers
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ---------------------------------------------------------- the draft */}
        <div className="relative border-b border-[color:var(--hairline)] p-5 lg:border-b-0 lg:border-r">
          <p className="eyebrow">The submission</p>
          <p className="mt-2 font-display text-[19px] leading-[1.55] text-ink">
            <DraftText quote={finding.quote} />
          </p>

          <div
            aria-hidden="true"
            className="mt-5 h-[1px] w-full bg-gradient-to-r from-gold/60 via-gold/20 to-transparent"
          />

          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">Content type</dt>
              <dd className="mt-0.5 text-ink">Social post</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">Department</dt>
              <dd className="mt-0.5 text-ink">Marketing</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">Engine</dt>
              <dd className="mt-0.5 text-ink">local deterministic engine</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">Decision</dt>
              <dd className="mt-0.5 text-ink">a person’s — always</dd>
            </div>
          </dl>

          <p className="mt-5 rounded-[2px] border border-[color:var(--hairline)] bg-parchment/50 p-2.5 text-2xs leading-relaxed text-ink-soft">
            This sample is fixed. It runs entirely in your browser, so it works with the server asleep —
            and it cannot touch a real submission.
          </p>

          {/* the six passes, including the two that found nothing */}
          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">
              Six passes over this draft
            </p>
            <ul className="mt-2 grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
              {DEMO_PASSES.map((pass) => (
                <li key={pass.reviewer} className="flex items-baseline justify-between gap-2 border-b border-[color:var(--hairline)] pb-1 text-xs">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span
                      aria-hidden="true"
                      className={`font-mono text-[10px] ${pass.clear ? "text-confirmed" : "text-possible"}`}
                    >
                      {pass.clear ? "✓" : "!"}
                    </span>
                    <span className="truncate text-ink-soft">{pass.reviewer}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute">
                    {pass.outcome}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* what a person can do next — the last step is the product */}
          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">
              Then a person decides
            </p>
            <ol className="mt-2 space-y-1.5 text-xs text-ink-soft">
              {[
                ["Approve", "the submission moves on; the finding is recorded as accepted"],
                ["Request changes", "the finding goes back to the creator, with the quote attached"],
                ["Override, with a reason", "a manager may waive it — that becomes a versioned, scoped exception"],
              ].map(([label, detail]) => (
                <li key={label} className="flex gap-2 border-b border-[color:var(--hairline)] pb-1.5">
                  <span className="w-[7.5rem] shrink-0 font-semibold text-ink">{label}</span>
                  <span className="text-ink-mute">{detail}</span>
                </li>
              ))}
            </ol>
          </div>

          <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">
            <span aria-hidden="true" className="inline-block h-[6px] w-[6px] rounded-full bg-live" />
            shift: {theme === "dark" ? "night" : "day"}
          </p>
        </div>

        {/* ------------------------------------------------------- the findings */}
        <div className="flex flex-col p-4">
          <p className="eyebrow">The committee’s notes</p>
          <ul className="mt-2 space-y-1" aria-label="Findings">
            {[...DEMO_FINDINGS]
              .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
              .map((f) => {
                const on = f.id === selected;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setSelected(f.id);
                        playSound("key");
                      }}
                      className={`flex w-full items-center gap-2 rounded-[2px] px-2 py-2 text-left transition-colors duration-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                        on ? "bg-navy text-ivory" : "hover:bg-ivory-deep/70"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          f.severity === "critical"
                            ? "bg-critical"
                            : f.severity === "major"
                              ? "bg-possible"
                              : "bg-info"
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {f.reviewerName} · “{f.quote}”
                      </span>
                      <span
                        className={`font-mono text-[9px] uppercase tracking-[0.12em] ${
                          on ? "text-[color:var(--ink-3)]" : "text-ink-mute"
                        }`}
                      >
                        {SEVERITY_LABEL[f.severity]}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>

          {/* the detail of the selected finding */}
          <div className="mt-3 flex-1 rounded-[2px] border border-[color:var(--hairline)] bg-parchment/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${SEVERITY_TONE[finding.severity]}`}
              >
                <span aria-hidden="true">▲</span>
                {SEVERITY_LABEL[finding.severity]}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute">
                {finding.ruleKey}
              </span>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-ink">{finding.problem}</p>

            <p className="mt-2 border-t border-[color:var(--hairline)] pt-2 text-[11px] leading-relaxed text-ink-mute">
              <span className="font-mono uppercase tracking-[0.12em] text-[color:var(--ink-2)]">Source · </span>
              {finding.source}
              {finding.page ? `, p.${finding.page}` : ""}
            </p>

            {/* hold to preview */}
            <div className="mt-3">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  start(finding.id);
                }}
                onPointerUp={stop}
                onPointerLeave={stop}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    start(finding.id);
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === " " || e.key === "Enter") stop();
                }}
                onBlur={stop}
                aria-describedby="preview-hint"
                className="w-full select-none rounded-[2px] border border-[color:var(--hairline)] bg-gold-tint/60 px-2 py-2 text-2xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-2)] transition-transform duration-micro ease-snap active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                {shown ? "Release to hide" : "Hold to preview"}
              </button>

              <div
                className={`mt-2 overflow-hidden rounded-[2px] border border-dashed bg-ivory p-2 transition-opacity duration-micro ${
                  shown ? "border-[color:var(--hairline)] opacity-100" : "border-transparent opacity-0"
                }`}
                aria-hidden={!shown}
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--ink-2)]">
                  {pinned ? "pinned preview" : "preview"} · not applied
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink">{finding.suggestion}</p>
              </div>

              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-ink-mute">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#8F7418]"
                />
                Pin the preview (a toggle, for keyboards without a hold)
              </label>

              <p id="preview-hint" className="mt-2 text-[11px] leading-relaxed text-ink-mute">
                Hold the button, or focus it and hold Space. Nothing is written: this page has no
                apply control at all.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
