import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "futboltipster-theme";
const MEDIA = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(MEDIA).matches;
}

function storedPreference(): ThemePreference | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "system" || v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => storedPreference() ?? "system");

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = preference === "dark" || (preference === "system" && systemPrefersDark());
      root.classList.toggle("dark", dark);
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      meta?.setAttribute("content", dark ? "#14151b" : "#f2f2f4");
    };
    apply();

    if (preference !== "system") return;
    if (typeof window.matchMedia !== "function") return;

    const mql = window.matchMedia(MEDIA);
    const onChange = () => apply();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // almacenamiento no disponible (p.ej. modo privado); el tema sigue aplicado en memoria
    }
  }, []);

  const resolved = preference === "system" ? (systemPrefersDark() ? "dark" : "light") : preference;

  return { preference, resolved, setTheme };
}