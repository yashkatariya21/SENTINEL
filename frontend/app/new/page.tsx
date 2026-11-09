"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api, ContentItem, CONTENT_TYPES } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, Field, SectionHeading, Select, TextArea, TextInput, useToast } from "../components/ui";

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
    <div className="mx-auto max-w-3xl">
      <SectionHeading
        title="New submission"
        subtitle="Paste text or upload a DOCX, PDF or image. Sentinel reviews it; it never publishes or edits it."
      />

      <form onSubmit={submit}>
        <Card className="p-5">
          <div className="mb-4 flex gap-1 rounded-lg border border-ink/10 bg-paper p-1" role="tablist" aria-label="Input method">
            {([["paste", "Paste text"], ["upload", "Upload file"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => setMode(key)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${mode === key ? "bg-white text-ink shadow-card" : "text-ink-soft"}`}
              >
                {label}
              </button>
            ))}
          </div>

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
                        placeholder="Paste your draft here…" required={mode === "paste"} />
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
                  className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-navy-700"
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
            <p role="alert" className="mb-3 rounded-lg border border-danger-500/40 bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4">
            <p className="max-w-md text-[11px] leading-relaxed text-ink-mute">
              Submitted content is treated as data. Instruction-like text (for example “ignore previous instructions”)
              is detected and shown to reviewers — it is never followed.
            </p>
            <Button type="submit" variant="primary" loading={busy}
                    disabled={!title.trim() || (mode === "paste" ? text.trim().length < 10 : false)}>
              Run review
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
