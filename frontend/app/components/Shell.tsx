"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth, DEMO_USERS } from "@/lib/auth";
import { Crest, Monogram } from "./brand/Crest";
import { Lattice } from "./brand/Pattern";
import { LoadDemoButton } from "./Demo";
import { TeamModal } from "./brand/TeamModal";
import { Button, Select } from "./ui";
import { StatusBar } from "./StatusBar";
import { ThemeSwitch } from "./ThemeSwitch";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { NAV, ROLE_LABEL, visibleNav } from "@/lib/nav";

/** Routes that render without the chrome (public marketing / auth). */
const BARE_ROUTES = ["/login", "/welcome"];

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading, logout, loginAs } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);

  /* close the mobile drawer on navigation */
  useEffect(() => setOpen(false), [pathname]);

  /* ---------------------------------------------------------------- keys
     ⌘K / "/" → palette · "?" → shortcuts · "g" then 1-9 → page */
  useEffect(() => {
    let awaitingGo = false;
    let timer: number | undefined;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

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

  // Public routes own their own <main>, so the shell contributes nothing here — two
  // main landmarks on one page is a real navigation fault, not a technicality.
  if (BARE_ROUTES.includes(pathname)) return <>{children}</>;

  if (loading || !me) {
    return (
      <main id="main" className="flex min-h-screen items-center justify-center gap-3 text-sm text-ink-mute">
        <Monogram size={28} /> Loading the workspace…
      </main>
    );
  }

  const role = me.user.role;
  const visible = visibleNav(me);
  const initials = me.user.name.split(" ").map((part) => part[0]).slice(0, 2).join("");

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
                  className={`group relative flex min-h-[44px] items-center justify-between rounded-[2px] px-3 text-xs font-medium transition duration-ui ease-royal ${
                    active ? "bg-ivory/10 text-ivory" : "text-ivory/70 hover:bg-ivory/[0.06] hover:text-ivory"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-gradient-gold transition-opacity duration-micro ${
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                    }`}
                  />
                  <span className={active ? "font-semibold" : ""}>{item.label}</span>
                  {item.key && (
                    <kbd
                      aria-hidden="true"
                      className={`font-mono text-[10px] tracking-[0.1em] transition-opacity duration-micro ${
                        active ? "text-gold-soft/70" : "text-ivory/25 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      g {item.key}
                    </kbd>
                  )}
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
            <Link
              href="/welcome"
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-gold-soft/70 underline-offset-4 hover:text-gold-soft hover:underline"
            >
              <span aria-hidden="true">↗</span> About Sentinel
            </Link>
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
                className="grid h-11 w-11 place-items-center rounded-[2px] border border-ink/15 text-navy hover:bg-ivory-deep lg:hidden"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="sidebar"
                aria-label={open ? "Close navigation" : "Open navigation"}
              >
                <span aria-hidden="true">{open ? "✕" : "☰"}</span>
              </button>
              <div className="min-w-0">
                <p className="truncate text-2xs uppercase tracking-[0.16em] text-ink-mute">
                  {me.organisation.name} · {me.user.department ?? "All departments"}
                </p>
                <p className="truncate font-display text-sm font-semibold text-navy">{titleFor(pathname)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* the palette, one keystroke away */}
              <button
                type="button"
                onClick={() => setPalette(true)}
                className="hidden items-center gap-2 whitespace-nowrap rounded-[2px] border border-ink/15 bg-white/60 px-2.5 py-1.5 text-2xs text-ink-mute transition-colors duration-micro hover:border-gold/60 hover:text-ink xl:flex"
              >
                <span aria-hidden="true">⌕</span>
                <span className="font-mono uppercase tracking-[0.14em]">Search</span>
                <span className="sr-only">— open the command palette</span>
                <kbd aria-hidden="true" className="rounded-[2px] border border-ink/20 px-1 font-mono text-[10px]">
                  ⌘K
                </kbd>
              </button>

              <div className="hidden items-center gap-2 2xl:flex">
                <label className="whitespace-nowrap text-2xs uppercase tracking-[0.14em] text-ink-mute" htmlFor="viewas">
                  View as
                </label>
                <Select
                  id="viewas"
                  className="w-[10.5rem] py-1.5 text-xs"
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
                </Select>
              </div>

              <LoadDemoButton label="Load demo data" size="sm" variant="primary" className="hidden 2xl:inline-flex" />

              <ThemeSwitch showLabel className="whitespace-nowrap" />

              <div className="flex items-center gap-2 border-l border-ink/10 pl-2 sm:pl-3">
                <button
                  type="button"
                  onClick={() => setTeam(true)}
                  aria-label={`${initials} — meet the team: reviewers and human roles`}
                  className="grid h-9 w-9 place-items-center rounded-full border border-gold/50 bg-navy text-2xs font-semibold text-gold-soft transition-colors duration-micro hover:border-gold focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
                >
                  <span aria-hidden="true">{initials}</span>
                </button>
                <div className="hidden sm:block">
                  <p className="whitespace-nowrap text-xs font-semibold leading-tight text-ink">{me.user.name}</p>
                  <p className="whitespace-nowrap text-2xs uppercase tracking-[0.12em] text-gold-deep">
                    {ROLE_LABEL[role] ?? role}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={logout} className="whitespace-nowrap px-2">
                Sign out
              </Button>
            </div>
          </div>
        </header>

        {/* the content column is the only thing that animates on a route change */}
        <main
          id="main"
          key={pathname}
          className="route-fade mx-auto w-full max-w-[1240px] flex-1 px-4 pb-16 pt-6 sm:pb-12 lg:px-8 lg:pb-14 lg:pt-8"
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

function titleFor(pathname: string): string {
  if (pathname === "/") return "Overview";
  const match = NAV.filter((n) => n.href !== "/").find((n) => pathname.startsWith(n.href));
  if (match) return match.label;
  if (pathname.includes("/approval")) return "Approval";
  if (pathname.startsWith("/content/")) return "Review report";
  return "Sentinel AI";
}
