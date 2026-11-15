"use client";
import { useCallback, useEffect, useState } from "react";
import { api, Rule } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, EmptyState, SectionHeading, Skeleton, Tag, useToast } from "../components/ui";
import { Icon } from "../components/Icon";

const CATEGORY_LABEL: Record<string, string> = {
  brand_voice: "Brand Voice", terminology: "Terminology", fact: "Fact Checker",
  visual: "Visual", accessibility: "Accessibility", legal: "Legal",
};

/**
 * The rule book. Each rule is a numbered clause with its key set in the margin, the
 * way a statute is printed; the version history opens beneath it as a ledger rather
 * than a dialog, because a history you cannot compare side by side is not a history.
 */
export default function RulesPage() {
  const { can } = useAuth();
  const { push } = useToast();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, Rule[]>>({});

  const load = useCallback(async () => {
    const data = await api.get<Rule[]>("/rules");
    setRules(data);
  }, []);

  useEffect(() => { load().catch((e) => push(e.message, "error")); }, [load, push]);

  async function toggle(rule: Rule) {
    if (open === rule.id) { setOpen(null); return; }
    setOpen(rule.id);
    if (!versions[rule.id]) {
      const history = await api.get<Rule[]>(`/rules/${rule.id}/versions`);
      setVersions((v) => ({ ...v, [rule.id]: history }));
    }
  }

  async function revert(rule: Rule, version: number) {
    const reason = window.prompt(`Revert ${rule.key} to version ${version}? Give a reason (recorded in the audit log).`);
    if (reason === null) return;
    try {
      await api.post(`/rules/${rule.id}/revert/${version}`, { reason });
      push(`Reverted ${rule.key} — a new version was created, history kept.`, "ok");
      setVersions((v) => ({ ...v, [rule.id]: undefined as any }));
      await load();
      const history = await api.get<Rule[]>(`/rules/${rule.id}/versions`);
      setVersions((v) => ({ ...v, [rule.id]: history }));
    } catch (err: any) {
      push(err.message, "error");
    }
  }

  const grouped = (rules || []).reduce<Record<string, Rule[]>>((acc, rule) => {
    (acc[rule.category] ||= []).push(rule);
    return acc;
  }, {});

  const approverCount = (rules || []).filter((r) => r.requires_approver).length;

  return (
    <div>
      <SectionHeading
        title="Rules and version history" as="h1"
        subtitle="A rule is never overwritten. Editing or reverting appends a version with an author, a date, a scope and a reason."
      />

      {!rules && <Skeleton className="h-48 w-full" />}
      {rules && rules.length === 0 && <EmptyState title="No rules yet" body="Confirm rules from the Brand Kit first." />}

      {rules && rules.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
          {/* the index, stuck to the margin like a thumb index */}
          <nav aria-label="Rule categories" className="hidden lg:block">
            <div className="sticky top-4 border-l-[1.5px] border-[color:var(--hairline-strong)] pl-3">
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">
                {rules.length} rules · {approverCount} need an approver
              </p>
              <ul className="mt-2 space-y-0.5">
                {Object.entries(grouped).map(([category, rows]) => (
                  <li key={category}>
                    <a
                      href={`#cat-${category}`}
                      className="group flex items-baseline justify-between gap-2 rounded-[4px] py-1 pr-1 text-xs text-[color:var(--ink-2)] transition-colors hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                    >
                      <span className="group-hover:underline">{CATEGORY_LABEL[category] || category}</span>
                      <span className="font-mono text-[10px] tabular-nums text-[color:var(--ink-3)]">{rows.length}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-[color:var(--hairline)] pt-2 text-[10px] leading-relaxed text-[color:var(--ink-3)]">
                Reverting never deletes: it appends a new version carrying the old text.
              </p>
            </div>
          </nav>

          <div className="min-w-0 space-y-7">
            {Object.entries(grouped).map(([category, rows]) => (
              <section key={category} id={`cat-${category}`} className="scroll-mt-4">
                <h2 className="mb-2 flex items-baseline gap-2 border-b-[1.5px] border-[color:var(--hairline-strong)] pb-1.5">
                  <span className="text-base font-semibold tracking-tight text-[color:var(--ink)]">
                    {CATEGORY_LABEL[category] || category}
                  </span>
                  <span className="font-mono text-2xs tabular-nums text-[color:var(--ink-3)]">
                    {String(rows.length).padStart(2, "0")}
                  </span>
                </h2>

                <ul className="divide-y divide-[color:var(--hairline)]">
                  {rows.map((rule) => (
                    <li key={rule.id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Tag tone="navy">{rule.key}</Tag>
                            <span className="text-sm font-semibold text-[color:var(--ink)]">{rule.title}</span>
                            {rule.requires_approver && <Tag tone="amber">Approver required</Tag>}
                            {!rule.active && <Tag>inactive</Tag>}
                          </div>
                          <p className="prose-measure mt-1.5 text-sm leading-relaxed text-[color:var(--ink-2)]">{rule.body}</p>
                          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
                            v{rule.current_version} · {rule.check_type} check ·{" "}
                            {rule.scope_department ? `department: ${rule.scope_department}` : "all departments"} ·{" "}
                            {rule.scope_content_type ? `content type: ${rule.scope_content_type}` : "all content types"}
                            {rule.source_section ? ` · source: ${rule.source_section}` : ""}
                          </p>
                        </div>
                        <Button size="sm" onClick={() => toggle(rule)} aria-expanded={open === rule.id}>
                          <span className="flex items-center gap-1.5">
                            {open === rule.id ? "Hide history" : "Version history"}
                            <Icon name="chevron" size={12} className={`transition-transform ${open === rule.id ? "rotate-90" : ""}`} />
                          </span>
                        </Button>
                      </div>

                      {open === rule.id && (
                        <div className="mt-3 border-l-[1.5px] border-[color:var(--mark)] bg-[color:var(--paper-2)] pl-3">
                          <table className="w-full text-left text-xs">
                            <caption className="sr-only">Version history for {rule.key}</caption>
                            <thead>
                              <tr className="font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
                                <th scope="col" className="py-1.5 pr-3 font-medium">Version</th>
                                <th scope="col" className="py-1.5 pr-3 font-medium">Author</th>
                                <th scope="col" className="py-1.5 pr-3 font-medium">Date</th>
                                <th scope="col" className="py-1.5 pr-3 font-medium">Scope</th>
                                <th scope="col" className="py-1.5 pr-3 font-medium">Reason</th>
                                <th scope="col" className="py-1.5 font-medium"><span className="sr-only">Actions</span></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(versions[rule.id] || []).map((v) => (
                                <tr key={v.id} className="border-t border-[color:var(--hairline)] align-top">
                                  <td className="py-1.5 pr-3 font-mono">
                                    v{v.version}{" "}
                                    {v.is_current && <span className="text-[color:var(--pass)]">current</span>}
                                    {v.status === "superseded" && <span className="text-[color:var(--ink-3)]"> (superseded)</span>}
                                  </td>
                                  <td className="py-1.5 pr-3">{v.author_name || "—"}</td>
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{v.created_at ? new Date(v.created_at).toLocaleDateString() : "—"}</td>
                                  <td className="py-1.5 pr-3">
                                    {v.scope_department || v.scope_content_type
                                      ? [v.scope_department, v.scope_content_type].filter(Boolean).join(" / ")
                                      : "global"}
                                  </td>
                                  <td className="max-w-56 py-1.5 pr-3 text-[color:var(--ink-2)]">{v.reason || "—"}</td>
                                  <td className="py-1.5 text-right">
                                    {!v.is_current && can("can_approve") && (
                                      <Button size="sm" variant="ghost" onClick={() => revert(rule, v.version)}>Revert</Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="mt-1.5 pb-1.5 text-[11px] text-[color:var(--ink-3)]">
                            Reverting does not delete anything: it appends a new version with the old text.
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
