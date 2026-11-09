"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Field, Modal, Select, TextArea, useToast } from "./ui";

export interface LearningPromptData {
  overrideId: string;
  findingIssue: string;
  requiresApprover: boolean;
  category: string;
}

interface Props {
  data: LearningPromptData | null;
  departments: string[];
  onClose: () => void;
  onDone: (result: any) => void;
}

/**
 * The learning prompt. A manager overriding the AI is asked, explicitly:
 * "Make this an approved rule?" — Yes / No / Yes for one department or content type only.
 * Nothing changes until this is answered, and nothing is applied automatically.
 */
export function LearningPrompt({ data, departments, onClose, onDone }: Props) {
  const [choice, setChoice] = useState<"yes" | "no" | "scoped">("yes");
  const [scopeKind, setScopeKind] = useState<"department" | "content_type">("content_type");
  const [department, setDepartment] = useState(departments[0] || "");
  const [contentType, setContentType] = useState("ad");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { push } = useToast();

  if (!data) return null;

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        make_rule: choice !== "no",
        scope: choice === "scoped" ? scopeKind : "global",
        reason: reason || undefined,
      };
      if (choice === "scoped" && scopeKind === "department") body.department = department;
      if (choice === "scoped" && scopeKind === "content_type") body.content_type = contentType;
      const res = await api.post<any>(`/overrides/${data!.overrideId}/answer`, body);
      setResult(res);
      onDone(res);
      push(
        res.status === "pending_approval"
          ? "Sent to an Approver: legal and accessibility rules need compliance sign-off."
          : res.status === "promoted"
          ? "New rule version created and the labelled test set was re-run."
          : "Noted. No rule was created.",
        "ok",
      );
    } catch (err: any) {
      push(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const regression = result.regression || {};
    return (
      <Modal open onClose={onClose} title="Learning prompt answered" footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
        <p className="text-sm text-ink">{result.next_step}</p>
        {result.status === "promoted" && (
          <div className="mt-4 rounded-lg border border-ink/10 bg-paper p-3 text-xs text-ink-soft">
            <p className="font-medium text-ink">Regression suite</p>
            {regression.error ? (
              <p className="mt-1 text-danger-700">Could not complete: {regression.error}</p>
            ) : (
              <p className="mt-1">
                Re-ran {regression.samples ?? "the"} labelled samples.{" "}
                {regression.passed === false ? (
                  <span className="font-medium text-danger-700">Regressions detected — review before relying on this rule.</span>
                ) : (
                  <span className="font-medium text-ok-600">No regressions across the six reviewers.</span>
                )}
              </p>
            )}
          </div>
        )}
        {result.status === "pending_approval" && (
          <p className="mt-3 text-xs text-ink-mute">
            Nothing takes effect yet. An Approver must confirm {result.category} rule changes — that gate is not
            removable by a manager.
          </p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Make this an approved rule?"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Not now</Button>
          <Button variant="primary" onClick={submit} loading={busy}>Continue</Button>
        </>
      }
    >
      <p className="mb-4 rounded-lg border border-ink/10 bg-paper px-3 py-2 text-xs text-ink-soft">
        You overrode the AI on: <span className="font-medium text-ink">{data.findingIssue}</span>
        {data.requiresApprover && (
          <span className="mt-1 block text-amber-700">
            This is a {data.category} finding: an Approver must confirm any rule change.
          </span>
        )}
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-ink">Should future reviews enforce your decision?</legend>
        {[
          { key: "yes", label: "Yes, make it a rule everywhere", hint: "Applies to all content types and departments." },
          { key: "no", label: "No, this was a one-off", hint: "The decision is recorded but no rule is created." },
          { key: "scoped", label: "Yes, for one department or content type only", hint: "Narrowest safe scope." },
        ].map((opt) => (
          <label key={opt.key} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${choice === opt.key ? "border-navy-500 bg-navy-50" : "border-ink/15"}`}>
            <input
              type="radio"
              name="learning-choice"
              value={opt.key}
              checked={choice === opt.key}
              onChange={() => setChoice(opt.key as any)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-ink">{opt.label}</span>
              <span className="block text-xs text-ink-mute">{opt.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {choice === "scoped" && (
        <div className="mt-4 rounded-lg border border-ink/10 p-3">
          <Field label="Scope this rule to" htmlFor="scope-kind">
            <Select id="scope-kind" value={scopeKind} onChange={(e) => setScopeKind(e.target.value as any)}>
              <option value="content_type">One content type</option>
              <option value="department">One department</option>
            </Select>
          </Field>
          {scopeKind === "content_type" ? (
            <Field label="Content type" htmlFor="scope-ct">
              <Select id="scope-ct" value={contentType} onChange={(e) => setContentType(e.target.value)}>
                <option value="ad">Ad</option>
                <option value="social_post">Social post</option>
                <option value="blog">Blog</option>
                <option value="email">Email</option>
              </Select>
            </Field>
          ) : (
            <Field label="Department" htmlFor="scope-dept">
              <Select id="scope-dept" value={department} onChange={(e) => setDepartment(e.target.value)}>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}

      <Field label="Why? (recorded in the rule history and audit log)" htmlFor="learning-reason">
        <TextArea id="learning-reason" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Price-led paid social performs better with this wording; approved by Brand." />
      </Field>
    </Modal>
  );
}
