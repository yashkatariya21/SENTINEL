"use client";
/** The public header: wordmark, four anchors, the shift switch, one way in. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { DeskMark, Wordmark } from "../Desk";
import { ThemeSwitch } from "../ThemeSwitch";

const LINKS = [
  { href: "#committee", label: "The committee" },
  { href: "#reading", label: "How it reads" },
  { href: "#demo", label: "The report" },
  { href: "#limits", label: "What it won’t do" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-colors duration-ui ${
        scrolled ? "border-[color:var(--hairline)] bg-[color:var(--paper)]/95 backdrop-blur" : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-5 lg:px-8">
        <Link href="/welcome" className="flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]">
          <Wordmark />
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="link-under font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-3)] transition-colors hover:text-[color:var(--ink)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeSwitch />
          <Link
            href="/login"
            className="group relative inline-flex min-h-[40px] items-center overflow-hidden rounded-[2px] border border-[color:var(--ink)] px-3.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink)] transition-colors duration-200 hover:text-[color:var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 -translate-x-full bg-[color:var(--ink)] transition-transform duration-200 ease-out group-hover:translate-x-0"
            />
            <span className="relative">Open the workspace</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
