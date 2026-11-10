import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Home,
  Library,
  Loader2,
  Minus,
  RotateCw,
  Settings,
  SlidersHorizontal,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { isTauri } from "../lib/api";
import type { Tab } from "../lib/types";
import type { Music } from "../lib/useMusic";

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
  music: Music;
  onRestartSteam: () => void;
  restarting: boolean;
  steamFound: boolean;
}

const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Accueil", icon: Home },
  { id: "library", label: "Bibliothèque", icon: Library },
  { id: "mode", label: "Mode", icon: SlidersHorizontal },
  { id: "settings", label: "Paramètres", icon: Settings },
];

export function TitleBar({ tab, onTab, music, onRestartSteam, restarting, steamFound }: Props) {
  const win = isTauri ? getCurrentWindow() : null;

  return (
    <header
      data-tauri-drag-region
      className="h-14 shrink-0 flex items-center justify-between px-4 bg-ctp-mantle border-b border-ctp-surface0"
    >
      {/* Marque avec le nouveau logo */}
      <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-44 pointer-events-none">
        <img src="/icon.png" alt="" className="w-7 h-7 rounded-lg object-cover" />
        <span className="text-sm font-bold tracking-tight text-white">StTools-Manager</span>
      </div>

      {/* Navigation centrale par pilules */}
      <nav className="flex items-center gap-1 p-1 rounded-xl bg-ctp-crust border border-ctp-surface0">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => onTab(id)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                active
                  ? "bg-ctp-mauve text-ctp-on-accent shadow-sm"
                  : "text-ctp-subtext0 hover:text-white hover:bg-ctp-surface0/50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Actions rapides + Contrôles fenêtre */}
      <div className="flex items-center justify-end gap-1 min-w-44">
        <IconButton
          onClick={onRestartSteam}
          disabled={restarting || !steamFound}
          title="Redémarrer Steam"
        >
          {restarting ? (
            <Loader2 className="w-4 h-4 text-ctp-mauve animate-spin" />
          ) : (
            <RotateCw className="w-4 h-4" />
          )}
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
            {music.playing ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </IconButton>
        </div>

        <div className="h-4 w-px bg-ctp-surface0 mx-1" />

        <IconButton onClick={() => win?.minimize()} title="Réduire">
          <Minus className="w-4 h-4" />
        </IconButton>
        <IconButton onClick={() => win?.toggleMaximize()} title="Agrandir">
          <Square className="w-3.5 h-3.5" />
        </IconButton>
        <IconButton onClick={() => win?.close()} title="Fermer" danger>
          <X className="w-4 h-4" />
        </IconButton>
      </div>
    </header>
  );
}

function IconButton({
  children,
  onClick,
  title,
  active,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  danger?: boolean;
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
          : danger
            ? "text-ctp-subtext0 hover:bg-ctp-red/20 hover:text-ctp-red"
            : "text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
