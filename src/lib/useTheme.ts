import { createContext, useContext, useEffect, useState } from "react";

export type ThemeId =
  | "classic"
  | "catppuccin"
  | "tokyo"
  | "nord"
  | "emerald"
  | "yume"
  | "milk";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  colors: [string, string, string]; // [base, surface, accent]
  wallpaper?: string;
  subtitle?: string;
}

export const THEMES: ThemeMeta[] = [
  { id: "classic", label: "Classic", colors: ["#0e1422", "#161f33", "#ff333b"] },
  { id: "catppuccin", label: "Catppuccin", colors: ["#1e1e2e", "#313244", "#cba6f7"] },
  { id: "tokyo", label: "Tokyo Night", colors: ["#1a1b26", "#24283b", "#7aa2f7"] },
  { id: "nord", label: "Nord Frost", colors: ["#2e3440", "#3b4252", "#88c0d0"] },
  { id: "emerald", label: "Émeraude", colors: ["#0e1814", "#15251e", "#10b981"] },
  {
    id: "yume",
    label: "Yume Nikki",
    subtitle: "Nexus",
    wallpaper: "/themes/yume/bg.jpg",
    colors: ["#150c2a", "#723c62", "#e04c5c"],
  },
  {
    id: "milk",
    label: "Milk",
    subtitle: "Milk-chan",
    wallpaper: "/themes/milk/bg.jpg",
    colors: ["#090107", "#57123a", "#ef3f5b"],
  },
];

export const ThemeContext = createContext<ThemeId>("classic");

export function useCurrentTheme(): ThemeId {
  return useContext(ThemeContext);
}

export function getThemeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(() => {
    const param = new URLSearchParams(window.location.search).get("theme") as ThemeId | null;
    const saved = localStorage.getItem("theme") as ThemeId | null;
    const initial =
      param && THEMES.some((t) => t.id === param)
        ? param
        : THEMES.some((t) => t.id === saved)
          ? (saved as ThemeId)
          : "classic";
    document.documentElement.setAttribute("data-theme", initial);
    return initial;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return { theme, setTheme };
}
