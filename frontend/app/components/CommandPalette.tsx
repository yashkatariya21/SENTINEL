"use client";
/**
 * Keyboard-first access to everything.
 *
 * Cmd/Ctrl+K or "/" opens it; "g then 1-9" jumps straight to a page from anywhere; "?"
 * lists the shortcuts. Only the items this role may actually open are listed, so the
 * palette can never offer a door that answers 403.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { api } from "@/lib/api";
import { useAuth, DEMO_USERS } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { visibleNav } from "@/lib/nav";
import { playSound } from "@/lib/sound";

interface ContentRow {
  id: string;
  title: string;
  status: string;
}

const STATUS_WORD: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
};

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { me, loginAs } = useAuth();
  const { theme, toggleTheme } = usePrefs();
  const router = useRouter();
  const [rows, setRows] = useState<ContentRow[]>([]);

  const items = useMemo(() => visibleNav(me), [me]);

  // Submissions are only fetched when the palette first opens — never on page load.
  useEffect(() => {
    if (!open || rows.length) return;
    let alive = true;
    api
      .get<ContentRow[]>("/content")
      .then((data) => {
        if (alive) setRows(data.slice(0, 40));
      })
      .catch(() => {
        /* the palette stays useful for navigation and toggles */
      });
    return () => {
      alive = false;
    };
  }, [open, rows.length]);

  const go = useCallback(
    (href: string) => {
      playSound("key");
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      loop
      className="fixed inset-0 z-[70] flex items-start justify-center bg-navy/45 px-4 pt-[12vh] backdrop-blur-[2px]"
      shouldFilter
    >
      <div className="w-full max-w-[560px] overflow-hidden rounded-[3px] border border-[color:var(--hairline)] bg-ivory shadow-herald">
        <div className="flex items-center gap-2 border-b border-[color:var(--hairline)] px-3">
          <span aria-hidden="true" className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-2)]">
            ⌘K
          </span>
          <Command.Input
            placeholder="Go to a page, find a submission, switch role…"
            className="h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-mute/80"
          />
          <kbd className="hidden rounded-[2px] border border-ink/20 px-1.5 py-0.5 font-mono text-[10px] text-ink-mute sm:block">
            esc
          </kbd>
        </div>

        <Command.List className="max-h-[52vh] overflow-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-sm text-ink-mute">
            Nothing in the charter matches that.
          </Command.Empty>

          <Command.Group
            heading="Pages"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.2em] [&_[cmdk-group-heading]]:text-[color:var(--ink-2)]"
          >
            {items.map((item) => (
              <PaletteRow
                key={item.href}
                value={`${item.label} ${item.href}`}
                onSelect={() => go(item.href)}
                label={item.label}
                hint={item.key ? `g ${item.key}` : undefined}
              />
            ))}
            <PaletteRow
              value="review new content submission upload"
              onSelect={() => go("/new")}
              label="Review new content"
              hint="action"
            />
          </Command.Group>

          {rows.length > 0 && (
            <Command.Group
              heading="Submissions"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.2em] [&_[cmdk-group-heading]]:text-[color:var(--ink-2)]"
            >
              {rows.map((row) => (
                <PaletteRow
                  key={row.id}
                  value={`${row.title} ${row.status}`}
                  onSelect={() => go(`/content/${row.id}`)}
                  label={row.title}
                  hint={STATUS_WORD[row.status] ?? row.status}
                />
              ))}
            </Command.Group>
          )}

          <Command.Group
            heading="Workspace"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.2em] [&_[cmdk-group-heading]]:text-[color:var(--ink-2)]"
          >
            <PaletteRow
              value={`switch to ${theme === "dark" ? "day shift" : "night shift"} theme toggle`}
              onSelect={() => {
                playSound("key");
                toggleTheme();
                onOpenChange(false);
              }}
              label={theme === "dark" ? "Switch to Day shift" : "Switch to Night shift"}
              hint="theme"
            />
            {DEMO_USERS.filter((user) => user.email !== me?.user.email).map((user) => (
              <PaletteRow
                key={user.email}
                value={`switch role ${user.name} ${user.role} ${user.email}`}
                onSelect={() => {
                  playSound("key");
                  onOpenChange(false);
                  void loginAs(user.email);
                }}
                label={`Switch to ${user.name}`}
                hint={`${user.role} · demo`}
              />
            ))}
          </Command.Group>
        </Command.List>

        <div className="flex items-center justify-between border-t border-[color:var(--hairline)] bg-ivory-deep/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">
          <span>↑↓ move · ↵ open</span>
          <span>? for shortcuts</span>
        </div>
      </div>
    </Command.Dialog>
  );
}

function PaletteRow({
  value,
  onSelect,
  label,
  hint,
}: {
  value: string;
  onSelect: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-[2px] px-2 py-2 text-sm text-ink outline-none aria-selected:bg-navy aria-selected:text-ivory"
    >
      <span className="truncate">{label}</span>
      {hint && <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] opacity-60">{hint}</span>}
    </Command.Item>
  );
}
