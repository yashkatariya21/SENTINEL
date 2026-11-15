"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, ContentItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, EmptyState, SectionHeading, Skeleton, StatusPill, Tag } from "../components/ui";
import { Icon } from "../components/Icon";
import { DeskSentri } from "../components/Desk";

const STATUSES = ["all", "draft", "in_review", "changes_requested", "approved", "rejected"];
const LABELS: Record<string, string> = {
  all: "All", draft: "Draft", in_review: "In review",
  changes_requested: "Changes", approved: "Approved", rejected: "Rejected",
};

/**
 * The content queue as a proof ledger: one line per submission, numbered in mono,
 * ruled like a ledger book. The whole row is the link; the two actions only appear
 * on hover or keyboard focus so the page stays quiet at rest.
 */
export default function ContentQueuePage() {
  const { me } = useAuth();
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<ContentItem[]>("/content").then(setItems).catch((e) => { setError(e.message); setItems([]); });
  }, []);

  const visible = useMemo(() => (items || []).filter((i) => {
    if (status !== "all" && i.status !== status) return false;
    if (query && !`${i.title} ${i.owner_name || ""} ${i.department || ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [items, status, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: (items || []).length };
    for (const i of items || []) c[i.status] = (c[i.status] || 0) + 1;
    return c;
  }, [items]);

  return (
    <div>
      <SectionHeading
        title="Content queue" as="h1"
        subtitle={
          me?.user.role === "external_creator"
            ? "You can see the content you submitted. Approval decisions stay with the brand team."
            : "Everything submitted in this workspace, newest first."
        }
        action={
          <Link href="/new">
            <Button variant="primary">
              <span className="flex items-center gap-2"><Icon name="new" size={14} /> New submission</span>
            </Button>
          </Link>
        }
      />

      {/* ---------------------------------------------------- the filter rail */}
      <div className="mb-4 border-y border-[color:var(--hairline)] bg-[color:var(--paper)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-3 py-2.5">
          {/* status as a row of pressed/unpressed stamps — same state, no dropdown
              to open, and the counts are visible before you choose */}
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by status">
            {STATUSES.map((s) => {
              const on = status === s;
              const n = counts[s] ?? 0;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStatus(s)}
                  className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-1 font-mono text-2xs uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
                    on
                      ? "border-[color:var(--ink)] bg-[color:var(--ink)] text-[color:var(--paper)]"
                      : "border-[color:var(--hairline)] text-[color:var(--ink-2)] hover:border-[color:var(--ink)] hover:text-[color:var(--ink)]"
                  }`}
                >
                  {LABELS[s]}
                  <span className={`tabular-nums ${on ? "text-[color:var(--paper)] opacity-70" : "text-[color:var(--ink-3)]"}`}>
                    {n}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative min-w-[12rem] flex-1">
            <label htmlFor="queue-search" className="sr-only">Search the queue</label>
            <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[color:var(--ink-3)]">
              <Icon name="search" size={14} />
            </span>
            <input
              id="queue-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title, owner or department"
              className="w-full rounded-[6px] border border-[color:var(--hairline-strong)] bg-[color:var(--paper)] py-1.5 pl-8 pr-3 text-xs text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
            />
          </div>

          <p className="font-mono text-2xs uppercase tracking-[0.12em] text-[color:var(--ink-3)]" aria-live="polite">
            {visible.length} of {counts.all ?? 0} shown
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-[8px] border border-[color:var(--mark)] bg-[color:var(--mark-tint)] px-3 py-2 text-sm text-[color:var(--mark-text)]">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      {!items && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {items && visible.length === 0 && (
        <div className="relative">
          <EmptyState
            title={query || status !== "all" ? "No submissions match this filter" : "Nothing here yet"}
            body={
              query || status !== "all"
                ? "Clear the search or choose All to see the rest of the queue."
                : "Submit a draft from the New submission page to get a review report."
            }
            action={
              query || status !== "all" ? (
                <Button size="sm" onClick={() => { setQuery(""); setStatus("all"); }}>Clear filters</Button>
              ) : (
                <Link href="/new"><Button variant="primary">New submission</Button></Link>
              )
            }
          />
        </div>
      )}

      {items && visible.length > 0 && (
        <ol className="border-t-[1.5px] border-[color:var(--hairline-strong)]">
          {visible.map((item, idx) => (
            <li key={item.id} className="group/row relative border-b border-[color:var(--hairline)] transition-colors hover:bg-[color:var(--highlight-tint)]">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-3 sm:flex-nowrap">
                <span aria-hidden="true" className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-[color:var(--ink-3)]">
                  {String(idx + 1).padStart(3, "0")}
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/content/${item.id}`}
                    className="block truncate text-sm font-semibold text-[color:var(--ink)] underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {item.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--ink-3)]">
                    <Tag>{item.content_type.replace("_", " ")}</Tag>
                    <span>{item.department || "No department"}</span>
                    <span aria-hidden="true" className="text-[color:var(--hairline-strong)]">/</span>
                    <span>{item.owner_name}</span>
                    <span aria-hidden="true" className="text-[color:var(--hairline-strong)]">/</span>
                    <span className="font-mono">v{item.current_version}</span>
                    <span aria-hidden="true" className="text-[color:var(--hairline-strong)]">/</span>
                    <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString()}</time>
                  </div>
                </div>

                <span className="shrink-0"><StatusPill status={item.status} /></span>

                <span className="flex shrink-0 items-center gap-1.5">
                  <Link href={`/content/${item.id}`} tabIndex={-1} className="hidden sm:block">
                    <Button size="sm" variant="ghost">Review report</Button>
                  </Link>
                  <Link href={`/content/${item.id}/approval`} tabIndex={-1}>
                    <Button size="sm">Approval</Button>
                  </Link>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      {items && visible.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="font-mono text-2xs uppercase tracking-[0.12em] text-[color:var(--ink-3)]">
            End of ledger · {visible.length} record{visible.length === 1 ? "" : "s"}
          </p>
          <span className="text-[color:var(--ink-2)]"><DeskSentri size={40} mood="idle" /></span>
        </div>
      )}
    </div>
  );
}
