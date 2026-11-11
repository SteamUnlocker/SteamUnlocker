import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/api";
import type { Tab } from "../lib/types";
import type { Music } from "../lib/useMusic";
import { useCurrentTheme } from "../lib/useTheme";
import {
  ThemeActionGlyph,
  ThemeNavIcon,
  ThemeWindowControls,
} from "./ThemeIcons";

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
  music: Music;
  onRestartSteam: () => void;
  restarting: boolean;
  steamFound: boolean;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Accueil" },
  { id: "search", label: "Recherche" },
  { id: "library", label: "Bibliothèque" },
  { id: "mode", label: "Mode" },
  { id: "settings", label: "Paramètres" },
];

export function TitleBar({ tab, onTab, music, onRestartSteam, restarting, steamFound }: Props) {
  const theme = useCurrentTheme();
  const win = isTauri ? getCurrentWindow() : null;

  return (
    <header
      data-tauri-drag-region
      className="theme-header relative z-20 h-14 shrink-0 flex items-center justify-between px-4 bg-ctp-mantle border-b border-ctp-surface0"
    >
      {/* Marque SteamUnlocker */}
      <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-44 pointer-events-none">
        <img src="/icon.png" alt="" className="w-7 h-7 rounded-lg object-cover" />
        <span
          className={`text-sm font-bold tracking-tight ${
            theme === "milk" ? "text-ctp-mauve" : "text-white"
          }`}
        >
          SteamUnlocker
        </span>
      </div>

      {/* Navigation centrale par pilules */}
      <nav className="theme-nav flex items-center gap-1 p-1 rounded-xl bg-ctp-crust border border-ctp-surface0">
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              data-tab={id}
              onClick={() => onTab(id)}
              className={`theme-tab-btn flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                active
                  ? "theme-tab-active bg-ctp-mauve text-ctp-on-accent shadow-sm"
                  : "text-ctp-subtext0 hover:text-white hover:bg-ctp-surface0/50"
              }`}
            >
              <ThemeNavIcon theme={theme} tab={id} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Actions rapides + Contrôles fenêtre stylisés par thème */}
      <div className="flex items-center justify-end gap-1 min-w-44">
        <IconButton
          onClick={onRestartSteam}
          disabled={restarting || !steamFound}
          title="Redémarrer Steam"
        >
          <ThemeActionGlyph theme={theme} kind="restart" spinning={restarting} />
        </IconButton>

        <div className="flex items-center gap-1.5 mr-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={music.volume}
            onChange={(e) => music.setVolume(Number(e.target.value))}
            className={`w-14 accent-ctp-mauve cursor-pointer ${music.playing ? "block" : "hidden"}`}
            title="Volume"
          />
          <IconButton
            onClick={music.toggle}
            active={music.playing}
            title={music.playing ? "Couper la musique" : "Activer la musique (Yume Nikki)"}
          >
            <ThemeActionGlyph theme={theme} kind="music" active={music.playing} />
          </IconButton>
        </div>

        <div className="h-4 w-px bg-ctp-surface0 mx-1" />

        <ThemeWindowControls
          theme={theme}
          onMinimize={() => win?.minimize()}
          onMaximize={() => win?.toggleMaximize()}
          onClose={() => win?.close()}
        />
      </div>
    </header>
  );
}

function IconButton({
  children,
  onClick,
  title,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-8 h-8 flex items-center justify-center rounded-lg transition disabled:opacity-40 ${
        active
          ? "text-ctp-mauve bg-ctp-mauve/15"
          : "text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
