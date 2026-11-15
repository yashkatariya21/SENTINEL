"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, DEMO_USERS } from "@/lib/auth";
import { LoadDemoButton, ResetDemoButton } from "../components/Demo";
import { Button, Card, FloatField, Select, TextInput, useToast } from "../components/ui";
import { DeskSentri, Stamp, Wordmark } from "../components/Desk";
import { Icon } from "../components/Icon";
import { EntrySequence } from "../components/EntrySequence";
import { DeskBackground } from "@/app/components/DeskBackground";

/* a short, marked-up proof — the product in one glance, not a screenshot */
function SampleSheet() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-2 translate-y-2 rounded-[10px] border border-[#3A4149]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-1 translate-y-1 rounded-[10px] border border-[#2A2F38]"
      />
      <div className="relative rounded-[10px] border-[1.5px] border-[#111318] bg-[#FFFFFF] p-4 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)]">
        {/* this sheet never inverts — it is paper stock, so its ink is the light palette */}
        <p className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-[#5A6270]">
          <span>Launch post · v3</span>
          <span className="text-[#C42A1E]">2 open</span>
        </p>
        <p className="font-doc text-[15px] leading-[1.7] text-[#111318]">
          Our platform is the{" "}
          <span className="hl">
            world&rsquo;s best
            <span className="mark-pin">1</span>
          </span>{" "}
          way to ship copy that{" "}
          <span className="hl">
            10x&rsquo;s your reach
            <span className="mark-pin">2</span>
          </span>
          . Teams move faster when the words are already right.
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-[#E6E9EE] pt-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#5A6270]">
            Six reviewers · 2 findings
          </span>
          <Stamp state="hold" tone="stock" className="text-[11px]" />
        </div>
      </div>
      {/* Sentri peers over the top edge of the sheet, reading it upside-down */}
      <div className="pointer-events-none absolute -top-11 right-6 hidden sm:block">
        <DeskSentri size={72} mood="reading" className="drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]" />
      </div>
    </div>
  );
}

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
    <main id="main" className="relative grid min-h-screen bg-[color:var(--canvas)] lg:grid-cols-[1.02fr_0.98fr]">
      <EntrySequence />
      {/* the paper half is a desk, not a void: grid, crop marks, grain, lamp */}
      <DeskBackground variant="public" />

      {/* ------------------------------------------- left: the ink stock panel */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-[#111318] px-7 py-8 text-[#F4F5F7] lg:px-12 lg:py-10">
        {/* a light grid ruled on the ink, and one highlighter wash behind the sheet */}
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]">
          <defs>
            <pattern id="ink-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M28 0H0v28" fill="none" stroke="#9AA1AE" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ink-grid)" />
        </svg>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-1/3 h-64 w-64 rounded-full bg-[#FFE066] opacity-[0.07] blur-3xl"
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <Wordmark tone="paper" className="text-[#F4F5F7]" />
            <span className="ml-1 hidden border-l border-[#3A4149] pl-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9AA1AE] sm:inline">
              Pre-publication brand governance
            </span>
          </div>

          <h1 className="mt-12 max-w-[34ch] text-[2.4rem] font-semibold leading-[1.03] tracking-[-0.035em] sm:text-[3.1rem]">
            Every word,
            <br />
            <span className="relative inline-block">
              <span aria-hidden="true" className="absolute inset-x-0 bottom-[0.12em] top-[0.18em] -z-0 bg-[#FFE066]" />
              <span className="relative px-1 text-[#111318]">held at the gate</span>
            </span>
            .
          </h1>
          <p className="mt-5 max-w-[42ch] text-sm leading-relaxed text-[#C3CAD6]">
            Six specialist reviewers read each draft against your Brand Kit. Every finding quotes the rule, shows its
            source, and waits for a person. Nothing publishes on its own.
          </p>

          <div className="mt-12 max-w-md">
            <SampleSheet />
          </div>
        </div>

        <div className="relative mt-16 lg:mt-10">
          <ul className="grid max-w-md gap-2.5 text-xs text-[#C3CAD6]">
            {[
              ["Humans decide, always", "No auto-fix, no auto-publish, no rule change without a click."],
              ["Every finding is explained", "The rule, the quoted section, the evidence page — or an honest “no approved source found”."],
              ["The system learns on your terms", "An override becomes a versioned exception, scoped and reversible."],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-[#FFE066]">
                  <Icon name="check" size={14} />
                </span>
                <span>
                  <span className="font-semibold text-[#F4F5F7]">{title}.</span>{" "}
                  <span className="text-[#9AA1AE]">{body}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#6C7683]">
              Reviews · Explains · Never publishes
            </span>
            <Link
              href="/welcome"
              className="link-under w-fit font-mono text-[10px] uppercase tracking-[0.22em] text-[#FFE066] hover:text-[#FFF0A8]"
            >
              What Sentinel is — read the brief
            </Link>
          </div>

          <p className="mt-4 max-w-md border-l-2 border-[#3A4149] pl-3 text-[11px] leading-relaxed text-[#9AA1AE]">
            Sentinel reviews and explains. It never publishes, never auto-fixes, and never changes a rule without a
            manager’s click. Legal reviewer output is an AI risk perspective, not legal advice.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------ right: the sign-in */}
      <section className="relative z-10 flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          {/* one-click demo, before sign-in */}
          <div className="desk-sheet mb-5 rounded-[10px] border-[1.5px] border-[color:var(--hairline-strong)] bg-[color:var(--paper)] p-4">
            <p className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">
              <Icon name="pen" size={13} /> See it with real data
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[color:var(--ink-2)]">
              Builds the fictional Northwind Analytics workspace, reviews 53 submissions with the six reviewers, and
              signs you in as the Manager. About a minute on the local engine.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <LoadDemoButton label="Load demo data" onDone={(itemId) => itemId && router.push(`/content/${itemId}`)} />
              <ResetDemoButton />
            </div>
          </div>

          {/* the tabs are two tabs of a filing folder */}
          <div
            className="mb-3 flex gap-1"
            role="tablist"
            aria-label="Authentication mode"
          >
            {[
              { key: "signin", label: "Sign in" },
              { key: "setup", label: "Create workspace" },
            ].map((tab) => {
              const on = mode === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setMode(tab.key as "signin" | "setup")}
                  className={`relative -mb-px flex-1 rounded-t-[8px] border border-b-0 px-3 py-2.5 font-mono text-2xs uppercase tracking-[0.14em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
                    on
                      ? "border-[color:var(--hairline-strong)] bg-[color:var(--paper)] text-[color:var(--ink)]"
                      : "border-[color:var(--hairline)] bg-[color:var(--canvas)] text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
                  }`}
                >
                  {on && <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-[2px] bg-[color:var(--paper)]" />}
                  {tab.label}
                </button>
              );
            })}
          </div>

          <Card className="rounded-tl-none p-6">
            <form onSubmit={submit} aria-describedby={error ? "auth-error" : undefined}>
              {mode === "signin" ? (
                <>
                  <FloatField label="Work email" htmlFor="email" required>
                    <TextInput id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
                  </FloatField>
                  <FloatField
                    label="Password"
                    htmlFor="password"
                    hint="Your own workspace password. For the demo, use the role switcher below."
                    required
                  >
                    <TextInput id="password" type="password" autoComplete="current-password" value={form.password} onChange={set("password")} required />
                  </FloatField>
                </>
              ) : (
                <>
                  <FloatField label="Company / workspace name" htmlFor="org_name" required>
                    <TextInput id="org_name" value={form.org_name} onChange={set("org_name")} placeholder="Acme Foods" required />
                  </FloatField>
                  <FloatField label="Workspace slug" htmlFor="slug" hint="Lowercase letters, numbers and hyphens. Used in URLs." required>
                    <TextInput id="slug" value={form.slug} onChange={set("slug")} placeholder="acme-foods" pattern="[a-z0-9\-]+" required />
                  </FloatField>
                  <FloatField label="Your name" htmlFor="admin_name" required>
                    <TextInput id="admin_name" value={form.admin_name} onChange={set("admin_name")} required />
                  </FloatField>
                  <FloatField label="Your email" htmlFor="admin_email" required>
                    <TextInput id="admin_email" type="email" value={form.admin_email} onChange={set("admin_email")} required />
                  </FloatField>
                  <FloatField label="Password" htmlFor="admin_password" hint="At least 8 characters." required>
                    <TextInput id="admin_password" type="password" value={form.admin_password} onChange={set("admin_password")} minLength={8} required />
                  </FloatField>
                </>
              )}

              {error && (
                <p
                  id="auth-error"
                  role="alert"
                  className="mb-4 animate-[slide-in-left_200ms_ease-out_both] rounded-[6px] border border-[color:var(--mark)] bg-[color:var(--mark-tint)] px-3 py-2 text-xs text-[color:var(--mark-text)]"
                >
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
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">
                Demo workspace — Northwind Analytics
              </p>
              <label className="mb-2 mt-2.5 block text-xs text-[color:var(--ink-2)]" htmlFor="quick">
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
              <p className="mt-2 text-xs leading-relaxed text-[color:var(--ink-3)]">
                Demo roles need no password — choosing one signs you in on this machine only. Real workspaces sign in
                with the credentials created for them above.
              </p>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}
