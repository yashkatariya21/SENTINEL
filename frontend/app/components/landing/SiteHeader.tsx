"use client";
/** The public header: wordmark, four anchors, the shift switch, one way in. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Crest } from "../brand/Crest";
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
        scrolled ? "border-gold/40 bg-paper/92 backdrop-blur" : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-5 lg:px-8">
        <Link href="/welcome" className="flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
          <Crest size={28} tone="gold" />
          <span className="font-crest text-sm font-semibold uppercase tracking-[0.2em] text-navy">
            Sentinel AI
          </span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="link-under font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft transition-colors duration-micro hover:text-navy"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeSwitch />
          <Link
            href="/login"
            className="group relative inline-flex min-h-[40px] items-center overflow-hidden rounded-[2px] border border-navy px-3.5 font-mono text-[10px] uppercase tracking-[0.18em] text-navy transition-colors duration-ui hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 -translate-x-full bg-navy transition-transform duration-ui ease-royal group-hover:translate-x-0"
            />
            <span className="relative">Open the workspace</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
