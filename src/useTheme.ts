import { useLayoutEffect, useState } from "react";

type Theme = "light" | "dark";
const storageKey = "dnd-rebalanced:theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      /* Fall back to the browser preference when storage is blocked. */
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      /* The switch still works without persistent storage. */
    }
  }, [theme]);
  return {
    theme,
    toggleTheme: () =>
      setTheme((value) => (value === "light" ? "dark" : "light")),
  };
}
