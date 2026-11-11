import { listen } from "@tauri-apps/api/event";
import {
  Archive,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RotateCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GameCover } from "../components/GameCover";
import { api, coverUrl, isTauri } from "../lib/api";
import type {
  DownloadGameResult,
  DownloadProgressEvent,
  DownloadSourceInfo,
  SteamApp,
  SteamAppDetails,
  SteamSearchResult,
} from "../lib/types";

interface Props {
  games: SteamApp[];
  onOpenGame: (app: SteamApp) => void;
  onRestartSteam: () => void;
  restarting: boolean;
  steamFound: boolean;
  notify: (msg: string, ok?: boolean) => void;
  reload: () => Promise<void>;
}

const DEFAULT_SOURCES: DownloadSourceInfo[] = [
  { slug: "ryuu", name: "Ryuu DB" },
  { slug: "sushi", name: "Sushi DB" },
  { slug: "r2", name: "R2" },
  { slug: "luagen", name: "Luagen" },
  { slug: "manifesthub", name: "ManifestHub" },
  { slug: "steamcooked", name: "Steam Cooked DB" },
];

export function SearchView({
  games,
  onOpenGame,
  onRestartSteam,
  restarting,
  steamFound,
  notify,
  reload,
}: Props) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [results, setResults] = useState<SteamSearchResult[]>([]);

  const [selected, setSelected] = useState<SteamSearchResult | null>(null);
  const [details, setDetails] = useState<SteamAppDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [sources, setSources] = useState<DownloadSourceInfo[]>(DEFAULT_SOURCES);
  const [sourceSlug, setSourceSlug] = useState("auto");

  const [downloadingMode, setDownloadingMode] = useState<"install" | "save_zip" | null>(null);
  const [progress, setProgress] = useState<DownloadProgressEvent | null>(null);
  const [dlResult, setDlResult] = useState<DownloadGameResult | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);

  const installedIds = useMemo(
    () => new Set(games.filter((g) => g.has_lua).map((g) => g.app_id)),
    [games]
  );

  useEffect(() => {
    if (!isTauri) return;
    api
      .downloadSources()
      .then((list) => {
        if (list.length > 0) setSources(list);
      })
      .catch(() => {});

    const unlisten = listen<DownloadProgressEvent>("search-download-progress", (e) => {
      setProgress(e.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const selectResult = async (item: SteamSearchResult) => {
    setSelected(item);
    setDetails(null);
    setDlResult(null);
    setDlError(null);
    setProgress(null);
    setLoadingDetails(true);
    try {
      const info = await api.steamAppDetails(item.app_id);
      setDetails(info);
    } catch {
      // Garde l'aperçu minimal si Steam Store ne répond pas sur cet AppID
    } finally {
      setLoadingDetails(false);
    }
  };

  const runSearch = async (termOverride?: string) => {
    const q = (termOverride ?? query).trim();
    if (!q) return;
    if (termOverride !== undefined) setQuery(termOverride);
    setSearching(true);
    setSearchedOnce(true);
    setDlError(null);
    try {
      const list = await api.searchSteam(q);
      setResults(list);
      if (list.length > 0) {
        await selectResult(list[0]);
      } else {
        setSelected(null);
        setDetails(null);
      }
    } catch (e) {
      notify(String(e), false);
    } finally {
      setSearching(false);
    }
  };

  const startDownload = async (mode: "install" | "save_zip") => {
    if (!selected || downloadingMode) return;
    setDownloadingMode(mode);
    setDlError(null);
    setDlResult(null);
    setProgress({
      app_id: selected.app_id,
      source: sourceSlug === "auto" ? "Auto" : sourceSlug,
      message: "Connexion aux sources…",
      downloaded_bytes: 0,
      total_bytes: null,
    });

    try {
      const res = await api.downloadGameFiles(selected.app_id, sourceSlug, mode);
      setDlResult(res);
      if (mode === "install") {
        await reload();
        notify(
          `Installé depuis ${res.source_name} (${res.lua_count} Lua, ${res.manifest_count} manifest)`
        );
      } else {
        notify(`Archive ${res.app_id}.zip enregistrée (${res.source_name})`);
      }
    } catch (e) {
      const msg = String(e);
      setDlError(msg);
      notify(msg, false);
    } finally {
      setDownloadingMode(null);
    }
  };

  const openInLibrary = () => {
    if (!selected) return;
    const match = games.find((g) => g.app_id === selected.app_id);
    onOpenGame(
      match ?? {
        app_id: selected.app_id,
        name: details?.name ?? selected.name,
        has_lua: true,
        enabled: true,
        file_name: `${selected.app_id}.lua`,
        modified_ts: Math.floor(Date.now() / 1000),
        installed: false,
      }
    );
  };

  const pct =
    progress?.total_bytes && progress.total_bytes > 0
      ? Math.min(100, Math.round((progress.downloaded_bytes / progress.total_bytes) * 100))
      : null;

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Barre de recherche & choix de source */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="theme-hero-card rounded-2xl bg-ctp-mantle border border-ctp-surface0 p-4 flex flex-wrap items-center gap-3 shrink-0"
      >
        <div className="relative flex-1 min-w-64">
          <Search className="w-4 h-4 text-ctp-overlay0 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom du jeu Steam ou AppID (ex: Hollow Knight, 650700)…"
            className="w-full h-10 pl-10 pr-8 rounded-xl bg-ctp-base border border-ctp-surface1 focus:border-ctp-mauve outline-none text-xs text-white placeholder:text-ctp-overlay0 transition"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ctp-overlay0 hover:text-white"
              title="Effacer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={sourceSlug}
          onChange={(e) => setSourceSlug(e.target.value)}
          disabled={Boolean(downloadingMode)}
          title="Source de téléchargement"
          className="h-10 px-3 rounded-xl bg-ctp-base border border-ctp-surface1 focus:border-ctp-mauve outline-none text-xs text-ctp-text"
        >
          <option value="auto">Source : Auto (toutes)</option>
          {sources.map((s) => (
            <option key={s.slug} value={s.slug}>
              Source : {s.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="h-10 px-4 rounded-xl bg-ctp-mauve hover:bg-ctp-lavender disabled:opacity-45 text-xs font-semibold text-ctp-on-accent flex items-center gap-2 transition"
        >
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Rechercher
        </button>
      </form>

      {/* Zone résultats + Fiche & téléchargement */}
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Liste des résultats Steam */}
        <div className="col-span-5 theme-card rounded-2xl bg-ctp-mantle border border-ctp-surface0 p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-1 pb-2.5 border-b border-ctp-surface0 shrink-0">
            <span className="text-xs font-semibold text-white">Résultats Steam</span>
            {results.length > 0 && (
              <span className="text-[11px] font-mono text-ctp-subtext0">{results.length}</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pt-2.5 space-y-2 pr-1">
            {searching ? (
              <div className="h-44 flex flex-col items-center justify-center gap-2 text-xs text-ctp-subtext0">
                <Loader2 className="w-5 h-5 text-ctp-mauve animate-spin" />
                Recherche sur Steam…
              </div>
            ) : results.length === 0 ? (
              <div className="h-full min-h-44 flex flex-col items-center justify-center text-center px-4 gap-3 text-xs text-ctp-overlay0">
                <Sparkles className="w-6 h-6 text-ctp-mauve/70" />
                {searchedOnce ? (
                  <p>Aucun jeu trouvé pour « {query} ».</p>
                ) : (
                  <>
                    <p>
                      Recherche n&apos;importe quel jeu Steam ou colle directement son AppID pour
                      récupérer son <span className="font-mono text-ctp-text">.lua</span> et ses{" "}
                      <span className="font-mono text-ctp-text">.manifest</span>.
                    </p>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {["Yume Nikki", "Milk outside", "Hollow Knight", "Celeste"].map((ex) => (
                        <button
                          key={ex}
                          type="button"
                          onClick={() => runSearch(ex)}
                          className="px-2.5 py-1 rounded-lg bg-ctp-surface0/70 hover:bg-ctp-surface1 text-[11px] text-ctp-text transition"
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              results.map((r) => {
                const isSelected = selected?.app_id === r.app_id;
                const isInstalled = installedIds.has(r.app_id);
                return (
                  <button
                    key={r.app_id}
                    type="button"
                    onClick={() => selectResult(r)}
                    className={`w-full text-left p-2 rounded-xl border flex items-center gap-2.5 transition ${
                      isSelected
                        ? "bg-ctp-surface0 border-ctp-mauve"
                        : "bg-ctp-base/70 border-ctp-surface0 hover:border-ctp-surface2"
                    }`}
                  >
                    <img
                      src={r.tiny_image || coverUrl(r.app_id)}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                      className="w-16 h-8 rounded object-cover bg-ctp-crust shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">{r.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ctp-subtext0">
                        <span className="font-mono">{r.app_id}</span>
                        {r.price && <span>· {r.price}</span>}
                        {isInstalled && (
                          <span className="text-ctp-green font-semibold">· Installé</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Fiche du jeu sélectionné + Téléchargement */}
        <div className="col-span-7 theme-card rounded-2xl bg-ctp-mantle border border-ctp-surface0 p-4 flex flex-col min-h-0 overflow-y-auto">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-xs text-ctp-overlay0 gap-2 px-6">
              <Download className="w-7 h-7 text-ctp-surface2" />
              <p>Sélectionne un jeu dans la liste pour afficher sa fiche et télécharger ses fichiers.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-56 shrink-0 rounded-xl overflow-hidden border border-ctp-surface1 theme-cover-tint">
                  <GameCover appId={selected.app_id} name={details?.name ?? selected.name} />
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-bold text-white leading-snug">
                      {details?.name ?? selected.name}
                    </h2>
                    {installedIds.has(selected.app_id) && (
                      <span className="px-2 py-0.5 rounded-full bg-ctp-green/15 text-ctp-green border border-ctp-green/35 text-[10px] font-semibold shrink-0">
                        Déjà installé
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-ctp-base border border-ctp-surface1 font-mono text-ctp-text">
                      AppID {selected.app_id}
                    </span>
                    {details?.price && (
                      <span className="px-2 py-0.5 rounded bg-ctp-base border border-ctp-surface1 text-ctp-green">
                        {details.price}
                      </span>
                    )}
                    {details?.release_date && details.release_date !== "N/A" && (
                      <span className="px-2 py-0.5 rounded bg-ctp-base border border-ctp-surface1 text-ctp-subtext0">
                        {details.release_date}
                      </span>
                    )}
                    {details?.metacritic !== null && details?.metacritic !== undefined && (
                      <span className="px-2 py-0.5 rounded bg-ctp-green/15 text-ctp-green font-semibold">
                        Metacritic {details.metacritic}
                      </span>
                    )}
                  </div>

                  {loadingDetails ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-ctp-overlay0 pt-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Chargement des détails Steam…
                    </div>
                  ) : (
                    details && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-ctp-subtext0 truncate">
                          {details.developers.join(", ")}
                          {details.genres.length > 0 ? ` · ${details.genres.slice(0, 3).join(", ")}` : ""}
                        </p>
                        <p className="text-xs text-ctp-text/90 leading-relaxed line-clamp-3">
                          {details.description}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Boutons d'action */}
              <div className="p-3.5 rounded-xl bg-ctp-base/75 border border-ctp-surface1 space-y-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={Boolean(downloadingMode) || !steamFound}
                    onClick={() => startDownload("install")}
                    className="flex-1 min-w-48 h-10 px-4 rounded-xl bg-ctp-mauve hover:bg-ctp-lavender disabled:opacity-45 text-xs font-semibold text-ctp-on-accent flex items-center justify-center gap-2 transition"
                  >
                    {downloadingMode === "install" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Télécharger et installer dans Steam
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(downloadingMode)}
                    onClick={() => startDownload("save_zip")}
                    className="h-10 px-3.5 rounded-xl bg-ctp-surface0 hover:bg-ctp-surface1 disabled:opacity-45 border border-ctp-surface1 text-xs font-medium text-white flex items-center gap-2 transition"
                    title="Télécharger l'archive ZIP brute dans Téléchargements"
                  >
                    {downloadingMode === "save_zip" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Archive className="w-3.5 h-3.5 text-ctp-mauve" />
                    )}
                    Enregistrer .zip
                  </button>
                </div>

                {!steamFound && (
                  <p className="text-[11px] text-ctp-peach">
                    Steam introuvable sur ce PC : utilise « Enregistrer .zip » pour récupérer l&apos;archive.
                  </p>
                )}

                {/* Progression en direct */}
                {downloadingMode && progress && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-ctp-text truncate">{progress.message}</span>
                      {pct !== null && <span className="font-mono text-ctp-mauve">{pct}%</span>}
                    </div>
                    <div className="h-1.5 rounded-full bg-ctp-surface0 overflow-hidden">
                      <div
                        className="h-full bg-ctp-mauve transition-all duration-150"
                        style={{ width: pct !== null ? `${pct}%` : "45%" }}
                      />
                    </div>
                  </div>
                )}

                {/* Erreur */}
                {dlError && !downloadingMode && (
                  <p className="text-xs text-ctp-red bg-ctp-red/10 border border-ctp-red/30 rounded-lg px-3 py-2">
                    {dlError}
                  </p>
                )}

                {/* Résultat succès */}
                {dlResult && !downloadingMode && (
                  <div className="p-3 rounded-xl bg-ctp-green/10 border border-ctp-green/35 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-ctp-green">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          {dlResult.mode === "install"
                            ? `Installé depuis ${dlResult.source_name}`
                            : `ZIP enregistré depuis ${dlResult.source_name}`}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-ctp-subtext0">
                        {(dlResult.size_bytes / 1_048_576).toFixed(2)} Mo
                      </span>
                    </div>

                    {dlResult.mode === "install" ? (
                      <>
                        <p className="text-[11px] text-ctp-text">
                          {dlResult.lua_count} fichier(s) Lua dans{" "}
                          <span className="font-mono">config\stplug-in</span> ·{" "}
                          {dlResult.manifest_count} manifest(s) dans{" "}
                          <span className="font-mono">depotcache</span>.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={openInLibrary}
                            className="px-3 py-1.5 rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1 text-[11px] font-semibold text-white flex items-center gap-1.5 transition"
                          >
                            <ExternalLink className="w-3 h-3 text-ctp-mauve" />
                            Ouvrir dans Bibliothèque
                          </button>
                          {steamFound && (
                            <button
                              type="button"
                              disabled={restarting}
                              onClick={onRestartSteam}
                              className="px-3 py-1.5 rounded-lg bg-ctp-green/20 hover:bg-ctp-green/30 text-[11px] font-semibold text-ctp-green flex items-center gap-1.5 transition"
                            >
                              <RotateCw className={`w-3 h-3 ${restarting ? "animate-spin" : ""}`} />
                              Redémarrer Steam
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] font-mono text-ctp-text break-all">
                        {dlResult.saved_zip_path}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
