"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, readableError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Button, Card, EmptyState, Field, SectionHeading, Select, Skeleton, Tag, TextInput, useToast,
} from "../components/ui";
import { Figure, TabStrip } from "../components/Desk";

interface Kit { id: string; name: string; version: number; status: string; documents: number; rules: number; terms: number; facts: number; assets: number }
interface Doc { id: string; filename: string; mime: string; kind: string; version: number; pages: number; size_bytes: number; status: string; created_at: string; chunks: number; replaces_document_id?: string | null; superseded_by?: string | null; change_id?: string | null; review_tasks?: number }
/** What an upload that replaced a version did to the rules drawn from it. */
interface DiffNote { filename: string; version: number; previousVersion: number; changeId: string; tasks: number }
interface Term { id: string; kind: string; value: string; replacement: string | null; severity: string; note: string | null; status: string }
interface Fact { id: string; statement: string; value: string | null; topic: string | null; status: string; source_document: string | null; source_page: number | null }
interface Asset { id: string; kind: string; name: string; value: string; version: string | null; status: string; meta: any }
interface Proposal { id: string; key?: string; title?: string; body?: string; category?: string; value?: string; kind?: string; replacement?: string | null; statement?: string; severity?: string }

export default function BrandKitPage() {
  const { me, can } = useAuth();
  const { push } = useToast();
  const [kit, setKit] = useState<Kit | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [proposals, setProposals] = useState<{ rules: Proposal[]; terms: Proposal[]; facts: Proposal[] } | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [tab, setTab] = useState<"documents" | "proposals" | "terms" | "facts" | "assets" | "health">("documents");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [docKind, setDocKind] = useState("guideline");
  const [replacesId, setReplacesId] = useState("");
  const [lastDiff, setLastDiff] = useState<DiffNote | null>(null);
  const [newTerm, setNewTerm] = useState({ kind: "banned", value: "", replacement: "" });
  const [newFact, setNewFact] = useState({ statement: "", topic: "" });
  const [loaded, setLoaded] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);

  const writable = can("can_write_kit");

  const load = useCallback(async () => {
    const kits = await api.get<Kit[]>("/brand-kits");
    const active = kits.find((k) => k.status === "active") || kits[0] || null;
    setKit(active);
    const [d, t, f, a] = await Promise.all([
      api.get<Doc[]>("/documents"), api.get<Term[]>("/terms"),
      api.get<Fact[]>("/facts"), api.get<Asset[]>("/assets"),
    ]);
    setDocs(d); setTerms(t); setFacts(f); setAssets(a);
    setLoaded(true);
    if (active) {
      const [p, h] = await Promise.all([
        api.get<any>(`/brand-kits/${active.id}/proposals`),
        api.get<any>(`/brand-kits/${active.id}/health`),
      ]);
      setProposals(p); setHealth(h);
    }
  }, []);

  useEffect(() => {
    load().catch((e) => {
      setLoaded(true);
      push(readableError(e, "The Brand Kit could not be loaded."), "error");
    });
  }, [load, push]);

  /**
   * Load the bundled sample kit into an empty one.
   *
   * The rules, terms and facts are the fictional set from `seed/brand_kit.py`, written on
   * the server, and every one of them arrives labelled "sample". Nothing is invented here
   * and nothing overwrites a kit that already holds content — the server refuses that.
   */
  async function loadSample() {
    if (!kit) return;
    setSampleBusy(true);
    try {
      const res = await api.post<{ loaded: { rules: number; terms: number; facts: number }; note: string }>(
        `/brand-kits/${kit.id}/sample`,
      );
      push(`Sample kit loaded: ${res.loaded.rules} rules, ${res.loaded.terms} terms, ${res.loaded.facts} approved facts. All fictional.`, "ok");
      await load();
    } catch (err: unknown) {
      push(readableError(err, "The sample kit could not be loaded."), "error");
    } finally {
      setSampleBusy(false);
    }
  }

  /** Only used when the workspace somehow has no kit at all (older workspaces). */
  async function createKit() {
    setSampleBusy(true);
    try {
      await api.post<Kit>("/brand-kits", { name: "Brand Kit", version: 1 });
      push("Brand Kit created. Load the sample or upload your own guideline.", "ok");
      await load();
    } catch (err: unknown) {
      push(readableError(err, "The Brand Kit could not be created."), "error");
    } finally {
      setSampleBusy(false);
    }
  }

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.querySelector<HTMLInputElement>('input[type="file"]');
    const file = input?.files?.[0];
    if (!file || !kit) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", docKind);
      form.append("brand_kit_id", kit.id);
      if (replacesId) form.append("replaces_document_id", replacesId);
      const doc = await api.upload<Doc>("/documents", form);
      setReplacesId("");
      if (doc.change_id) {
        // The upload replaced a version: say what the comparison found and where the
        // decisions are made. Nothing about the rules has changed — only a task exists.
        const previous = docs.find((d) => d.id === doc.replaces_document_id);
        setLastDiff({
          filename: doc.filename, version: doc.version,
          previousVersion: previous?.version ?? doc.version - 1,
          changeId: doc.change_id, tasks: doc.review_tasks ?? 0,
        });
        // The notice above the tabs already says this in full; a toast would repeat it.
      } else {
        push(`Ingested ${doc.filename}: ${doc.chunks ?? 0} chunks embedded. Check the Proposals tab.`, "ok");
      }
      if (input) input.value = "";
      setTab("proposals");
      await load();
    } catch (err: any) {
      push(err.message, "error");
    } finally {
      setUploading(false);
    }
  }

  async function confirmProposals(action: "confirm" | "reject") {
    if (!kit || selected.size === 0) return;
    try {
      const res = await api.post<any>(`/brand-kits/${kit.id}/confirm`, { ids: Array.from(selected), action });
      push(`${res.confirmed} item(s) ${action === "confirm" ? "confirmed — they now drive reviews" : "rejected"}.`, "ok");
      setSelected(new Set());
      await load();
    } catch (err: any) {
      push(err.message, "error");
    }
  }

  async function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allProposals = proposals ? [...proposals.rules, ...proposals.terms, ...proposals.facts] : [];

  return (
    <div>
      <SectionHeading
        title="Brand Kit" as="h1"
        subtitle="The single source of truth the reviewers check against. Extracted rules, terms and facts stay in draft until an Admin confirms them."
        action={kit && <Tag tone={kit.status === "active" ? "navy" : "amber"}>{kit.status === "active" ? "Active kit" : kit.status}</Tag>}
      />

      {!loaded ? (
        <Skeleton className="h-40 w-full" />
      ) : !kit ? (
        <Card className="p-5">
          <SectionHeading
            title="No Brand Kit yet"
            subtitle="The reviewers check your content against a Brand Kit: rules, banned and approved terms, approved facts, colours, fonts and a logo. There is none in this workspace, so start with a sample or create an empty one."
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={createKit} loading={sampleBusy} disabled={!writable}>
              Create an empty Brand Kit
            </Button>
            <span className="text-xs text-ink-mute">
              Only an Admin or Brand Manager can do this.
            </span>
          </div>
          <p className="mt-3 rounded-lg border border-dashed border-ink/20 bg-[color:var(--paper-2)] p-3 text-xs leading-relaxed text-ink-2">
            Content can still be uploaded and reviewed without a kit — the run will say that its
            results were limited to built-in checks.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 divide-[color:var(--hairline)] border-y border-[color:var(--hairline)] bg-[color:var(--paper)] sm:grid-cols-5 sm:divide-x">
            {[
              ["Documents", kit.documents], ["Rules", kit.rules], ["Terms", kit.terms],
              ["Facts", kit.facts], ["Assets", kit.assets],
            ].map(([label, value]) => (
              <Figure key={label as string} value={String(value as number).padStart(2, "0")} label={label as string} />
            ))}
          </div>

          {!writable && (
            <p className="mb-4 rounded-lg border border-ink/10 bg-white px-3 py-2 text-xs text-ink-mute">
              Read-only for your role. Only Admins and Brand Managers can change the Brand Kit.
            </p>
          )}

          {writable && kit.rules === 0 && kit.terms === 0 && kit.facts === 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border-[1.5px] border-dashed border-[color:var(--hairline-strong)] bg-[color:var(--paper)] p-4">
              <div className="min-w-0">
                <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">
                  Empty kit · fastest way to a first review
                </p>
                <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-[color:var(--ink-2)]">
                  Load the fictional <strong>sample Brand Kit</strong>: 14 rules, 10 terms, 8 approved facts,
                  the colours and fonts the visual reviewer checks against, and the guideline document they
                  cite. It is demo content, every item is labelled <em>sample</em>, and you can replace or
                  delete any of it.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone="amber">Sample</Tag>
                <Button variant="primary" onClick={loadSample} loading={sampleBusy}>
                  Start with a sample Brand Kit
                </Button>
              </div>
            </div>
          )}

          {lastDiff && (
            <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border-l-[2.5px] border-[color:var(--warn)] bg-[color:var(--paper-2)] p-4">
              <div className="min-w-0">
                <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">
                  New version compared
                </p>
                <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-[color:var(--ink-2)]">
                  <strong className="text-[color:var(--ink)]">{lastDiff.filename}</strong> v{lastDiff.previousVersion} → v{lastDiff.version} was
                  compared section by section. {lastDiff.tasks > 0
                    ? <>{lastDiff.tasks} rule{lastDiff.tasks === 1 ? "" : "s"} came from a section that changed or vanished and await{lastDiff.tasks === 1 ? "s" : ""} a decision. Nothing has been altered.</>
                    : <>No rule cited a section that changed, so nothing needs a decision.</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/rules/changes" className="rounded-[4px] border border-[color:var(--hairline-strong)] px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.12em] text-[color:var(--ink)] transition-colors hover:border-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]">
                  Open the comparison
                </Link>
                <button type="button" onClick={() => setLastDiff(null)} aria-label="Dismiss" className="font-mono text-2xs uppercase tracking-[0.12em] text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">Dismiss</button>
              </div>
            </div>
          )}

          <TabStrip
            className="mb-4"
            label="Brand Kit sections"
            value={tab}
            onChange={(key) => setTab(key as typeof tab)}
            tabs={[
              { key: "documents", label: "Documents" },
              { key: "proposals", label: "Proposals", count: allProposals.length },
              { key: "terms", label: "Terms" },
              { key: "facts", label: "Approved facts" },
              { key: "assets", label: "Colours, fonts, logo" },
              { key: "health", label: "Readiness" },
            ]}
          />

          {tab === "documents" && (
            <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
              <Card className="p-5">
                <SectionHeading title="Upload a document"
                               subtitle="PDF, DOCX, term list or logo. Text is extracted, chunked to 300–500 tokens with overlap, and embedded." />
                <form onSubmit={upload}>
                  <Field label="Document type" htmlFor="doc-kind">
                    <Select id="doc-kind" value={docKind} onChange={(e) => setDocKind(e.target.value)}>
                      <option value="guideline">Brand guideline</option>
                      <option value="legal">Legal document</option>
                      <option value="term_list">Term list</option>
                      <option value="approved_facts">Approved facts</option>
                      <option value="logo">Logo asset</option>
                      <option value="other">Other</option>
                    </Select>
                  </Field>
                  <Field label="Replaces" htmlFor="doc-replaces"
                         hint="Optional. A new version is normally matched by its filename; name it here when the name changed too. The two are then compared section by section.">
                    <Select id="doc-replaces" value={replacesId} onChange={(e) => setReplacesId(e.target.value)}
                            disabled={!writable}>
                      <option value="">Detect from the filename</option>
                      {docs
                        .filter((d) => d.kind === docKind && !d.superseded_by)
                        .map((d) => (
                          <option key={d.id} value={d.id}>{d.filename} · v{d.version}</option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="File" htmlFor="doc-file" hint="Max 20MB. Type and size are validated before storage.">
                    <input id="doc-file" type="file" disabled={!writable}
                           accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
                           className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-navy-700" />
                  </Field>
                  <Button type="submit" variant="primary" loading={uploading} disabled={!writable}>
                    Ingest and propose rules
                  </Button>
                </form>
              </Card>

              <Card className="p-5">
                <SectionHeading title="Documents" subtitle="Extraction, chunk and delete controls" />
                {docs.length === 0 ? <EmptyState title="No documents yet" /> : (
                  <ul className="space-y-2">
                    {docs.map((doc) => (
                      <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{doc.filename}</p>
                          <p className="text-xs text-ink-mute">
                            {doc.kind} · v{doc.version} · {doc.pages || "—"} page(s) · {doc.chunks} chunks · {(doc.size_bytes / 1024).toFixed(0)}KB · {doc.status}
                          </p>
                          {(doc.superseded_by || doc.replaces_document_id) && (
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
                              {doc.superseded_by ? "Replaced by a later version" : "Replaces the previous version"}
                            </p>
                          )}
                        </div>
                        <Button size="sm" variant="danger" disabled={!writable}
                                onClick={async () => {
                                  if (!confirm(`Delete ${doc.filename}? Its chunks will no longer be used as evidence.`)) return;
                                  await api.del(`/documents/${doc.id}`);
                                  push("Document deleted.", "ok");
                                  await load();
                                }}>
                          Delete
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}

          {tab === "proposals" && (
            <Card className="p-5">
              <SectionHeading
                title="Extracted rules, terms and facts"
                subtitle="Nothing here affects a review until an Admin confirms it. Ticking is per item; the AI proposes, you decide."
                action={
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!writable || selected.size === 0} onClick={() => confirmProposals("reject")}>
                      Reject selected
                    </Button>
                    <Button size="sm" variant="primary" disabled={!writable || selected.size === 0}
                            onClick={() => confirmProposals("confirm")}>
                      Confirm selected ({selected.size})
                    </Button>
                    <Button size="sm" variant="ghost" disabled={!writable} onClick={async () => {
                      if (!confirm("Re-derive proposals from the kit documents? Existing proposals are replaced; confirmed rules are untouched.")) return;
                      try {
                        const res = await api.post<{ created: number }>(`/brand-kits/${kit!.id}/refresh-proposals`);
                        push(`${res.created} candidate item(s) extracted.`, "ok");
                        await load();
                      } catch (err: any) { push(err.message, "error"); }
                    }}>Re-extract</Button>
                  </div>
                }
              />
              {allProposals.length === 0 ? (
                <EmptyState title="Nothing waiting for confirmation"
                            body="Upload a guideline document, or re-derive proposals from the documents already in this kit."
                            action={writable ? (
                              <Button variant="primary" onClick={async () => {
                                try {
                                  const res = await api.post<{ created: number }>(`/brand-kits/${kit!.id}/refresh-proposals`);
                                  push(`${res.created} candidate item(s) extracted. Confirm what you agree with.`, "ok");
                                  await load();
                                } catch (err: any) { push(err.message, "error"); }
                              }}>
                                Extract proposals from my documents
                              </Button>
                            ) : undefined} />
              ) : (
                <div className="space-y-5">
                  {([
                    ["Rules", proposals!.rules, "rule"],
                    ["Terms", proposals!.terms, "term"],
                    ["Facts", proposals!.facts, "fact"],
                  ] as const).map(([label, rows, kind]) => rows.length > 0 && (
                    <section key={label}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</h3>
                      <ul className="space-y-2">
                        {rows.map((row: any) => (
                          <li key={row.id} className="flex gap-3 rounded-lg border border-ink/10 p-3">
                            <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)}
                                   disabled={!writable} aria-label={`Select ${label} ${row.title || row.value || row.statement}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-ink">
                                {row.title || row.value || row.statement}
                                {row.key && <span className="ml-2"><Tag>{row.key}</Tag></span>}
                                {row.category && <span className="ml-1"><Tag tone="navy">{row.category}</Tag></span>}
                              </p>
                              {row.body && <p className="mt-1 text-xs text-ink-soft">{row.body}</p>}
                              {row.replacement && <p className="mt-1 text-xs text-ink-mute">Preferred: “{row.replacement}”</p>}
                              {row.source_section && <p className="mt-1 text-[11px] text-ink-mute">Suggested from: {row.source_section}</p>}
                            </div>
                            {row.status && <span className="self-start text-[11px] text-ink-mute">{row.status}</span>}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </Card>
          )}

          {tab === "terms" && (
            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <Card className="p-5">
                <SectionHeading title="Term lists" subtitle="Banned terms produce Confirmed findings from a deterministic check." />
                <ul className="space-y-2">
                  {terms.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 p-2.5">
                      <div>
                        <p className="text-sm text-ink">
                          <span className="font-medium">{t.value}</span>
                          {t.replacement && <span className="text-ink-mute"> → {t.replacement}</span>}
                        </p>
                        <p className="text-[11px] text-ink-mute">{t.note}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Tag tone={t.kind === "banned" ? "amber" : "navy"}>{t.kind}</Tag>
                        <Tag>{t.status}</Tag>
                        {writable && t.status !== "deleted" && (
                          <Button size="sm" variant="ghost" onClick={async () => {
                            await api.del(`/terms/${t.id}`); push("Term removed.", "ok"); await load();
                          }}>Remove</Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-5">
                <SectionHeading title="Add a term" />
                <Field label="Kind" htmlFor="term-kind">
                  <Select id="term-kind" value={newTerm.kind} onChange={(e) => setNewTerm({ ...newTerm, kind: e.target.value })}>
                    <option value="banned">Banned</option>
                    <option value="approved">Approved</option>
                    <option value="required">Required</option>
                  </Select>
                </Field>
                <Field label="Term" htmlFor="term-value" required>
                  <TextInput id="term-value" value={newTerm.value} onChange={(e) => setNewTerm({ ...newTerm, value: e.target.value })} />
                </Field>
                <Field label="Preferred replacement" htmlFor="term-replacement">
                  <TextInput id="term-replacement" value={newTerm.replacement}
                             onChange={(e) => setNewTerm({ ...newTerm, replacement: e.target.value })} />
                </Field>
                <Button variant="primary" disabled={!writable || !newTerm.value.trim()} onClick={async () => {
                  try {
                    await api.post("/terms", { ...newTerm, status: "confirmed" });
                    setNewTerm({ kind: "banned", value: "", replacement: "" });
                    push("Term added and confirmed.", "ok");
                    await load();
                  } catch (err: any) { push(err.message, "error"); }
                }}>Add term</Button>
              </Card>
            </div>
          )}

          {tab === "facts" && (
            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <Card className="p-5">
                <SectionHeading title="Approved facts"
                               subtitle="The only numbers allowed in external content. The Fact Checker compares every claim with this list." />
                <ul className="space-y-2">
                  {facts.map((f) => (
                    <li key={f.id} className="rounded-lg border border-ink/10 p-2.5">
                      <p className="text-sm text-ink">{f.statement}</p>
                      <p className="text-[11px] text-ink-mute">
                        {f.topic || "general"} {f.value ? `· ${f.value}` : ""}{" "}
                        {f.source_document ? `· ${f.source_document}${f.source_page ? ` p${f.source_page}` : ""}` : ""} · {f.status}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-5">
                <SectionHeading title="Add a fact" />
                <Field label="Statement" htmlFor="fact-statement" required>
                  <TextInput id="fact-statement" value={newFact.statement}
                             onChange={(e) => setNewFact({ ...newFact, statement: e.target.value })}
                             placeholder="87% of customers renew within 12 months" />
                </Field>
                <Field label="Topic" htmlFor="fact-topic">
                  <TextInput id="fact-topic" value={newFact.topic} onChange={(e) => setNewFact({ ...newFact, topic: e.target.value })}
                             placeholder="renewal rate" />
                </Field>
                <Button variant="primary" disabled={!writable || !newFact.statement.trim()} onClick={async () => {
                  try {
                    await api.post("/facts", newFact);
                    setNewFact({ statement: "", topic: "" });
                    push("Fact added.", "ok");
                    await load();
                  } catch (err: any) { push(err.message, "error"); }
                }}>Add fact</Button>
              </Card>
            </div>
          )}

          {tab === "assets" && (
            <Card className="p-5">
              <SectionHeading title="Brand assets"
                               subtitle="Colours drive the off-palette check; fonts and logo version drive the Visual reviewer." />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {["colour", "font", "logo"].map((kind) => (
                  <div key={kind}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">
                      {kind === "colour" ? "Colours" : kind === "font" ? "Fonts" : "Logo"}
                    </h3>
                    <ul className="space-y-2">
                      {assets.filter((a) => a.kind === kind).map((a) => (
                        <li key={a.id} className="flex items-center gap-2 rounded-lg border border-ink/10 p-2">
                          {a.kind === "colour" && (
                            <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded border border-ink/20"
                                  style={{ background: a.value }} />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm text-ink">{a.name}</p>
                            <p className="font-mono text-[11px] text-ink-mute">{a.value} {a.version ? `· v${a.version}` : ""}</p>
                          </div>
                          <Tag>{a.status}</Tag>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === "health" && health && (
            <Card className="p-5">
              <SectionHeading title="Readiness"
                               subtitle="What an Admin should confirm before the kit goes live." />
              <ul className="space-y-2">
                {health.checks.map((c: any) => (
                  <li key={c.item} className="flex items-center gap-2 text-sm">
                    <span aria-hidden="true" className={c.ok ? "text-confirmed" : "text-possible"}>{c.ok ? "✓" : "○"}</span>
                    <span className={c.ok ? "text-ink-soft" : "text-ink"}>{c.item}</span>
                    <span className="sr-only">{c.ok ? "complete" : "not complete"}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink-mute">
                {health.ready ? "This kit is ready: all six reviewer categories are covered."
                              : "Some checks are open. Reviews still run, but coverage will be narrower."}
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
