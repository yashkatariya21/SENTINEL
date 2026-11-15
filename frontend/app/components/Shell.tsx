"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth, DEMO_USERS } from "@/lib/auth";
import { LoadDemoButton } from "./Demo";
import { TeamModal } from "./brand/TeamModal";
import { StatusBar } from "./StatusBar";
import { ThemeSwitch } from "./ThemeSwitch";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { DeskMark, DeskSentri } from "./Desk";
import { Icon, type IconName } from "./Icon";
import { NAV, ROLE_LABEL, visibleNav } from "@/lib/nav";

/** Routes that render without the chrome (public marketing / auth). */
const BARE_ROUTES = ["/login", "/welcome"];

const ICONS: Record<string, IconName> = {
  "/": "overview",
  "/new": "new",
  "/content": "queue",
  "/kit": "kit",
  "/rules": "rules",
  "/learn": "learning",
  "/analytics": "analytics",
  "/evaluation": "evaluation",
  "/audit": "audit",
  "/settings": "settings",
};

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading, logout, loginAs } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  /* ⌘K / "/" → palette · "?" → shortcuts · "g" then 1-9 → page */
  useEffect(() => {
    let awaitingGo = false;
    let timer: number | undefined;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        setPalette(true);
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShortcuts(true);
        return;
      }
      if (event.key.toLowerCase() === "g" && !awaitingGo) {
        awaitingGo = true;
        timer = window.setTimeout(() => {
          awaitingGo = false;
        }, 1400);
        return;
      }
      if (awaitingGo && /^[1-9]$/.test(event.key)) {
        const item = visibleNav(me).find((entry) => entry.key === event.key);
        awaitingGo = false;
        if (timer) window.clearTimeout(timer);
        if (item) {
          event.preventDefault();
          router.push(item.href);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer) window.clearTimeout(timer);
    };
  }, [me, router]);

  // Public routes own their own <main>, so the shell contributes nothing here.
  if (BARE_ROUTES.includes(pathname)) return <>{children}</>;

  if (loading || !me) {
    return (
      <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-4 text-sm text-ink-2">
        <DeskSentri size={88} mood="reading" />
        <p className="font-mono text-2xs uppercase tracking-[0.2em]">Opening the desk…</p>
      </main>
    );
  }

  const role = me.user.role;
  const visible = visibleNav(me);
  const initials = me.user.name.split(" ").map((p) => p[0]).slice(0, 2).join("");

  return (
    <div className="min-h-screen bg-paper">
      {/* ------------------------------------------------------------- icon rail */}
      <nav
        aria-label="Sections"
        className={`${
          open ? "flex" : "hidden"
        } fixed inset-y-0 left-0 z-50 w-[64px] flex-col items-center border-r-[1.5px] border-ink bg-ivory py-2 lg:flex`}
      >
        <Link
          href="/welcome"
          aria-label="Sentinel — about the desk"
          className="mb-2 grid h-11 w-11 place-items-center rounded-md hover:bg-ivory-deep focus-visible:outline-none"
        >
          <DeskMark size={24} className="text-ink" />
        </Link>

        <ul className="flex flex-1 flex-col items-center gap-0.5 overflow-y-auto">
          {visible
            .filter((item) => item.href !== "/settings")
            .map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href} className="group relative">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    className="rail-item"
                  >
                    <Icon name={ICONS[item.href] ?? "queue"} />
                  </Link>
                  {/* the tooltip: name only, never the only source of it */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[52px] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-[4px] bg-[#111318] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#F4F5F7] opacity-0 shadow-herald transition-opacity duration-micro group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    {item.label}
                  </span>
                </li>
              );
            })}
        </ul>

        {visible.some((i) => i.href === "/settings") && (
          <Link
            href="/settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            aria-label="Settings"
            className="rail-item group relative mt-1"
          >
            <Icon name="settings" />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-[52px] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-[4px] bg-[#111318] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#F4F5F7] opacity-0 transition-opacity duration-micro group-hover:opacity-100"
            >
              Settings
            </span>
          </Link>
        )}
      </nav>

      <div className="lg:pl-[64px]">
        {/* ------------------------------------------------------------- top bar */}
        <header className="sticky top-0 z-40 bg-navy text-paper">
          <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-md text-paper hover:bg-white/10 lg:hidden"
              aria-expanded={open}
              aria-label={open ? "Close navigation" : "Open navigation"}
            >
              <Icon name={open ? "close" : "menu"} />
            </button>

            <Link href="/" className="flex items-center gap-2 rounded focus-visible:outline-none">
              <DeskMark size={20} className="text-paper" />
              <span className="hidden font-mono text-[12px] font-semibold uppercase tracking-[0.22em] sm:inline">
                Sentinel
              </span>
            </Link>

            <span aria-hidden="true" className="hidden text-[#3A4149] sm:inline">/</span>
            <p className="hidden truncate font-mono text-[11px] uppercase tracking-[0.14em] text-[#9AA1AE] sm:block">
              {me.organisation.slug} / {titleFor(pathname)}
            </p>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setPalette(true)}
                className="flex items-center gap-2 rounded-md border border-[#3A4149] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#C3CAD6] transition-colors duration-micro hover:border-[#FFE066] hover:text-[#FFE066]"
              >
                <Icon name="search" size={14} />
                <span className="hidden sm:inline">Search</span>
                <span className="sr-only">— open the command palette</span>
                <kbd aria-hidden="true" className="hidden rounded border border-[#3A4149] px-1 sm:inline">
                  ⌘K
                </kbd>
              </button>

              <span className="hidden items-center gap-1.5 rounded-md border border-[#3A4149] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#7BE0A8] md:flex">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#7BE0A8]" />
                Demo
              </span>

              <div className="hidden items-center gap-2 xl:flex">
                <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9AA1AE]" htmlFor="viewas">
                  View as
                </label>
                <select
                  id="viewas"
                  className="w-[10.5rem] rounded-[4px] border border-[#3A4149] bg-[#171A20] px-2 py-1 font-mono text-[11px] text-paper focus:border-[#FFE066] focus:outline-none"
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
                    <option key={u.email} value={u.email}>
                      {u.name} — {u.role}
                    </option>
                  ))}
                </select>
              </div>

              <LoadDemoButton label="Load demo" size="sm" variant="primary" className="hidden 2xl:inline-flex" />
              <ThemeSwitch showLabel className="hidden text-paper sm:flex" />

              <button
                type="button"
                onClick={() => setTeam(true)}
                aria-label={`${initials} — meet the team: reviewers and human roles`}
                className="grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-[#3A4149] font-mono text-[11px] font-semibold text-paper transition-colors duration-micro hover:border-[#FFE066]"
              >
                <span aria-hidden="true">{initials}</span>
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-md px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#9AA1AE] transition-colors duration-micro hover:text-paper"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main
          id="main"
          key={pathname}
          className="route-fade mx-auto w-full max-w-[1280px] flex-1 px-3 pb-16 pt-4 sm:pb-12 sm:px-5 sm:pt-6 lg:px-7"
        >
          {children}
        </main>

        <TeamModal open={team} onClose={() => setTeam(false)} />
        <CommandPalette open={palette} onOpenChange={setPalette} />
        <ShortcutsSheet open={shortcuts} onClose={() => setShortcuts(false)} me={me} />
        <StatusBar slug={me.organisation.slug} role={ROLE_LABEL[role] ?? role} />
      </div>
    </div>
  );
}

const TITLES: [string, string][] = [
  ["/brand/characters", "The cast"],
  ["/brand", "Brand system"],
  ["/content/", "Proof desk"],
  ["/kit", "Brand Kit"],
  ["/evaluation", "Evaluation"],
];

function titleFor(pathname: string): string {
  if (pathname === "/") return "Overview";
  if (pathname.endsWith("/approval")) return "Approval";
  for (const [prefix, label] of TITLES) {
    if (pathname.startsWith(prefix)) return label;
  }
  const match = NAV.filter((n) => n.href !== "/").find((n) => pathname.startsWith(n.href));
  if (match) return match.label;
  return "Sentinel";
}
