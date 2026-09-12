"use client";

import * as React from "react";

type Theme = "dark" | "light" | "system";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("dark");
  const [resolvedTheme, setResolvedTheme] = React.useState<"dark" | "light">("dark");
  const [mounted, setMounted] = React.useState(false);

  // Apply theme to document element
  const applyTheme = React.useCallback((targetTheme: Theme) => {
    const root = document.documentElement;
    let actualTheme: "dark" | "light" = "dark";

    if (targetTheme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      actualTheme = prefersDark ? "dark" : "light";
    } else {
      actualTheme = targetTheme;
    }

    if (actualTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    setResolvedTheme(actualTheme);
  }, []);

  // Initialize theme on client mount
  React.useEffect(() => {
    setMounted(true);
    const stored = (localStorage.getItem("lifeos-theme") as Theme) || "dark";
    setThemeState(stored);
    applyTheme(stored);

    // Sync with backend preferences if session exists
    fetch("/api/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.preferences?.theme) {
          const prefTheme = data.preferences.theme as Theme;
          setThemeState(prefTheme);
          localStorage.setItem("lifeos-theme", prefTheme);
          applyTheme(prefTheme);
        }
      })
      .catch(() => {
        // Silently ignore if unauthenticated or network failure
      });
  }, [applyTheme]);

  const setTheme = React.useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      localStorage.setItem("lifeos-theme", newTheme);
      applyTheme(newTheme);

      // Persist to preferences API
      fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: newTheme }),
      }).catch(() => {
        // Silently ignore if unauthenticated or network error
      });
    },
    [applyTheme]
  );

  const toggleTheme = React.useCallback(() => {
    const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
