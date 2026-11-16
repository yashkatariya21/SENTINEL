/**
 * The tour: every room in the desk, in the order it is worth walking.
 *
 * This list lives here rather than in a page so it cannot drift away from the
 * sidebar, the command palette and the shortcuts sheet: labels and one-line
 * descriptions come from `NAV`, and if a room is renamed it is renamed in one
 * edit. The walkthrough itself is shown on Settings.
 */
import { NAV } from "./nav";

export interface Room {
  href: string;
  label: string;
  /** what to do once you are in the room — one instruction, no marketing */
  todo: string;
}

/** The order a person actually needs: the standards first, then the work, then the record. */
const ORDER = [
  "/",
  "/kit",
  "/rules",
  "/rules/changes",
  "/new",
  "/content",
  "/learn",
  "/analytics",
  "/evaluation",
  "/audit",
  "/settings",
];

const TODO: Record<string, string> = {
  "/": "Start here: what is waiting on a person, and how the week is scoring.",
  "/kit": "Load the sample kit or upload a guideline — this is what everything is judged against.",
  "/rules": "Open one rule and read its versions; nothing here is ever overwritten.",
  "/rules/changes": "The sample guideline re-issued to 5.0, compared section by section, with the rules it flagged.",
  "/new": "Paste a paragraph with a superlative in it and watch the reviewers find it.",
  "/content": "The whole workspace as a ledger; open anything to read its findings.",
  "/learn": "Where a manager's override became a proposal, with the reason attached.",
  "/analytics": "The measured record: findings, decisions, and the mistakes that repeat.",
  "/evaluation": "The regression and held-out benchmarks — including the misses.",
  "/audit": "Append-only and hash-chained: every decision, by whom, when.",
  "/settings": "Appearance, your role, and this walkthrough.",
};

export const TOUR: Room[] = ORDER.map((href) => {
  const item = NAV.find((nav) => nav.href === href);
  return {
    href,
    label: item?.label ?? (href === "/" ? "Overview" : href),
    // One line per room: the instruction, which is what a tour adds over the sidebar.
    // Where there is no instruction the sidebar's own description is used, so a room
    // is never listed with a blank line beside it.
    todo: TODO[href] ?? item?.blurb ?? "",
  };
});

// --------------------------------------------------------------------------- #
// What this browser has actually opened
// --------------------------------------------------------------------------- #
// Kept in localStorage and written by the shell on every desk page, so a room is
// ticked for having been opened, not for having been listed on a page about it.
const VISITED_KEY = "sentinel.walkthrough.visited";

export function readVisited(): string[] {
  try {
    const raw = window.localStorage.getItem(VISITED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Record a room as opened. Unknown paths are ignored — the count stays honest. */
export function markVisited(href: string): void {
  if (!TOUR.some((room) => room.href === href)) return;
  const seen = readVisited();
  if (seen.includes(href)) return;
  try {
    window.localStorage.setItem(VISITED_KEY, JSON.stringify([...seen, href]));
  } catch {
    /* private mode: the ticks are a convenience, not a record */
  }
}
