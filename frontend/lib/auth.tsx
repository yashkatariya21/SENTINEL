"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api, clearToken, getToken, setToken, Me } from "./api";

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  setup: (payload: Record<string, unknown>) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
  loginAs: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

/** The two public pages: the brief, and the sign-in. */
const PUBLIC_ROUTES = ["/login", "/welcome", "/about", "/trust"];

/** Where a visitor was trying to go before we asked them in.
 *
 *  Kept in sessionStorage rather than the URL so neither public page has to be
 *  rendered dynamically: the brief stays static, and a deep link into the desk
 *  still survives one round trip through the sign-in. Only same-site paths are
 *  ever stored or honoured.
 */
const NEXT_KEY = "sentinel.next";

function rememberNext(path: string) {
  try {
    if (path && path !== "/" && !path.startsWith("/welcome") && !path.startsWith("/login")
        && !path.startsWith("/about") && !path.startsWith("/trust")) {
      window.sessionStorage.setItem(NEXT_KEY, path);
    }
  } catch {
    /* private mode: deep links simply land on the overview */
  }
}

function takeNext(): string | null {
  try {
    const next = window.sessionStorage.getItem(NEXT_KEY);
    window.sessionStorage.removeItem(NEXT_KEY);
    // a path, never a scheme or a protocol-relative URL
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  } catch {
    /* ignore */
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api.get<Me>("/auth/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* An anonymous visitor meets the brief before the sign-in form: opening the
     link (or following any deep link) lands on /welcome, whose call to action
     is /login. The attempted page is remembered and honoured after sign-in. */
  useEffect(() => {
    if (loading || me) return;
    if (PUBLIC_ROUTES.includes(pathname)) return;
    rememberNext(pathname);
    router.replace("/welcome");
  }, [loading, me, pathname, router]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ access_token: string }>("/auth/login", { email, password });
    setToken(data.access_token);
    await refresh();
    router.push(takeNext() ?? "/");
  }, [refresh, router]);

  const setup = useCallback(async (payload: Record<string, unknown>) => {
    const data = await api.post<{ access_token: string }>("/auth/workspace", payload);
    setToken(data.access_token);
    await refresh();
    router.push(takeNext() ?? "/");
  }, [refresh, router]);

  /** Demo role switch: the server mints a token for a demo-workspace user.
   *
   *  No password is involved on purpose — seeded demo users have no fixed one
   *  (SEED_PASSWORD is optional), so a browser holding a hard-coded value could
   *  only ever fail. `POST /v1/demo/session` 404s when DEMO_MODE is off.
   */
  const loginAs = useCallback(async (email: string) => {
    const data = await api.post<{ access_token: string }>(
      `/demo/session?as_email=${encodeURIComponent(email)}`,
    );
    setToken(data.access_token);
    await refresh();
    router.push(takeNext() ?? "/");
  }, [refresh, router]);

  const logout = useCallback(() => {
    clearToken();
    setMe(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo<AuthState>(() => ({
    me,
    loading,
    login,
    setup,
    logout,
    refresh,
    loginAs,
    can: (permission: string) => Boolean(me?.permissions?.[permission]),
  }), [me, loading, login, setup, logout, refresh, loginAs]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** `primary: true` marks the persona the one-click demo signs you in as. */
export interface DemoUser {
  email: string;
  name: string;
  role: string;
  detail: string;
  primary?: boolean;
}

export const DEMO_USERS: DemoUser[] = [
  { email: "ananya@northwind.example", name: "Ananya Iyer", role: "Admin", detail: "Workspace, Brand Kit, users" },
  { email: "meera@northwind.example", name: "Meera Krishnan", role: "Brand Manager", detail: "Maintains the rules" },
  { email: "arjun@northwind.example", name: "Arjun Nair", role: "Approver", detail: "Compliance sign-off" },
  { email: "karan@northwind.example", name: "Karan Mehta", role: "Manager", detail: "Team content, promotions", primary: true },
  { email: "priya@northwind.example", name: "Priya Raghavan", role: "Manager", detail: "Sales content" },
  { email: "rhea@northwind.example", name: "Rhea D'Souza", role: "Creator", detail: "Writes and submits" },
  { email: "vikram@northwind.example", name: "Vikram Sethi", role: "Creator", detail: "Product content" },
  { email: "nikhil@northwind.example", name: "Nikhil Verma", role: "External Creator", detail: "Limited view" },
];
