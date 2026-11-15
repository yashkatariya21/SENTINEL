"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api, ContentItem, CONTENT_TYPES } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Field, Select, TextArea, TextInput, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { DeskSentri } from "../components/Desk";
import { ReviewerAvatar } from "../components/brand/ReviewerAvatar";
import { CHARACTER_LIST } from "../components/brand/characters";

/**
 * New submission — a blank proof sheet on the left, and on the right the six
 * people who will read it. Their roundels light up in sequence as a reminder that
 * the review is six independent passes, not one opaque score.
 */
export default function NewSubmissionPage() {
  const { me } = useAuth();
  const router = useRouter();
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState("social_post");
  const [department, setDepartment] = useState(me?.user.department || "");
  const [text, setText] = useState("");
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const maxMb = 20;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let item: ContentItem;
      if (mode === "paste") {
        item = await api.post<ContentItem>("/content", {
          title, content_type: contentType, department: department || null, text,
        });
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error("Choose a DOCX, PDF or image file first.");
        if (file.size > maxMb * 1024 * 1024) throw new Error(`That file is over the ${maxMb}MB limit.`);
        const form = new FormData();
        form.append("file", file);
        form.append("title", title);
        form.append("content_type", contentType);
        if (department) form.append("department", department);
        if (alt) form.append("alt", alt);
        item = await api.upload<ContentItem>("/content/upload", form);
      }
      await api.post(`/content/${item.id}/analyze`);
      push("Submitted. Six reviewers are reading it now.", "ok");
      router.push(`/content/${item.id}`);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 border-b-[1.5px] border-[color:var(--hairline-strong)] pb-4">
        <p className="font-mono text-2xs uppercase tracking-[0.24em] text-[color:var(--ink-3)]">
          Submission desk <span className="mx-2 text-[color:var(--hairline)]">/</span> blank sheet
        </p>
        <h1 className="mt-2 text-[1.9rem] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">
          New submission
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[color:var(--ink-2)]">
          Paste text or upload a DOCX, PDF or image. Sentinel reviews it; it never publishes or edits it.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <form onSubmit={submit} className="min-w-0">
          {/* the sheet: a hairline, a mono header strip, then the fields */}
          <div className="desk-sheet rounded-[10px] border-[1.5px] border-[color:var(--hairline-strong)] bg-[color:var(--paper)]">
            <div className="flex items-center justify-between border-b border-[color:var(--hairline)] px-4 py-2">
              <div className="flex gap-1" role="tablist" aria-label="Input method">
                {([["paste", "Paste text"], ["upload", "Upload file"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={mode === key}
                    onClick={() => setMode(key)}
                    className={`rounded-[4px] px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.12em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
                      mode === key
                        ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                        : "text-[color:var(--ink-3)] hover:bg-[color:var(--highlight-tint)] hover:text-[color:var(--ink)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="font-mono text-2xs uppercase tracking-[0.12em] text-[color:var(--ink-3)]">
                {mode === "paste" ? `${text.trim().length} characters` : `max ${maxMb} MB`}
              </span>
            </div>

            <div className="p-4">
              <Field label="Title" htmlFor="title" required hint="How this draft will appear in the queue.">
                <TextInput id="title" value={title} onChange={(e) => setTitle(e.target.value)}
                           placeholder="e.g. Q4 renewal social post" required maxLength={300} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Content type" htmlFor="content-type" required
                       hint="The type decides which scoped rules apply.">
                  <Select id="content-type" value={contentType} onChange={(e) => setContentType(e.target.value)}>
                    {CONTENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                </Field>
                <Field label="Department" htmlFor="department" hint="Departments can carry their own rule scopes.">
                  <Select id="department" value={department} onChange={(e) => setDepartment(e.target.value)}>
                    <option value="">No department</option>
                    {(me?.organisation.departments || []).map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </Field>
              </div>

              {mode === "paste" ? (
                <Field label="Content" htmlFor="text" required
                       hint="Paste the exact text you intend to publish. Formatting hints (12pt, #FF00FF) are checked too.">
                  <TextArea id="text" value={text} onChange={(e) => setText(e.target.value)} rows={12}
                            placeholder="Paste your draft here…" required={mode === "paste"}
                            className="font-doc !text-[16px] !leading-[1.75]" />
                </Field>
              ) : (
                <>
                  <Field label="File" htmlFor="file" required
                         hint={`DOCX, PDF, PNG, JPG or WEBP · up to ${maxMb}MB. Files are stored in object storage and parsed server-side.`}>
                    <input
                      id="file"
                      ref={fileRef}
                      type="file"
                      accept=".docx,.pdf,.png,.jpg,.jpeg,.webp,.txt"
                      className="w-full rounded-[6px] border border-[color:var(--hairline-strong)] bg-[color:var(--paper)] px-3 py-2 text-xs text-[color:var(--ink)] file:mr-3 file:rounded-[4px] file:border-0 file:bg-[color:var(--ink)] file:px-3 file:py-1.5 file:font-mono file:text-2xs file:uppercase file:tracking-[0.1em] file:text-[color:var(--paper)]"
                      required={mode === "upload"}
                    />
                  </Field>
                  <Field label="Alt text (images only)" htmlFor="alt"
                         hint="Leave blank to let the Accessibility reviewer flag the missing description.">
                    <TextInput id="alt" value={alt} onChange={(e) => setAlt(e.target.value)}
                               placeholder="Describe the image, or leave blank deliberately" />
                  </Field>
                </>
              )}

              {error && (
                <p role="alert" className="mb-3 flex items-start gap-2 rounded-[6px] border border-[color:var(--mark)] bg-[color:var(--mark-tint)] px-3 py-2 text-xs text-[color:var(--mark-text)]">
                  <Icon name="alert" size={15} /> {error}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--hairline)] pt-4">
                <p className="max-w-md text-[11px] leading-relaxed text-[color:var(--ink-3)]">
                  Submitted content is treated as data. Instruction-like text (for example “ignore previous
                  instructions”) is detected and shown to reviewers — it is never followed.
                </p>
                <Button type="submit" variant="primary" loading={busy}
                        disabled={!title.trim() || (mode === "paste" ? text.trim().length < 10 : false)}>
                  Run review
                </Button>
              </div>
            </div>
          </div>
        </form>

        {/* -------------------------------------------------- who reads this */}
        <aside className="min-w-0">
          <div className="rounded-[10px] border border-[color:var(--hairline)] bg-[color:var(--paper)] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">Six readers</p>
                <h2 className="mt-1 text-sm font-semibold text-[color:var(--ink)]">Who reads this draft</h2>
              </div>
              <DeskSentri size={54} mood={busy ? "reading" : "idle"} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ink-3)]">
              Each reads the whole draft in parallel, on its own question, and returns span-level findings with a rule
              and a source.
            </p>
            <ul className="mt-3 divide-y divide-[color:var(--hairline)]">
              {CHARACTER_LIST.map((c, i) => (
                <li
                  key={c.key}
                  className="ink-bleed flex items-start gap-2.5 py-2"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <ReviewerAvatar reviewer={c.reviewer} size={30} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[color:var(--ink)]">{c.name}</span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
                      {c.role} · {c.catchphrase}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 rounded-[10px] border border-[color:var(--hairline)] bg-[color:var(--paper-2)] p-4">
            <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">What happens next</p>
            <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-[color:var(--ink-2)]">
              {[
                "Deterministic checks run first — approved and banned terms, colours, alt text, contrast.",
                "The six readers run, then duplicates merge and confidence is scored.",
                "You land on the proof desk with every mark in place. Nothing publishes itself.",
              ].map((line, i) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="font-mono text-[10px] text-[color:var(--ink-3)]">{String(i + 1).padStart(2, "0")}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
