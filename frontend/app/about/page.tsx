import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../components/landing/SiteHeader";
import { SiteFooter } from "../components/landing/SiteFooter";
import { DeskBackground } from "../components/DeskBackground";

export const metadata: Metadata = {
  title: "About — Sentinel AI",
  description:
    "What Sentinel AI is, the three things it improves, where the design comes from, what it is built with, and how AI tools were used to build it.",
  robots: { index: true, follow: true },
};

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || "";

const STACK: [string, string][] = [
  ["Frontend", "Next.js 14 (App Router) + React 18 + Tailwind"],
  ["Backend", "Python 3.12 FastAPI, REST/JSON under /v1"],
  ["Data", "PostgreSQL 16 + pgvector (SQLite fallback for local and demo)"],
  ["Auth", "JWT (local HS256) or Supabase/Clerk JWKS verification"],
  ["AI", "Provider-agnostic adapter: offline deterministic engine (default) or a hosted LLM, server-side only"],
  ["Parsing", "PyMuPDF, python-docx, Pillow, OCR (pytesseract + tesseract)"],
  ["Tests", "pytest suite, a rule-engine regression benchmark, a held-out set and an LLM evaluation harness"],
];

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="border-b border-[color:var(--hairline)] py-10 first:pt-0">
      <p className="font-mono text-2xs uppercase tracking-[0.2em] text-[color:var(--ink-3)]">{eyebrow}</p>
      <h2 id={`${id}-title`} className="mt-2 text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ink)]">
        {title}
      </h2>
      <div className="mt-3 max-w-[68ch] space-y-3 text-[15px] leading-relaxed text-[color:var(--ink-2)]">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="relative min-h-screen bg-[color:var(--canvas)] text-[color:var(--ink)]">
      <DeskBackground variant="public" />
      <SiteHeader />

      <main id="main" className="relative mx-auto max-w-[1240px] px-5 py-12 lg:px-8">
        <p className="font-mono text-2xs uppercase tracking-[0.24em] text-[color:var(--ink-3)]">About</p>
        <h1 className="mt-2 max-w-[22ch] text-[clamp(2rem,5vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
          A gate a person opens.
        </h1>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <Section id="what" eyebrow="01 — what it is" title="In three sentences">
              <p>
                Sentinel AI reviews brand content before it is published. Six specialist reviewers read each
                draft against the organisation&rsquo;s Brand Kit, and every finding quotes the rule it breaks,
                shows the evidence behind it and states a confidence score. The work then stops at a gate: a
                person accepts, edits, dismisses or escalates each finding, and nothing is ever published,
                auto-fixed or made into a rule without that decision.
              </p>
            </Section>

            <Section id="improvements" eyebrow="02 — what it improves" title="Three improvements, by name">
              <dl className="space-y-4">
                <div>
                  <dt className="font-semibold text-[color:var(--ink)]">AI Brand Review Committee</dt>
                  <dd className="mt-1">
                    Six reviewers — brand voice, terminology, facts, visual, accessibility and legal — each on
                    its own question, running in parallel and merging duplicate findings, instead of one
                    opaque score.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[color:var(--ink)]">Explainability by Design</dt>
                  <dd className="mt-1">
                    A finding without a rule and a source is not shown. Confidence is computed from stated
                    components and stored on the finding, so the number can be audited rather than believed.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[color:var(--ink)]">Adaptive Learning</dt>
                  <dd className="mt-1">
                    A manager&rsquo;s decision is the signal. Answering the learning prompt turns an override into
                    a new rule version with an author, a scope and a reason — and legal or accessibility rules
                    still need an Approver.
                  </dd>
                </div>
              </dl>
            </Section>

            <Section id="design" eyebrow="03 — design and originality" title="The Proof Desk is an original design language">
              <p>
                The interface is built on one idea: a draft is reviewed the way a proofreader reviews it. The
                document is the hero, every objection is a numbered mark in the text with a note in the margin,
                and the work stops at a gate. That language — the manuscript, the margin, the verdict stamp,
                the gate strip, the paper trail, the desk furniture with its measured contrast tokens — is
                original to this project. It is described in <code className="font-mono text-[13px]">docs/PROOF-DESK.md</code>
                {REPO_URL ? (
                  <>
                    {" "}
                    (
                    <a
                      className="link-under text-[color:var(--ink)]"
                      href={`${REPO_URL}/blob/main/docs/PROOF-DESK.md`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      read it
                    </a>
                    )
                  </>
                ) : null}
                , including its two themes and the measured contrast table behind every colour pair.
              </p>
              <p>
                Three patterns in the interface are standard rather than original, and are named here so the
                distinction is clear: a <strong>sidebar navigation</strong> rail, a{" "}
                <strong>command-palette search</strong> (⌘K), and a <strong>role switcher</strong> for the demo
                workspace. Everything else on the screen was designed for this product.
              </p>
            </Section>

            <Section id="stack" eyebrow="04 — built with" title="The stack">
              <dl className="divide-y divide-[color:var(--hairline)] border-y border-[color:var(--hairline)]">
                {STACK.map(([label, value]) => (
                  <div key={label} className="grid gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-[color:var(--ink-3)]">{label}</dt>
                    <dd className="text-sm text-[color:var(--ink-2)]">{value}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section id="ai" eyebrow="05 — ai assistance" title="How this was made">
              <p>
                AI tools assisted with parts of the code and the written documentation in this project. The
                author reviewed and tested everything that shipped: the test suite, the evaluation harnesses and
                the contrast measurements are the evidence, and where something could not be measured it is
                labelled as not measured rather than estimated.
              </p>
              <p>
                The product itself is a review aid, not an authority. Legal reviewer output is an AI risk
                perspective, not legal advice, and every final decision is a person&rsquo;s.
              </p>
            </Section>
          </div>

          <aside className="min-w-0">
            <div className="rounded-[10px] border border-[color:var(--hairline)] bg-[color:var(--paper)] p-4">
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">On this page</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {[
                  ["#what", "What it is"],
                  ["#improvements", "Three improvements"],
                  ["#design", "Design and originality"],
                  ["#stack", "Built with"],
                  ["#ai", "AI assistance"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <a href={href} className="link-under text-[color:var(--ink-2)] hover:text-[color:var(--ink)]">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-3 rounded-[10px] border border-[color:var(--hairline)] bg-[color:var(--paper-2)] p-4">
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">Elsewhere</p>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--ink-2)]">
                <Link href="/trust" className="link-under text-[color:var(--ink)]">
                  Security, privacy and terms
                </Link>{" "}
                — what the system does with your content, and what it refuses to do.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--ink-2)]">
                <Link href="/evaluation" className="link-under text-[color:var(--ink)]">
                  Evaluation
                </Link>{" "}
                — the measured numbers, with the sample sizes they were measured on.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
