"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemeId = "midnight" | "daylight" | "ocean" | "ember";

const STORAGE_KEY = "manuva-theme";

const ThemeContext = createContext<{
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}>({
  theme: "daylight",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("daylight");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (stored) {
      setThemeState(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
  }, []);

  function setTheme(id: ThemeId) {
    setThemeState(id);
    localStorage.setItem(STORAGE_KEY, id);
    document.documentElement.setAttribute("data-theme", id);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
