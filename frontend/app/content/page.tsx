"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, ContentItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, EmptyState, SectionHeading, Select, Skeleton, StatusPill, Tag } from "../components/ui";

const STATUSES = ["all", "draft", "in_review", "changes_requested", "approved", "rejected"];

export default function ContentQueuePage() {
  const { me } = useAuth();
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.get<ContentItem[]>("/content").then(setItems).catch(() => setItems([]));
  }, []);

  const visible = useMemo(() => (items || []).filter((i) => {
    if (status !== "all" && i.status !== status) return false;
    if (query && !`${i.title} ${i.owner_name || ""} ${i.department || ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [items, status, query]);

  return (
    <div>
      <SectionHeading
        title="Content queue"
        subtitle={
          me?.user.role === "external_creator"
            ? "You can see the content you submitted. Approval decisions stay with the brand team."
            : "Everything submitted in this workspace, newest first."
        }
        action={<Link href="/new"><Button variant="primary">New submission</Button></Link>}
      />

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label htmlFor="status-filter" className="mb-1 block text-xs text-ink-mute">Status</label>
          <Select id="status-filter" value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto">
            {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s.replace("_", " ")}</option>)}
          </Select>
        </div>
        <div className="min-w-56 flex-1">
          <label htmlFor="queue-search" className="mb-1 block text-xs text-ink-mute">Search</label>
          <input
            id="queue-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, owner or department"
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/30"
          />
        </div>
        <p className="text-xs text-ink-mute">{visible.length} item{visible.length === 1 ? "" : "s"}</p>
      </Card>

      {!items && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {items && visible.length === 0 && (
        <EmptyState title="Nothing here yet"
                    body="Submit a draft from the New submission page to get a review report."
                    action={<Link href="/new"><Button variant="primary">New submission</Button></Link>} />
      )}

      <div className="space-y-2">
        {visible.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/content/${item.id}`} className="truncate text-sm font-semibold text-ink hover:underline">
                    {item.title}
                  </Link>
                  <StatusPill status={item.status} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
                  <Tag>{item.content_type.replace("_", " ")}</Tag>
                  <span>{item.department || "No department"}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.owner_name}</span>
                  <span aria-hidden="true">·</span>
                  <span>v{item.current_version}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString()}</time>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`/content/${item.id}`}><Button size="sm">Review report</Button></Link>
                <Link href={`/content/${item.id}/approval`}><Button size="sm" variant="primary">Approval</Button></Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
