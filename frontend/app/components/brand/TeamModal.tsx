"use client";
import Link from "next/link";
import { Modal, Button } from "../ui";
import { ReviewerAvatar } from "./ReviewerAvatar";
import { CHARACTER_LIST, PERSONAS } from "./characters";
import { Ribbon } from "./Seal";
import { Sentri } from "./Sentri";

/** “Meet the team” — the cast behind every finding, plus the human roles. */
export function TeamModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Meet the team"
      footer={<>
        <Link href="/brand/characters"><Button>Full cast page</Button></Link>
        <Button variant="primary" onClick={onClose}>Close</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Sentri mood="welcome" size={54} decorative />
          <p className="text-xs leading-relaxed text-ink-soft">
            Six reviewers, each with one lens. The cartoon names the reviewer; the sentence under it repeats what
            the finding says in words.
          </p>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {CHARACTER_LIST.map((c) => (
            <li key={c.key} className="flex items-start gap-2 rounded-md border border-ink/12 bg-white p-2">
              <ReviewerAvatar reviewer={c.key} size={34} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink">{c.name}</p>
                <p className="font-mono text-2xs uppercase tracking-[0.12em] text-gold-deep">{c.role}</p>
                <p className="mt-0.5 text-2xs italic text-ink-soft">“{c.catchphrase}”</p>
              </div>
            </li>
          ))}
        </ul>

        <div>
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-ink-mute">Human roles in this workspace</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {Object.values(PERSONAS).map((p) => (
              <li key={p.email} className="flex items-center gap-1.5 rounded-full border border-ink/12 bg-ivory px-2 py-1">
                <span
                  aria-hidden
                  className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-semibold text-ivory"
                  style={{ background: p.accent }}
                >
                  {p.initials}
                </span>
                <span className="text-2xs font-medium text-ink-soft">{p.name}</span>
                <Ribbon tone="muted">{p.role}</Ribbon>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
