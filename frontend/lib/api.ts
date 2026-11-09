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
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: any) => d.msg).join("; ");
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
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
  decision_status: "open" | "accepted" | "edited" | "dismissed" | "escalated";
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
