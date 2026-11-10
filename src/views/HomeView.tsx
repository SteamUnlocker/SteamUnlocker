import { ArrowRight, FolderOpen, HardDrive } from "lucide-react";
import { DropZone } from "../components/DropZone";
import { GameCover } from "../components/GameCover";
import type { SteamApp, SteamInfo } from "../lib/types";

interface Props {
  info: SteamInfo | null;
  games: SteamApp[];
  onOpenGame: (app: SteamApp) => void;
  onOpenSteamFolder: () => void;
  onOpenLibrary: () => void;
  onFiles: (files: File[]) => void;
}

export function HomeView({
  info,
  games,
  onOpenGame,
  onOpenSteamFolder,
  onOpenLibrary,
  onFiles,
}: Props) {
  const recent = games.filter((g) => g.has_lua).slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Bento Hero (distinct de LuaTools) */}
      <div className="grid grid-cols-12 gap-4 items-stretch">
        {/* Panneau Statut & Compteurs */}
        <div className="col-span-7 rounded-2xl bg-gradient-to-br from-ctp-surface0/70 via-ctp-surface0/35 to-ctp-mantle border border-ctp-surface1/60 p-6 flex flex-col justify-between gap-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-ctp-mantle border border-ctp-surface1 flex items-center justify-center shrink-0">
                <HardDrive
                  className={`w-4 h-4 ${info?.steam_path ? "text-ctp-green" : "text-ctp-red"}`}
                />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-ctp-subtext0">Répertoire Steam</p>
                <p className="text-xs font-mono text-white truncate">
                  {info?.steam_path || "Steam introuvable"}
                </p>
              </div>
            </div>

            {info?.steam_path && (
              <button
                onClick={onOpenSteamFolder}
                title="Ouvrir le dossier Steam"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-ctp-mantle hover:bg-ctp-surface1 text-ctp-subtext0 hover:text-white border border-ctp-surface1/50 shrink-0 transition"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatTile
              value={String(info?.lua_count ?? 0)}
              label="Scripts Lua"
              accent="text-ctp-mauve"
            />
            <StatTile
              value={info?.modules_installed ? "Actifs" : "Absents"}
              label="Modules Steam"
              accent={info?.modules_installed ? "text-ctp-green" : "text-ctp-overlay0"}
            />
          </div>
        </div>

        {/* Panneau DropZone latéral */}
        <div className="col-span-5">
          <DropZone onFiles={onFiles} />
        </div>
      </div>

      {/* Scripts récents */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Récents dans stplug-in</h2>
          <button
            onClick={onOpenLibrary}
            className="flex items-center gap-1 text-xs font-medium text-ctp-mauve hover:text-ctp-lavender transition"
          >
            Tout voir
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-2xl bg-ctp-mantle/60 border border-ctp-surface0 p-8 text-center text-xs text-ctp-overlay0">
            Aucun script trouvé dans config\stplug-in.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3.5">
            {recent.map((g) => (
              <button
                key={g.app_id}
                onClick={() => onOpenGame(g)}
                className="group text-left rounded-xl overflow-hidden bg-ctp-mantle border border-ctp-surface0 hover:border-ctp-mauve transition"
              >
                <GameCover appId={g.app_id} name={g.name} />
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      g.enabled ? "bg-ctp-green" : "bg-ctp-peach"
                    }`}
                  />
                  <p className="text-xs font-medium text-ctp-text truncate group-hover:text-white">
                    {g.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div className="rounded-xl bg-ctp-mantle/90 border border-ctp-surface0 p-3.5">
      <p className={`text-2xl font-bold leading-none ${accent}`}>{value}</p>
      <p className="text-[11px] text-ctp-subtext0 mt-1.5">{label}</p>
    </div>
  );
}
