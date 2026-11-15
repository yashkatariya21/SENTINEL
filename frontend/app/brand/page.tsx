"use client";
import Link from "next/link";
import { Card, SectionHeading, SeverityChip, LabelChip, ConfidenceChip, Button, StatusPill, Tag } from "../components/ui";
import { DeskMark, DeskSentri, GateStrip, Stamp, Wordmark, type StampState } from "../components/Desk";
import { readableOn } from "@/lib/contrast";

/**
 * The proof-desk style sheet. This page is documentation, so it prints the real
 * values the app uses — the same CSS variables, the same components — rather than
 * swatch cards that can drift away from the product.
 */
const INKS: { name: string; token: string; hex: string; use: string }[] = [
  { name: "Ink", token: "--ink", hex: "#111318", use: "Body, headings, the rail, the gate" },
  { name: "Ink soft", token: "--ink-2", hex: "#4B5160", use: "Secondary prose" },
  { name: "Ink mute", token: "--ink-3", hex: "#5F6673", use: "Meta, hints, timestamps" },
  { name: "Hairline", token: "--hairline", hex: "#D6DAE1", use: "Every rule that is not ink" },
  { name: "Paper", token: "--paper", hex: "#FFFFFF", use: "Sheets" },
  { name: "Canvas", token: "--canvas", hex: "#EEF0F3", use: "The desk behind the sheets" },
  { name: "Mark", token: "--mark", hex: "#D92D20", use: "Proof marks, holds, the pen" },
  { name: "Mark text", token: "--mark-text", hex: "#C42A1E", use: "Red that carries small words" },
  { name: "Highlight", token: "--highlight", hex: "#FFE066", use: "A fill only — 14.3:1 under ink" },
  { name: "Pass", token: "--pass", hex: "#15704A", use: "Resolved, approved, verified" },
  { name: "Warn", token: "--warn", hex: "#8F5500", use: "Possible, pending, waiting" },
  { name: "Night", token: "--canvas (night)", hex: "#0E1014", use: "Proof black, the night shift" },
];

const TYPE = [
  { role: "Interface", family: "Inter", use: "Body, headings, controls", cls: "font-sans text-2xl font-semibold" },
  { role: "Machine", family: "IBM Plex Mono", use: "Rule keys, counts, timestamps, eyebrow labels", cls: "font-mono text-xl" },
  { role: "Draft", family: "Source Serif 4", use: "The document under review — and nothing else", cls: "font-doc text-2xl" },
];

const STAMPS: StampState[] = ["hold", "changes", "awaiting", "ready", "approved"];

