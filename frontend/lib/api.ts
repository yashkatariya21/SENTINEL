/** Thin typed client for the Sentinel AI API. The token lives in localStorage. */

const TOKEN_KEY = "sentinel.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  /** The API's machine-readable reason, when it sends one (`no_brand_kit`). */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * A missing Brand Kit is not an error the reader caused, and it is not a crash: it is a
 * state with a one-click fix. Everything that renders an API failure checks this first so
 * those two cases never share a red box.
 */
export function isNoBrandKit(err: unknown): boolean {
  return err instanceof ApiError && (err.code === "no_brand_kit" || err.status === 409 && /brand kit/i.test(err.message));
}

/** A message that is safe to show a person. Never "undefined", never a bare status code. */
export function readableError(err: unknown, fallback = "That did not work. Nothing was changed."): string {
  if (err instanceof ApiError) {
    if (err.status >= 500) return `${err.message} The server refused the request — try again, and if it repeats, tell an Admin.`;
    return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`/v1${path}`, { ...init, headers });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login")) {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail && typeof body.detail === "object" && typeof body.detail.detail === "string") {
        detail = body.detail.detail;
        code = body.detail.code;
      } else if (Array.isArray(body.detail)) detail = body.detail.map((d: any) => d.msg).join("; ");
      if (typeof body.code === "string") code = body.code;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, detail, code);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

