import { useState } from "react";
import {
  CheckCircle2,
  Download,
  FolderOpen,
  Loader2,
  RefreshCw,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import type { AppUpdateInfo, DllStatus, FolderKind } from "../lib/types";
import type { Music } from "../lib/useMusic";
import { THEMES, type ThemeId } from "../lib/useTheme";

interface Props {
  namesCount: number;
  dlls: DllStatus[];
  music: Music;
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  autoUpdate: boolean;
  setAutoUpdate: (v: boolean) => void;
  updateInfo: AppUpdateInfo | null;
  updating: boolean;
  onCheckUpdate: () => Promise<void>;
  onInstallUpdate: (url: string) => Promise<void>;
  notify: (msg: string, ok?: boolean) => void;
  reload: () => Promise<void>;
}

const FOLDERS: [FolderKind, string][] = [
  ["steam", "Steam"],
  ["stplug-in", "stplug-in"],
  ["depotcache", "depotcache"],
];

export function SettingsView({
  namesCount,
  dlls,
  music,
  theme,
  setTheme,
  autoUpdate,
  setAutoUpdate,
  updateInfo,
  updating,
  onCheckUpdate,
  onInstallUpdate,
  notify,
  reload,
}: Props) {
  const [syncing, setSyncing] = useState(false);
  const [checkingUpd, setCheckingUpd] = useState(false);

  const open = (kind: FolderKind) => api.openFolder(kind).catch((e) => notify(String(e), false));

  const syncNames = async () => {
    setSyncing(true);
    try {
      const count = await api.syncAppNames();
      notify(`${count.toLocaleString("fr-FR")} jeux synchronisés`);
      await reload();
    } catch (e) {
      notify(String(e), false);
    } finally {
      setSyncing(false);
    }
  };

  const checkNow = async () => {
    setCheckingUpd(true);
    try {
      await onCheckUpdate();
    } finally {
      setCheckingUpd(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Paramètres</h1>

      <Section title="Thème" hint="Classic reprend les couleurs du logo. Les thèmes de jeux ajoutent un habillage complet.">
        <div className="grid grid-cols-5 gap-2.5">
          {THEMES.filter((t) => !t.wallpaper).map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`theme-card p-3 rounded-xl border text-left transition ${
                  active
                    ? "bg-ctp-surface0 border-ctp-mauve ring-1 ring-ctp-mauve"
                    : "bg-ctp-mantle border-ctp-surface0 hover:border-ctp-surface2"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  {t.colors.map((c, idx) => (
                    <span
                      key={idx}
                      className="w-4 h-4 rounded-full border border-white/10"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <p className="text-xs font-semibold text-white truncate">{t.label}</p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2.5 mt-2.5">
          {THEMES.filter((t) => Boolean(t.wallpaper)).map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`theme-card group rounded-xl border text-left overflow-hidden transition ${
                  active
                    ? "bg-ctp-surface0 border-ctp-mauve ring-1 ring-ctp-mauve"
                    : "bg-ctp-mantle border-ctp-surface0 hover:border-ctp-surface2"
                }`}
              >
                <div
                  className="h-14 w-full bg-cover bg-center relative"
                  style={{ backgroundImage: `url(${t.wallpaper})` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-1.5 left-2.5 flex items-center gap-1">
                    {t.colors.map((c, idx) => (
                      <span
                        key={idx}
                        className="w-2.5 h-2.5 rounded-full border border-white/25"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <span className="absolute top-1.5 right-2 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-semibold text-white/85">
                    Jeu
                  </span>
                </div>
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white truncate">{t.label}</p>
                  {t.subtitle && (
                    <span className="text-[10px] text-ctp-subtext0 truncate">{t.subtitle}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Mises à jour automatiques"
        hint={`Version installée : v${updateInfo?.current_version ?? "1.6.1"} · GitHub Releases (SteamUnlocker)`}
      >
        <div className="theme-card rounded-xl bg-ctp-mantle border border-ctp-surface0 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoUpdate(!autoUpdate)}
              className={`w-10 h-5 rounded-full transition relative ${
                autoUpdate ? "bg-ctp-mauve" : "bg-ctp-surface1"
              }`}
              title="Activer / désactiver la mise à jour automatique"
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                  autoUpdate ? "left-5 bg-ctp-on-accent" : "left-0.5 bg-white"
                }`}
              />
            </button>
            <div>
              <p className="text-xs font-semibold text-white">Mise à jour automatique au démarrage</p>
              <p className="text-[11px] text-ctp-subtext0">
                {updateInfo?.update_available
                  ? `Nouvelle version disponible : v${updateInfo.latest_version}`
                  : updateInfo
                    ? "Application à jour"
                    : "Vérification automatique sur GitHub"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {updateInfo?.update_available && updateInfo.download_url && (
              <button
                onClick={() => onInstallUpdate(updateInfo.download_url!)}
                disabled={updating}
                className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-ctp-mauve hover:bg-ctp-lavender text-ctp-on-accent text-xs font-semibold disabled:opacity-50"
              >
                {updating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Installer v{updateInfo.latest_version}
              </button>
            )}
            <button
              onClick={checkNow}
              disabled={checkingUpd || updating}
              className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1 text-xs font-medium text-white disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-ctp-mauve ${checkingUpd ? "animate-spin" : ""}`} />
              Vérifier
            </button>
          </div>
        </div>
      </Section>

      <Section title="Dossiers Steam" hint="Les scripts sont enregistrés dans config\stplug-in.">
        <div className="flex flex-wrap gap-2">
          {FOLDERS.map(([kind, label]) => (
            <button
              key={kind}
              onClick={() => open(kind)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-ctp-mantle border border-ctp-surface0 hover:border-ctp-mauve/60 text-xs font-medium text-white transition"
            >
              <FolderOpen className="w-4 h-4 text-ctp-mauve" />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Catalogue des noms Steam"
        hint={`${namesCount.toLocaleString("fr-FR")} jeux en cache pour la recherche par nom.`}
      >
        <button
          onClick={syncNames}
          disabled={syncing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-ctp-mantle border border-ctp-surface0 hover:border-ctp-mauve/60 text-xs font-medium text-white disabled:opacity-50 transition"
        >
          {syncing ? (
            <Loader2 className="w-4 h-4 text-ctp-mauve animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 text-ctp-mauve" />
          )}
          {syncing ? "Téléchargement…" : "Mettre à jour le catalogue"}
        </button>
      </Section>

      <Section title="Modules Steam" hint="DLL détectées à la racine de Steam.">
        <div className="theme-card rounded-xl bg-ctp-mantle border border-ctp-surface0 divide-y divide-ctp-surface0">
          {dlls.length === 0 && <p className="px-4 py-3 text-xs text-ctp-overlay0">Steam introuvable.</p>}
          {dlls.map((d) => (
            <div key={d.name} className="px-4 py-3 flex items-center gap-3">
              {d.present ? (
                <CheckCircle2 className="w-4 h-4 text-ctp-green" />
              ) : (
                <XCircle className="w-4 h-4 text-ctp-overlay0" />
              )}
              <span className="flex-1 text-sm font-mono text-white">{d.name}</span>
              <span className={`text-xs ${d.present ? "text-ctp-subtext0" : "text-ctp-overlay0"}`}>
                {d.present ? `${(d.size / 1024).toFixed(0)} Ko` : "Absent"}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Musique" hint="Yume Nikki – Barracks Settlement. Toujours coupée au démarrage.">
        <div className="flex items-center gap-4">
          <button
            onClick={music.toggle}
            title={music.playing ? "Couper" : "Écouter"}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${
              music.playing
                ? "bg-ctp-mauve text-ctp-on-accent"
                : "bg-ctp-mantle border border-ctp-surface0 text-ctp-subtext0 hover:text-white"
            }`}
          >
            {music.playing ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={music.volume}
            onChange={(e) => music.setVolume(Number(e.target.value))}
            className="w-48 accent-ctp-mauve cursor-pointer"
          />
          <span className="text-xs text-ctp-subtext0 w-10">{Math.round(music.volume * 100)} %</span>
        </div>
      </Section>

      <p className="text-xs text-ctp-overlay0">
        SteamUnlocker v{updateInfo?.current_version ?? "1.6.1"} · Local, sans compte ni connexion Discord.
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {hint && <p className="text-xs text-ctp-subtext0">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
