export interface SteamInfo {
  steam_path: string | null;
  lua_count: number;
  modules_installed: boolean;
  names_count: number;
}

export interface SteamApp {
  app_id: string;
  name: string;
  has_lua: boolean;
  enabled: boolean;
  file_name: string;
  modified_ts: number;
  installed: boolean;
}

export interface LuaConfig {
  file_path: string;
  content: string;
  exists: boolean;
  enabled: boolean;
}

export interface DllStatus {
  name: string;
  present: boolean;
  size: number;
}

export interface ModeStatus {
  steam_found: boolean;
  bst_installed: boolean;
  bst_files: DllStatus[];
  bst_latest_version: string | null;
  cr_installed: boolean;
  cr_enabled: boolean;
  cr_exe_installed: boolean;
  cr_latest_version: string | null;
}

export interface AppUpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  download_url: string | null;
  release_url: string | null;
}

export type FolderKind = "steam" | "stplug-in" | "depotcache";
export type Tab = "home" | "library" | "mode" | "settings";
