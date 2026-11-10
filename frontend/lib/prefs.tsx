"use client";
/** User preferences that must survive a reload (localStorage, no server round-trip). */
import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface Prefs {
  showCharacters: boolean;
  setShowCharacters: (value: boolean) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const Ctx = createContext<Prefs>({
  showCharacters: true, setShowCharacters: () => {},
  theme: "light", toggleTheme: () => {},
});

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [showCharacters, setShow] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    try {
      const chars = window.localStorage.getItem("sentinel.prefs.characters");
      if (chars === "0") setShow(false);
      const saved = window.localStorage.getItem("sentinel.prefs.theme");
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setShowCharacters = useCallback((value: boolean) => {
    setShow(value);
    try {
      window.localStorage.setItem("sentinel.prefs.characters", value ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem("sentinel.prefs.theme", next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ showCharacters, setShowCharacters, theme, toggleTheme }}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);
