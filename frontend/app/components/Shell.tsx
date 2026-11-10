"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, DEMO_USERS } from "@/lib/auth";
import { Crest, Monogram } from "./brand/Crest";
import { Lattice } from "./brand/Pattern";
import { LoadDemoButton } from "./Demo";
import { TeamModal } from "./brand/TeamModal";
import { Button, Select } from "./ui";

const NAV = [
  { href: "/", label: "Overview", permission: null },
  { href: "/new", label: "New submission", permission: null },
  { href: "/content", label: "Content queue", permission: null },
  { href: "/kit", label: "Brand Kit", permission: null },
  { href: "/rules", label: "Rules", permission: null },
  { href: "/learn", label: "Learning", permission: null },
  { href: "/analytics", label: "Analytics", permission: "can_read_analytics" },
  { href: "/evaluation", label: "Evaluation", permission: "can_read_analytics" },
  { href: "/audit", label: "Audit log", permission: "can_read_audit" },
  { href: "/settings", label: "Settings", permission: null },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  brand_manager: "Brand Manager",
  approver: "Approver",
  manager: "Manager",
  creator: "Creator",
  external_creator: "External Creator",
};

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading, logout, loginAs } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState(false);
  const [switching, setSwitching] = useState(false);

  /* close the mobile drawer on navigation */
  useEffect(() => setOpen(false), [pathname]);

  if (pathname === "/login") return <main id="main">{children}</main>;

  if (loading || !me) {
    return (
      <main id="main" className="flex min-h-screen items-center justify-center gap-3 text-sm text-ink-mute">
        <Monogram size={28} /> Loading the workspace…
      </main>
    );
  }

  const role = me.user.role;
  const visible = NAV.filter((n) => {
    if (role === "manager" || role === "creator" || role === "external_creator") {
      if (n.href === "/audit") return false;
    }
    return !n.permission || me.permissions?.[n.permission];
  });
  const initials = me.user.name.split(" ").map((p) => p[0]).slice(0, 2).join("");

  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[252px_1fr]">
      {/* ------------------------------------------------------------ sidebar */}
      <aside
        className={`${open ? "block" : "hidden"} relative isolate overflow-hidden bg-navy text-ivory lg:block`}
        aria-label="Main navigation"
      >
        <Lattice className="pointer-events-none absolute inset-0 h-full w-full text-gold-soft" opacity={0.06} />
        <div className="relative flex h-full flex-col">
          <div className="border-b border-gold/20 px-5 py-5">
            <Link href="/" className="flex items-center gap-2.5 rounded focus-visible:outline-none">
              <Crest size={34} tone="gold" />
              <span>
                <span className="block font-crest text-base font-semibold leading-none tracking-[0.14em] text-ivory">
                  SENTINEL AI
                </span>
                <span className="mt-1 block text-2xs uppercase tracking-[0.18em] text-gold-soft/70">
                  Reviews. Never publishes.
                </span>
              </span>
            </Link>
          </div>

          <nav className="flex-1 space-y-0.5 px-2.5 py-4" aria-label="Sections">
            {visible.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex min-h-[44px] items-center rounded-md px-3 text-xs font-medium transition duration-200 ease-royal ${
                    active
                      ? "bg-ivory/10 text-ivory"
                      : "text-ivory/70 hover:bg-ivory/[0.06] hover:text-ivory"
                  }`}
                >
                  {/* gold active indicator */}
                  <span
                    aria-hidden
                    className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-gradient-gold transition-opacity duration-200 ${
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                    }`}
                  />
                  <span className={active ? "font-semibold" : ""}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-gold/20 px-4 py-4">
            <p className="text-xs font-semibold text-ivory">{me.organisation.name}</p>
            <p className="text-2xs uppercase tracking-[0.14em] text-gold-soft/60">{me.organisation.slug}</p>
            <p className="mt-2.5 text-2xs leading-relaxed text-ivory/50">
              It reviews and explains. It never publishes, auto-fixes, or changes a rule without a
              manager&apos;s click.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        {/* ----------------------------------------------------------- topbar */}
        <header className="sticky top-0 z-30 border-b border-gold/25 bg-paper/95 backdrop-blur">
          <div className="flex min-h-[64px] items-center justify-between gap-3 px-4 lg:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-md border border-ink/15 text-navy hover:bg-ivory-deep lg:hidden"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="sidebar"
                aria-label={open ? "Close navigation" : "Open navigation"}
              >
                <span aria-hidden>{open ? "✕" : "☰"}</span>
              </button>
              <div className="min-w-0">
                <p className="truncate text-2xs uppercase tracking-[0.16em] text-ink-mute">
                  {me.organisation.name} · {me.user.department ?? "All departments"}
                </p>
                <p className="truncate font-display text-sm font-semibold text-navy">
                  {titleFor(pathname)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 md:flex">
                <label className="text-2xs uppercase tracking-[0.14em] text-ink-mute" htmlFor="viewas">
                  View as
                </label>
                <Select
                  id="viewas"
                  className="max-w-[15rem] py-1.5 text-xs"
                  value={DEMO_USERS.find((u) => u.name === me.user.name)?.email ?? ""}
                  disabled={switching}
                  onChange={async (e) => {
                    if (!e.target.value) return;
                    setSwitching(true);
                    try {
                      await loginAs(e.target.value);
                    } finally {
                      setSwitching(false);
                    }
                  }}
                >
                  <option value="">{me.user.name}</option>
                  {DEMO_USERS.filter((u) => u.email !== me.user.email).map((u) => (
                    <option key={u.email} value={u.email}>{u.name} — {u.role}</option>
                  ))}
                </Select>
              </div>

              <LoadDemoButton label="Load demo data" size="sm" variant="primary" className="hidden sm:inline-flex" />

              <div className="flex items-center gap-2 border-l border-ink/10 pl-2 sm:pl-3">
                <button
                  type="button"
                  onClick={() => setTeam(true)}
                  aria-label="Meet the team — reviewers and human roles"
                  className="grid h-9 w-9 place-items-center rounded-full border border-gold/50 bg-navy text-2xs font-semibold text-gold-soft transition hover:border-gold focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
                >
                  {initials}
                </button>
                <div className="hidden sm:block">
                  <p className="text-xs font-semibold leading-tight text-ink">{me.user.name}</p>
                  <p className="text-2xs uppercase tracking-[0.12em] text-gold-deep">
                    {ROLE_LABEL[role] ?? role}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={logout} className="px-2">
                Sign out
              </Button>
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <TeamModal open={team} onClose={() => setTeam(false)} />
        <footer className="border-t border-ink/10 px-4 py-4 text-2xs text-ink-mute lg:px-8">
          Sentinel AI reviews and explains. It never publishes, never auto-fixes, and never changes a rule
          without a manager’s click. Legal output is an AI risk perspective, not legal advice.
        </footer>
      </div>
    </div>
  );
}

function titleFor(pathname: string): string {
  if (pathname === "/") return "Overview";
  const match = NAV.filter((n) => n.href !== "/").find((n) => pathname.startsWith(n.href));
  if (match) return match.label;
  if (pathname.includes("/approval")) return "Approval";
  if (pathname.startsWith("/content/")) return "Review report";
  return "Sentinel AI";
}
