import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Download,
  ExternalLink,
  Loader2,
  Power,
  RefreshCw,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { DeleteButton } from "../components/DeleteButton";
import { api } from "../lib/api";
import type { ModeStatus } from "../lib/types";

interface Props {
  notify: (msg: string, ok?: boolean) => void;
  reload: () => Promise<void>;
}

export function ModeView({ notify, reload }: Props) {
  const [status, setStatus] = useState<ModeStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<"bst" | "cr" | null>(null);

  const loadStatus = useCallback(
    async (checkRemote: boolean) => {
      setChecking(true);
      try {
        const s = await api.modeStatus(checkRemote);
        setStatus(s);
      } catch (e) {
        notify(String(e), false);
      } finally {
        setChecking(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    loadStatus(true);
  }, [loadStatus]);

  const handleInstallBst = async () => {
    setBusy("bst");
    try {
      const version = await api.installBst();
      notify(`BetterSteamTools ${version} installé`);
      await Promise.all([loadStatus(false), reload()]);
    } catch (e) {
      notify(String(e), false);
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveBst = async () => {
    setBusy("bst");
    try {
      await api.uninstallBst();
      notify("BetterSteamTools supprimé");
      await Promise.all([loadStatus(false), reload()]);
    } catch (e) {
      notify(String(e), false);
    } finally {
      setBusy(null);
    }
  };

  const handleInstallCr = async () => {
    setBusy("cr");
    try {
      const version = await api.installCr();
      notify(`CloudRedirect ${version} installé et activé`);
      await Promise.all([loadStatus(false), reload()]);
    } catch (e) {
      notify(String(e), false);
    } finally {
      setBusy(null);
    }
  };

  const handleToggleCr = async () => {
    if (!status) return;
    setBusy("cr");
    try {
      const next = await api.toggleCr(!status.cr_enabled);
      notify(`CloudRedirect ${next ? "activé" : "désactivé"} (redémarrez Steam)`);
      await loadStatus(false);
    } catch (e) {
      notify(String(e), false);
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveCr = async () => {
    setBusy("cr");
    try {
      await api.uninstallCr();
      notify("CloudRedirect supprimé");
      await Promise.all([loadStatus(false), reload()]);
    } catch (e) {
      notify(String(e), false);
    } finally {
      setBusy(null);
    }
  };

  const handleLaunchCr = async () => {
    try {
      await api.launchCr();
    } catch (e) {
      notify(String(e), false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Mode</h1>
          <p className="text-xs text-ctp-subtext0 mt-0.5">
            Gestion locale de BetterSteamTools et CloudRedirect dans Steam.
          </p>
        </div>

        <button
          onClick={() => loadStatus(true)}
          disabled={checking || busy !== null}
          title="Vérifier les versions sur GitHub"
          className="h-9 px-3 flex items-center gap-2 rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1 text-xs font-medium text-white disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-ctp-mauve ${checking ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* BetterSteamTools */}
      <section className="theme-card rounded-2xl bg-ctp-mantle border border-ctp-surface0 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-ctp-mauve/15 border border-ctp-mauve/30 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-5 h-5 text-ctp-mauve" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">BetterSteamTools</h2>
                {status?.bst_latest_version && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-ctp-crust text-ctp-mauve border border-ctp-surface1">
                    {status.bst_latest_version}
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    status?.bst_installed
                      ? "bg-ctp-green/15 text-ctp-green"
                      : "bg-ctp-surface0 text-ctp-subtext0"
                  }`}
                >
                  {status?.bst_installed ? "Installé" : "Absent"}
                </span>
              </div>
              <p className="text-xs text-ctp-subtext0 mt-1">
                Charge les scripts de config\stplug-in et configure opensteamtool.toml.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {status?.bst_installed && (
              <DeleteButton onConfirm={handleRemoveBst} label="Supprimer" />
            )}
            <button
              onClick={handleInstallBst}
              disabled={busy !== null || !status?.steam_found}
              className="h-8 px-3.5 flex items-center gap-1.5 rounded-lg bg-ctp-mauve hover:bg-ctp-lavender text-ctp-on-accent text-xs font-semibold disabled:opacity-50"
            >
              {busy === "bst" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {status?.bst_installed ? "Mettre à jour" : "Installer"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {(status?.bst_files ?? []).map((f) => (
            <div
              key={f.name}
              className="px-3 py-2 rounded-lg bg-ctp-base border border-ctp-surface0 flex items-center gap-2"
            >
              {f.present ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-ctp-green shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-ctp-overlay0 shrink-0" />
              )}
              <span className="text-xs font-mono text-ctp-text truncate flex-1">{f.name}</span>
              {f.present && (
                <span className="text-[10px] text-ctp-overlay0">
                  {(f.size / 1024).toFixed(0)} Ko
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CloudRedirect */}
      <section className="theme-card rounded-2xl bg-ctp-mantle border border-ctp-surface0 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-ctp-sapphire/15 border border-ctp-sapphire/30 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5 text-ctp-sapphire" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">CloudRedirect</h2>
                {status?.cr_latest_version && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-ctp-crust text-ctp-sapphire border border-ctp-surface1">
                    {status.cr_latest_version}
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    status?.cr_installed
                      ? status.cr_enabled
                        ? "bg-ctp-green/15 text-ctp-green"
                        : "bg-ctp-peach/15 text-ctp-peach"
                      : "bg-ctp-surface0 text-ctp-subtext0"
                  }`}
                >
                  {status?.cr_installed
                    ? status.cr_enabled
                      ? "Installé · Activé"
                      : "Installé · Désactivé"
                    : "Absent"}
                </span>
              </div>
              <p className="text-xs text-ctp-subtext0 mt-1">
                Redirection des sauvegardes Steam Cloud locales (cloud_redirect.dll).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {status?.cr_installed && (
              <>
                <button
                  onClick={handleToggleCr}
                  disabled={busy !== null}
                  title={
                    status.cr_enabled
                      ? "Désactiver dans opensteamtool.toml"
                      : "Activer dans opensteamtool.toml"
                  }
                  className={`h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium ${
                    status.cr_enabled
                      ? "bg-ctp-green/15 text-ctp-green hover:bg-ctp-peach/15 hover:text-ctp-peach"
                      : "bg-ctp-peach/15 text-ctp-peach hover:bg-ctp-green/15 hover:text-ctp-green"
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {status.cr_enabled ? "Actif" : "Inactif"}
                </button>
                {status.cr_exe_installed && (
                  <button
                    onClick={handleLaunchCr}
                    title="Ouvrir CloudRedirect"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-subtext0 hover:text-white"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                <DeleteButton onConfirm={handleRemoveCr} label="Supprimer" />
              </>
            )}

            <button
              onClick={handleInstallCr}
              disabled={busy !== null || !status?.steam_found}
              className="h-8 px-3.5 flex items-center gap-1.5 rounded-lg bg-ctp-mauve hover:bg-ctp-lavender text-ctp-on-accent text-xs font-semibold disabled:opacity-50"
            >
              {busy === "cr" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {status?.cr_installed ? "Mettre à jour" : "Installer"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
