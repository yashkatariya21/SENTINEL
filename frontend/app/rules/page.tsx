"use client";
import { useCallback, useEffect, useState } from "react";
import { api, Rule, REVIEWERS } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, EmptyState, SectionHeading, Skeleton, Tag, useToast } from "../components/ui";

const CATEGORY_LABEL: Record<string, string> = {
  brand_voice: "Brand Voice", terminology: "Terminology", fact: "Fact Checker",
  visual: "Visual", accessibility: "Accessibility", legal: "Legal",
};

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

  return (
    <div>
      <SectionHeading
        title="Rules and version history"
        subtitle="A rule is never overwritten. Editing or reverting appends a version with an author, a date, a scope and a reason."
      />

      {!rules && <Skeleton className="h-48 w-full" />}
      {rules && rules.length === 0 && <EmptyState title="No rules yet" body="Confirm rules from the Brand Kit first." />}

      <div className="space-y-6">
        {Object.entries(grouped).map(([category, rows]) => (
          <section key={category}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              {CATEGORY_LABEL[category] || category}
              <span className="rounded bg-white px-1.5 py-0.5 text-xs font-normal text-ink-mute">{rows.length}</span>
            </h2>
            <div className="space-y-2">
              {rows.map((rule) => (
                <Card key={rule.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Tag tone="navy">{rule.key}</Tag>
                        <span className="text-sm font-semibold text-ink">{rule.title}</span>
                        {rule.requires_approver && <Tag tone="amber">Approver required</Tag>}
                        {!rule.active && <Tag>inactive</Tag>}
                      </div>
                      <p className="mt-1.5 text-sm text-ink-soft">{rule.body}</p>
                      <p className="mt-1 text-[11px] text-ink-mute">
                        v{rule.current_version} · {rule.check_type} check ·{" "}
                        {rule.scope_department ? `department: ${rule.scope_department}` : "all departments"} ·{" "}
                        {rule.scope_content_type ? `content type: ${rule.scope_content_type}` : "all content types"}
                        {rule.source_section ? ` · source: ${rule.source_section}` : ""}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => toggle(rule)} aria-expanded={open === rule.id}>
                      {open === rule.id ? "Hide history" : "Version history"}
                    </Button>
                  </div>

                  {open === rule.id && (
                    <div className="mt-3 border-t border-ink/10 pt-3">
                      <table className="w-full text-left text-xs">
                        <caption className="sr-only">Version history for {rule.key}</caption>
                        <thead>
                          <tr className="text-ink-mute">
                            <th scope="col" className="py-1 pr-3 font-medium">Version</th>
                            <th scope="col" className="py-1 pr-3 font-medium">Author</th>
                            <th scope="col" className="py-1 pr-3 font-medium">Date</th>
                            <th scope="col" className="py-1 pr-3 font-medium">Scope</th>
                            <th scope="col" className="py-1 pr-3 font-medium">Reason</th>
                            <th scope="col" className="py-1 font-medium"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(versions[rule.id] || []).map((v) => (
                            <tr key={v.id} className="border-t border-ink/5 align-top">
                              <td className="py-1.5 pr-3">
                                v{v.version} {v.is_current && <span className="text-confirmed">current</span>}
                                {v.status === "superseded" && <span className="text-ink-mute"> (superseded)</span>}
                              </td>
                              <td className="py-1.5 pr-3">{v.author_name || "—"}</td>
                              <td className="py-1.5 pr-3">{v.created_at ? new Date(v.created_at).toLocaleDateString() : "—"}</td>
                              <td className="py-1.5 pr-3">
                                {v.scope_department || v.scope_content_type
                                  ? [v.scope_department, v.scope_content_type].filter(Boolean).join(" / ")
                                  : "global"}
                              </td>
                              <td className="max-w-56 py-1.5 pr-3 text-ink-soft">{v.reason || "—"}</td>
                              <td className="py-1.5 text-right">
                                {!v.is_current && can("can_approve") && (
                                  <Button size="sm" variant="ghost" onClick={() => revert(rule, v.version)}>Revert</Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-[11px] text-ink-mute">
                        Reverting does not delete anything: it appends a new version with the old text.
                      </p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
