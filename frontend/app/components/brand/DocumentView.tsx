"use client";
/**
 * The ivory “document” a review is printed on: letterhead, highlighted spans and
 * inline tracked changes for suggestions the reviewer has applied in preview.
 */
import { useMemo } from "react";
import Link from "next/link";
import type { ContentItem, Finding } from "@/lib/api";
import { Crest } from "./Crest";
import { Seal } from "./Seal";
import { ReviewerAvatar } from "./ReviewerAvatar";
import { characterFor } from "./characters";

interface Props {
  item: ContentItem | null;
  text: string;
  findings: Finding[];
  activeId: string | null;
  onSelect: (id: string) => void;
  applied: Record<string, string>;
  onUndo: (findingId: string) => void;
  status?: string;
}

const ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function DocumentView({
  item, text, findings, activeId, onSelect, applied, onUndo, status,
}: Props) {
  const segments = useMemo(() => {
    const spans = findings
      .filter((f) => f.span_end > f.span_start)
      .map((f) => ({ start: f.span_start, end: f.span_end, id: f.id, severity: f.severity, suggestion: f.suggestion }))
      .sort((a, b) => a.start - b.start || b.end - a.end);

    const cuts = new Set<number>([0, text.length]);
    spans.forEach((s) => {
      cuts.add(Math.max(0, Math.min(text.length, s.start)));
      cuts.add(Math.max(0, Math.min(text.length, s.end)));
    });
    const points = Array.from(cuts).sort((a, b) => a - b);

    const out: {
      text: string; findingId: string | null; severity?: string; appliedTo?: string;
    }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      if (end <= start) continue;
      const covering = spans.filter((s) => s.start <= start && s.end >= end);
      const top = covering.sort((a, b) => (ORDER[b.severity] || 0) - (ORDER[a.severity] || 0))[0];
      out.push({
        text: text.slice(start, end),
        findingId: top?.id ?? null,
        severity: top?.severity,
        appliedTo: top && applied[top.id] !== undefined ? applied[top.id] : undefined,
      });
    }
    return out;
  }, [text, findings, applied]);

  const changed = Object.keys(applied).filter((id) => findings.some((f) => f.id === id));
  const sealLabel =
    status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "In review";

  return (
    <div className="relative overflow-hidden rounded-lg border border-ink/12 bg-ivory shadow-card">
      {/* letterhead */}
      <div className="flex items-start justify-between gap-4 border-b border-gold/30 bg-gradient-parchment px-6 py-4">
        <div className="flex items-start gap-3">
          <Crest size={34} tone="gold" decorative />
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.22em] text-gold-deep">
              Sentinel AI · Review record
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold leading-tight text-navy">
              {item?.title ?? "Untitled submission"}
            </h2>
            <p className="mt-0.5 text-2xs text-ink-mute">
              {item?.owner_name} · {item?.department || "No department"} · version {item?.current_version ?? "—"}
              {item?.content_type ? ` · ${item.content_type.replace("_", " ")}` : ""}
            </p>
          </div>
        </div>
        <Seal label={sealLabel} tone={status === "approved" ? "approved" : "review"} size={58} />
      </div>

      {/* highlighted document */}
      <div className="relative px-6 py-5">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.035]">
          <svg width="100%" height="100%"><rect width="100%" height="100%" fill="url(#doc-rules)" />
            <defs>
              <pattern id="doc-rules" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M0 8h8" stroke="#0B1437" strokeWidth="0.5" />
              </pattern>
            </defs>
          </svg>
        </div>

        <div className="relative whitespace-pre-wrap break-words font-sans text-[15px] leading-8 text-ink"
             data-testid="content-body">
          {segments.map((seg, i) =>
            seg.appliedTo !== undefined ? (
              <span key={i} className="rounded bg-confirmed-tint/60 px-0.5">
                <del className="tracked-old" title="Removed in your preview">{seg.text}</del>
                <ins className="tracked-new" title="Your applied suggestion">{seg.appliedTo}</ins>
              </span>
            ) : seg.findingId ? (
              <mark
                key={i}
                className={`hl hl-${seg.severity} ${seg.findingId === activeId ? "hl-active" : ""} cursor-pointer`}
                tabIndex={0}
                role="button"
                aria-label={`Open the finding on: ${seg.text.slice(0, 60)}`}
                onClick={() => onSelect(seg.findingId!)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(seg.findingId!); }
                }}
              >
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </div>

        {item?.version?.filename && (
          <p className="relative mt-4 border-t border-ink/10 pt-2 font-mono text-2xs text-ink-mute">
            Source file: {item.version.filename}
          </p>
        )}
      </div>

      {/* applied-changes ledger */}
      {changed.length > 0 && (
        <div className="border-t border-gold/30 bg-ivory-deep/60 px-6 py-3">
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-gold-deep">
            Applied in preview · {changed.length}
          </p>
          <ul className="mt-1.5 space-y-1">
            {changed.map((fid) => {
              const f = findings.find((x) => x.id === fid)!;
              return (
                <li key={fid} className="flex flex-wrap items-center gap-2 text-2xs text-ink-soft">
                  <ReviewerAvatar reviewer={f.reviewer} size={18} showRing={false} />
                  <span className="font-medium text-ink">{characterFor(f.reviewer).name}</span>
                  <span className="rounded bg-critical-tint px-1 text-critical line-through">{f.span_text}</span>
                  <span aria-hidden>→</span>
                  <span className="rounded bg-confirmed-tint px-1 text-confirmed">{applied[fid]}</span>
                  <button
                    type="button"
                    onClick={() => onUndo(fid)}
                    className="ml-auto rounded px-1.5 py-0.5 font-semibold text-gold-deep underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    Undo
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="border-t border-ink/10 px-6 py-2 font-mono text-2xs text-ink-mute">
        Preview only — this browser session. Nothing is saved until a human records a decision and adds a version.
        {" "}<Link href={`/content/${item?.id ?? ""}/approval`} className="underline">Approval view</Link>
      </p>
    </div>
  );
}
