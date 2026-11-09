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
const DEMO_PASSWORD = "Sentinel!2026";

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

  useEffect(() => {
    if (!loading && !me && pathname !== "/login") router.replace("/login");
  }, [loading, me, pathname, router]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ access_token: string }>("/auth/login", { email, password });
    setToken(data.access_token);
    await refresh();
    router.push("/");
  }, [refresh, router]);

  const setup = useCallback(async (payload: Record<string, unknown>) => {
    const data = await api.post<{ access_token: string }>("/auth/workspace", payload);
    setToken(data.access_token);
    await refresh();
    router.push("/");
  }, [refresh, router]);

  const loginAs = useCallback(async (email: string) => {
    await login(email, DEMO_PASSWORD);
  }, [login]);

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

export const DEMO_USERS = [
  { email: "ada@northwind.example", name: "Ada Okafor", role: "Admin", detail: "Workspace, Brand Kit, users" },
  { email: "maya@northwind.example", name: "Maya Lindqvist", role: "Brand Manager", detail: "Maintains the rules" },
  { email: "raj@northwind.example", name: "Raj Menon", role: "Approver", detail: "Compliance sign-off" },
  { email: "tom@northwind.example", name: "Tom Ferreira", role: "Manager", detail: "Team content, promotions" },
  { email: "ines@northwind.example", name: "Inês Duarte", role: "Manager", detail: "Sales content" },
  { email: "leo@northwind.example", name: "Leo Park", role: "Creator", detail: "Writes and submits" },
  { email: "nina@northwind.example", name: "Nina Haddad", role: "Creator", detail: "Product content" },
  { email: "sam@northwind.example", name: "Sam Boateng", role: "External Creator", detail: "Limited view" },
];
export { DEMO_PASSWORD };
