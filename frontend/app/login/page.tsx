"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, DEMO_USERS } from "@/lib/auth";
import { LoadDemoButton, ResetDemoButton } from "../components/Demo";
import { Crest, PatternDivider } from "../components/brand/Crest";
import { Damask } from "../components/brand/Pattern";
import { Button, Card, Field, Select, TextInput, useToast } from "../components/ui";

export default function LoginPage() {
  const { login, setup, loginAs } = useAuth();
  const { push } = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "setup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
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
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ------------------------------------------------ left: the charter */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-gradient-royal px-7 py-10 text-ivory lg:px-14">
        <Damask className="pointer-events-none absolute inset-0 h-full w-full text-gold-soft" opacity={0.07} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <Crest size={44} tone="gold" />
            <div>
              <p className="font-crest text-xl font-semibold leading-none tracking-wide">SENTINEL AI</p>
              <p className="mt-1 text-2xs uppercase tracking-[0.22em] text-gold-soft/80">
                Pre-publication brand governance
              </p>
            </div>
          </div>

          <h1 className="mt-14 max-w-lg font-display text-[2.6rem] font-semibold leading-[1.08] text-ivory">
            Every word,
            <span className="block text-gold-soft">approved.</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-ivory/80">
            Six specialist reviewers read each draft against your Brand Kit. Every finding quotes the rule,
            shows its source, and waits for a human.
          </p>

          <PatternDivider className="my-8 max-w-md text-gold/50" />

          <ul className="max-w-md space-y-3.5 text-sm text-ivory/85">
            {[
              ["Every finding is explained", "the rule, the quoted section and the evidence page — or an honest “no approved source found”."],
              ["Humans decide, always", "nothing publishes, nothing auto-fixes, no rule changes without a manager’s click."],
              ["The system learns on your terms", "a manager’s override becomes a versioned exception, scoped and reversible."],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                <span>
                  <span className="font-semibold text-ivory">{title}</span>
                  <span className="block text-ivory/70">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-10 max-w-md rounded-lg border border-gold/25 bg-navy/40 p-3 text-2xs leading-relaxed text-ivory/70">
          Sentinel reviews and explains. It never publishes, never auto-fixes, and never changes a rule without a
          manager’s click. Legal reviewer output is an AI risk perspective, not legal advice.
        </p>
      </section>

      {/* --------------------------------------------------- right: sign in */}
      <section id="main" className="flex items-center justify-center px-5 py-10 sm:px-6">
        <div className="w-full max-w-md">
          {/* Phase 1: one-click demo, before sign-in */}
          <Card className="mb-5 border-gold/40 p-4">
            <p className="font-display text-base font-semibold text-navy">See it with real data</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Builds the fictional Northwind Analytics workspace, reviews {53} submissions with the six
              reviewers, and signs you in as the Manager. About a minute on the local engine.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <LoadDemoButton
                label="Load demo data"
                onDone={(itemId) => itemId && router.push(`/content/${itemId}`)}
              />
              <ResetDemoButton />
            </div>
          </Card>

          <div
            className="mb-5 flex gap-1 rounded-lg border border-ink/10 bg-white p-1 dark:border-ivory/15 dark:bg-night-card"
            role="tablist"
            aria-label="Authentication mode"
          >
            {[
              { key: "signin", label: "Sign in" },
              { key: "setup", label: "Create workspace" },
            ].map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={mode === tab.key}
                onClick={() => setMode(tab.key as "signin" | "setup")}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition duration-200 ease-royal ${
                  mode === tab.key ? "bg-navy text-ivory shadow-card" : "text-ink-soft hover:bg-ivory-deep"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <Card className="corner-ornament p-6">
            <form onSubmit={submit} aria-describedby={error ? "auth-error" : undefined}>
              {mode === "signin" ? (
                <>
                  <Field label="Work email" htmlFor="email" required>
                    <TextInput id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
                  </Field>
                  <Field label="Password" htmlFor="password"
                    hint="Your own workspace password. For the demo, use the role switcher below." required>
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
                <p id="auth-error" role="alert" className="mb-3 rounded-lg border border-critical/40 bg-critical-tint px-3 py-2 text-xs text-critical">
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
              <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-mute">
                Demo workspace — Northwind Analytics
              </p>
              <label className="mb-2 mt-2 block text-xs text-ink-mute" htmlFor="quick">
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
              <p className="mt-2 text-xs leading-relaxed text-ink-mute">
                Demo roles need no password — choosing one signs you in on this machine only. Real
                workspaces sign in with the credentials created for them above.
              </p>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