export default function BrandPage() {
  return (
    <div className="max-w-5xl">
      <div className="border-b-[1.5px] border-[color:var(--hairline-strong)] pb-4">
        <p className="font-mono text-2xs uppercase tracking-[0.24em] text-[color:var(--ink-3)]">Brand system</p>
        <h1 className="mt-1.5 text-[2.2rem] font-semibold leading-tight tracking-[-0.035em] text-[color:var(--ink)]">
          Ink, paper, three pens.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--ink-2)]">
          Sentinel looks like the thing it does: a draft on a desk, marked up by six readers, stamped, and held at a
          gate until a person signs it. Every rule here is a 1.5px line rather than a shadow; every state is a word
          before it is a colour.
        </p>
      </div>

      {/* ------------------------------------------------------------- the mark */}
      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-[color:var(--hairline)] bg-[#111318] px-6 py-8">
          <div className="flex flex-wrap items-center gap-8">
            <span className="flex items-center gap-3 text-[#F4F5F7]">
              <DeskMark size={44} />
              <Wordmark tone="paper" className="text-[#F4F5F7]" />
            </span>
            <span aria-hidden="true" className="text-[#3A4149]">/</span>
            <DeskMark size={28} className="text-[#FFE066]" />
            <span aria-hidden="true" className="text-[#3A4149]">/</span>
            <DeskMark size={18} className="text-[#C3CAD6]" />
          </div>
        </div>
        <div className="p-5">
          <SectionHeading title="The mark" subtitle="A shield, a keyhole and a 1.7px stroke — the gate, in one glyph" />
          <p className="text-sm leading-relaxed text-[color:var(--ink-2)]">
            The mark works from 16 px (favicon) to 512 px (print). It is original inline SVG with no external
            request, and it never carries meaning alone: beside it there is always the word Sentinel.
          </p>
        </div>
      </Card>

      {/* ------------------------------------------------------------- colour */}
      <Card className="mt-4 p-5">
        <SectionHeading title="Colour" subtitle="Every hex below is measured against the surface it sits on — the ratios are in globals.css" />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {INKS.map((s) => (
            <li key={s.name} className="overflow-hidden rounded-[6px] border border-[color:var(--hairline)]">
              <div className="flex h-16 items-end p-2" style={{ background: s.hex, color: readableOn(s.hex) }}>
                <span className="font-mono text-2xs">{s.hex}</span>
              </div>
              <div className="bg-[color:var(--paper)] px-2 py-1.5">
                <p className="text-xs font-semibold text-[color:var(--ink)]">{s.name}</p>
                <p className="font-mono text-[10px] text-[color:var(--ink-3)]">{s.token}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-[color:var(--ink-3)]">{s.use}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-[color:var(--hairline)] pt-4">
          <p className="mb-2 font-mono text-2xs uppercase tracking-[0.14em] text-[color:var(--ink-3)]">Chips and stamps</p>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityChip severity="critical" />
            <SeverityChip severity="high" />
            <SeverityChip severity="medium" />
            <SeverityChip severity="low" />
            <LabelChip label="confirmed" />
            <LabelChip label="possible" />
            <ConfidenceChip band="high" value={0.86} />
            <Tag>v1.2.0</Tag>
            <StatusPill status="in_review" />
            <StatusPill status="approved" />
            <StatusPill status="changes_requested" />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[color:var(--ink-3)]">
            Severity is never colour alone: each chip carries a printer’s shape — square, triangle, diamond, circle —
            plus a word, and the marks in the draft carry a strike as well as a fill.
          </p>
        </div>
      </Card>

      {/* --------------------------------------------------------- the stamp set */}
      <Card className="mt-4 p-5">
        <SectionHeading title="The stamp" subtitle="One word, pressed at an angle — the only element allowed to be imperfect" />
        <div className="flex flex-wrap items-center gap-5">
          {STAMPS.map((s) => (
            <div key={s} className="text-center">
              <Stamp state={s} />
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-3)]">{s}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[color:var(--ink-3)]">
          The stamp drops in over 620ms with a slight overshoot, then rests at −5°. With{" "}
          <code className="font-mono">prefers-reduced-motion</code> it simply appears.
        </p>
        <div className="mt-5">
          <p className="mb-2 font-mono text-2xs uppercase tracking-[0.14em] text-[color:var(--ink-3)]">The gate</p>
          <GateStrip current={2} className="rounded-[8px]" />
          <p className="mt-2 text-xs leading-relaxed text-[color:var(--ink-3)]">
            Publishing is the last step and it stays locked until a human decides. The strip is a real readout of the
            item&apos;s state, not decoration.
          </p>
        </div>
      </Card>

      {/* ------------------------------------------------------------- type */}
      <Card className="mt-4 p-5">
        <SectionHeading title="Type" subtitle="Three families, self-hosted through next/font — no runtime font requests" />
        <ul className="divide-y divide-[color:var(--hairline)]">
          {TYPE.map((t) => (
            <li key={t.role} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <span className={`${t.cls} text-[color:var(--ink)]`}>{t.family}</span>
              <span className="font-mono text-2xs uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
                {t.role} · {t.use}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 max-w-2xl border-l-2 border-[color:var(--mark)] pl-3 text-xs leading-relaxed text-[color:var(--ink-2)]">
          The serif is reserved for the draft. It is the one place where the page stops being software and becomes a
          document — using it anywhere else would spend that effect.
        </p>
      </Card>

      {/* ------------------------------------------------------------- the cast */}
      <Card className="mt-4 p-5">
        <SectionHeading title="Sentri and the cast" subtitle="One owl at the desk, six readers with their own question" />
        <div className="flex flex-wrap items-end gap-5">
          {(["idle", "reading", "done"] as const).map((m) => (
            <figure key={m} className="text-center">
              <DeskSentri mood={m} size={78} />
              <figcaption className="mt-1 font-mono text-2xs uppercase tracking-[0.12em] text-[color:var(--ink-3)]">{m}</figcaption>
            </figure>
          ))}
          <div className="flex flex-col gap-1 border-l border-[color:var(--hairline)] pl-5 text-xs leading-relaxed text-[color:var(--ink-2)]">
            <p>Sentri reads the draft, not the person.</p>
            <p className="text-[color:var(--ink-3)]">Drawn by hand in SVG. No stock illustration, no generated character.</p>
            <Link href="/brand/characters" className="link-under mt-1 w-fit font-mono text-2xs uppercase tracking-[0.12em] text-[color:var(--ink)]">
              Meet the six readers
            </Link>
          </div>
        </div>
      </Card>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/brand/characters"><Button variant="primary">Meet the committee</Button></Link>
        <Link href="/settings"><Button>Characters &amp; appearance</Button></Link>
        <Link href="/welcome"><Button variant="ghost">The public brief</Button></Link>
      </div>
    </div>
  );
}
