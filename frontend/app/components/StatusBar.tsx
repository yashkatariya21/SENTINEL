"use client";
/**
 * The status strip: a 28px instrument line along the bottom of the app.
 *
 * It is a trust device, not decoration — workspace, role, whether the API is answering,
 * which model and prompt version produced the findings, and the local time. The sound
 * toggle lives here because it is the one preference you might flip mid-session.
 */
import { useEffect, useState } from "react";
import { useApiHealth, useApiMeta } from "@/lib/meta";
import { playSound, soundEnabled, setSoundEnabled } from "@/lib/sound";
import { usePrefs } from "@/lib/prefs";

const HEALTH_LABEL = { ok: "API online", down: "API unreachable", unknown: "checking API" } as const;

function useClock(): string {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return time;
}

export function StatusBar({
  slug,
  role,
}: {
  slug: string;
  role: string;
}) {
  const health = useApiHealth();
  const meta = useApiMeta();
  const clock = useClock();
  const { theme } = usePrefs();
  const [sound, setSound] = useState(false);

  useEffect(() => setSound(soundEnabled()), []);

  const dot =
    health === "ok" ? "bg-confirmed" : health === "down" ? "bg-critical" : "bg-possible";

  return (
    <div
      role="contentinfo"
      aria-label="Workspace status"
      className="fixed bottom-0 left-0 right-0 z-40 hidden h-[28px] items-center gap-4 border-t border-gold/25 bg-navy px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ivory/70 sm:flex lg:pl-[calc(252px+0.75rem)]"
    >
      <span className="flex items-center gap-1.5 text-ivory/85">
        <span aria-hidden="true" className="inline-block h-[6px] w-[6px] rounded-full bg-gradient-gold" />
        {slug}
      </span>

      <span className="text-ivory/60" aria-hidden="true">/</span>
      <span>{role}</span>

      <span className="text-ivory/60" aria-hidden="true">/</span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`inline-block h-[6px] w-[6px] rounded-full ${dot}`} />
        <span className="sr-only">Status: </span>
        {HEALTH_LABEL[health]}
      </span>

      <span className="hidden md:inline text-ivory/45" aria-hidden="true">/</span>
      <span className="hidden md:inline truncate">
        {meta ? `${meta.ai.provider} · ${meta.ai.model}` : "engine unknown"}
      </span>

      <span className="hidden lg:inline text-ivory/45" aria-hidden="true">/</span>
      <span className="hidden lg:inline">prompt {meta?.ai.prompt_version ?? "—"}</span>

      <span className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const next = !sound;
            setSound(next);
            setSoundEnabled(next);
            if (next) playSound("key"); // an audible confirmation of the choice
          }}
          aria-pressed={sound}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-ivory/60 underline-offset-4 hover:text-ivory hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Sound {sound ? "on" : "off"}
        </button>
        <span aria-hidden="true" className="text-ivory/60">{theme === "dark" ? "night shift" : "day shift"}</span>
        <time className="tabular-nums text-ivory/85" suppressHydrationWarning>{clock}</time>
      </span>
    </div>
  );
}