/** Fetch a binary endpoint (PDF export) with the same auth and error handling. */
export async function fetchBlob(path: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`/v1${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, detail);
  }
  return res.blob();
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T,>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
};

// --------------------------------------------------------------------------- types
export type Role = "admin" | "brand_manager" | "approver" | "manager" | "creator" | "external_creator";

export interface Me {
  user: { id: string; email: string; name: string; role: Role; department: string | null };
  organisation: { id: string; name: string; slug: string; departments: string[] };
  permissions: Record<string, boolean>;
}

export interface FindingMetrics {
  latency_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost_usd?: number | null;
  provider?: string;
  model?: string;
  deterministic?: boolean;
}

/** What the run itself says it could not check (server-side, always measured facts). */
export interface NoRulesConfirmed {
  count: number;
  note: string;
}

export interface RunMetrics {
  /** Present only when the run had no confirmed rules to check against. */
  no_rules_confirmed?: NoRulesConfirmed;
  /** Present only when a run failed because the workspace has no Brand Kit at all. */
  no_brand_kit?: boolean;
  code?: string;
  wall_ms?: number;
  mean_reviewer_ms?: number | null;
  slowest_reviewer_ms?: number | null;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost_usd_estimate?: number | null;
  provider?: string;
  model?: string;
  note?: string | null;
}

export interface Finding {
  id: string;
  reviewer: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  label: "confirmed" | "possible";
  confidence: number;
  confidence_band: "low" | "medium" | "high";
  human_review_required: boolean;
  span_start: number;
  span_end: number;
  span_text: string;
  block_id: string | null;
  issue: string;
  why: string;
  rule_quote: string | null;
  rule_key: string | null;
  rule_version: number | null;
  evidence: null | {
    document: string; page: number | null; section: string | null;
    chunk_id: string | null; snippet: string | null; score?: number;
  };
  impact: string;
  suggestion: string | null;
  deterministic: boolean;
  provider: string;
  model: string;
  prompt_version: string;
  agreement: number;
  evidence_strength: number;
  metrics?: FindingMetrics;
  /** B3: the pixels a visual finding is about; null when nothing was measured. */
  visual_evidence?: VisualEvidence | null;
  decision_status: "open" | "accepted" | "edited" | "dismissed" | "escalated";
}

/** What `services/image_analysis.py` measured, attached to a finding at review time. */
export interface VisualEvidence {
  page: number;
  /** [x0, y0, x1, y1] in 0..1, so a highlight can be drawn at any width. */
  bbox_norm: [number, number, number, number];
  detected_text: string;
  detected_value: {
    kind: "colour" | "contrast" | "aspect_ratio" | "pixels" | "logo_similarity" | "text" | string;
    measured: string | number | null;
    expected: string | number | null;
  };
  source?: string;
  ocr_confidence?: number | null;
}

export interface AnalysisRun {
  id: string;
  status: "queued" | "running" | "complete" | "failed";
  content_item_id: string;
  content_version_id: string;
  model_provider: string;
  model_name: string;
  embedding_model: string;
  prompt_version: string;
  repeat_runs: number;
  stats: Record<string, any>;
  metrics?: RunMetrics;
  rule_versions: { key: string; version: number; category: string; requires_approver: boolean }[];
  error?: string | null;
  findings: Finding[];
}

export interface ContentItem {
  id: string;
  title: string;
  content_type: "social_post" | "blog" | "ad" | "email";
  department: string | null;
  owner_id: string;
  owner_name?: string | null;
  status: "draft" | "in_review" | "changes_requested" | "approved" | "rejected";
  current_version: number;
  created_at: string;
  submitted_at: string | null;
  active_run_id: string | null;
  version?: {
    id: string; version: number; body_text: string;
    blocks: { id: string; kind: string; text: string; page: number; start: number; end: number; meta: any }[];
    filename?: string | null;
  };
}

export interface Rule {
  id: string;
  key: string;
  category: string;
  check_type: string;
  requires_approver: boolean;
  current_version: number;
  active: boolean;
  version_id: string | null;
  version: number;
  title: string;
  body: string;
  scope_department: string | null;
  scope_content_type: string | null;
  status: string;
  author_name: string | null;
  reason: string | null;
  source_document: string | null;
  source_page: number | null;
  source_section: string | null;
  created_at: string | null;
  is_current?: boolean;
  /** an open review task: a newer guideline version touched the section this rule came from */
  needs_review?: boolean;
}

/** One section of a guideline diff, as `services/guideline_diff.py` reports it. */
export interface ChangeSection {
  title: string;
  previous_title?: string | null;
  status: "added" | "removed" | "changed" | "unchanged";
  similarity: number;
  body?: string | null;
  previous_body?: string | null;
  similar_to?: string | null;
  /** plain-language notes from the differ, e.g. "title renamed, body similar" */
  notes?: string[];
}

/** A rule whose source section changed or vanished. It stays active until a person decides. */
export interface RuleReviewTask {
  id: string;
  guideline_change_id: string;
  rule_id: string;
  rule_key: string;
  category: string;
  rule_title: string | null;
  rule_body: string | null;
  requires_approver: boolean;
  rule_active: boolean;
  section_title: string;
  change_status: string;
  similarity: number | null;
  status: "needs_review" | "kept" | "edited" | "retired";
  previous_body: string | null;
  current_body: string | null;
  notes: string[];
  reason: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string | null;
}

export interface GuidelineChange {
  id: string;
  filename: string;
  current_version: number;
  previous_version: number;
  summary: { added?: number; removed?: number; changed?: number; unchanged?: number };
  sections: ChangeSection[];
  status: "open" | "reviewed";
  created_at: string | null;
  current_document_id: string;
  has_original: boolean;
  tasks: RuleReviewTask[];
  open_tasks: number;
}

export const REVIEWERS: Record<string, { label: string; job: string }> = {
  brand_voice: { label: "Brand Voice", job: "Tone and style against the guideline" },
  terminology: { label: "Terminology", job: "Approved words vs. banned words" },
  fact_checker: { label: "Fact Checker", job: "Claims compared with approved documents" },
  visual: { label: "Visual", job: "Logo version, colours, fonts, ratio, quality" },
  accessibility: { label: "Accessibility", job: "Contrast, text size, alt text, readable font" },
  legal: { label: "Legal", job: "Risky claims without proof" },
};

export const CONTENT_TYPES = [
  { value: "social_post", label: "Social post" },
  { value: "blog", label: "Blog" },
  { value: "ad", label: "Ad" },
  { value: "email", label: "Email" },
];

export const STATUS_STYLES: Record<string, string> = {
  draft: "bg-paper text-ink-soft border-ink-mute/30",
  in_review: "bg-navy-50 text-navy-700 border-navy-500/30",
  changes_requested: "bg-amber-100 text-amber-700 border-amber-500/40",
  approved: "bg-ok-50 text-ok-600 border-ok-600/30",
  rejected: "bg-danger-50 text-danger-700 border-danger-500/30",
};
