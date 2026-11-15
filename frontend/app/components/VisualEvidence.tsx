"use client";
import { useEffect, useId, useRef, useState } from "react";
import { fetchBlob, type VisualEvidence } from "@/lib/api";

/**
 * VisualEvidence — the picture, and the exact pixels the finding is about.
 *
 * A visual finding is only useful if you can see what it saw. So: the stored original is
 * fetched with the session's own credentials (never a public URL), the measured box is
 * drawn over it, and the numbers that produced the finding are printed underneath —
 * measured against expected, in the same words the reviewer would use out loud.
 *
 * Honesty rules this component obeys:
 *  - when a value was not measured, it says "not measured" — never a placeholder number;
 *  - a perceptual-hash match is captioned "Possible", never "Confirmed";
 *  - if the image cannot be fetched (a pasted item, a missing file, no permission) the
 *    measurements are still shown, and the missing picture is stated plainly.
 *
 * Keyboard: the figure is one tab stop. Enter/Space toggles the highlight box so the
 * picture can be read clean, and the caption is the figure's description.
 */
export function VisualEvidencePanel({
  evidence,
  contentItemId,
  label,
  className = "",
}: {
  evidence: VisualEvidence;
  contentItemId?: string;
  /** "confirmed" | "possible" — carried through so a guess is never captioned as fact. */
  label?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "missing" | "ready">(
    contentItemId ? "loading" : "missing",
  );
  const [showBox, setShowBox] = useState(true);
  const urlRef = useRef<string | null>(null);
  const captionId = useId();

  useEffect(() => {
    let cancelled = false;
    if (!contentItemId) {
      setState("missing");
      return;
    }
    setState("loading");
    fetchBlob(`/content/${contentItemId}/original`)
      .then((blob) => {
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        urlRef.current = next;
        setUrl(next);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });
    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [contentItemId]);

  const value: Partial<VisualEvidence["detected_value"]> = evidence.detected_value || {};
  const measured = value.measured ?? null;
  const expected = value.expected ?? null;
  const [x0, y0, x1, y1] = evidence.bbox_norm || [0, 0, 1, 1];

  return (
    <figure className={`mt-2 rounded-[6px] border-[1.5px] border-[color:var(--hairline)] bg-[color:var(--paper-2)] p-2 ${className}`}>
      <div className="relative overflow-hidden rounded-[3px] border border-[color:var(--hairline)] bg-[color:var(--paper)]">
        {state === "ready" && url ? (
          <div
            role="button"
            tabIndex={0}
            aria-pressed={showBox}
            aria-label={showBox ? "Hide the highlight box" : "Show the highlight box"}
            aria-describedby={captionId}
            onClick={() => setShowBox((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setShowBox((v) => !v);
              }
            }}
            className="relative block w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
          >
            {/* the stored original, served by the API with the session's own credentials */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={evidence.detected_text ? `Uploaded image: ${evidence.detected_text}` : "Uploaded image"} className="block h-auto w-full" />
            {showBox && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute border-2 border-[color:var(--mark)]"
                style={{
                  left: `${x0 * 100}%`,
                  top: `${y0 * 100}%`,
                  width: `${Math.max(0.5, (x1 - x0) * 100)}%`,
                  height: `${Math.max(0.5, (y1 - y0) * 100)}%`,
                }}
              />
            )}
          </div>
        ) : (
          <p className="px-2 py-3 text-[11px] text-[color:var(--ink-3)]">
            {state === "loading"
              ? "Fetching the stored original…"
              : "No original image is stored for this version — the measurements below still apply."}
          </p>
        )}
      </div>

      <figcaption id={captionId} className="mt-1.5 space-y-1 text-[11px] leading-[1.5] text-[color:var(--ink-2)]">
        {evidence.detected_text && (
          <p>
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
              Detected in the image{" "}
            </span>
            “{evidence.detected_text}”
          </p>
        )}
        <p className="font-mono text-[10px] text-[color:var(--ink-2)]">
          <span className="uppercase tracking-[0.08em]">Measured </span>
          {measured === null || measured === "" ? "not measured" : String(measured)}
          <span className="mx-1 text-[color:var(--ink-3)]">·</span>
          <span className="uppercase tracking-[0.08em]">Expected </span>
          {expected === null || expected === "" ? "no threshold declared" : String(expected)}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
          page {evidence.page}
          {evidence.source === "ocr" ? " · text read by OCR" : ""}
          {typeof evidence.ocr_confidence === "number"
            ? ` · OCR confidence ${Math.round(evidence.ocr_confidence * 100)}%`
            : ""}
          {value.kind === "logo_similarity" ? " · possible match, not a confirmation" : ""}
          {label === "possible" ? " · possible" : ""}
        </p>
      </figcaption>
    </figure>
  );
}
