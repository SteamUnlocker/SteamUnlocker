import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import { ThemeBackdrop } from "./components/ThemeBackdrop";
import { TitleBar } from "./components/TitleBar";
import { api, isTauri } from "./lib/api";
import type { AppUpdateInfo, DllStatus, SteamApp, SteamInfo, Tab } from "./lib/types";
import { useMusic } from "./lib/useMusic";
import { ThemeContext, useTheme } from "./lib/useTheme";
import { HomeView } from "./views/HomeView";
import { LibraryView } from "./views/LibraryView";
import { ModeView } from "./views/ModeView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";

export default function App() {
  const { theme, setTheme } = useTheme();
  const music = useMusic();
  const [tab, setTab] = useState<Tab>(() => {
    const q = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    return q && ["home", "search", "library", "mode", "settings"].includes(q) ? q : "home";
  });
  const [info, setInfo] = useState<SteamInfo | null>(null);
  const [games, setGames] = useState<SteamApp[]>([]);
  const [dlls, setDlls] = useState<DllStatus[]>([]);
  const [editing, setEditing] = useState<SteamApp | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [autoUpdate, setAutoUpdateState] = useState<boolean>(
    () => localStorage.getItem("autoUpdate") !== "false"
  );
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);

  const setAutoUpdate = (v: boolean) => {
    setAutoUpdateState(v);
    localStorage.setItem("autoUpdate", String(v));
  };

  const notify = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast((cur) => (cur?.msg === msg ? null : cur)), 3200);
  }, []);

  const installUpdate = useCallback(
    async (downloadUrl: string) => {
      setUpdating(true);
      notify("Téléchargement et installation de la mise à jour…");
      try {
        await api.installAppUpdate(downloadUrl);
      } catch (e) {
        notify(String(e), false);
        setUpdating(false);
      }
    },
    [notify]
  );

  const checkUpdate = useCallback(
    async (allowAutoInstall = false) => {
      if (!isTauri) return;
      try {
        const res = await api.checkAppUpdate();
        setUpdateInfo(res);
        if (res.update_available && res.download_url) {
          if (allowAutoInstall && autoUpdate) {
            await installUpdate(res.download_url);
          } else if (!allowAutoInstall) {
            notify(`Mise à jour v${res.latest_version} disponible`);
          }
        } else if (!allowAutoInstall) {
          notify("Application déjà à jour");
        }
      } catch (e) {
        if (!allowAutoInstall) notify(String(e), false);
      }
    },
    [autoUpdate, installUpdate, notify]
  );

  const reload = useCallback(async () => {
    try {
      const [i, g, d] = await Promise.all([api.steamInfo(), api.games(), api.dlls()]);
      setInfo(i);
      setGames(g);
      setDlls(d);
    } catch (e) {
      notify(String(e), false);
    }
  }, [notify]);

  useEffect(() => {
    reload().then(() => {
      api
        .steamInfo()
        .then((i) => {
          if (i.names_count === 0) {
            api
              .syncAppNames()
              .then(() => reload())
              .catch(() => {});
          }
        })
        .catch(() => {});
    });

    // Vérification silencieuse de mise à jour automatique au démarrage
    checkUpdate(true);
  }, [reload, checkUpdate]);

  const importFiles = async (files: File[]) => {
    let ok = 0;
    for (const f of files) {
      try {
        await api.importFile(f);
        ok++;
      } catch (e) {
        notify(String(e), false);
      }
    }
    if (ok) {
      notify(`${ok} fichier${ok > 1 ? "s" : ""} importé${ok > 1 ? "s" : ""}`);
      reload();
    }
  };

  const restartSteam = async () => {
    setRestarting(true);
    try {
      await api.restartSteam();
      notify("Steam redémarré");
      setTimeout(reload, 2000);
    } catch (e) {
      notify(String(e), false);
    } finally {
      setRestarting(false);
    }
  };

  const go = (t: Tab) => {
    setTab(t);
    if (t !== "library") setEditing(null);
  };

  return (
    <ThemeContext.Provider value={theme}>
      <div className="theme-app-shell h-screen flex flex-col bg-ctp-base text-ctp-text relative overflow-hidden">
        <ThemeBackdrop theme={theme} />

      <TitleBar
        tab={tab}
        onTab={go}
        music={music}
        onRestartSteam={restartSteam}
        restarting={restarting}
        steamFound={Boolean(info?.steam_path)}
      />

      {/* Bandeau de mise à jour (affiché si auto-update désactivé ou en cours) */}
      {(updating || (updateInfo?.update_available && updateInfo.download_url)) && (
        <div className="relative z-20 px-4 py-2 bg-ctp-mantle/90 backdrop-blur-md border-b border-ctp-surface0 flex items-center justify-center gap-3 text-xs">
          {updating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-ctp-mauve animate-spin" />
              <span className="text-white font-medium">
                Mise à jour vers v{updateInfo?.latest_version} en cours… L'application va redémarrer.
              </span>
            </>
          ) : (
            <>
              <span className="text-ctp-text">
                Nouvelle version disponible :{" "}
                <strong className="text-white">v{updateInfo?.latest_version}</strong>
              </span>
              <button
                onClick={() => installUpdate(updateInfo!.download_url!)}
                className="px-2.5 py-1 rounded-md bg-ctp-mauve hover:bg-ctp-lavender text-ctp-on-accent font-semibold flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                Mettre à jour
              </button>
            </>
          )}
        </div>
      )}

      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-7 h-full">
          {tab === "home" && (
            <HomeView
              theme={theme}
              info={info}
              games={games}
              onFiles={importFiles}
              onOpenSteamFolder={() => api.openFolder("steam").catch((e) => notify(String(e), false))}
              onOpenLibrary={() => go("library")}
              onOpenGame={(g) => {
                setEditing(g);
                setTab("library");
              }}
            />
          )}
          {tab === "search" && (
            <SearchView
              games={games}
              onOpenGame={(g) => {
                setEditing(g);
                setTab("library");
              }}
              onRestartSteam={restartSteam}
              restarting={restarting}
              steamFound={Boolean(info?.steam_path)}
              notify={notify}
              reload={reload}
            />
          )}
          {tab === "library" && (
            <LibraryView
              games={games}
              namesCount={info?.names_count ?? 0}
              editing={editing}
              setEditing={setEditing}
              notify={notify}
              reload={reload}
            />
          )}
          {tab === "mode" && <ModeView notify={notify} reload={reload} />}
          {tab === "settings" && (
            <SettingsView
              namesCount={info?.names_count ?? 0}
              dlls={dlls}
              music={music}
              theme={theme}
              setTheme={setTheme}
              autoUpdate={autoUpdate}
              setAutoUpdate={setAutoUpdate}
              updateInfo={updateInfo}
              updating={updating}
              onCheckUpdate={() => checkUpdate(false)}
              onInstallUpdate={installUpdate}
              notify={notify}
              reload={reload}
            />
          )}
        </div>
      </main>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 max-w-sm px-4 py-2.5 rounded-xl border bg-ctp-mantle text-xs font-medium shadow-xl flex items-center gap-2 ${
            toast.ok
              ? "border-ctp-green/40 text-ctp-green"
              : "border-ctp-red/40 text-ctp-red"
          }`}
        >
          {toast.ok ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          {toast.msg}
        </div>
      )}
      </div>
    </ThemeContext.Provider>
  );
}
