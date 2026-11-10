"use client";
import Link from "next/link";
import { Card, SectionHeading, SeverityChip, LabelChip, ConfidenceChip, Button } from "../components/ui";
import { Crest, Wordmark, Monogram } from "../components/brand/LogoLockup";
import { Seal, Ribbon } from "../components/brand/Seal";
import { Sentri } from "../components/brand/Sentri";
import { Damask, Lattice, Fan, Rosette, DoubleRule } from "../components/brand/Pattern";

const SWATCHES: { name: string; token: string; hex: string; onDark?: boolean }[] = [
  { name: "Royal navy", token: "--royal-navy", hex: "#0B1437", onDark: true },
  { name: "Imperial purple", token: "--imperial", hex: "#3D2468", onDark: true },
  { name: "Gold", token: "--gold", hex: "#C9A227" },
  { name: "Gold soft", token: "--gold-soft", hex: "#E8D48B" },
  { name: "Gold deep", token: "--gold-deep", hex: "#8F7418", onDark: true },
  { name: "Ivory", token: "--ivory", hex: "#FBF7EE" },
  { name: "Parchment", token: "--parchment", hex: "#F4EDDE" },
  { name: "Ink", token: "--ink", hex: "#14192E", onDark: true },
  { name: "Confirmed", token: "--confirmed", hex: "#1F6F4A", onDark: true },
  { name: "Possible", token: "--possible", hex: "#B26A00", onDark: true },
  { name: "Critical", token: "--critical", hex: "#9B1C31", onDark: true },
];

const TYPE = [
  { role: "Display", family: "Playfair Display", use: "Page titles, seals, numerals", cls: "font-display text-3xl" },
  { role: "Crest", family: "Cormorant Garamond", use: "Motto lines and certificates", cls: "font-crest text-2xl" },
  { role: "Text", family: "Inter", use: "Body, forms, buttons", cls: "font-sans text-base" },
  { role: "Mono", family: "JetBrains Mono", use: "Rule keys, models, citations", cls: "font-mono text-sm" },
];

export default function BrandPage() {
  return (
    <div className="max-w-5xl">
      <p className="font-mono text-2xs uppercase tracking-[0.24em] text-gold-deep">Brand system</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-navy">
        Royal, legible, unbothered.
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Sentinel borrows the vocabulary of a chancery — crest, seal, hairline rules, gold leaf — and spends it on
        readability. Nothing is decorative-only: every seal, chip and colour has a text label beside it.
      </p>

      {/* marks */}
      <Card className="mt-6 overflow-hidden">
        <div className="relative bg-navy px-6 py-8">
          <Damask className="absolute inset-0 h-full w-full" opacity={0.45} />
          <div className="relative flex flex-wrap items-center gap-8">
            <span className="flex items-center gap-3">
              <Crest size={56} tone="gold" />
              <Wordmark tone="gold" size={22} />
            </span>
            <span className="text-ivory/70">·</span>
            <Monogram size={64} tone="gold" />
            <span className="text-ivory/70">·</span>
            <Crest size={56} tone="ivory" />
            <span className="text-ivory/70">·</span>
            <Crest size={56} tone="mono" />
          </div>
        </div>
        <div className="p-5">
          <SectionHeading title="The mark" subtitle="Shield, laurel and a lowercase s — the small voice that never shouts" />
          <p className="text-sm text-ink-soft">
            The crest works at 16 px (favicon) up to 512 px (print). The monogram’s 12 stars stand for the six
            reviewers and the six human roles. All marks are original inline SVG, no external requests.
          </p>
        </div>
      </Card>

      {/* colour */}
      <Card className="mt-4 p-5">
        <SectionHeading title="Colour" subtitle="Every pairing below is checked against WCAG AA at the size shown" />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SWATCHES.map((s) => (
            <li key={s.name} className="overflow-hidden rounded-md border border-ink/12">
              <div
                className="flex h-16 items-end p-2"
                style={{ background: s.hex, color: s.onDark ? "#FBF7EE" : "#14192E" }}
              >
                <span className="font-mono text-2xs">{s.hex}</span>
              </div>
              <div className="bg-white px-2 py-1.5">
                <p className="text-xs font-semibold text-ink">{s.name}</p>
                <p className="font-mono text-2xs text-ink-mute">{s.token}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SeverityChip severity="critical" />
          <SeverityChip severity="high" />
          <SeverityChip severity="medium" />
          <SeverityChip severity="low" />
          <LabelChip label="confirmed" />
          <LabelChip label="possible" />
          <ConfidenceChip band="high" value={0.86} />
          <Ribbon tone="gold">Human review required</Ribbon>
        </div>
        <p className="mt-2 text-xs text-ink-mute">
          Severity is never colour alone: each chip carries a glyph, a word and an underline style in the document.
        </p>
      </Card>

      {/* type */}
      <Card className="mt-4 p-5">
        <SectionHeading title="Type" subtitle="Four families, self-hosted through next/font — no runtime font requests" />
        <ul className="divide-y divide-ink/10">
          {TYPE.map((t) => (
            <li key={t.role} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span className={t.cls}>{t.family}</span>
              <span className="text-xs text-ink-mute">
                {t.role} · {t.use}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* ornaments */}
      <Card className="mt-4 p-5">
        <SectionHeading title="Ornaments" subtitle="Inline SVG patterns, 4–10% opacity, each under 3 KB" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: "Damask", node: <Damask className="h-24 w-full rounded-md bg-navy" /> },
            { name: "Lattice", node: <Lattice className="h-24 w-full rounded-md bg-navy" /> },
            { name: "Fan", node: <Fan className="h-24 w-full rounded-md bg-ivory-deep" /> },
            { name: "Rosette", node: <Rosette className="h-24 w-full rounded-md bg-ivory-deep" /> },
          ].map((o) => (
            <div key={o.name}>
              {o.node}
              <p className="mt-1 font-mono text-2xs uppercase tracking-[0.14em] text-ink-mute">{o.name}</p>
            </div>
          ))}
        </div>
        <DoubleRule className="mt-4" />
      </Card>

      {/* mascot + seals */}
      <Card className="mt-4 p-5">
        <SectionHeading title="Sentri and the seal" subtitle="One owl, seven moods; seals carry a word, never a colour alone" />
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-wrap items-end gap-3">
            {(["welcome", "thinking", "scanning", "alert", "celebrating", "sleeping", "confused"] as const).map((m) => (
              <figure key={m} className="text-center">
                <Sentri mood={m} size={62} decorative />
                <figcaption className="mt-1 font-mono text-2xs text-ink-mute">{m}</figcaption>
              </figure>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <Seal label="Approved" tone="approved" size={72} />
            <Seal label="In review" tone="review" size={72} />
            <Seal label="Rejected" tone="critical" size={72} />
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Sentri blinks every 4–6 seconds and tilts on hover. With <code className="font-mono">prefers-reduced-motion</code>{" "}
          both stop and the owl stands still.
        </p>
      </Card>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/brand/characters"><Button variant="primary">Meet the committee →</Button></Link>
        <Link href="/settings"><Button>Characters &amp; appearance</Button></Link>
      </div>
    </div>
  );
}
