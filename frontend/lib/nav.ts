"use client";
/** One source of truth for navigation: the sidebar, the palette and the shortcuts sheet. */
import type { Me } from "./api";

export interface NavItem {
  href: string;
  label: string;
  /** permission key from /auth/me; null = visible to every signed-in role */
  permission: string | null;
  /** roles that never see this item, whatever the permission says */
  hiddenFor?: string[];
  /** the number key that opens it in the sidebar (g + n) */
  key?: string;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", permission: null, key: "1" },
  { href: "/new", label: "New submission", permission: null, key: "2" },
  { href: "/content", label: "Content queue", permission: null, key: "3" },
  { href: "/kit", label: "Brand Kit", permission: null, key: "4" },
  { href: "/rules", label: "Rules", permission: null, key: "5" },
  { href: "/learn", label: "Learning", permission: null, key: "6" },
  { href: "/analytics", label: "Analytics", permission: "can_read_analytics", key: "7" },
  { href: "/evaluation", label: "Evaluation", permission: "can_read_analytics", key: "8" },
  { href: "/audit", label: "Audit log", permission: "can_read_audit", hiddenFor: ["manager", "creator", "external_creator"], key: "9" },
  { href: "/settings", label: "Settings", permission: null },
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
