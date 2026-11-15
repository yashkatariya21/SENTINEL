/** The close of the public page: wordmark, the doors, and a plain statement of scope. */
import Link from "next/link";
import { Wordmark } from "../Desk";

const COLUMNS = [
  {
    heading: "The product",
    links: [
      { href: "#committee", label: "The committee" },
      { href: "#reading", label: "How it reads" },
      { href: "#demo", label: "A finished report" },
      { href: "#limits", label: "Limits" },
    ],
  },
  {
    heading: "In the workspace",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/login", label: "Load the demo" },
      { href: "/brand/characters", label: "The cast" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-[#111318] text-[#F4F5F7]">
      <div className="mx-auto max-w-[1240px] px-5 py-12 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,0.8fr))]">
          <div>
            <Wordmark tone="paper" className="text-[#F4F5F7]" />
            <p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-[#C3CAD6]">
              Pre-publication brand governance for organisations that would rather be told before it
              ships than after.
            </p>
            <p className="mt-4 max-w-[42ch] border-t border-[#3A4149] pt-3 text-[11px] leading-relaxed text-[#9AA1AE]">
              Sentinel reviews and explains. It never publishes. Legal reviewer output is an AI risk
              perspective, not legal advice.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9AA1AE]">
                {column.heading}
              </p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="group inline-flex items-baseline gap-1.5 text-sm text-[#C3CAD6] transition-colors duration-micro hover:text-[#F4F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE066]"
                    >
                      <span className="roll">
                        <span>{link.label}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="inline-block -translate-x-1 opacity-0 transition duration-micro ease-royal group-hover:translate-x-0 group-hover:opacity-100"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-baseline justify-between gap-3 border-t border-[#3A4149] pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ivory/50">
          <span>Sentinel AI · the Chancery</span>
          <span>Built with a local engine — no paid APIs on this page</span>
        </div>
      </div>
    </footer>
  );
}
