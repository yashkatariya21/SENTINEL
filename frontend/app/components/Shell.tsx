"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth, DEMO_USERS } from "@/lib/auth";
import { Button, Select } from "./ui";

const NAV = [
  { href: "/", label: "Overview", icon: "▦", permission: null },
  { href: "/new", label: "New submission", icon: "＋", permission: null },
  { href: "/content", label: "Content queue", icon: "≡", permission: null },
  { href: "/kit", label: "Brand Kit", icon: "◆", permission: null },
  { href: "/rules", label: "Rules", icon: "§", permission: null },
  { href: "/learn", label: "Learning", icon: "◎", permission: null },
  { href: "/analytics", label: "Analytics", icon: "◔", permission: "can_read_analytics" },
  { href: "/audit", label: "Audit log", icon: "⧉", permission: "can_read_audit" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading, logout, loginAs, refresh } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (pathname === "/login") return <main id="main">{children}</main>;

  if (loading || !me) {
    return (
      <main id="main" className="flex min-h-screen items-center justify-center text-sm text-ink-mute">
        Loading workspace…
      </main>
    );
  }

  const role = me?.user.role;
  // The audit log is an Admin / Brand Manager / Approver view; managers and creators
  // never see the link, so they cannot land on a page they are not entitled to.
  const visible = NAV.filter((n) => {
    if (role === "manager" || role === "creator" || role === "external_creator") {
      if (n.href === "/audit") return false;
    }
    return !n.permission || me.permissions?.[n.permission];
  });
  const initials = me.user.name.split(" ").map((p) => p[0]).slice(0, 2).join("");

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      {/* Sidebar */}
      <aside
        className={`${open ? "block" : "hidden"} border-r border-ink/10 bg-navy-900 text-white lg:block`}
        aria-label="Main navigation"
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-5 py-5">
            <Link href="/" className="flex items-center gap-2 text-white">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500 font-bold text-navy-900">S</span>
              <span>
                <span className="block text-sm font-semibold leading-tight">Sentinel AI</span>
                <span className="block text-[11px] text-white/60">Reviews. Never publishes.</span>
              </span>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4">
            {visible.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                    active ? "bg-white/15 font-medium text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span aria-hidden="true" className="w-4 text-center text-white/60">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/10 px-4 py-4 text-xs text-white/70">
            <p className="font-medium text-white">{me.organisation.name}</p>
            <p>{me.organisation.slug}</p>
            <p className="mt-2 leading-relaxed text-white/50">
              It reviews and explains. It never publishes, auto-fixes, or changes a rule without a manager&apos;s click.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink/10 bg-white/95 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded p-2 text-ink-soft hover:bg-paper lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="main"
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <div className="hidden text-sm text-ink-mute sm:block">
              {me.organisation.name} <span aria-hidden="true">·</span>{" "}
              <span className="text-ink-soft">{me.user.department || "No department"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-2 text-xs text-ink-mute sm:flex">
              View as
              <Select
                aria-label="Switch demo user"
                className="!w-auto !py-1 text-xs"
                value={me.user.email}
                disabled={switching}
                onChange={async (e) => {
                  setSwitching(true);
                  try {
                    await loginAs(e.target.value);
                    await refresh();
                  } finally {
                    setSwitching(false);
                  }
                }}
              >
                {DEMO_USERS.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name} — {u.role}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-center gap-2 rounded-full border border-ink/10 py-1 pl-1 pr-3">
              <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-navy-100 text-xs font-semibold text-navy-700">
                {initials}
              </span>
              <span className="text-xs leading-tight">
                <span className="block font-medium text-ink">{me.user.name}</span>
                <span className="block capitalize text-ink-mute">{me.user.role.replace("_", " ")}</span>
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>Sign out</Button>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
