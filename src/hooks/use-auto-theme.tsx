"use client";

/**
 * AutoTheme — theme management with time-based auto-switching.
 *
 * Logic:
 *  - Auto-switches based on device time: 06:00–17:59 = light, 18:00–05:59 = dark
 *  - When user manually picks a theme, `manualOverride` is set to true in localStorage
 *  - Manual choice takes precedence until user clicks the auto-toggle in settings
 *  - Clicking the auto-toggle resets manualOverride, restoring time-based behavior
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export type ResolvedTheme = "light" | "dark";
export type StoredTheme = ResolvedTheme | "auto";

const STORAGE_KEY = "just-chess-theme";

function getAutoTheme(): ResolvedTheme {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "light" : "dark";
}

function readStored(): StoredTheme {
  if (typeof window === "undefined") return "auto";
  return (localStorage.getItem(STORAGE_KEY) as StoredTheme) ?? "auto";
}

function writeStored(value: StoredTheme) {
  if (typeof window === "undefined") return;
  if (value === "auto") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, value);
  }
}

// ─── Context ────────────────────────────────────────────────────

interface AutoThemeContextValue {
  storedTheme: StoredTheme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: StoredTheme) => void;
  toggleAuto: () => void;
  isAuto: boolean;
  mounted: boolean;
}

const AutoThemeContext = createContext<AutoThemeContextValue | null>(null);

export function useAutoTheme() {
  const ctx = useContext(AutoThemeContext);
  if (!ctx) throw new Error("useAutoTheme must be used within AutoThemeProvider");
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────────

export function AutoThemeProvider({ children }: { children: ReactNode }) {
  const [storedTheme, setStoredTheme] = useState<StoredTheme>("auto");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [mounted, setMounted] = useState(false);

  const computeResolved = useCallback((stored: StoredTheme): ResolvedTheme => {
    return stored === "auto" ? getAutoTheme() : stored;
  }, []);

  // On mount: read from localStorage and apply to DOM
  useEffect(() => {
    const stored = readStored();
    const resolved = computeResolved(stored);
    setStoredTheme(stored);
    setResolvedTheme(resolved);
    applyTheme(resolved);
    setMounted(true);
  }, [computeResolved]);

  // Re-apply auto-theme every minute (in case user leaves tab open past midnight)
  useEffect(() => {
    if (storedTheme !== "auto") return;
    const interval = setInterval(() => {
      const fresh = getAutoTheme();
      setResolvedTheme(fresh);
      applyTheme(fresh);
    }, 60_000);
    return () => clearInterval(interval);
  }, [storedTheme]);

  const setTheme = useCallback(
    (theme: StoredTheme) => {
      const resolved = computeResolved(theme);
      setStoredTheme(theme);
      setResolvedTheme(resolved);
      writeStored(theme);
      applyTheme(resolved);
    },
    [computeResolved]
  );

  const toggleAuto = useCallback(() => {
    setTheme("auto");
  }, [setTheme]);

  return (
    <AutoThemeContext.Provider
      value={{ storedTheme, resolvedTheme, setTheme, toggleAuto, isAuto: storedTheme === "auto", mounted }}
    >
      {children}
    </AutoThemeContext.Provider>
  );
}

// ─── DOM helpers ────────────────────────────────────────────────

function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}