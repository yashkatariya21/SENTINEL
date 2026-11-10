"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Card, EmptyState, SectionHeading, Skeleton, Tag } from "../components/ui";

interface Entry {
  id: string; action: string; actor: string; actor_role: string;
  entity: string; entity_id: string | null; detail: any; created_at: string; entry_hash: string;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [chain, setChain] = useState<any>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    api.get<{ entries: Entry[]; chain: any }>("/audit?limit=200")
      .then((d) => { setEntries(d.entries); setChain(d.chain); })
      .catch((e) => {
        // Opening /audit by URL is not an error the reader caused. Say who can read it
        // instead of printing a bare "403 Forbidden" on a blank page.
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setError(e.message);
      });
  }, []);

  const visible = (entries || []).filter((e) =>
    !filter || `${e.action} ${e.actor} ${e.entity} ${JSON.stringify(e.detail)}`.toLowerCase().includes(filter.toLowerCase()));

  if (forbidden) {
    return (
      <div>
        <SectionHeading
          title="Audit log"
          subtitle="Append-only and hash-chained, so tampering is detectable."
        />
        <EmptyState
          title="This page is for Admins, Brand Managers and Approvers"
          body="Your role can review content and raise findings, but not read the audit trail. Ask an Admin if you need an export of it."
        />
      </div>
    );
  }

  if (error) return <Card className="p-6 text-sm text-critical" role="alert">{error}</Card>;

  return (
    <div>
      <SectionHeading
        title="Audit log"
        subtitle="Append-only and hash-chained: each entry commits to the one before it, so tampering is detectable."
        action={chain && (
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
            chain.ok ? "border-confirmed/30 bg-confirmed-tint text-confirmed" : "border-critical/30 bg-critical-tint text-critical"}`}>
            <span aria-hidden="true">{chain.ok ? "⛓" : "!"}</span>
            {chain.ok ? `Chain verified · ${chain.entries} entries` : `Chain broken at ${chain.broken_at}`}
          </span>
        )}
      />

      <Card className="mb-4 p-4">
        <label htmlFor="audit-filter" className="mb-1 block text-xs text-ink-mute">Filter</label>
        <input id="audit-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
               placeholder="Action, actor, entity or detail"
               className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/30" />
      </Card>

      {!entries && <Skeleton className="h-64 w-full" />}
      {entries && visible.length === 0 && <EmptyState title="No audit entries match" />}

      {visible.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Audit log entries, newest first</caption>
            <thead className="bg-paper text-xs text-ink-mute">
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
                <tr key={e.id} className="border-t border-ink/5 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-mute">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="block text-ink">{e.actor}</span>
                    <span className="text-ink-mute">{e.actor_role || "system"}</span>
                  </td>
                  <td className="px-3 py-2"><Tag tone="navy">{e.action}</Tag></td>
                  <td className="px-3 py-2 text-xs text-ink-soft">{e.entity}</td>
                  <td className="max-w-72 px-3 py-2 text-xs text-ink-soft">
                    <span className="line-clamp-2">{JSON.stringify(e.detail)}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-ink-mute">{e.entry_hash.slice(0, 10)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
