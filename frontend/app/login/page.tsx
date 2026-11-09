"use client";
import { useState } from "react";
import { useAuth, DEMO_USERS, DEMO_PASSWORD } from "@/lib/auth";
import { Button, Card, Field, Select, TextInput, useToast } from "../components/ui";

export default function LoginPage() {
  const { login, setup, loginAs } = useAuth();
  const { push } = useToast();
  const [mode, setMode] = useState<"signin" | "setup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "tom@northwind.example",
    password: DEMO_PASSWORD,
    org_name: "",
    slug: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
  });

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signin") {
        await login(form.email, form.password);
      } else {
        await setup({
          org_name: form.org_name,
          slug: form.slug,
          admin_name: form.admin_name,
          admin_email: form.admin_email,
          admin_password: form.admin_password,
          departments: ["Marketing", "Product", "Sales", "Support"],
        });
        push("Workspace created. Upload a Brand Kit next.", "ok");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: product story */}
      <section className="flex flex-col justify-between bg-navy-900 px-8 py-10 text-white lg:px-14">
        <div>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-lg font-bold text-navy-900">S</span>
            <div>
              <p className="text-lg font-semibold leading-tight">Sentinel AI</p>
              <p className="text-xs text-white/60">Pre-publication brand governance</p>
            </div>
          </div>

          <h1 className="mt-12 max-w-md text-3xl font-semibold leading-tight">
            Six reviewers read every draft. Every finding shows its source. Humans decide.
          </h1>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {[
              ["Brand Voice", "tone and style against the guideline"],
              ["Terminology", "approved words, not banned ones"],
              ["Fact Checker", "claims compared with approved documents"],
              ["Visual", "logo version, colours, fonts, ratio"],
              ["Accessibility", "contrast, text size, alt text"],
              ["Legal", "risky claims without proof"],
            ].map(([name, job]) => (
              <li key={name} className="flex gap-3">
                <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span><span className="font-medium text-white">{name}</span> — {job}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-10 max-w-md rounded-lg border border-white/15 bg-white/5 p-3 text-xs leading-relaxed text-white/70">
          Sentinel reviews and explains. It never publishes, never auto-fixes, and never changes a rule without a
          manager&apos;s click. Legal reviewer output is an AI risk perspective, not legal advice.
        </p>
      </section>

      {/* Right: auth */}
      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex gap-1 rounded-lg border border-ink/10 bg-white p-1" role="tablist" aria-label="Authentication mode">
            {[
              { key: "signin", label: "Sign in" },
              { key: "setup", label: "Create workspace" },
            ].map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={mode === tab.key}
                onClick={() => setMode(tab.key as "signin" | "setup")}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                  mode === tab.key ? "bg-navy-700 text-white" : "text-ink-soft hover:bg-paper"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <Card className="p-6">
            <form onSubmit={submit} aria-describedby={error ? "auth-error" : undefined}>
              {mode === "signin" ? (
                <>
                  <Field label="Work email" htmlFor="email" required>
                    <TextInput id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
                  </Field>
                  <Field label="Password" htmlFor="password" required>
                    <TextInput id="password" type="password" autoComplete="current-password" value={form.password} onChange={set("password")} required />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Company / workspace name" htmlFor="org_name" required>
                    <TextInput id="org_name" value={form.org_name} onChange={set("org_name")} placeholder="Acme Foods" required />
                  </Field>
                  <Field label="Workspace slug" htmlFor="slug" hint="Lowercase letters, numbers and hyphens. Used in URLs." required>
                    <TextInput id="slug" value={form.slug} onChange={set("slug")} placeholder="acme-foods" pattern="[a-z0-9\-]+" required />
                  </Field>
                  <Field label="Your name" htmlFor="admin_name" required>
                    <TextInput id="admin_name" value={form.admin_name} onChange={set("admin_name")} required />
                  </Field>
                  <Field label="Your email" htmlFor="admin_email" required>
                    <TextInput id="admin_email" type="email" value={form.admin_email} onChange={set("admin_email")} required />
                  </Field>
                  <Field label="Password" htmlFor="admin_password" hint="At least 8 characters." required>
                    <TextInput id="admin_password" type="password" value={form.admin_password} onChange={set("admin_password")} minLength={8} required />
                  </Field>
                </>
              )}

              {error && (
                <p id="auth-error" role="alert" className="mb-3 rounded-lg border border-danger-500/40 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" loading={busy} className="w-full">
                {mode === "signin" ? "Sign in" : "Create workspace"}
              </Button>
            </form>
          </Card>

          {mode === "signin" && (
            <Card className="mt-4 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-mute">Demo workspace — Northwind Analytics</p>
              <label className="mb-2 block text-xs text-ink-mute" htmlFor="quick">
                Sign in as any role to see its permissions
              </label>
              <Select
                id="quick"
                defaultValue=""
                onChange={async (e) => {
                  if (e.target.value) {
                    setBusy(true);
                    try { await loginAs(e.target.value); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
                  }
                }}
              >
                <option value="">Choose a demo user…</option>
                {DEMO_USERS.map((u) => (
                  <option key={u.email} value={u.email}>{u.name} — {u.role} · {u.detail}</option>
                ))}
              </Select>
              <p className="mt-2 text-xs text-ink-mute">Password for all demo users: <code className="rounded bg-paper px-1">{DEMO_PASSWORD}</code></p>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
