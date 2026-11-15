"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ChangeSection, GuidelineChange, RuleReviewTask } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, EmptyState, SectionHeading, Skeleton, Tag, TextArea, useToast } from "../../components/ui";

const STATUS_TONE: Record<string, "neutral" | "navy" | "amber"> = {
  added: "navy", removed: "amber", changed: "amber", unchanged: "neutral",
};

const TASK_LABEL: Record<string, string> = {
  needs_review: "Waiting for a person",
  kept: "Kept as it was",
  edited: "Edited — new version",
  retired: "Retired",
};

/** Who may answer. Mirrors DECIDERS in routers/guidelines.py, and the Approver gate. */
function canDecide(role: string | undefined, task: RuleReviewTask): boolean {
  if (!role) return false;
  if (task.requires_approver) return role === "admin" || role === "approver";
  return role === "admin" || role === "brand_manager" || role === "approver";
}

const pct = (n: number | null | undefined) =>
  typeof n === "number" ? `${Math.round(n * 100)}% similar` : "—";

/**
 * Guideline changes — what a new version of a guideline did to the rules.
 *
 * Two promises are printed on the page because they are the point of it: a
 * change never edits a rule by itself, and a rule keeps working until someone
 * answers. The page is a comparison sheet, not a wizard.
 */
export default function GuidelineChangesPage() {
  const { me } = useAuth();
  const { push } = useToast();
  const [changes, setChanges] = useState<GuidelineChange[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setChanges(await api.get<GuidelineChange[]>("/guideline-changes"));
  }, []);

  useEffect(() => { load().catch((e) => push(e.message, "error")); }, [load, push]);

  async function decide(task: RuleReviewTask, action: "keep" | "edit" | "retire") {
    const body = action === "edit" ? draft[task.id] : undefined;
    if (action === "edit" && !body?.trim()) {
      push("Type the new rule text first — an edit needs something to save.", "error");
      return;
    }
    const reason =
      action === "keep" ? "Section change reviewed; rule still applies as written."
      : action === "retire" ? window.prompt(`Retire ${task.rule_key}? Give a reason (recorded in the audit log).`) ?? ""
      : window.prompt(`Edit ${task.rule_key}? Give a reason (recorded in the audit log).`) ?? "";
    if ((action === "retire" || action === "edit") && !reason.trim()) {
      push("A reason is required — the audit log records who changed the rule and why.", "error");
      return;
    }
    setBusy(task.id);
    try {
      await api.post(`/rule-review-tasks/${task.id}/decide`, { action, body, reason });
      push(
        action === "keep" ? `Kept ${task.rule_key} unchanged.`
        : action === "edit" ? `Edited ${task.rule_key} — a new version was appended, the old one kept.`
        : `Retired ${task.rule_key} — deactivated, not deleted.`,
        "ok",
      );
      setEditing(null);
      await load();
    } catch (err: any) {
      push(err.message, "error");
    } finally {
      setBusy(null);
    }
  }

  const openTasks = (changes || []).reduce((n, c) => n + c.open_tasks, 0);

  return (
    <div>
      <SectionHeading
        title="Guideline changes" as="h1"
        subtitle="When a new version of a guideline arrives, Sentinel compares it with the version it replaces, section by section. Rules that came from a section that changed or vanished are flagged. Nothing is altered until a person decides."
        action={
          <Link
            href="/rules"
            className="rounded-[4px] border border-[color:var(--hairline-strong)] px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.12em] text-[color:var(--ink)] transition-colors hover:border-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
          >
            Back to the rule book
          </Link>
        }
      />

      <p className="mb-5 border-l-[2.5px] border-[color:var(--hairline-strong)] py-1 pl-3 text-xs leading-relaxed text-[color:var(--ink-2)]">
        {changes === null
          ? "Reading the change ledger…"
          : `${changes.length} change${changes.length === 1 ? "" : "s"} recorded · ${openTasks} rule${openTasks === 1 ? "" : "s"} awaiting a decision.`}
      </p>

      {!changes && <Skeleton className="h-48 w-full" />}
      {changes && changes.length === 0 && (
        <EmptyState
          title="No guideline changes yet"
          body="Upload the new version in the Brand Kit under the same document type. Sentinel matches it to the version it replaces by filename, and you can name that version explicitly on the upload form. The section-by-section comparison appears here."
        />
      )}

      <div className="space-y-7">
        {(changes || []).map((change) => (
          <section key={change.id} className="border-t-[1.5px] border-[color:var(--hairline-strong)] pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight text-[color:var(--ink)]">
                {change.filename}
                <span className="ml-2 font-mono text-2xs font-normal uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
                  v{change.previous_version} → v{change.current_version}
                </span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {(["added", "removed", "changed", "unchanged"] as const).map((key) => (
                  <Tag key={key} tone={STATUS_TONE[key]}>
                    {change.summary?.[key] ?? 0} {key}
                  </Tag>
                ))}
                <Tag tone={change.open_tasks > 0 ? "amber" : "neutral"}>
                  {change.open_tasks > 0 ? `${change.open_tasks} open` : "settled"}
                </Tag>
              </div>
            </div>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
              {change.created_at ? new Date(change.created_at).toLocaleString() : "—"} · diff of{" "}
              {change.sections.length} section{change.sections.length === 1 ? "" : "s"}
            </p>

            <table className="mt-3 w-full text-left text-xs">
              <caption className="sr-only">Sections compared between the two versions of {change.filename}</caption>
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
                  <th scope="col" className="py-1.5 pr-3 font-medium">Section</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Change</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Similarity</th>
                  <th scope="col" className="py-1.5 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {change.sections.map((section: ChangeSection, i) => (
                  <tr key={`${section.title}-${i}`} className="border-t border-[color:var(--hairline)] align-top">
                    <td className="py-1.5 pr-3 font-medium text-[color:var(--ink)]">{section.title}</td>
                    <td className="py-1.5 pr-3">
                      <Tag tone={STATUS_TONE[section.status] || "neutral"}>{section.status}</Tag>
                    </td>
                    <td className="py-1.5 pr-3 font-mono tabular-nums text-[color:var(--ink-2)]">
                      {pct(section.similarity)}
                    </td>
                    <td className="max-w-72 py-1.5 text-[color:var(--ink-2)]">
                      {(section.notes && section.notes.length > 0 && section.notes.join("; "))
                        || (section.similar_to ? `Looks like “${section.similar_to}”` : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {change.tasks.length === 0 && (
              <p className="mt-3 text-xs text-[color:var(--ink-2)]">
                No rule cited a section that changed, so there is nothing to review for this version.
              </p>
            )}

            {change.tasks.length > 0 && (
              <ul className="mt-4 space-y-3">
                {change.tasks.map((task) => {
                  const settled = task.status !== "needs_review";
                  const allowed = canDecide(me?.user.role, task);
                  return (
                    <li
                      key={task.id}
                      className={`border-l-[2.5px] py-2 pl-3 ${
                        settled
                          ? "border-[color:var(--hairline-strong)]"
                          : "border-[color:var(--warn)] bg-[color:var(--paper-2)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Tag tone="navy">{task.rule_key}</Tag>
                        <span className="text-sm font-semibold text-[color:var(--ink)]">
                          {task.rule_title || "Untitled rule"}
                        </span>
                        {task.requires_approver && <Tag tone="amber">Approver required</Tag>}
                        <Tag tone={settled ? "neutral" : "amber"}>{TASK_LABEL[task.status] || task.status}</Tag>
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
                          {task.section_title} · {task.change_status}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--ink-2)]">
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
                          Rule as it stands:
                        </span>{" "}
                        {task.rule_body || task.previous_body || "—"}
                      </p>
                      {task.change_status === "removed" ? (
                        <p className="mt-1 text-xs leading-relaxed text-[color:var(--ink-2)]">
                          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
                            Section no longer in the guideline:
                          </span>{" "}
                          “{task.section_title}” does not appear in the new version at all, so this
                          rule now stands on text that has been withdrawn.
                        </p>
                      ) : task.current_body && (
                        <p className="mt-1 text-xs leading-relaxed text-[color:var(--ink-2)]">
                          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
                            Guideline now says:
                          </span>{" "}
                          {task.current_body}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-[color:var(--ink-3)]">
                        {settled
                          ? `Decided by ${task.decided_by_name || "—"}${task.decided_at ? ` on ${new Date(task.decided_at).toLocaleString()}` : ""}.`
                          : "The rule still applies in reviews. Keep it, edit it, or retire it."}
                      </p>

                      {!settled && allowed && (
                        <div className="mt-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="secondary" disabled={busy === task.id}
                              onClick={() => decide(task, "keep")}
                              aria-label={`Keep ${task.rule_key} as it is`}>
                              Keep as is
                            </Button>
                            <Button size="sm" variant="secondary"
                              disabled={busy === task.id}
                              aria-expanded={editing === task.id}
                              onClick={() => {
                                setEditing(editing === task.id ? null : task.id);
                                setDraft((d) => ({ ...d, [task.id]: d[task.id] ?? task.rule_body ?? "" }));
                              }}>
                              Edit rule
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy === task.id}
                              onClick={() => decide(task, "retire")}
                              aria-label={`Retire ${task.rule_key}`}>
                              Retire
                            </Button>
                          </div>
                          {editing === task.id && (
                            <div className="mt-2">
                              <label
                                htmlFor={`body-${task.id}`}
                                className="mb-1 block font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-2)]"
                              >
                                New text for {task.rule_key} — saved as a new version, the old one kept
                              </label>
                              <TextArea
                                id={`body-${task.id}`}
                                value={draft[task.id] ?? ""}
                                onChange={(e) => setDraft((d) => ({ ...d, [task.id]: e.target.value }))}
                                className="text-sm"
                              />
                              <div className="mt-2">
                                <Button size="sm" disabled={busy === task.id} onClick={() => decide(task, "edit")}>
                                  Save this edit as a new version
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {!settled && !allowed && (
                        <p className="mt-1.5 text-[11px] text-[color:var(--ink-3)]">
                          {task.requires_approver
                            ? "This rule needs an Approver to keep, edit or retire it."
                            : "Your role cannot answer a rule review task."}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
