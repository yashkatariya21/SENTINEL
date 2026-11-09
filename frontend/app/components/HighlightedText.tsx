"use client";
import { useMemo } from "react";
import type { Finding } from "@/lib/api";

interface Props {
  text: string;
  findings: Finding[];
  activeId: string | null;
  onSelect: (id: string) => void;
  showHighlights: boolean;
}

/** Renders the submitted content with the flagged spans highlighted.
 *  Overlapping findings are stacked by severity so the strongest one wins visually. */
export function HighlightedText({ text, findings, activeId, onSelect, showHighlights }: Props) {
  const segments = useMemo(() => {
    if (!showHighlights) return [{ text, findingId: null as string | null }];
    const spans = findings
      .filter((f) => f.span_end > f.span_start)
      .map((f) => ({ start: f.span_start, end: f.span_end, id: f.id, severity: f.severity }))
      .sort((a, b) => a.start - b.start || b.end - a.end);

    const cuts = new Set<number>([0, text.length]);
    spans.forEach((s) => { cuts.add(Math.max(0, s.start)); cuts.add(Math.min(text.length, s.end)); });
    const points = Array.from(cuts).sort((a, b) => a - b);

    const order = { critical: 4, high: 3, medium: 2, low: 1 } as Record<string, number>;
    const out: { text: string; findingId: string | null; severity?: string }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      if (end <= start) continue;
      const covering = spans.filter((s) => s.start <= start && s.end >= end);
      const top = covering.sort((a, b) => (order[b.severity] || 0) - (order[a.severity] || 0))[0];
      out.push({ text: text.slice(start, end), findingId: top?.id ?? null, severity: top?.severity });
    }
    return out;
  }, [text, findings, showHighlights]);

  return (
    <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-ink" data-testid="content-body">
      {segments.map((seg, i) =>
        seg.findingId ? (
          <mark
            key={i}
            className={`hl hl-${seg.severity} ${seg.findingId === activeId ? "hl-active" : ""} cursor-pointer text-ink`}
            tabIndex={0}
            role="button"
            aria-label={`Finding on: ${seg.text.slice(0, 60)}. Activate to open the finding card.`}
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
  );
}
