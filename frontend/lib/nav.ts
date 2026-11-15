"use client";
/** One source of truth for navigation: the sidebar, the palette and the shortcuts sheet. */
import type { Me } from "./api";

export interface NavItem {
  href: string;
  label: string;
  /** one line saying what the page is for — printed in the sidebar, never invented */
  blurb: string;
  /** which band of the desk the page belongs to */
  group: "desk" | "record" | "setup";
  /** permission key from /auth/me; null = visible to every signed-in role */
  permission: string | null;
  /** roles that never see this item, whatever the permission says */
  hiddenFor?: string[];
  /** the number key that opens it in the sidebar (g + n) */
  key?: string;
}

export const NAV: NavItem[] = [
  { href: "/desk", label: "Overview", permission: null, key: "1", group: "desk",
    blurb: "Today at the gate: what is waiting on a person, and how the workspace is scoring." },
  { href: "/new", label: "New submission", permission: null, key: "2", group: "desk",
    blurb: "Paste text or upload a file; the six reviewers read it against the Brand Kit." },
  { href: "/content", label: "Content queue", permission: null, key: "3", group: "desk",
    blurb: "Every submission in the workspace, as a ledger you can filter and open." },
  { href: "/kit", label: "Brand Kit", permission: null, key: "4", group: "record",
    blurb: "The source of truth: documents, rules, terms, approved facts, colours and logo." },
  { href: "/rules", label: "Rules", permission: null, key: "5", group: "record",
    blurb: "Every rule with its full version history — nothing is ever overwritten." },
  { href: "/rules/changes", label: "Guideline changes", permission: null, group: "record",
    blurb: "Where a new guideline version and the live rules disagree, and who has to decide." },
  { href: "/learn", label: "Learning", permission: null, key: "6", group: "record",
    blurb: "Manager overrides as proposals: the reason, the scope, and what became a rule." },
  { href: "/analytics", label: "Analytics", permission: "can_read_analytics", key: "7", group: "record",
    blurb: "What the reviews actually show, measured from recorded findings and decisions." },
  { href: "/evaluation", label: "Evaluation", permission: "can_read_analytics", key: "8", group: "record",
    blurb: "The regression and held-out benchmarks, including the misses." },
  { href: "/audit", label: "Audit log", permission: "can_read_audit", hiddenFor: ["manager", "creator", "external_creator"], key: "9", group: "record",
    blurb: "Append-only, hash-chained: every decision, by whom, and when." },
  { href: "/settings", label: "Settings", permission: null, group: "setup",
    blurb: "Your browser preferences: characters, appearance, and what your role can do." },
];

/** What the current user is allowed to see. Used by the sidebar *and* the palette. */
export function visibleNav(me: Me | null): NavItem[] {
  if (!me) return [];
  const role = me.user.role;
  return NAV.filter((item) => {
    if (item.hiddenFor?.includes(role)) return false;
    return !item.permission || Boolean(me.permissions?.[item.permission]);
  });
}

export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  brand_manager: "Brand Manager",
  approver: "Approver",
  manager: "Manager",
  creator: "Creator",
  external_creator: "External Creator",
};

/** The three bands, in the order the sidebar prints them. */
export const NAV_GROUPS: { key: NavItem["group"]; label: string; note: string }[] = [
  { key: "desk", label: "The desk", note: "draft · mark · decide" },
  { key: "record", label: "The record", note: "rules · history · evidence" },
  { key: "setup", label: "Your setup", note: "preferences" },
];

/** What to say about a page in the sidebar footer when nothing is selected. */
export const DESK_NOTE =
  "Six specialists read every draft against your Brand Kit. Nothing publishes without a person.";
