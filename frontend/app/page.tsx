import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "./components/landing/SiteHeader";
import { SiteFooter } from "./components/landing/SiteFooter";
import { ReviewFloor } from "./components/landing/ReviewFloor";
import { LiveDemo } from "./components/landing/LiveDemo";
import { Marquee } from "./components/landing/Marquee";
import { Reveal } from "./components/landing/Reveal";
import { SealStage } from "./components/landing/SealStage";
import { EntrySequence } from "./components/EntrySequence";
import { DeskMark, DeskSentri, GateStrip } from "./components/Desk";
import { Icon } from "./components/Icon";
import { FACTS, MOVEMENTS, REVIEWERS } from "@/lib/landing";
import { DeskBackground } from "@/app/components/DeskBackground";

export const metadata: Metadata = {
  title: "Sentinel AI — read before it ships",
  description:
    "Six specialist reviewers read every draft against your Brand Kit. Every finding quotes the rule, shows its source, and waits for a person. It never publishes.",
  robots: { index: true, follow: true },
};

/** the eyebrow that opens each movement: a number, a rule, a word */
function Marker({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 font-mono text-2xs uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
      <span className="tabular-nums text-[color:var(--ink)]">{n}</span>
      <span aria-hidden="true" className="h-px w-8 bg-[color:var(--hairline-strong)]" />
      {children}
    </p>
  );
}

