import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../components/landing/SiteHeader";
import { SiteFooter } from "../components/landing/SiteFooter";
import { ReviewFloor } from "../components/landing/ReviewFloor";
import { LiveDemo } from "../components/landing/LiveDemo";
import { Marquee } from "../components/landing/Marquee";
import { Reveal } from "../components/landing/Reveal";
import { SealStage } from "../components/landing/SealStage";
import { EntrySequence } from "../components/EntrySequence";
import { Sentri } from "../components/brand/Sentri";
import { CornerFan, PatternDivider } from "../components/brand/Crest";
import { Damask } from "../components/brand/Pattern";
import { FACTS, MOVEMENTS, REVIEWERS } from "@/lib/landing";

export const metadata: Metadata = {
  title: "Sentinel AI — read before it ships",
  description:
    "Six specialist reviewers read every draft against your Brand Kit. Every finding quotes the rule, shows its source, and waits for a person. It never publishes.",
  robots: { index: true, follow: true },
};

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <EntrySequence />
      <SiteHeader />

      <main id="main">
        {/* ================================================================ hero */}
        <section className="relative isolate overflow-hidden border-b border-gold/25">
          <Damask
            className="pointer-events-none absolute -right-24 -top-24 h-[520px] w-[520px] text-gold"
            opacity={0.05}
          />
          <div className="mx-auto max-w-[1240px] px-5 pb-14 pt-10 lg:px-8 lg:pb-20 lg:pt-14">
            <p className="eyebrow flex items-center gap-2">
              <span className="eyebrow-num">No. 01</span>
              <span aria-hidden="true" className="h-px w-6 bg-gold-deep/60" />
              Pre-publication brand governance
            </p>

            {/* the headline runs the full width — it is the loudest thing on the page */}
            <h1 className="display-hero mt-4 text-navy">
              Read before
              <span className="block">
                <span className="em-italic">it ships.</span>
              </span>
            </h1>

            <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start lg:gap-14">
              <div>
                <p className="prose-measure text-base text-ink-soft">
                  Six specialist reviewers read every draft against your Brand Kit — voice, terminology,
                  facts, visual, accessibility, legal. Each finding quotes the exact words, names the rule,
                  and cites the page it came from. Then a person decides.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <Link
                    href="/login"
                    className="group relative inline-flex min-h-[48px] items-center overflow-hidden rounded-[2px] bg-navy px-5 text-xs font-semibold uppercase tracking-[0.16em] text-ivory transition-shadow duration-ui hover:shadow-herald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 origin-left scale-x-0 bg-gradient-to-r from-gold-deep to-gold transition-transform duration-ui ease-royal group-hover:scale-x-100"
                    />
                    <span className="relative">Open the workspace</span>
                  </Link>
                  <a
                    href="#demo"
                    className="link-under inline-flex min-h-[48px] items-center px-1 text-xs font-semibold uppercase tracking-[0.16em] text-navy"
                  >
                    See a finished report
                  </a>
                </div>

                <p className="mt-7 max-w-md border-l-2 border-gold/60 pl-3 text-2xs leading-relaxed text-ink-mute">
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
          <div className="border-t border-gold/25 bg-ivory-deep/40">
            <dl className="mx-auto grid max-w-[1240px] grid-cols-2 divide-gold/25 px-5 sm:grid-cols-4 sm:divide-x lg:px-8">
              {FACTS.map((fact) => (
                <div key={fact.label} className="border-b border-gold/25 px-1 py-5 sm:border-b-0 sm:px-5 first:sm:pl-0">
                  <dt className="sr-only">{fact.label}</dt>
                  <dd>
                    <span className="block font-display text-2xl font-semibold leading-none tabular-nums text-navy">
                      {fact.value}
                    </span>
                    <span className="mt-1.5 block text-xs text-ink">{fact.label}</span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
                      {fact.evidence}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mx-auto max-w-[1240px] px-5 pb-4 text-[11px] leading-relaxed text-ink-mute lg:px-8">
              These are counts from the running product and the repository, shown with how each was
              obtained. There are no customers, logos, testimonials or awards on this page because we
              have none to show you yet — when there are, they will be named.
            </p>
          </div>
        </section>

        {/* ============================================================= marquee */}
        <section aria-labelledby="flagged-title" className="border-b border-gold/25">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-8 lg:px-8">
            <h2 id="flagged-title" className="eyebrow">
              Phrases the reviewers flag, out of the box
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
              lifted from the labelled sample set the test suite runs against
            </p>
          </div>
          <Marquee />
        </section>

        {/* =========================================================== committee */}
        <section id="committee" aria-labelledby="committee-title" className="border-b border-gold/25">
          <div className="mx-auto max-w-[1240px] px-5 py-16 lg:px-8 lg:py-24">
            <Reveal>
              <p className="eyebrow flex items-center gap-2">
                <span className="eyebrow-num">02 / The committee</span>
                <span aria-hidden="true" className="h-px w-8 bg-gold-deep/60" />
              </p>
              <h2 id="committee-title" className="display-section mt-3 max-w-3xl text-navy">
                Six readers, one <span className="em-italic">charter.</span>
              </h2>
              <p className="prose-measure mt-4 text-base text-ink-soft">
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
        <section id="demo" aria-labelledby="demo-title" className="border-b border-gold/25 bg-ivory-deep/30">
          <div className="mx-auto max-w-[1240px] px-5 py-16 lg:px-8 lg:py-24">
            <Reveal>
              <p className="eyebrow flex items-center gap-2">
                <span className="eyebrow-num">03 / The report</span>
                <span aria-hidden="true" className="h-px w-8 bg-gold-deep/60" />
              </p>
              <h2 id="demo-title" className="display-section mt-3 max-w-3xl text-navy">
                Hold a finding. See what it <span className="em-italic">suggests.</span>
              </h2>
              <p className="prose-measure mt-4 text-base text-ink-soft">
                This report is fixed and runs in your browser, so it works with the server asleep. Press
                and hold a finding to preview the rewrite — or focus the button and hold Space. Release
                and it is gone. There is no apply control here, and there is none in the product.
              </p>
            </Reveal>

            <Reveal delay={60} className="mt-10">
              <LiveDemo />
            </Reveal>

            <p className="mt-4 text-[11px] leading-relaxed text-ink-mute">
              The sample sentence is the kind of draft the reviewers are built for. It is not a customer
              story, and nothing on this page was produced by a real brand team.
            </p>
          </div>
        </section>

        {/* ============================================================= reading */}
        <section id="reading" aria-labelledby="reading-title" className="border-b border-gold/25">
          <div className="mx-auto max-w-[1240px] px-5 py-16 lg:px-8 lg:py-24">
            <Reveal>
              <p className="eyebrow flex items-center gap-2">
                <span className="eyebrow-num">04 / How it reads</span>
                <span aria-hidden="true" className="h-px w-8 bg-gold-deep/60" />
              </p>
              <h2 id="reading-title" className="display-section mt-3 max-w-3xl text-navy">
                Three movements, then a <span className="em-italic">signature.</span>
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
              <div className="lg:sticky lg:top-24 lg:self-start">
                <div className="relative mx-auto w-full max-w-[300px] rounded-[3px] border border-gold/40 bg-ivory p-6 text-center shadow-herald">
                  <CornerFan size={44} className="absolute -left-3 -top-3 text-gold/60" />
                  <CornerFan size={44} className="absolute -bottom-3 -right-3 rotate-180 text-gold/60" />
                  <Sentri mood="scanning" size={132} className="mx-auto" />
                  <p className="mt-2 font-display text-base font-semibold text-navy">Sentri</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">
                    Reads the whole draft, then the rule book, then the draft again.
                  </p>
                </div>
                <p className="mx-auto mt-4 max-w-[300px] font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-ink-mute">
                  Sentri is drawn by hand in SVG. No stock illustration, no generated character.
                </p>
              </div>

              <ol className="space-y-10">
                {MOVEMENTS.map((movement, i) => (
                  <li key={movement.n} className="border-t border-gold/30 pt-5">
                    <Reveal delay={i * 60}>
                      <div className="flex items-baseline gap-4">
                        <span className="font-mono text-[11px] tabular-nums tracking-[0.16em] text-gold-deep">
                          {movement.n}
                        </span>
                        <h3 className="font-display text-xl font-semibold leading-tight text-navy">
                          {movement.title}
                        </h3>
                      </div>
                      <p className="prose-measure mt-2 pl-8 text-sm text-ink-soft">{movement.body}</p>
                    </Reveal>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ============================================================== limits */}
        <section id="limits" aria-labelledby="limits-title" className="border-b border-gold/25 bg-ivory-deep/30">
          <div className="mx-auto max-w-[1240px] px-5 py-16 lg:px-8 lg:py-24">
            <Reveal>
              <p className="eyebrow flex items-center gap-2">
                <span className="eyebrow-num">05 / Limits</span>
                <span aria-hidden="true" className="h-px w-8 bg-gold-deep/60" />
              </p>
              <h2 id="limits-title" className="display-section mt-3 max-w-3xl text-navy">
                What it will not <span className="em-italic">do.</span>
              </h2>
            </Reveal>

            <Reveal delay={60}>
              <div className="mt-10 grid gap-px overflow-hidden rounded-[3px] border border-gold/35 bg-gold/25 md:grid-cols-2">
                <div className="bg-ivory p-6">
                  <h3 className="font-display text-base font-semibold text-navy">It will</h3>
                  <ul className="mt-3 space-y-2.5 text-sm text-ink-soft">
                    {[
                      "quote the exact span it objects to, and name the rule",
                      "cite the section and page — or say “no approved source found”",
                      "attribute each finding to the reviewer who raised it",
                      "learn only from a manager’s explicit override, as a versioned exception",
                      "write every decision to one hash-chained, append-only log",
                    ].map((line) => (
                      <li key={line} className="flex gap-2.5">
                        <span aria-hidden="true" className="mt-[2px] shrink-0 font-mono text-[11px] text-confirmed">
                          ✓
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-ivory p-6">
                  <h3 className="font-display text-base font-semibold text-navy">It will not</h3>
                  <ul className="mt-3 space-y-2.5 text-sm text-ink-soft">
                    {[
                      "publish, schedule or send anything",
                      "rewrite your text on its own — suggestions are previews, never edits",
                      "change a rule without a manager’s click",
                      "run two submissions against different rule sets and call the scores comparable",
                      "claim a measurement it has not made",
                    ].map((line) => (
                      <li key={line} className="flex gap-2.5">
                        <span aria-hidden="true" className="mt-[2px] shrink-0 font-mono text-[11px] text-critical">
                          ✕
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>

            {/* the founder note: not written for us, so it is marked, not invented */}
            <Reveal delay={90}>
              <figure className="mt-10 border-l-2 border-gold pl-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-deep">
                  {"// TODO — founder’s note pending"}
                </p>
                <blockquote className="mt-2 max-w-[56ch] font-display text-lg italic leading-relaxed text-ink">
                  A note from the person who built this is meant to sit here. It has not been supplied, so
                  this page will not invent one — no borrowed aphorism, no name attached to words nobody
                  wrote.
                </blockquote>
                <figcaption className="mt-2 text-xs text-ink-mute">
                  Placeholder, visible on purpose. Replace with the founder’s own words before launch.
                </figcaption>
              </figure>
            </Reveal>
          </div>
        </section>

        {/* ================================================================ close */}
        <section className="border-b border-gold/25">
          <div className="mx-auto max-w-[1240px] px-5 py-16 text-center lg:px-8 lg:py-20">
            <PatternDivider className="mx-auto mb-8 max-w-sm text-gold/60" />
            <h2 className="display-section mx-auto max-w-2xl text-navy">
              Every word, <span className="em-italic">accounted for.</span>
            </h2>
            <p className="prose-measure mx-auto mt-4 text-base text-ink-soft">
              The best way to see it is to load the demonstration workspace: 53 submissions, real
              findings, and the six reviewers doing what they do. It takes about a minute on the local
              engine.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/login"
                className="group relative inline-flex min-h-[48px] items-center overflow-hidden rounded-[2px] bg-navy px-6 text-xs font-semibold uppercase tracking-[0.16em] text-ivory transition-shadow duration-ui hover:shadow-herald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 origin-left scale-x-0 bg-gradient-to-r from-gold-deep to-gold transition-transform duration-ui ease-royal group-hover:scale-x-100"
                />
                <span className="relative">Load the workspace</span>
              </Link>
              <a
                href="#committee"
                className="link-under inline-flex min-h-[48px] items-center px-2 text-xs font-semibold uppercase tracking-[0.16em] text-navy"
              >
                Meet the six reviewers
              </a>
            </div>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">
              {REVIEWERS.length} reviewers · 8 roles · one audit log
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
