import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckSquare,
  FileCode2,
  Loader2,
  Plus,
  Power,
  Save,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { DeleteButton } from "../components/DeleteButton";
import { GameCover } from "../components/GameCover";
import { api } from "../lib/api";
import type { SteamApp } from "../lib/types";

type Filter = "scripts" | "active" | "disabled" | "installed" | "all";
type SortBy = "recent" | "name" | "appid";
const PAGE_SIZE = 48;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface Props {
  games: SteamApp[];
  namesCount: number;
  editing: SteamApp | null;
  setEditing: (app: SteamApp | null) => void;
  notify: (msg: string, ok?: boolean) => void;
  reload: () => Promise<void>;
}

export function LibraryView({
  games,
  namesCount,
  editing,
  setEditing,
  notify,
  reload,
}: Props) {
  if (editing) {
    return (
      <Editor
        app={editing}
        notify={notify}
        onClose={() => setEditing(null)}
        onChanged={reload}
      />
    );
  }
  return (
    <GameList
      games={games}
      namesCount={namesCount}
      onOpen={setEditing}
      notify={notify}
      reload={reload}
    />
  );
}

function GameList({
  games,
  namesCount,
  onOpen,
  notify,
  reload,
}: {
  games: SteamApp[];
  namesCount: number;
  onOpen: (app: SteamApp) => void;
  notify: Props["notify"];
  reload: Props["reload"];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("scripts");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [newId, setNewId] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmBatch, setConfirmBatch] = useState(false);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, filter, sortBy]);

  useEffect(() => {
    if (!confirmBatch) return;
    const t = setTimeout(() => setConfirmBatch(false), 3000);
    return () => clearTimeout(t);
  }, [confirmBatch]);

  const counts = useMemo(() => {
    let scripts = 0;
    let active = 0;
    let disabled = 0;
    let installed = 0;
    for (const g of games) {
      if (g.has_lua) {
        scripts++;
        if (g.enabled) active++;
        else disabled++;
      }
      if (g.installed) installed++;
    }
    return { scripts, active, disabled, installed, all: games.length };
  }, [games]);

  const matched = useMemo(() => {
    const raw = query.trim().toLowerCase();
    const tokens = normalizeText(raw).split(" ").filter(Boolean);

    const list = games.filter((g) => {
      const okFilter =
        filter === "all" ||
        (filter === "scripts" && g.has_lua) ||
        (filter === "active" && g.has_lua && g.enabled) ||
        (filter === "disabled" && g.has_lua && !g.enabled) ||
        (filter === "installed" && g.installed);
      if (!okFilter) return false;
      if (!raw) return true;

      if (
        g.app_id.toLowerCase().includes(raw) ||
        g.file_name.toLowerCase().includes(raw) ||
        g.name.toLowerCase().includes(raw)
      ) {
        return true;
      }

      const hay = `${normalizeText(g.name)} ${g.app_id} ${normalizeText(g.file_name)}`;
      return tokens.every((tok) => hay.includes(tok));
    });

    list.sort((a, b) => {
      if (sortBy === "recent") {
        return b.modified_ts - a.modified_ts || a.name.localeCompare(b.name);
      }
      if (sortBy === "appid") {
        return a.app_id.localeCompare(b.app_id, undefined, { numeric: true });
      }
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [games, query, filter, sortBy]);

  const visible = useMemo(() => matched.slice(0, limit), [matched, limit]);

  const openById = () => {
    const id = newId.trim();
    if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) {
      notify("Saisissez un AppID valide", false);
      return;
    }
    onOpen(
      games.find((g) => g.app_id === id) ?? {
        app_id: id,
        name: `AppID ${id}`,
        has_lua: false,
        enabled: true,
        file_name: `${id}.lua`,
        modified_ts: 0,
        installed: false,
      }
    );
    setNewId("");
  };

  const toggle = async (app: SteamApp) => {
    try {
      const active = await api.toggleLua(app.app_id);
      notify(`${app.name} ${active ? "activé" : "désactivé (.lua.disabled)"}`);
      await reload();
    } catch (e) {
      notify(String(e), false);
    }
  };

  const remove = async (app: SteamApp) => {
    try {
      await api.deleteLua(app.app_id);
      notify(`Script de ${app.name} supprimé`);
      await reload();
    } catch (e) {
      notify(String(e), false);
    }
  };

  const toggleSelect = (appId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirmBatch) {
      setConfirmBatch(true);
      return;
    }
    try {
      const count = await api.deleteManyLua(Array.from(selected));
      notify(`${count} script${count > 1 ? "s" : ""} supprimé${count > 1 ? "s" : ""}`);
      setSelected(new Set());
      setSelecting(false);
      setConfirmBatch(false);
      await reload();
    } catch (e) {
      notify(String(e), false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Bibliothèque</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-ctp-mantle border border-ctp-surface0 text-ctp-subtext0">
            {matched.length}
          </span>
          {namesCount === 0 && (
            <span className="flex items-center gap-1.5 text-xs text-ctp-mauve">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Synchronisation des noms…
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selecting && selected.size > 0 && (
            <button
              onClick={deleteSelected}
              className={`h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-semibold transition ${
                confirmBatch
                  ? "bg-ctp-red text-ctp-crust"
                  : "bg-ctp-red/15 text-ctp-red hover:bg-ctp-red/25"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {confirmBatch ? `Confirmer (${selected.size})` : `Supprimer (${selected.size})`}
            </button>
          )}
          <button
            onClick={() => {
              setSelecting((s) => !s);
              setSelected(new Set());
              setConfirmBatch(false);
            }}
            className={`h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium transition ${
              selecting
                ? "bg-ctp-mauve text-ctp-on-accent"
                : "bg-ctp-mantle border border-ctp-surface0 text-ctp-subtext0 hover:text-white"
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            {selecting ? "Terminer" : "Sélectionner"}
          </button>
        </div>
      </div>

      {/* Barre de recherche & filtres */}
      <div className="flex flex-wrap gap-2.5">
        <div className="relative flex-1 min-w-56">
          <Search className="w-4 h-4 text-ctp-overlay0 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom de jeu, AppID ou fichier…"
            className="w-full h-10 pl-9 pr-8 rounded-lg bg-ctp-mantle border border-ctp-surface0 text-sm text-white placeholder:text-ctp-overlay0 focus:outline-none focus:border-ctp-mauve"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              title="Effacer la recherche"
              className="w-6 h-6 flex items-center justify-center rounded text-ctp-overlay0 hover:text-white absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex h-10 p-1 rounded-lg bg-ctp-mantle border border-ctp-surface0">
          {(
            [
              ["scripts", "Scripts", counts.scripts],
              ["active", "Actifs", counts.active],
              ["disabled", "Inactifs", counts.disabled],
              ["installed", "Installés", counts.installed],
              ["all", "Tous", counts.all],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`px-2.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                filter === id
                  ? "bg-ctp-surface0 text-ctp-mauve"
                  : "text-ctp-subtext0 hover:text-white"
              }`}
            >
              <span>{label}</span>
              <span className="text-[10px] opacity-65">{count}</span>
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="h-10 px-3 rounded-lg bg-ctp-mantle border border-ctp-surface0 text-xs font-medium text-ctp-text focus:outline-none focus:border-ctp-mauve"
        >
          <option value="recent">Récents d'abord</option>
          <option value="name">Nom (A-Z)</option>
          <option value="appid">AppID</option>
        </select>

        <div className="flex h-10 rounded-lg bg-ctp-mantle border border-ctp-surface0 focus-within:border-ctp-mauve">
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && openById()}
            placeholder="AppID"
            className="w-24 px-3 bg-transparent text-sm text-white placeholder:text-ctp-overlay0 focus:outline-none"
          />
          <button
            onClick={openById}
            title="Créer ou ouvrir un script"
            className="w-10 flex items-center justify-center text-ctp-mauve hover:bg-ctp-surface0 rounded-r-lg"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-ctp-overlay0">
          Aucun script ou jeu ne correspond.
        </p>
      ) : (
        <>
          <div key={`${filter}-${sortBy}`} className="grid grid-cols-3 xl:grid-cols-4 gap-3.5">
            {visible.map((g) => {
              const isSelected = selected.has(g.app_id);
              return (
                <div
                  key={g.app_id}
                  onClick={() => (selecting && g.has_lua ? toggleSelect(g.app_id) : onOpen(g))}
                  className={`group cursor-pointer rounded-xl overflow-hidden bg-ctp-mantle border transition relative ${
                    isSelected
                      ? "border-ctp-mauve ring-1 ring-ctp-mauve"
                      : "border-ctp-surface0 hover:border-ctp-mauve/70"
                  } ${g.has_lua && !g.enabled ? "opacity-75" : ""}`}
                >
                  {selecting && g.has_lua && (
                    <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-md bg-ctp-crust/85 border border-ctp-surface1 flex items-center justify-center">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-ctp-mauve" />
                      ) : (
                        <Square className="w-4 h-4 text-ctp-subtext0" />
                      )}
                    </div>
                  )}

                  <GameCover appId={g.app_id} name={g.name} />
                  <div className="p-3 flex items-center gap-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate group-hover:text-ctp-mauve">
                        {g.name}
                      </p>
                      <p className="text-[11px] text-ctp-overlay1 font-mono flex items-center gap-1.5 mt-0.5 truncate">
                        {g.has_lua ? g.file_name : g.app_id}
                        {g.has_lua && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              g.enabled ? "bg-ctp-green" : "bg-ctp-peach"
                            }`}
                            title={g.enabled ? "Actif (.lua)" : "Inactif (.lua.disabled)"}
                          />
                        )}
                      </p>
                    </div>
                    {!selecting && g.has_lua && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(g);
                          }}
                          title={g.enabled ? "Désactiver (.lua.disabled)" : "Activer (.lua)"}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg transition ${
                            g.enabled
                              ? "bg-ctp-base text-ctp-green hover:bg-ctp-peach/15 hover:text-ctp-peach"
                              : "bg-ctp-base text-ctp-peach hover:bg-ctp-green/15 hover:text-ctp-green"
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <DeleteButton onConfirm={() => remove(g)} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {matched.length > visible.length && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setLimit((n) => n + PAGE_SIZE)}
                className="px-4 py-2 rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1 text-xs font-medium text-white"
              >
                Afficher plus ({matched.length - visible.length} restants)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Editor({
  app,
  notify,
  onClose,
  onChanged,
}: {
  app: SteamApp;
  notify: Props["notify"];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [path, setPath] = useState("");
  const [exists, setExists] = useState(false);
  const [enabled, setEnabled] = useState(app.enabled);
  const dirty = content !== saved;

  useEffect(() => {
    api
      .readLua(app.app_id)
      .then((cfg) => {
        setContent(cfg.content);
        setSaved(cfg.exists ? cfg.content : "");
        setPath(cfg.file_path);
        setExists(cfg.exists);
        setEnabled(cfg.enabled);
      })
      .catch((e) => notify(String(e), false));
  }, [app.app_id]);

  const save = async () => {
    try {
      const p = await api.saveLua(app.app_id, content);
      setSaved(content);
      setPath(p);
      setExists(true);
      notify(`${app.app_id} enregistré`);
      await onChanged();
    } catch (e) {
      notify(String(e), false);
    }
  };

  const toggle = async () => {
    try {
      const active = await api.toggleLua(app.app_id);
      setEnabled(active);
      setPath((p) =>
        active ? p.replace(/\.lua\.disabled$/i, ".lua") : p.replace(/\.lua$/i, ".lua.disabled")
      );
      notify(active ? "Script activé (.lua)" : "Script désactivé (.lua.disabled)");
      await onChanged();
    } catch (e) {
      notify(String(e), false);
    }
  };

  const remove = async () => {
    try {
      await api.deleteLua(app.app_id);
      notify(`Script de ${app.name} supprimé`);
      await onChanged();
      onClose();
    } catch (e) {
      notify(String(e), false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          title="Retour à la bibliothèque"
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1 text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-white truncate">
            {app.name} <span className="text-sm font-mono text-ctp-mauve">{app.app_id}</span>
          </h1>
          <p className="text-[11px] text-ctp-overlay0 font-mono truncate flex items-center gap-1.5">
            <FileCode2 className="w-3 h-3" />
            {exists ? path : "Nouveau fichier, pas encore enregistré"}
          </p>
        </div>
        {exists && (
          <button
            onClick={toggle}
            title={enabled ? "Désactiver (.lua.disabled)" : "Activer (.lua)"}
            className={`h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium ${
              enabled
                ? "bg-ctp-green/15 text-ctp-green hover:bg-ctp-peach/15 hover:text-ctp-peach"
                : "bg-ctp-peach/15 text-ctp-peach hover:bg-ctp-green/15 hover:text-ctp-green"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {enabled ? "Actif" : "Désactivé"}
          </button>
        )}
        {exists && <DeleteButton onConfirm={remove} label="Supprimer" />}
        <button
          onClick={save}
          disabled={!dirty && exists}
          title="Enregistrer (Ctrl+S)"
          className="h-8 px-4 flex items-center gap-1.5 rounded-lg bg-ctp-mauve hover:bg-ctp-lavender text-ctp-on-accent text-xs font-semibold disabled:opacity-40 disabled:hover:bg-ctp-mauve"
        >
          <Save className="w-4 h-4" />
          Enregistrer
        </button>
      </div>

      <div className="flex gap-1.5">
        {[
          ["+ addappid", `addappid(${app.app_id})`],
          ["+ setManifestid", `setManifestid(DEPOT_ID, "MANIFEST_ID")`],
        ].map(([label, snippet]) => (
          <button
            key={label}
            onClick={() => setContent((c) => `${c.trimEnd()}\n${snippet}\n`)}
            className="px-2.5 py-1 rounded-md bg-ctp-surface0 hover:bg-ctp-surface1 font-mono text-[11px] text-ctp-mauve"
          >
            {label}
          </button>
        ))}
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key.toLowerCase() === "s") {
            e.preventDefault();
            save();
          }
          if (e.key === "Tab") {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart: s, selectionEnd: end } = el;
            setContent(content.slice(0, s) + "  " + content.slice(end));
            requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
          }
        }}
        spellCheck={false}
        className="flex-1 min-h-80 p-4 rounded-xl bg-ctp-mantle border border-ctp-surface0 font-mono text-xs text-ctp-text leading-relaxed resize-none focus:outline-none focus:border-ctp-mauve select-text"
      />
    </div>
  );
}
