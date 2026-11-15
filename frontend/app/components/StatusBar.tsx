"use client";
/**
 * The desk line: a 28px instrument strip along the bottom.
 *
 * Workspace, role, whether the API is answering, which engine produced the findings
 * (provider, model, prompt version), the shift, and the time. It is a trust device, not
 * decoration: a reader can see that the offline deterministic engine is the one writing
 * these notes.
 */
import { useEffect, useState } from "react";
import { useApiHealth, useApiMeta } from "@/lib/meta";
import { playSound, soundEnabled, setSoundEnabled } from "@/lib/sound";
import { usePrefs } from "@/lib/prefs";
import { Icon } from "./Icon";

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

export function StatusBar({ slug, role }: { slug: string; role: string }) {
  const health = useApiHealth();
  const meta = useApiMeta();
  const clock = useClock();
  const { theme } = usePrefs();
  const [sound, setSound] = useState(false);

  useEffect(() => setSound(soundEnabled()), []);

  const dot = health === "ok" ? "bg-[#7BE0A8]" : health === "down" ? "bg-[#FF8A7A]" : "bg-[#9AA1AE]";

  return (
    <footer
      aria-label="Workspace status"
      className="fixed inset-x-0 bottom-0 z-30 hidden h-[28px] items-center gap-3 border-t border-[#2A2F38] bg-navy px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#9AA1AE] sm:flex lg:pl-[calc(64px+0.75rem)]"
    >
      <span className="flex items-center gap-1.5 text-paper">
        <span aria-hidden="true" className="inline-block h-[6px] w-[6px] bg-[#FFE066]" />
        {slug}
      </span>
      <Separator />
      <span>{role}</span>
      <Separator />
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`inline-block h-[6px] w-[6px] rounded-full ${dot}`} />
        <span className="sr-only">Status: </span>
        {HEALTH_LABEL[health]}
      </span>
      <span className="hidden md:inline"><Separator /></span>
      <span className="hidden truncate md:inline">
        {meta ? `${meta.ai.provider} · ${meta.ai.model}` : "engine unknown"}
      </span>
      <span className="hidden lg:inline"><Separator /></span>
      <span className="hidden lg:inline">prompt {meta?.ai.prompt_version ?? "—"}</span>

      <span className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const next = !sound;
            setSound(next);
            setSoundEnabled(next);
            if (next) playSound("key");
          }}
          aria-pressed={sound}
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#9AA1AE] hover:text-paper focus-visible:outline-none"
        >
          <Icon name={sound ? "volume" : "volume-off"} size={13} />
          Sound {sound ? "on" : "off"}
        </button>
        <span aria-hidden="true" className="text-[#3A4149]">/</span>
        <span>{theme === "dark" ? "night shift" : "day shift"}</span>
        <time className="tabular-nums text-paper" suppressHydrationWarning>{clock}</time>
      </span>
    </footer>
  );
}

function Separator() {
  return <span aria-hidden="true" className="text-[#3A4149]">/</span>;
}
