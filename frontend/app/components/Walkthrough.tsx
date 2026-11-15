"use client";
/**
 * The walkthrough — one box that lists every room in the desk, so a visitor can
 * look at all of it instead of guessing at the sidebar.
 *
 * Two modes, one list:
 *
 * * **public** (on the brief, before anyone is signed in) — the rooms are described
 *   and each one is a link. With no session the link remembers where the visitor
 *   wanted to go and sends them to the sign-in, so the first thing they see after
 *   signing in is the room they clicked, not the overview.
 * * **desk** (on the overview, signed in) — the same list, plus a tick on the rooms
 *   this browser has actually opened and a "next unvisited" button. The counts come
 *   from `localStorage`, so nothing is claimed that was not visited.
 *
 * Dismissible on the overview only; the public brief always shows it, because a
 * first-time visitor cannot know it is there otherwise.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getToken } from "@/lib/api";
import { rememberNext } from "@/lib/auth";
import { TOUR, markVisited, readVisited } from "@/lib/tour";
import { Icon } from "./Icon";

const DISMISS_KEY = "sentinel.walkthrough.dismissed";

export function Walkthrough({
  variant = "desk",
  onDismiss,
}: {
  variant?: "public" | "desk";
  onDismiss?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [visited, setVisited] = useState<string[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  /* Reads the two browser facts it needs after mount: a token (so the desk copy can
     say "signed in" honestly) and the rooms already opened. Both are localStorage,
     which does not exist during the server render. */
  useEffect(() => {
    setSignedIn(Boolean(getToken()));
    if (variant === "desk" && pathname) markVisited(pathname);
    setVisited(readVisited());
  }, [pathname, variant]);

  const open = useCallback(
    (href: string) => {
      // Anonymous: remember the room and go to the sign-in, which comes back here.
      if (!getToken() && variant === "public") {
        rememberNext(href);
        router.push("/login");
        return;
      }
      router.push(href);
    },
    [router, variant],
  );

  const done = TOUR.filter((room) => visited.includes(room.href));
  const remaining = TOUR.filter((room) => !visited.includes(room.href));
  const next = variant === "desk" ? remaining[0] : TOUR[0];
  const publicMode = variant === "public";

  return (
    <section
      aria-labelledby="walkthrough-title"
      className={
        publicMode
          ? "rounded-[10px] border-[1.5px] border-[color:var(--hairline-strong)] bg-[color:var(--paper)]"
          : "mb-6 rounded-[10px] border-[1.5px] border-[color:var(--hairline-strong)] bg-[color:var(--paper)]"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--hairline)] px-4 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">
            Walkthrough · {TOUR.length} rooms
            {!publicMode && signedIn && (
              <>
                {" · "}
                <span className="text-[color:var(--ink-2)]">
                  {done.length} of {TOUR.length} opened in this browser
                </span>
              </>
            )}
          </p>
          <h2 id="walkthrough-title" className="mt-0.5 text-sm font-semibold text-[color:var(--ink)]">
            {publicMode
              ? "Every room in the desk — open any of them"
              : remaining.length === 0
                ? "You have opened every room"
                : `${remaining.length} room${remaining.length === 1 ? "" : "s"} you have not opened yet`}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!publicMode && next && (
            <button
              type="button"
              onClick={() => open(next.href)}
              className="rounded-[5px] border border-[color:var(--ink)] bg-[color:var(--ink)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--paper)] transition-colors hover:bg-[color:var(--mark)] hover:text-[#111318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            >
              Next: {next.label} →
            </button>
          )}
          {publicMode && (
            <button
              type="button"
              onClick={() => open(TOUR[0].href)}
              className="rounded-[5px] border border-[color:var(--ink)] bg-[color:var(--ink)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--paper)] transition-colors hover:bg-[color:var(--mark)] hover:text-[#111318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            >
              Start the walkthrough →
            </button>
          )}
          {!publicMode && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-[4px] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-3)] transition-colors hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      <ol className="divide-y divide-[color:var(--hairline)]">
        {TOUR.map((room, i) => {
          const isDone = visited.includes(room.href);
          const here = pathname === room.href;
          return (
            <li key={room.href} className="flex items-center gap-3 px-4 py-2">
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
                onClick={(event) => {
                  if (publicMode && !getToken()) {
                    event.preventDefault();
                    open(room.href);
                  }
                }}
                className="flex-none whitespace-nowrap rounded-[5px] border border-[color:var(--hairline-strong)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink)] transition-colors hover:bg-[color:var(--ink)] hover:text-[color:var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              >
                Open <Icon name="arrow" size={11} className="ml-0.5 inline-block" />
              </Link>
            </li>
          );
        })}
      </ol>

      <p className="border-t border-[color:var(--hairline)] px-4 py-2 text-[11px] leading-relaxed text-[color:var(--ink-3)]">
        {publicMode
          ? "Opening a room asks you to sign in first with one of the demo roles; you land in the room you clicked. Nothing here publishes, auto-fixes or changes a rule on its own."
          : "The ticks are kept in this browser only. Nothing about the workspace changes when you open a room."}
      </p>
    </section>
  );
}

/** Dismissal is remembered per browser, so the box does not return on every visit. */
export function useWalkthroughVisible() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(DISMISS_KEY) === "hidden");
    } catch {
      setHidden(false);
    }
  }, []);
  const dismiss = useCallback(() => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "hidden");
    } catch {
      /* private mode */
    }
  }, []);
  const show = useCallback(() => {
    setHidden(false);
    try {
      window.localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* private mode */
    }
  }, []);
  return { hidden, dismiss, show };
}
