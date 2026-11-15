import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../components/landing/SiteHeader";
import { SiteFooter } from "../components/landing/SiteFooter";
import { DeskBackground } from "../components/DeskBackground";

export const metadata: Metadata = {
  title: "Security, privacy and terms — Sentinel AI",
  description:
    "How Sentinel AI isolates organisations, what roles can do, what the audit log proves, what leaves the system and when, and the terms this demo is offered under.",
  robots: { index: true, follow: true },
};

const ROWS: [string, string][] = [
  [
    "Organisation isolation",
    "Every query is filtered by your organisation, and asking for another organisation's object returns 404 rather than 403, so nothing can be probed. On PostgreSQL a second, independent row-level-security layer enforces the same boundary.",
  ],
  [
    "Roles",
    "Seven roles — Admin, Brand Manager, Approver, Manager, Creator, External Creator and the demo role switcher — each checked on the server for every action, not merely hidden in the interface. A Creator sees only their own content; an External Creator sees only their own, and only external comments.",
  ],
  [
    "Audit log",
    "Every action writes an append-only entry that commits to the entry before it (a hash chain). There is no route to edit or delete an entry, and the app's database role has those privileges revoked. Tampering is detectable, which is what makes the log evidence rather than a diary.",
  ],
  [
    "Nothing publishes",
    "There is no publish, schedule, webhook or channel integration anywhere in the API. Sentinel reviews and explains; releasing content stays with whatever tool you already publish from.",
  ],
  [
    "No auto-fix, no automatic rule change",
    "Suggestions are text beside the flagged span; the server never rewrites your content. A rule changes only through an explicit action that writes a new version and an audit entry, and legal or accessibility rules need a second, Approver-level gate.",
  ],
  [
    "Confidential documents skip external model calls",
    "A content item can be marked confidential. Such a document never leaves the system: the review runs on the offline engine and the run records that external calls were skipped, and why.",
  ],
  [
    "What leaves the system, and when",
    "Only when a hosted model is configured (LLM_PROVIDER is not `local`) and the content is not marked confidential, the text and the retrieved Brand Kit excerpts for that review are sent to that provider. Nothing else leaves: API keys stay server-side, are never logged and never reach the browser, which only talks to its own origin and proxies /v1 to the API.",
  ],
];

function Block({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 border-b border-[color:var(--hairline)] py-10">
      <p className="font-mono text-2xs uppercase tracking-[0.2em] text-[color:var(--ink-3)]">{eyebrow}</p>
      <h2 id={`${id}-title`} className="mt-2 text-[1.6rem] font-semibold leading-tight tracking-[-0.02em]">
        {title}
      </h2>
      <div className="mt-3 max-w-[68ch] space-y-3 text-[15px] leading-relaxed text-[color:var(--ink-2)]">{children}</div>
    </section>
  );
}

export default function TrustPage() {
  return (
    <div className="relative min-h-screen bg-[color:var(--canvas)] text-[color:var(--ink)]">
      <DeskBackground variant="public" />
      <SiteHeader />

      <main id="main" className="relative mx-auto max-w-[1240px] px-5 py-12 lg:px-8">
        <p className="font-mono text-2xs uppercase tracking-[0.24em] text-[color:var(--ink-3)]">Trust</p>
        <h1 className="mt-2 max-w-[24ch] text-[clamp(2rem,5vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
          What this system does with your words.
        </h1>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[color:var(--ink-2)]">
          This is a plain-language summary of <code className="font-mono text-[13px]">docs/SECURITY-AND-RESPONSIBLE-AI.md</code>{" "}
          in the repository. The document is the fuller account, including the tests that hold each claim.
        </p>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <Block id="security" eyebrow="01 — security and responsible ai" title="The guarantees, in plain language">
              <dl className="divide-y divide-[color:var(--hairline)] border-y border-[color:var(--hairline)]">
                {ROWS.map(([label, value]) => (
                  <div key={label} className="grid gap-1 py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="font-mono text-2xs uppercase leading-relaxed tracking-[0.12em] text-[color:var(--ink-3)]">
                      {label}
                    </dt>
                    <dd className="text-sm leading-relaxed text-[color:var(--ink-2)]">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="pt-2">
                Known limits are stated rather than hidden: rate limiting is in-process and per-IP, there is no
                SSO/SCIM, uploads are validated by type and size but not virus-scanned, and hosted-provider
                verification does not sync users into the workspace.
              </p>
            </Block>

            <Block id="privacy" eyebrow="02 — privacy" title="Privacy">
              <p>
                <strong>This deployment is a demo.</strong> It is seeded with a fictional company, Northwind
                Analytics, and fictional content. Do not enter confidential, personal or client data into it: the
                demo workspace is shared, it can be reset, and anything you upload there is treated as
                demonstration material.
              </p>
              <p>
                In a real deployment of your own, your content stays in your database and your storage; it is
                sent to a model provider only under the conditions named above, and an Admin can delete a
                document, a content item or the entire organisation, which removes every organisation-scoped row.
                There is no analytics or advertising telemetry in this application, and the browser makes no
                third-party requests — fonts are self-hosted.
              </p>
              <p>
                Retention is a deployment decision, not something this page can promise for you. The
                aggregation window in analytics affects reporting only, never storage.
              </p>
            </Block>

            <Block id="terms" eyebrow="03 — terms" title="Terms">
              <p>
                <strong>No warranty.</strong> This is a demonstration project provided as-is, without warranty of
                any kind, express or implied, including fitness for a particular purpose. It is not a substitute
                for legal, compliance or accessibility review by a qualified person.
              </p>
              <p>
                <strong>Not legal advice.</strong> The Legal reviewer gives an AI risk perspective on a piece of
                text. It is not legal advice, it does not create a lawyer-client relationship, and it must not be
                relied on as a legal opinion.
              </p>
              <p>
                <strong>You keep your content.</strong> Nothing here claims ownership of what you submit, and
                nothing here publishes it. You are responsible for having the right to upload what you upload.
              </p>
              <p>
                There is no company address, telephone number or support inbox on this page because this is a
                student project with no support desk behind it; inventing one would be worse than admitting its
                absence. Questions about the code belong in the repository.
              </p>
            </Block>
          </div>

          <aside className="min-w-0">
            <div className="rounded-[10px] border border-[color:var(--hairline)] bg-[color:var(--paper)] p-4">
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">On this page</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {[
                  ["#security", "Security and responsible AI"],
                  ["#privacy", "Privacy"],
                  ["#terms", "Terms"],
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
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">The short version</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[color:var(--ink-2)]">
                <li>It never publishes anything.</li>
                <li>It never edits your text or changes a rule on its own.</li>
                <li>Confidential items are never sent to a hosted model.</li>
                <li>Demo data is fictional — do not put real confidential data here.</li>
              </ul>
              <p className="mt-3 text-sm">
                <Link href="/about" className="link-under text-[color:var(--ink)]">
                  About this project
                </Link>
              </p>
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
