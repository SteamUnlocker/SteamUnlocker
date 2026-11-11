import { ArrowRight } from "lucide-react";
import { DropZone } from "../components/DropZone";
import { GameCover } from "../components/GameCover";
import { ThemeActionGlyph } from "../components/ThemeIcons";
import type { SteamApp, SteamInfo } from "../lib/types";
import type { ThemeId } from "../lib/useTheme";

interface Props {
  theme: ThemeId;
  info: SteamInfo | null;
  games: SteamApp[];
  onOpenGame: (app: SteamApp) => void;
  onOpenSteamFolder: () => void;
  onOpenLibrary: () => void;
  onFiles: (files: File[]) => void;
}

export function HomeView({
  theme,
  info,
  games,
  onOpenGame,
  onOpenSteamFolder,
  onOpenLibrary,
  onFiles,
}: Props) {
  const recent = games.filter((g) => g.has_lua).slice(0, 4);

  return (
    <div className="space-y-6 pb-6 relative min-h-full">
      {/* Bento Hero */}
      <div className="theme-bento">
        <div className="grid grid-cols-12 gap-4 items-stretch">
          {/* Panneau Statut & Compteurs */}
          <div className="theme-hero-card relative overflow-hidden col-span-7 rounded-2xl bg-gradient-to-br from-ctp-surface0/70 via-ctp-surface0/35 to-ctp-mantle border border-ctp-surface1/60 p-6 flex flex-col justify-between gap-6">
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-ctp-mantle border border-ctp-surface1 flex items-center justify-center shrink-0">
                  <ThemeActionGlyph theme={theme} kind="drive" active={Boolean(info?.steam_path)} />
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
                  <ThemeActionGlyph theme={theme} kind="folder" />
                </button>
              )}
            </div>

            <div className="relative grid grid-cols-2 gap-3">
              <StatTile
                theme={theme}
                value={String(info?.lua_count ?? 0)}
                label="Scripts Lua"
                accent="text-ctp-mauve"
                tone="red"
              />
              <StatTile
                theme={theme}
                value={info?.modules_installed ? "Actifs" : "Absents"}
                label="Modules Steam"
                accent={info?.modules_installed ? "text-ctp-green" : "text-ctp-overlay0"}
                tone="green"
              />
            </div>
          </div>

          {/* Panneau DropZone latéral */}
          <div className="col-span-5">
            <DropZone onFiles={onFiles} />
          </div>
        </div>
      </div>

      {/* Scripts récents */}
      <section className="space-y-3 relative z-10">
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
          <div className="theme-card rounded-2xl bg-ctp-mantle/60 border border-ctp-surface0 p-8 text-center text-xs text-ctp-overlay0">
            Aucun script trouvé dans config\stplug-in.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3.5">
            {recent.map((g) => (
              <button
                key={g.app_id}
                onClick={() => onOpenGame(g)}
                className="theme-card theme-cover-tint group text-left rounded-xl overflow-hidden bg-ctp-mantle border border-ctp-surface0 hover:border-ctp-mauve transition"
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

      {/* Silhouette de Milk-chan en bas à gauche sur le thème Milk (sans texte superflu) */}
      {theme === "milk" && (
        <div className="relative flex items-end justify-start pt-2 pointer-events-none select-none min-h-[185px]">
          <img
            src="/themes/milk/milk-chan.png"
            alt="Milk-chan"
            className="h-52 w-auto object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.95)] ml-2 -mb-6"
          />
        </div>
      )}
    </div>
  );
}

function StatTile({
  theme,
  value,
  label,
  accent,
  tone,
}: {
  theme: ThemeId;
  value: string;
  label: string;
  accent: string;
  tone: "red" | "green";
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-ctp-mantle/90 border border-ctp-surface0 p-3.5 ${
        tone === "red" ? "theme-stat-red" : "theme-stat-green"
      }`}
    >
      {/* Motifs discrets par jeu sans SVG dessinés à la main */}
      {theme === "yume" && (
        <img
          src={tone === "red" ? "/themes/yume/egg_knife.png" : "/themes/yume/egg_eye.png"}
          alt=""
          className="w-6 h-6 object-contain pixelated absolute right-2.5 bottom-2 opacity-75 pointer-events-none"
        />
      )}

      {theme === "milk" && (
        <img
          src="/themes/milk/ctc.png"
          alt=""
          className="w-3 h-2 object-contain pixelated absolute right-2.5 bottom-2 opacity-70 pointer-events-none"
        />
      )}

      <p className={`text-2xl font-bold tracking-tight ${accent}`}>{value}</p>
      <p className="text-[11px] text-ctp-subtext0 mt-0.5">{label}</p>
    </div>
  );
}
