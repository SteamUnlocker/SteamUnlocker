import { useEffect, useState } from "react";

export type ThemeId = "classic" | "catppuccin" | "tokyo" | "nord" | "emerald";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  colors: [string, string, string]; // [base, surface, accent]
}

export const THEMES: ThemeMeta[] = [
  { id: "classic", label: "Classic", colors: ["#0e1422", "#161f33", "#ff333b"] },
  { id: "catppuccin", label: "Catppuccin", colors: ["#1e1e2e", "#313244", "#cba6f7"] },
  { id: "tokyo", label: "Tokyo Night", colors: ["#1a1b26", "#24283b", "#7aa2f7"] },
  { id: "nord", label: "Nord Frost", colors: ["#2e3440", "#3b4252", "#88c0d0"] },
  { id: "emerald", label: "Émeraude", colors: ["#0e1814", "#15251e", "#10b981"] },
];

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = localStorage.getItem("theme") as ThemeId | null;
    return THEMES.some((t) => t.id === saved) ? (saved as ThemeId) : "classic";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return { theme, setTheme };
}
