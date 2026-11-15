"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useReducedMotion } from "@/lib/motion";
import { Button, EmptyState, SectionHeading, Skeleton, Tag } from "../components/ui";
import { Icon } from "../components/Icon";

interface Entry {
  id: string; action: string; actor: string; actor_role: string;
  entity: string; entity_id: string | null; detail: any; created_at: string; entry_hash: string;
}

export default function AuditPage() {
  const { me, loading: authLoading } = useAuth();
  const allowed = me?.permissions?.can_read_audit ?? false;
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [chain, setChain] = useState<any>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  /* Verification sweep: the server does the hashing; this only shows the walk down the
     chain, row by row, at a pace a person can follow. The result shown is always the
     server's, never a guess — the animation cannot disagree with it. */
  const reduced = useReducedMotion();
  const [verifying, setVerifying] = useState(false);
  const [sweptTo, setSweptTo] = useState(-1);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const verifyNow = useCallback(async () => {
    clearTimers();
    setVerifying(true);
    setSweptTo(reduced ? 9999 : -1);
    try {
      const d = await api.get<{ entries: Entry[]; chain: any }>("/audit?limit=200");
      setEntries(d.entries);
      setChain(d.chain);
      setVerifiedAt(new Date().toLocaleTimeString("en-GB"));
      if (!reduced) {
        const rows = Math.min(d.entries.length, 24);
        for (let i = 0; i < rows; i++) {
          timers.current.push(
            window.setTimeout(() => setSweptTo(i), Math.round((i * 900) / Math.max(rows, 1))),
          );
        }
        timers.current.push(window.setTimeout(() => setVerifying(false), 1050));
      } else {
        setVerifying(false);
      }
    } catch (e) {
      setVerifying(false);
      setError(e instanceof Error ? e.message : "Verification could not run.");
    }
  }, [clearTimers, reduced]);

  useEffect(() => {
    // Roles that cannot read the audit trail should not even ask: a predictable 403 in
    // every network log looks like a fault. The permission is already in /auth/me.
    if (authLoading) return;
    if (!allowed) { setForbidden(true); return; }
    api.get<{ entries: Entry[]; chain: any }>("/audit?limit=200")
      .then((d) => { setEntries(d.entries); setChain(d.chain); })
      .catch((e) => {
        // Opened directly by URL and the server disagrees with the client: explain, don't
        // print a bare "403 Forbidden" on a blank page.
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setError(e.message);
      });
  }, [authLoading, allowed]);

  const visible = (entries || []).filter((e) =>
    !filter || `${e.action} ${e.actor} ${e.entity} ${JSON.stringify(e.detail)}`.toLowerCase().includes(filter.toLowerCase()));

  if (forbidden) {
    return (
      <div>
        <SectionHeading
          title="Audit log" as="h1"
          subtitle="Append-only and hash-chained, so tampering is detectable."
        />
        <EmptyState
          title="This page is for Admins, Brand Managers and Approvers"
          body="Your role can review content and raise findings, but not read the audit trail. Ask an Admin if you need an export of it."
        />
      </div>
    );
  }

  if (error) return <div className="rounded-[8px] border border-[color:var(--mark)] bg-[color:var(--mark-tint)] p-4 text-sm text-[color:var(--mark-text)]" role="alert">{error}</div>;

  return (
    <div>
      <SectionHeading
        title="Audit log"
        as="h1"
        subtitle="Append-only and hash-chained: each entry commits to the one before it, so tampering is detectable."
        action={chain && (
          <span className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.1em] ${
              chain.ok ? "border-[color:var(--pass)] text-[color:var(--pass)]" : "border-[color:var(--mark)] text-[color:var(--mark-text)]"}`}>
              <Icon name={chain.ok ? "check" : "alert"} size={13} />
              {chain.ok ? `Chain verified · ${chain.entries} entries` : `Chain broken at ${chain.broken_at}`}
              {verifiedAt && <span className="text-[10px] opacity-70">at {verifiedAt}</span>}
            </span>
            <Button size="sm" variant="secondary" onClick={verifyNow} disabled={verifying}>
              {verifying ? "Walking the chain…" : "Verify now"}
            </Button>
          </span>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 border-y border-[color:var(--hairline)] bg-[color:var(--paper)] px-3 py-2.5">
        <label htmlFor="audit-filter" className="font-mono text-2xs uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
          Filter
        </label>
        <div className="relative min-w-[14rem] flex-1">
          <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[color:var(--ink-3)]">
            <Icon name="search" size={14} />
          </span>
          <input id="audit-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
                 placeholder="Action, actor, entity or detail"
                 className="w-full rounded-[6px] border border-[color:var(--hairline-strong)] bg-[color:var(--paper)] py-1.5 pl-8 pr-3 text-xs text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]" />
        </div>
        <p className="font-mono text-2xs uppercase tracking-[0.1em] text-[color:var(--ink-3)]">{visible.length} shown</p>
      </div>

      {!entries && <Skeleton className="h-64 w-full" />}
      {entries && visible.length === 0 && <EmptyState title="No audit entries match" />}

      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-[10px] border border-[color:var(--hairline)] bg-[color:var(--paper)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Audit log entries, newest first</caption>
            <thead className="sticky top-14 z-10 bg-[color:var(--paper-2)] font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-3)]">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">When</th>
                <th scope="col" className="px-3 py-2 font-medium">Actor</th>
                <th scope="col" className="px-3 py-2 font-medium">Action</th>
                <th scope="col" className="px-3 py-2 font-medium">Entity</th>
                <th scope="col" className="px-3 py-2 font-medium">Detail</th>
                <th scope="col" className="px-3 py-2 font-medium">Hash</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr
                  key={e.id}
                  className={`border-t border-[color:var(--hairline)] align-top transition-colors duration-200 ${
                    sweptTo >= 0 && visible.indexOf(e) <= sweptTo ? "bg-[color:var(--highlight-tint)]" : "hover:bg-[color:var(--paper-2)]"
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] tabular-nums text-[color:var(--ink-3)]">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="block font-medium text-[color:var(--ink)]">{e.actor}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">{e.actor_role || "system"}</span>
                  </td>
                  <td className="px-3 py-2"><Tag tone="navy">{e.action}</Tag></td>
                  <td className="px-3 py-2 font-mono text-[11px] text-[color:var(--ink-2)]">{e.entity}</td>
                  <td className="max-w-72 px-3 py-2 font-mono text-[11px] leading-relaxed text-[color:var(--ink-2)]">
                    <span className="line-clamp-2">{JSON.stringify(e.detail)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-[color:var(--ink-3)]">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full align-middle ${
                        sweptTo >= 0 && visible.indexOf(e) <= sweptTo ? "bg-[color:var(--pass)]" : "bg-[color:var(--hairline)]"
                      }`}
                      aria-hidden="true"
                    />{" "}
                    <span title={e.entry_hash}>{e.entry_hash.slice(0, 10)}…</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