export default function WelcomePage() {
  return (
    <div className="relative min-h-screen bg-[color:var(--canvas)] text-[color:var(--ink)]">
      <DeskBackground variant="public" />
      <EntrySequence />
      <SiteHeader />

      <main id="main">
        {/* ================================================================ hero */}
        <section className="relative isolate overflow-hidden border-b border-[color:var(--hairline)]">
          {/* the desk grid, ruled faintly behind the sheet */}
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.5]">
            <defs>
              <pattern id="welcome-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M32 0H0v32" fill="none" stroke="var(--hairline)" strokeWidth="0.6" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#welcome-grid)" />
          </svg>

          <div className="relative mx-auto max-w-[1240px] px-5 pb-14 pt-10 lg:px-8 lg:pb-20 lg:pt-14">
            <Marker n="01">Pre-publication brand governance</Marker>

            {/* the headline runs the full width — it is the loudest thing on the page */}
            <h1 className="mt-5 max-w-[16ch] text-[clamp(2.75rem,8vw,6rem)] font-semibold leading-[0.94] tracking-[-0.04em]">
              Read before
              <span className="block">
                <span className="em-italic">it ships.</span>
              </span>
            </h1>

            <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start lg:gap-14">
              <div>
                <p className="prose-measure text-base leading-relaxed text-[color:var(--ink-2)]">
                  Six specialist reviewers read every draft against your Brand Kit — voice, terminology,
                  facts, visual, accessibility, legal. Each finding quotes the exact words, names the rule,
                  and cites the page it came from. Then a person decides.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <Link
                    href="/login"
                    className="group relative inline-flex min-h-[48px] items-center overflow-hidden rounded-[6px] border border-[color:var(--ink)] bg-[color:var(--ink)] px-5 font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--paper)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 origin-left scale-x-0 bg-[color:var(--highlight)] transition-transform duration-200 ease-out group-hover:scale-x-100"
                    />
                    <span className="relative transition-colors group-hover:text-[#111318]">Open the workspace</span>
                  </Link>
                  <a
                    href="#demo"
                    className="link-under inline-flex min-h-[48px] items-center px-1 font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink)]"
                  >
                    See a finished report
                  </a>
                </div>

                <p className="mt-7 max-w-md border-l-2 border-[color:var(--mark)] pl-3 text-[11px] leading-relaxed text-[color:var(--ink-3)]">
                  Sentinel reviews and explains. It never publishes, never auto-fixes, and never changes a
                  rule without a manager’s click. Legal reviewer output is an AI risk perspective, not
                  legal advice.
                </p>
              </div>

              {/* the focal object — an engraved seal; the model, if any, loads later */}
              <SealStage />
            </div>
          </div>

          {/* the four honest figures */}
          <div className="relative border-t border-[color:var(--hairline)] bg-[color:var(--paper-2)]">
            <dl className="mx-auto grid max-w-[1240px] grid-cols-2 divide-[color:var(--hairline)] px-5 sm:grid-cols-4 sm:divide-x lg:px-8">
              {FACTS.map((fact) => (
                <div key={fact.label} className="border-b border-[color:var(--hairline)] px-1 py-5 sm:border-b-0 sm:px-5 first:sm:pl-0">
                  <dt className="sr-only">{fact.label}</dt>
                  <dd>
                    <span className="block font-mono text-2xl font-semibold leading-none tabular-nums text-[color:var(--ink)]">
                      {fact.value}
                    </span>
                    <span className="mt-1.5 block text-xs text-[color:var(--ink)]">{fact.label}</span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
                      {fact.evidence}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mx-auto max-w-[1240px] px-5 pb-4 text-[11px] leading-relaxed text-[color:var(--ink-3)] lg:px-8">
              These are counts from the running product and the repository, shown with how each was
              obtained. There are no customers, logos, testimonials or awards on this page because we
              have none to show you yet — when there are, they will be named.
            </p>
          </div>
        </section>

        {/* ============================================================= marquee */}
        <section aria-labelledby="flagged-title" className="border-b border-[color:var(--hairline)]">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-8 lg:px-8">
            <h2 id="flagged-title" className="font-mono text-2xs uppercase tracking-[0.18em] text-[color:var(--ink-3)]">
              Phrases the reviewers flag, out of the box
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
              lifted from the labelled sample set the test suite runs against
            </p>
          </div>
          <Marquee />
        </section>

        {/* =========================================================== committee */}
        <section id="committee" aria-labelledby="committee-title" className="border-b border-[color:var(--hairline)]">
          <div className="mx-auto max-w-[1240px] px-5 py-16 lg:px-8 lg:py-24">
            <Reveal>
              <Marker n="02">The committee</Marker>
              <h2 id="committee-title" className="mt-3 max-w-3xl text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.04] tracking-[-0.03em]">
                Six readers, one <span className="em-italic">charter.</span>
              </h2>
              <p className="prose-measure mt-4 text-base leading-relaxed text-[color:var(--ink-2)]">
                Each reviewer has a single question and one job. They do not average their opinions into
                a score: every finding is attributed, so a person can agree with one reviewer and
                overrule another.
              </p>
            </Reveal>

            <Reveal delay={60} className="mt-12">
              <ReviewFloor />
            </Reveal>
          </div>
        </section>

        {/* ================================================================ demo */}
        <section id="demo" aria-labelledby="demo-title" className="border-b border-[color:var(--hairline)] bg-[color:var(--paper-2)]">
          <div className="mx-auto max-w-[1240px] px-5 py-16 lg:px-8 lg:py-24">
            <Reveal>
              <Marker n="03">The report</Marker>
              <h2 id="demo-title" className="mt-3 max-w-3xl text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.04] tracking-[-0.03em]">
                Hold a finding. See what it <span className="em-italic">suggests.</span>
              </h2>
              <p className="prose-measure mt-4 text-base leading-relaxed text-[color:var(--ink-2)]">
                This report is fixed and runs in your browser, so it works with the server asleep. Press
                and hold a finding to preview the rewrite — or focus the button and hold Space. Release
                and it is gone. There is no apply control here, and there is none in the product.
              </p>
            </Reveal>

            <Reveal delay={60} className="mt-10">
              <LiveDemo />
            </Reveal>

            <p className="mt-4 text-[11px] leading-relaxed text-[color:var(--ink-3)]">
              The sample sentence is the kind of draft the reviewers are built for. It is not a customer
              story, and nothing on this page was produced by a real brand team.
            </p>
          </div>
        </section>

        {/* ============================================================= reading */}
        <section id="reading" aria-labelledby="reading-title" className="border-b border-[color:var(--hairline)]">
          <div className="mx-auto max-w-[1240px] px-5 py-16 lg:px-8 lg:py-24">
            <Reveal>
              <Marker n="04">How it reads</Marker>
              <h2 id="reading-title" className="mt-3 max-w-3xl text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.04] tracking-[-0.03em]">
                Three movements, then a <span className="em-italic">signature.</span>
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
              <div className="lg:sticky lg:top-24 lg:self-start">
                <div className="desk-sheet relative mx-auto w-full max-w-[300px] rounded-[10px] border-[1.5px] border-[color:var(--hairline-strong)] bg-[color:var(--paper)] p-6 text-center">
                  <DeskSentri mood="reading" size={132} className="mx-auto" />
                  <p className="mt-2 text-base font-semibold text-[color:var(--ink)]">Sentri</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--ink-3)]">
                    Reads the whole draft, then the rule book, then the draft again.
                  </p>
                </div>
                <p className="mx-auto mt-4 max-w-[300px] font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-[color:var(--ink-3)]">
                  Sentri is drawn by hand in SVG. No stock illustration, no generated character.
                </p>
              </div>

              <ol className="space-y-10">
                {MOVEMENTS.map((movement, i) => (
                  <li key={movement.n} className="border-t border-[color:var(--hairline-strong)] pt-5">
                    <Reveal delay={i * 60}>
                      <div className="flex items-baseline gap-4">
                        <span className="font-mono text-[11px] tabular-nums tracking-[0.16em] text-[color:var(--ink-3)]">
                          {movement.n}
                        </span>
                        <h3 className="text-lg font-semibold leading-tight tracking-tight text-[color:var(--ink)]">
                          {movement.title}
                        </h3>
                      </div>
                      <p className="prose-measure mt-2 pl-8 text-sm leading-relaxed text-[color:var(--ink-2)]">
                        {movement.body}
                      </p>
                    </Reveal>
                  </li>
                ))}
              </ol>
            </div>

            {/* the gate, printed where a reader can see what publishing means */}
            <Reveal delay={80}>
              <div className="mt-14">
                <p className="mb-2 font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">
                  The gate, end to end
                </p>
                <GateStrip current={1} className="rounded-[8px]" />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============================================================== limits */}
        <section id="limits" aria-labelledby="limits-title" className="border-b border-[color:var(--hairline)] bg-[color:var(--paper-2)]">
          <div className="mx-auto max-w-[1240px] px-5 py-16 lg:px-8 lg:py-24">
            <Reveal>
              <Marker n="05">Limits</Marker>
              <h2 id="limits-title" className="mt-3 max-w-3xl text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.04] tracking-[-0.03em]">
                What it will not <span className="em-italic">do.</span>
              </h2>
            </Reveal>

            <Reveal delay={60}>
              <div className="mt-10 grid overflow-hidden rounded-[10px] border border-[color:var(--hairline-strong)] md:grid-cols-2">
                <div className="bg-[color:var(--paper)] p-6">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-[color:var(--ink)]">
                    <span aria-hidden="true" className="text-[color:var(--pass)]"><Icon name="check" size={16} /></span>
                    It will
                  </h3>
                  <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-[color:var(--ink-2)]">
                    {[
                      "quote the exact span it objects to, and name the rule",
                      "cite the section and page — or say “no approved source found”",
                      "attribute each finding to the reviewer who raised it",
                      "learn only from a manager’s explicit override, as a versioned exception",
                      "write every decision to one hash-chained, append-only log",
                    ].map((line) => (
                      <li key={line} className="flex gap-2.5">
                        <span aria-hidden="true" className="mt-1 shrink-0 text-[color:var(--pass)]">
                          <Icon name="check" size={13} />
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border-t border-[color:var(--hairline)] bg-[color:var(--paper-2)] p-6 md:border-l md:border-t-0">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-[color:var(--ink)]">
                    <span aria-hidden="true" className="text-[color:var(--mark-text)]"><Icon name="close" size={16} /></span>
                    It will not
                  </h3>
                  <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-[color:var(--ink-2)]">
                    {[
                      "publish, schedule or send anything",
                      "rewrite your text on its own — suggestions are previews, never edits",
                      "change a rule without a manager’s click",
                      "run two submissions against different rule sets and call the scores comparable",
                      "claim a measurement it has not made",
                    ].map((line) => (
                      <li key={line} className="flex gap-2.5">
                        <span aria-hidden="true" className="mt-1 shrink-0 text-[color:var(--mark-text)]">
                          <Icon name="close" size={13} />
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>

            {/* A note from the maker. Written in the maker's own voice: no name
                attached, no borrowed aphorism, no numbers it has not measured.
                Put your name in the byline and it is yours. */}
            <Reveal delay={90}>
              <figure className="mt-12 grid gap-8 border-t border-[color:var(--hairline)] pt-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
                <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
                  A note from the maker
                </p>

                <blockquote className="mt-4 max-w-[62ch] font-doc text-[1.15rem] leading-[1.72] text-[color:var(--ink)] sm:text-[1.3rem]">
                  <p>
                    Most copy does not fail loudly. It ships with one claim nobody could source, one
                    phrase the style guide dropped years ago, one number that was true last quarter.
                    The review that would have caught it usually has no time to happen.
                  </p>
                  <p className="mt-4">
                    Sentinel is that review, kept honest. It reads the way a careful colleague reads —
                    pointing at the exact line, naming the rule, showing where the rule came from — and
                    then it stops, because the judgement is not the software’s to make.
                  </p>
                  <p className="mt-4">
                    Nothing here publishes, rewrites, or changes a rule on its own. What it does is make
                    the decision cheap: everything on the table, in one place, with the evidence
                    attached — so the person who signs it off can say yes or no with{" "}
                    <span className="em-italic">reasons</span>, not instinct.
                  </p>
                </blockquote>

                <figcaption className="mt-6 flex flex-wrap items-center gap-3 text-xs text-[color:var(--ink-3)]">
                  <span aria-hidden="true" className="h-px w-8 bg-[color:var(--hairline-strong)]" />
                  <span>Demo workspace: Northwind Analytics, a fictional brand.</span>
                </figcaption>
                </div>

                {/* Marginal colophon: carries the mark, keeps the right of the
                    measure from reading as unfinished, and stacks under the note
                    at narrow widths. */}
                <div className="flex items-start gap-3 self-start lg:justify-self-end lg:pt-1">
                  <DeskMark size={22} className="mt-0.5 shrink-0 text-[color:var(--ink-3)]" />
                  <div className="lg:text-right">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
                      01 — why this exists
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--ink-3)]">
                      The person who built this desk.
                    </p>
                  </div>
                </div>
              </figure>
            </Reveal>
          </div>
        </section>

        {/* ================================================================ close */}
        <section className="border-b border-[color:var(--hairline)]">
          <div className="mx-auto max-w-[1240px] px-5 py-16 text-center lg:px-8 lg:py-20">
            <h2 className="mx-auto max-w-2xl text-[clamp(1.9rem,4.4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
              Every word, <span className="em-italic">accounted for.</span>
            </h2>
            <p className="prose-measure mx-auto mt-4 text-base leading-relaxed text-[color:var(--ink-2)]">
              The best way to see it is to load the demonstration workspace: 53 submissions, real
              findings, and the six reviewers doing what they do. It takes about a minute on the local
              engine.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/login"
                className="group relative inline-flex min-h-[48px] items-center overflow-hidden rounded-[6px] border border-[color:var(--ink)] bg-[color:var(--ink)] px-6 font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 origin-left scale-x-0 bg-[color:var(--highlight)] transition-transform duration-200 ease-out group-hover:scale-x-100"
                />
                <span className="relative transition-colors group-hover:text-[#111318]">Load the workspace</span>
              </Link>
              <a
                href="#committee"
                className="link-under inline-flex min-h-[48px] items-center px-2 font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink)]"
              >
                Meet the six reviewers
              </a>
            </div>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-3)]">
              {REVIEWERS.length} reviewers · 8 roles · one audit log
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
