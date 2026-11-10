import { invoke } from "@tauri-apps/api/core";
import type {
  AppUpdateInfo,
  DllStatus,
  FolderKind,
  LuaConfig,
  ModeStatus,
  SteamApp,
  SteamInfo,
} from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    return Promise.reject("Aperçu navigateur : lancez l'application de bureau.");
  }
  return invoke<T>(cmd, args);
}

export const api = {
  steamInfo: () => call<SteamInfo>("get_steam_info"),
  syncAppNames: () => call<number>("sync_app_names"),
  games: () => call<SteamApp[]>("get_games"),
  dlls: () => call<DllStatus[]>("get_dlls"),
  readLua: (appId: string) => call<LuaConfig>("get_lua", { appId }),
  saveLua: (appId: string, content: string) => call<string>("save_lua", { appId, content }),
  toggleLua: (appId: string) => call<boolean>("toggle_lua", { appId }),
  deleteLua: (appId: string) => call<void>("delete_lua", { appId }),
  deleteManyLua: (appIds: string[]) => call<number>("delete_many_lua", { appIds }),
  importFile: async (file: File) =>
    call<string>("import_file", {
      fileName: file.name,
      bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    }),
  openFolder: (kind: FolderKind = "steam") => call<void>("open_folder", { kind }),
  restartSteam: () => call<void>("restart_steam"),

  // Mode : BetterSteamTools & CloudRedirect
  modeStatus: (checkRemote = false) => call<ModeStatus>("get_mode_status", { checkRemote }),
  installBst: () => call<string>("install_bettersteamtools"),
  uninstallBst: () => call<void>("uninstall_bettersteamtools"),
  installCr: () => call<string>("install_cloudredirect"),
  toggleCr: (enabled: boolean) => call<boolean>("toggle_cloudredirect", { enabled }),
  uninstallCr: () => call<void>("uninstall_cloudredirect"),
  launchCr: () => call<void>("launch_cloudredirect"),

  // Auto-mise à jour GitHub
  checkAppUpdate: () => call<AppUpdateInfo>("check_app_update"),
  installAppUpdate: (downloadUrl: string) => call<void>("install_app_update", { downloadUrl }),
};

export const coverUrl = (appId: string) =>
  `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
