"use client";
import Link from "next/link";
import { Card, SectionHeading, Tag, Button } from "../../components/ui";
import { ReviewerAvatar } from "../../components/brand/ReviewerAvatar";
import { CHARACTER_LIST, PERSONAS } from "../../components/brand/characters";
import { Sentri } from "../../components/brand/Sentri";
import { Ribbon } from "../../components/brand/Seal";

export default function CharactersPage() {
  return (
    <div className="max-w-5xl">
      <p className="font-mono text-2xs uppercase tracking-[0.24em] text-gold-deep">The cast</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-navy">
        Six reviewers, one owl, and the people who decide.
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Each reviewer is a lens, not a personality hire: the cartoon carries the reviewer’s name, and the reading
        under it is the same sentence you will find in the finding card. Character is switched off in Settings and
        every fact survives.
      </p>

      {/* committee */}
      <SectionHeading className="mt-7" title="The committee" subtitle="Reviewer lenses, in the order they run" />
      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CHARACTER_LIST.map((c) => (
          <li key={c.key}>
            <Card className="h-full p-4">
              <div className="flex items-start gap-3">
                <ReviewerAvatar reviewer={c.key} size={62} />
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold leading-tight text-navy">{c.name}</h2>
                  <p className="font-mono text-2xs uppercase tracking-[0.14em] text-gold-deep">{c.role}</p>
                  <p className="mt-1 text-xs italic leading-relaxed text-ink-soft">“{c.catchphrase}”</p>
                </div>
              </div>
              <p className="mt-3 border-t border-ink/10 pt-2 text-xs leading-relaxed text-ink-soft">
                {IN_CHARACTER[c.key]}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Tag>{c.reviewer}</Tag>
                {c.serious && <Ribbon tone="muted">Never jokes on this lens</Ribbon>}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {/* sentri */}
      <Card className="mt-5 overflow-hidden">
        <div className="grid gap-5 p-5 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex items-end justify-center gap-2">
            <Sentri mood="welcome" size={92} />
            <Sentri mood="thinking" size={68} decorative />
          </div>
          <div>
            <SectionHeading title="Sentri" subtitle="The owl on the shoulder of the process" />
            <p className="text-sm leading-relaxed text-ink-soft">
              Sentri never decides anything. It appears when a run starts, when something needs a human, and when a
              queue is finally clear — always with a sentence a screen reader can read.
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-1.5 text-xs text-ink-soft sm:grid-cols-4">
              {["welcome", "thinking", "scanning", "alert", "celebrating", "sleeping", "confused"].map((m) => (
                <li key={m} className="flex items-center gap-1.5">
                  <Sentri mood={m as any} size={26} decorative />
                  <span className="font-mono text-2xs">{m}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {/* humans */}
      <SectionHeading className="mt-6" title="The humans" subtitle="Roles decide permissions; avatars only decide the ribbon" />
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.values(PERSONAS).map((p) => (
          <li key={p.email}>
            <Card className="flex items-center gap-3 p-3">
              <span
                aria-hidden
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-sm font-semibold text-ivory"
                style={{ background: p.accent }}
              >
                {p.initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                <p className="font-mono text-2xs uppercase tracking-[0.12em] text-gold-deep">{p.role}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/brand"><Button>Brand system</Button></Link>
        <Link href="/settings"><Button variant="primary">Turn characters on or off</Button></Link>
      </div>
    </div>
  );
}

const IN_CHARACTER: Record<string, string> = {
  brand_voice:
    "Reads for tone: contractions, warmth, the difference between confident and boastful. Flags anything that sounds like a different company wrote it.",
  terminology:
    "Holds the approved term list. Prefers the word the Brand Kit already chose, and says which alternative was expected.",
  fact_checker:
    "Asks for the source of every number, date and claim. If the approved facts list has nothing, the finding says so instead of guessing.",
  visual:
    "Checks hex values, logo lockups and contrast against the palette. Names the approved colour it expected.",
  accessibility:
    "Reads alt text, link wording and heading order. Never makes a joke here — a barrier is not a punchline.",
  legal:
    "Looks for guarantees, superlatives and regulated claims. States the risk plainly and routes it to a human with authority.",
};
