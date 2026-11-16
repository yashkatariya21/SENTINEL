"use client";
/**
 * The walkthrough — every room in the desk, on one page.
 *
 * It lives on Settings rather than on the front page: a visitor deciding whether
 * the product is worth a look should read the brief, not a table of contents, and
 * a reviewer who wants the map can find it where the other "about this workspace"
 * things are.
 *
 * A room is ticked only once this browser has actually opened it: the shell writes
 * `sentinel.walkthrough.visited` on every desk page, and this component reads it.
 * Nothing is claimed that did not happen, and the ticks are browser state only.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { TOUR, readVisited } from "@/lib/tour";
import { Icon } from "./Icon";

export function Walkthrough({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const [visited, setVisited] = useState<string[]>([]);

  useEffect(() => setVisited(readVisited()), [pathname]);

  const done = TOUR.filter((room) => visited.includes(room.href));
  const remaining = TOUR.filter((room) => !visited.includes(room.href));
  const next = remaining[0];
  const started = done.length > 0;

  return (
    <section aria-labelledby="walkthrough-title" id="walkthrough">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 id="walkthrough-title" className="text-base font-semibold tracking-tight text-[color:var(--ink)]">
            Walkthrough — every room in the desk
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--ink-2)]">
            {TOUR.length} rooms, in the order worth walking.{" "}
            {started
              ? `${done.length} of ${TOUR.length} opened in this browser.`
              : "None opened yet — the ticks are kept in this browser only."}
          </p>
        </div>
        {next && (
          <Link
            href={next.href}
            className="flex-none rounded-[5px] border border-[color:var(--ink)] bg-[color:var(--ink)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--paper)] transition-colors hover:bg-[color:var(--mark)] hover:text-[#111318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
          >
            {started ? `Next: ${next.label} →` : "Start the walkthrough →"}
          </Link>
        )}
      </div>

      <ol className={`mt-3 divide-y divide-[color:var(--hairline)] border-y border-[color:var(--hairline)] ${compact ? "" : ""}`}>
        {TOUR.map((room, i) => {
          const isDone = visited.includes(room.href);
          const here = pathname === room.href;
          return (
            <li key={room.href} className="flex items-center gap-3 py-2">
              <span
                aria-hidden="true"
                className={`grid h-5 w-5 flex-none place-items-center rounded-full border font-mono text-[10px] tabular-nums ${
                  isDone
                    ? "border-[color:var(--pass-graphic)] bg-[color:var(--pass-tint)] text-[color:var(--pass)]"
                    : "border-[color:var(--hairline-strong)] text-[color:var(--ink-3)]"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </span>
              <p className="min-w-0 flex-1 text-sm leading-snug">
                <span className={`font-medium ${isDone ? "text-[color:var(--ink-2)]" : "text-[color:var(--ink)]"}`}>
                  {room.label}
                </span>
                {here && (
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
                    you are here
                  </span>
                )}
                <span className="sr-only">{isDone ? " — opened" : " — not opened yet"}</span>
                <span className="ml-2 hidden text-xs text-[color:var(--ink-2)] sm:inline">{room.todo}</span>
                <span className="mt-0.5 block text-xs text-[color:var(--ink-2)] sm:hidden">{room.todo}</span>
              </p>
              <Link
                href={room.href}
                className="flex-none whitespace-nowrap rounded-[5px] border border-[color:var(--hairline-strong)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink)] transition-colors hover:bg-[color:var(--ink)] hover:text-[color:var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              >
                Open <Icon name="arrow" size={11} className="ml-0.5 inline-block" />
              </Link>
            </li>
          );
        })}
      </ol>

      <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--ink-3)]">
        Opening a room changes nothing about the workspace. Nothing here publishes, auto-fixes or
        changes a rule on its own.
      </p>
    </section>
  );
}
