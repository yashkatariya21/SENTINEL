"use client";
/**
 * The site footer — the close of every public page.
 *
 * Four labelled columns on a hairline, then the colophon line. It is built from the same
 * furniture as the desk: mono eyebrow labels, a warm rule rather than a cool one, and no
 * fill behind the text, so it reads as the bottom of the sheet rather than a block of
 * chrome. Every link is a real `<a>`, the columns stack to one at 390 px, and the notices
 * are text — not a tooltip, not an icon that has to be discovered.
 *
 * It is deliberately NOT in the app shell: the workspace already has a status bar along
 * the bottom, and two fixed strips would fight for the same 28 px.
 */
import Link from "next/link";
import { useApiHealth, useApiMeta } from "@/lib/meta";
import { DeskMark } from "../Desk";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || "";

type Link = { href: string; label: string; external?: boolean; note?: string };

const PRODUCT: Link[] = [
  { href: "/welcome#committee", label: "How it works" },
  { href: "/evaluation", label: "Evaluation" },
  { href: "/rules", label: "Rules and learning" },
  { href: "/login", label: "Open the workspace" },
];

const TRUST: Link[] = [
  { href: "/trust#security", label: "Security and responsible AI" },
  { href: "/trust#privacy", label: "Privacy" },
  { href: "/trust#terms", label: "Terms" },
];

/** The API docs are served by FastAPI itself; next.config proxies `/api-docs` to it. */
const PROJECT: Link[] = [
  { href: "/about", label: "About" },
  ...(REPO_URL ? [{ href: REPO_URL, label: "Source code", external: true }] : []),
  { href: "/api-docs", label: "API docs", external: true },
];

const HEALTH_LABEL = { ok: "API online", down: "API unreachable", unknown: "checking API" } as const;

function Column({ heading, links, note }: { heading: string; links: Link[]; note?: React.ReactNode }) {
  return (
    <nav aria-label={heading} className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-3)]">
        {heading}
      </p>
      <ul className="mt-3 space-y-2">
        {links.map((link) =>
          link.external ? (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="link-under inline-block py-0.5 text-sm leading-snug text-[color:var(--ink-2)] transition-colors hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              >
                {link.label}
                <span aria-hidden="true" className="ml-1 font-mono text-[10px] text-[color:var(--ink-3)]">
                  ↗
                </span>
              </a>
            </li>
          ) : (
            <li key={link.label}>
              <Link
                href={link.href}
                className="link-under inline-block py-0.5 text-sm leading-snug text-[color:var(--ink-2)] transition-colors hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              >
                {link.label}
              </Link>
            </li>
          ),
        )}
      </ul>
      {note ? <div className="mt-3">{note}</div> : null}
    </nav>
  );
}

export function SiteFooter() {
  const health = useApiHealth(60_000);
  const meta = useApiMeta();
  const dot = health === "ok" ? "bg-[color:var(--pass-graphic)]" : health === "down" ? "bg-[color:var(--mark)]" : "bg-[color:var(--ink-faint)]";

  return (
    <footer
      aria-labelledby="site-footer-heading"
      className="relative z-10 border-t border-[color:var(--hairline)] bg-[color:var(--paper)]"
    >
      <div className="mx-auto max-w-[1240px] px-5 pb-6 pt-10 lg:px-8">
        <h2 id="site-footer-heading" className="sr-only">
          Sentinel AI — site footer
        </h2>

        {/* a hairline under the wordmark row, the way a sheet is ruled before it is written on */}
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-[color:var(--hairline)] pb-3">
          <Link
            href="/welcome"
            className="flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
          >
            <DeskMark size={18} className="text-[color:var(--ink)]" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--ink)]">
              Sentinel AI
            </span>
          </Link>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-3)]">
            Pre-publication brand governance · reviews, explains, never publishes
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.55fr)]">
          <Column heading="Product" links={PRODUCT} />
          <Column heading="Trust" links={TRUST} />
          <Column heading="Project" links={PROJECT} />

          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-3)]">
              Notice
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-2)]">
              Legal reviewer output is an AI risk perspective, not legal advice. Humans make every final
              decision. Demo data is fictional.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-[color:var(--hairline)] pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-3)] sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-3">
          <p className="min-w-0">
            Sentinel AI <span aria-hidden="true" className="mx-1.5">·</span> Round 3{" "}
            <span aria-hidden="true" className="mx-1.5">·</span> Built by YASH S, VIT Vellore
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tabular-nums">v{meta?.version ?? "1.0.0"}</span>
            <span aria-hidden="true" className="text-[color:var(--hairline)]">
              /
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`inline-block h-[6px] w-[6px] rounded-full ${dot}`} />
              <span className="sr-only">Status: </span>
              {HEALTH_LABEL[health]}
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
