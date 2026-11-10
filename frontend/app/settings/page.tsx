"use client";
import Link from "next/link";
import { usePrefs } from "@/lib/prefs";
import { useAuth } from "@/lib/auth";
import { Card, SectionHeading } from "../components/ui";
import { Sentri } from "../components/brand/Sentri";
import { ReviewerAvatar } from "../components/brand/ReviewerAvatar";
import { CHARACTER_LIST, personaFor } from "../components/brand/characters";
import { Ribbon } from "../components/brand/Seal";

export default function SettingsPage() {
  const { showCharacters, setShowCharacters, theme, toggleTheme } = usePrefs();
  const { me } = useAuth();
  const persona = personaFor(me?.user.name, me?.user.email);

  return (
    <div className="max-w-4xl">
      <p className="font-mono text-2xs uppercase tracking-[0.24em] text-gold-deep">Settings</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-navy">
        Your workspace preferences
      </h1>
      <p className="mt-1 text-sm text-ink-mute">
        Stored in this browser only. Nothing here changes how Sentinel reviews content.
      </p>

      <Card className="mt-5 p-5">
        <SectionHeading title="Characters" subtitle="The committee cast and Sentri, the owl" />
        <div className="flex items-start gap-4">
          <Sentri mood={showCharacters ? "welcome" : "sleeping"} size={78} decorative />
          <div className="min-w-0 flex-1">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-[#C9A227] focus-visible:ring-2 focus-visible:ring-gold"
                checked={showCharacters}
                onChange={(e) => setShowCharacters(e.target.checked)}
                aria-describedby="characters-help"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">Show characters</span>
                <span id="characters-help" className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                  Adds the six reviewer avatars, their one-line readings and Sentri’s notes. Every message they
                  carry is also written in plain text, so turning this off changes nothing you need to know.
                </span>
              </span>
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {CHARACTER_LIST.map((c) => (
                <span key={c.key} className="flex items-center gap-1.5 rounded-full border border-ink/12 bg-white px-2 py-1">
                  <ReviewerAvatar reviewer={c.key} size={20} />
                  <span className="text-2xs font-medium text-ink-soft">{c.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <SectionHeading title="Appearance" subtitle="Light is the default; dark keeps the same contrast ratios" />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="min-h-[44px] rounded-md border border-navy/20 bg-white px-4 text-sm font-semibold text-navy transition hover:border-gold focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            {theme === "light" ? "Switch to dark" : "Switch to light"}
          </button>
          <Ribbon tone="muted">Currently {theme}</Ribbon>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <SectionHeading title="You" subtitle="Your role decides what you can do" />
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 place-items-center rounded-full font-display text-sm font-semibold text-ivory"
            style={{ background: persona.accent }}
          >
            {persona.initials}
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">{me?.user.name ?? "Not signed in"}</p>
            <p className="text-xs text-ink-mute">
              {me?.user.email} · <span className="capitalize">{me?.user.role.replace("_", " ")}</span>
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-mute">
          Roles and permissions are set by the workspace admin and enforced on the server. See{" "}
          <Link href="/audit" className="text-navy-700 underline-offset-2 hover:underline">the audit log</Link> for
          every decision made in this workspace.
        </p>
      </Card>

      <Card className="mt-4 p-5">
        <SectionHeading title="Brand" subtitle="The system behind the visuals" />
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/brand" className="rounded-md border border-ink/12 bg-white px-3 py-2 text-navy-700 hover:border-gold">
            Brand system →
          </Link>
          <Link href="/brand/characters" className="rounded-md border border-ink/12 bg-white px-3 py-2 text-navy-700 hover:border-gold">
            Meet the committee →
          </Link>
        </div>
      </Card>
    </div>
  );
}
