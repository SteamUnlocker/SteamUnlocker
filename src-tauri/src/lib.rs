use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Read};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{OnceLock, RwLock};
use std::time::{Duration, UNIX_EPOCH};
use winreg::enums::*;
use winreg::RegKey;

mod search;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const BST_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/madoiscool/BetterSteamTools/refs/heads/updates/opensteamtool/latest.toml";
const BST_RELEASES_API: &str =
    "https://api.github.com/repos/madoiscool/BetterSteamTools/releases/latest";
const CR_RELEASES_API: &str =
    "https://api.github.com/repos/madoiscool/CloudRedirect/releases/latest";
const APP_RELEASES_API: &str =
    "https://api.github.com/repos/SteamUnlocker/SteamUnlocker/releases/latest";
const MORRENUS_APPLIST_URL: &str = "https://applist.morrenus.xyz/";

static APP_NAMES: OnceLock<RwLock<HashMap<String, String>>> = OnceLock::new();

fn app_names_store() -> &'static RwLock<HashMap<String, String>> {
    APP_NAMES.get_or_init(|| RwLock::new(load_cached_app_names()))
}

#[derive(Serialize)]
pub struct SteamInfo {
    steam_path: Option<String>,
    lua_count: usize,
    modules_installed: bool,
    names_count: usize,
}

#[derive(Serialize)]
pub struct SteamApp {
    app_id: String,
    name: String,
    has_lua: bool,
    enabled: bool,
    file_name: String,
    modified_ts: u64,
    installed: bool,
}

#[derive(Serialize)]
pub struct LuaConfig {
    file_path: String,
    content: String,
    exists: bool,
    enabled: bool,
}

#[derive(Serialize)]
pub struct DllStatus {
    name: String,
    present: bool,
    size: u64,
}

#[derive(Serialize)]
pub struct ModeStatus {
    steam_found: bool,
    bst_installed: bool,
    bst_files: Vec<DllStatus>,
    bst_latest_version: Option<String>,
    cr_installed: bool,
    cr_enabled: bool,
    cr_exe_installed: bool,
    cr_latest_version: Option<String>,
}

#[derive(Serialize)]
pub struct AppUpdateInfo {
    current_version: String,
    latest_version: String,
    update_available: bool,
    download_url: Option<String>,
    release_url: Option<String>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct MorrenusEntry {
    appid: u64,
    name: String,
}

// ---------- utilitaires ----------

fn steam_path() -> Option<PathBuf> {
    let from_reg = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Valve\\Steam")
        .and_then(|k| k.get_value::<String, _>("SteamPath"))
        .map(|p| PathBuf::from(p.replace('/', "\\")))
        .ok()
        .or_else(|| {
            RegKey::predef(HKEY_LOCAL_MACHINE)
                .open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam")
                .and_then(|k| k.get_value::<String, _>("InstallPath"))
                .map(PathBuf::from)
                .ok()
        })
        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files (x86)\Steam"));

    from_reg.join("steam.exe").exists().then_some(from_reg)
}

fn require_steam() -> Result<PathBuf, String> {
    steam_path().ok_or_else(|| "Steam est introuvable sur ce PC".into())
}

fn app_data_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("SteamUnlocker")
}

fn stplugin_dir(steam: &Path) -> PathBuf {
    steam.join("config").join("stplug-in")
}

/// Valide un identifiant ou nom de script sans chemin parent (`..`, `/`, `\`).
fn sanitize_script_id(raw: &str) -> Result<String, String> {
    let clean = raw.trim();
    if clean.is_empty()
        || clean.contains("..")
        || clean.contains('/')
        || clean.contains('\\')
        || clean.contains(':')
    {
        return Err(format!("Identifiant invalide : « {raw} »"));
    }
    Ok(clean.to_owned())
}

fn steam_running() -> bool {
    Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq steam.exe", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .to_lowercase()
                .contains("steam.exe")
        })
        .unwrap_or(false)
}

fn stop_steam_if_running(steam: &Path) -> bool {
    if !steam_running() {
        return false;
    }
    let exe = steam.join("steam.exe");
    let _ = Command::new(&exe).arg("-shutdown").spawn();
    for _ in 0..24 {
        std::thread::sleep(Duration::from_millis(500));
        if !steam_running() {
            return true;
        }
    }
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "steam.exe"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    std::thread::sleep(Duration::from_millis(800));
    true
}

fn start_steam(steam: &Path) -> Result<(), String> {
    Command::new(steam.join("steam.exe"))
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Impossible de lancer Steam : {e}"))
}

fn vdf_value(line: &str, key: &str) -> Option<String> {
    let t = line.trim();
    if !t.starts_with(&format!("\"{key}\"")) {
        return None;
    }
    t.split('"').nth(3).map(str::to_owned)
}

fn load_cached_app_names() -> HashMap<String, String> {
    let own = app_data_dir().join("applist.json");
    if let Ok(raw) = fs::read_to_string(&own) {
        if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&raw) {
            if !map.is_empty() {
                return map;
            }
        }
    }

    // Reprend le cache existant s'il est déjà présent sur le PC
    if let Some(roaming) = dirs::config_dir() {
        let fallback = roaming.join("LuaToolsGui").join("steam-applist.json");
        if let Ok(raw) = fs::read_to_string(&fallback) {
            if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&raw) {
                if !map.is_empty() {
                    let _ = fs::create_dir_all(app_data_dir());
                    let _ = fs::write(&own, &raw);
                    return map;
                }
            }
        }
    }

    HashMap::new()
}

struct ScriptEntry {
    file_name: String,
    enabled: bool,
    ts: u64,
}

/// Liste tous les scripts .lua (actifs) et .st (désactivés) dans config/stplug-in.
fn scan_stplugin_scripts(steam: &Path) -> HashMap<String, ScriptEntry> {
    let mut map: HashMap<String, ScriptEntry> = HashMap::new();
    let Ok(entries) = fs::read_dir(stplugin_dir(steam)) else {
        return map;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        let lower = file_name.to_lowercase();
        let (stem, enabled) = if lower.ends_with(".lua.disabled") {
            (&file_name[..file_name.len() - ".lua.disabled".len()], false)
        } else if lower.ends_with(".lua") {
            (&file_name[..file_name.len() - ".lua".len()], true)
        } else {
            continue;
        };
        // Ignore les fichiers internes non-jeux (ex. Steamtools.lua) comme LuaTools
        if stem.eq_ignore_ascii_case("steamtools") {
            continue;
        }
        let ts = entry
            .metadata()
            .ok()
            .map(|m| {
                let mod_t = m
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_secs());
                let cre_t = m
                    .created()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_secs());
                mod_t.max(cre_t)
            })
            .unwrap_or(0);

        let replace = match map.get(stem) {
            None => true,
            Some(prev) => !prev.enabled && enabled,
        };
        if replace {
            map.insert(
                stem.to_owned(),
                ScriptEntry {
                    file_name: file_name.to_owned(),
                    enabled,
                    ts,
                },
            );
        }
    }
    map
}

fn parse_lua_comment_name(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let mut lines = content.lines();
    let line0 = lines.next()?;
    let line1 = lines.next()?;
    if (line0.contains("Created by") || line0.contains("Generated by"))
        && line1.trim_start().starts_with("--")
    {
        let name = line1.trim_start_matches('-').trim();
        if !name.is_empty() && !name.contains("addappid") {
            return Some(name.to_owned());
        }
    }
    None
}

fn detail_cache_name(app_id: &str) -> Option<String> {
    let roaming = dirs::config_dir()?;
    let detail_file = roaming
        .join("LuaToolsGui")
        .join("details")
        .join(format!("{app_id}.json"));
    let raw = fs::read_to_string(detail_file).ok()?;
    let val: serde_json::Value = serde_json::from_str(&raw).ok()?;
    val.get("name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

fn library_folders(steam: &Path) -> Vec<PathBuf> {
    let mut libs = vec![steam.to_path_buf()];
    if let Ok(content) = fs::read_to_string(steam.join("steamapps").join("libraryfolders.vdf")) {
        for line in content.lines() {
            if let Some(p) = vdf_value(line, "path") {
                let p = PathBuf::from(p.replace(r"\\", r"\"));
                if p.exists() && !libs.contains(&p) {
                    libs.push(p);
                }
            }
        }
    }
    libs
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("SteamUnlocker/1.5")
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("Erreur réseau : {e}"))
}

// ---------- configuration opensteamtool.toml ----------

fn ensure_toml_lua_path(steam: &Path) -> Result<(), String> {
    let toml_path = steam.join("opensteamtool.toml");
    let target_entry = "config/stplug-in";
    if !toml_path.exists() {
        return fs::write(&toml_path, format!("[lua]\npaths = [\"{target_entry}\"]\n"))
            .map_err(|e| e.to_string());
    }

    let raw = fs::read_to_string(&toml_path).map_err(|e| e.to_string())?;
    if raw.contains("config/stplug-in") || raw.contains("config\\stplug-in") {
        return Ok(());
    }

    let mut lines: Vec<String> = raw.lines().map(str::to_owned).collect();
    if let Some(lua_idx) = lines.iter().position(|l| l.trim() == "[lua]") {
        let end_idx = lines
            .iter()
            .enumerate()
            .skip(lua_idx + 1)
            .find(|(_, l)| {
                let t = l.trim();
                t.starts_with('[') && !t.starts_with('#')
            })
            .map_or(lines.len(), |(i, _)| i);

        let mut inserted = false;
        for line in &mut lines[lua_idx + 1..end_idx] {
            if line.trim_start().starts_with("paths") && line.contains(']') {
                if let Some(pos) = line.rfind(']') {
                    let before = line[..pos].trim_end();
                    let sep = if before.ends_with('[') { "" } else { ", " };
                    *line = format!("{before}{sep}\"{target_entry}\"{}", &line[pos..]);
                    inserted = true;
                    break;
                }
            }
        }
        if !inserted {
            lines.insert(lua_idx + 1, format!("paths = [\"{target_entry}\"]"));
        }
    } else {
        if !lines.is_empty() && !lines.last().unwrap().trim().is_empty() {
            lines.push(String::new());
        }
        lines.push("[lua]".into());
        lines.push(format!("paths = [\"{target_entry}\"]"));
    }

    fs::write(&toml_path, format!("{}\n", lines.join("\n"))).map_err(|e| e.to_string())
}

fn read_toml_cloud_enabled(steam: &Path) -> bool {
    let Ok(raw) = fs::read_to_string(steam.join("opensteamtool.toml")) else {
        return false;
    };
    let mut in_cloud = false;
    for line in raw.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        if t.starts_with('[') {
            in_cloud = t == "[cloud]";
            continue;
        }
        if in_cloud && t.starts_with("enabled") {
            return t.split('=').nth(1).is_some_and(|v| v.trim() == "true");
        }
    }
    false
}

fn set_toml_cloud_enabled(steam: &Path, enabled: bool) -> Result<(), String> {
    let toml_path = steam.join("opensteamtool.toml");
    let val = if enabled { "true" } else { "false" };
    if !toml_path.exists() {
        return fs::write(&toml_path, format!("[cloud]\nenabled = {val}\n"))
            .map_err(|e| e.to_string());
    }

    let raw = fs::read_to_string(&toml_path).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = raw.lines().map(str::to_owned).collect();

    if let Some(cloud_idx) = lines.iter().position(|l| l.trim() == "[cloud]") {
        let end_idx = lines
            .iter()
            .enumerate()
            .skip(cloud_idx + 1)
            .find(|(_, l)| {
                let t = l.trim();
                t.starts_with('[') && !t.starts_with('#')
            })
            .map_or(lines.len(), |(i, _)| i);

        let mut updated = false;
        for line in &mut lines[cloud_idx + 1..end_idx] {
            if line.trim_start().starts_with("enabled") {
                *line = format!("enabled = {val}");
                updated = true;
                break;
            }
        }
        if !updated {
            lines.insert(cloud_idx + 1, format!("enabled = {val}"));
        }
    } else {
        if !lines.is_empty() && !lines.last().unwrap().trim().is_empty() {
            lines.push(String::new());
        }
        lines.push("[cloud]".into());
        lines.push(format!("enabled = {val}"));
    }

    fs::write(&toml_path, format!("{}\n", lines.join("\n"))).map_err(|e| e.to_string())
}

// ---------- commandes principales ----------

#[tauri::command]
async fn get_steam_info() -> SteamInfo {
    let steam = steam_path();
    let names_count = app_names_store().read().map(|m| m.len()).unwrap_or(0);
    let (lua_count, modules) = match &steam {
        Some(s) => (
            scan_stplugin_scripts(s).len(),
            ["dwmapi.dll", "xinput1_4.dll", "OpenSteamTool.dll"]
                .iter()
                .all(|d| s.join(d).exists()),
        ),
        None => (0, false),
    };

    SteamInfo {
        steam_path: steam.map(|p| p.to_string_lossy().into_owned()),
        lua_count,
        modules_installed: modules,
        names_count,
    }
}

#[tauri::command]
async fn sync_app_names() -> Result<usize, String> {
    let client = http_client()?;
    let entries: Vec<MorrenusEntry> = client
        .get(MORRENUS_APPLIST_URL)
        .send()
        .await
        .map_err(|e| format!("Téléchargement impossible : {e}"))?
        .json()
        .await
        .map_err(|e| format!("Données invalides : {e}"))?;

    let mut map = HashMap::with_capacity(entries.len());
    for entry in entries {
        if !entry.name.trim().is_empty() {
            map.insert(entry.appid.to_string(), entry.name);
        }
    }

    let count = map.len();
    let dir = app_data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string(&map).map_err(|e| e.to_string())?;
    fs::write(dir.join("applist.json"), json).map_err(|e| e.to_string())?;

    if let Ok(mut guard) = app_names_store().write() {
        *guard = map;
    }

    Ok(count)
}

#[tauri::command]
async fn get_games() -> Vec<SteamApp> {
    let Some(steam) = steam_path() else {
        return Vec::new();
    };
    let mut scripts = scan_stplugin_scripts(&steam);
    let names_guard = app_names_store().read().ok();
    let mut apps = Vec::new();
    let mut seen_ids = HashSet::new();

    for lib in library_folders(&steam) {
        let Ok(entries) = fs::read_dir(lib.join("steamapps")) else {
            continue;
        };
        for entry in entries.flatten() {
            let file = entry.file_name().to_string_lossy().into_owned();
            let Some(id) = file
                .strip_prefix("appmanifest_")
                .and_then(|f| f.strip_suffix(".acf"))
            else {
                continue;
            };
            if !seen_ids.insert(id.to_owned()) {
                continue;
            }
            let Ok(content) = fs::read_to_string(entry.path()) else {
                continue;
            };
            let name = content
                .lines()
                .find_map(|l| vdf_value(l, "name"))
                .or_else(|| {
                    names_guard
                        .as_ref()
                        .and_then(|m| m.get(id).cloned())
                })
                .unwrap_or_else(|| format!("AppID {id}"));

            let script = scripts.remove(id);
            apps.push(SteamApp {
                app_id: id.to_owned(),
                name,
                has_lua: script.is_some(),
                enabled: script.as_ref().is_some_and(|s| s.enabled),
                file_name: script
                    .as_ref()
                    .map_or_else(|| format!("{id}.lua"), |s| s.file_name.clone()),
                modified_ts: script.map_or(0, |s| s.ts),
                installed: true,
            });
        }
    }

    for (id, script) in scripts {
        let script_path = stplugin_dir(&steam).join(&script.file_name);
        let resolved_name = names_guard
            .as_ref()
            .and_then(|m| m.get(&id).cloned())
            .or_else(|| parse_lua_comment_name(&script_path))
            .or_else(|| detail_cache_name(&id))
            .unwrap_or_else(|| {
                if id.chars().all(|c| c.is_ascii_digit()) {
                    format!("AppID {id}")
                } else {
                    id.clone()
                }
            });
        apps.push(SteamApp {
            app_id: id,
            name: resolved_name,
            has_lua: true,
            enabled: script.enabled,
            file_name: script.file_name,
            modified_ts: script.ts,
            installed: false,
        });
    }

    apps.sort_by(|a, b| {
        b.modified_ts
            .cmp(&a.modified_ts)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    apps
}

#[tauri::command]
async fn get_lua(app_id: String) -> Result<LuaConfig, String> {
    let steam = require_steam()?;
    let id = sanitize_script_id(&app_id)?;
    let dir = stplugin_dir(&steam);

    let lua_path = dir.join(format!("{id}.lua"));
    if lua_path.exists() {
        return Ok(LuaConfig {
            content: fs::read_to_string(&lua_path).map_err(|e| e.to_string())?,
            file_path: lua_path.to_string_lossy().into_owned(),
            exists: true,
            enabled: true,
        });
    }

    let disabled_path = dir.join(format!("{id}.lua.disabled"));
    if disabled_path.exists() {
        return Ok(LuaConfig {
            content: fs::read_to_string(&disabled_path).map_err(|e| e.to_string())?,
            file_path: disabled_path.to_string_lossy().into_owned(),
            exists: true,
            enabled: false,
        });
    }

    Ok(LuaConfig {
        file_path: lua_path.to_string_lossy().into_owned(),
        content: format!("addappid({id})\n"),
        exists: false,
        enabled: true,
    })
}

#[tauri::command]
async fn save_lua(app_id: String, content: String) -> Result<String, String> {
    let steam = require_steam()?;
    let id = sanitize_script_id(&app_id)?;
    let dir = stplugin_dir(&steam);
    fs::create_dir_all(&dir).map_err(|e| format!("Création du dossier impossible : {e}"))?;

    let disabled_path = dir.join(format!("{id}.lua.disabled"));
    let lua_path = dir.join(format!("{id}.lua"));
    let target = if !lua_path.exists() && disabled_path.exists() {
        disabled_path
    } else {
        lua_path
    };

    fs::write(&target, content).map_err(|e| format!("Écriture impossible : {e}"))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
async fn toggle_lua(app_id: String) -> Result<bool, String> {
    let steam = require_steam()?;
    let id = sanitize_script_id(&app_id)?;
    let dir = stplugin_dir(&steam);
    let lua_path = dir.join(format!("{id}.lua"));
    let disabled_path = dir.join(format!("{id}.lua.disabled"));

    if lua_path.exists() {
        fs::rename(&lua_path, &disabled_path)
            .map_err(|e| format!("Renommage impossible : {e}"))?;
        Ok(false)
    } else if disabled_path.exists() {
        fs::rename(&disabled_path, &lua_path)
            .map_err(|e| format!("Renommage impossible : {e}"))?;
        Ok(true)
    } else {
        Err("Script introuvable".into())
    }
}

#[tauri::command]
async fn delete_lua(app_id: String) -> Result<(), String> {
    let steam = require_steam()?;
    let id = sanitize_script_id(&app_id)?;
    let dir = stplugin_dir(&steam);

    for ext in ["lua", "lua.disabled"] {
        let path = dir.join(format!("{id}.{ext}"));
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("Suppression impossible : {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn delete_many_lua(app_ids: Vec<String>) -> Result<usize, String> {
    let steam = require_steam()?;
    let dir = stplugin_dir(&steam);
    let mut deleted = 0usize;

    for raw_id in app_ids {
        let Ok(id) = sanitize_script_id(&raw_id) else {
            continue;
        };
        let mut any = false;
        for ext in ["lua", "lua.disabled"] {
            let path = dir.join(format!("{id}.{ext}"));
            if path.exists() && fs::remove_file(&path).is_ok() {
                any = true;
            }
        }
        if any {
            deleted += 1;
        }
    }
    Ok(deleted)
}

#[tauri::command]
async fn import_file(file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let steam = require_steam()?;
    let name = Path::new(&file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Nom de fichier invalide")?;
    let lower = name.to_lowercase();

    let dir = if lower.ends_with(".lua") || lower.ends_with(".lua.disabled") || lower.ends_with(".st")
    {
        stplugin_dir(&steam)
    } else if lower.ends_with(".manifest") {
        steam.join("depotcache")
    } else {
        return Err(format!("{name} : seuls les .lua, .st et .manifest sont acceptés"));
    };

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(name);
    fs::write(&path, bytes).map_err(|e| format!("Écriture impossible : {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn get_dlls() -> Vec<DllStatus> {
    let Some(steam) = steam_path() else {
        return Vec::new();
    };
    ["dwmapi.dll", "xinput1_4.dll", "OpenSteamTool.dll", "cloud_redirect.dll"]
        .iter()
        .map(|name| {
            let meta = fs::metadata(steam.join(name)).ok();
            DllStatus {
                name: (*name).to_owned(),
                present: meta.is_some(),
                size: meta.map_or(0, |m| m.len()),
            }
        })
        .collect()
}

#[tauri::command]
fn open_folder(kind: Option<String>) -> Result<(), String> {
    let steam = require_steam()?;
    let dir = match kind.as_deref() {
        Some("stplug-in") => stplugin_dir(&steam),
        Some("depotcache") => steam.join("depotcache"),
        _ => steam,
    };
    let _ = fs::create_dir_all(&dir);
    Command::new("explorer")
        .arg(dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn restart_steam() -> Result<(), String> {
    let steam = require_steam()?;
    let _ = stop_steam_if_running(&steam);
    start_steam(&steam)
}

// ---------- Mode : BetterSteamTools & CloudRedirect ----------

async fn fetch_bst_latest_tag(client: &reqwest::Client) -> Option<String> {
    if let Ok(resp) = client.get(BST_MANIFEST_URL).send().await {
        if let Ok(text) = resp.text().await {
            for line in text.lines() {
                if let Some((k, v)) = line.split_once('=') {
                    if k.trim() == "version" {
                        let clean = v.trim().trim_matches('"').to_owned();
                        if !clean.is_empty() {
                            return Some(clean);
                        }
                    }
                }
            }
        }
    }

    if let Ok(resp) = client.get(BST_RELEASES_API).send().await {
        if let Ok(rel) = resp.json::<GithubRelease>().await {
            return Some(rel.tag_name);
        }
    }
    None
}

async fn fetch_cr_latest_release(client: &reqwest::Client) -> Result<GithubRelease, String> {
    client
        .get(CR_RELEASES_API)
        .send()
        .await
        .map_err(|e| format!("GitHub inaccessible : {e}"))?
        .json::<GithubRelease>()
        .await
        .map_err(|e| format!("Réponse GitHub invalide : {e}"))
}

#[tauri::command]
async fn get_mode_status(check_remote: bool) -> ModeStatus {
    let Some(steam) = steam_path() else {
        return ModeStatus {
            steam_found: false,
            bst_installed: false,
            bst_files: Vec::new(),
            bst_latest_version: None,
            cr_installed: false,
            cr_enabled: false,
            cr_exe_installed: false,
            cr_latest_version: None,
        };
    };

    let bst_names = ["dwmapi.dll", "xinput1_4.dll", "OpenSteamTool.dll"];
    let bst_files: Vec<DllStatus> = bst_names
        .iter()
        .map(|name| {
            let meta = fs::metadata(steam.join(name)).ok();
            DllStatus {
                name: (*name).to_owned(),
                present: meta.is_some(),
                size: meta.map_or(0, |m| m.len()),
            }
        })
        .collect();
    let bst_installed = bst_files.iter().all(|f| f.present);

    let cr_installed = steam.join("cloud_redirect.dll").exists();
    let cr_enabled = read_toml_cloud_enabled(&steam);
    let cr_exe_installed = app_data_dir().join("CloudRedirect.exe").exists();

    let (bst_latest_version, cr_latest_version) = if check_remote {
        if let Ok(client) = http_client() {
            let bst_v = fetch_bst_latest_tag(&client).await;
            let cr_v = fetch_cr_latest_release(&client).await.ok().map(|r| r.tag_name);
            (bst_v, cr_v)
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    ModeStatus {
        steam_found: true,
        bst_installed,
        bst_files,
        bst_latest_version,
        cr_installed,
        cr_enabled,
        cr_exe_installed,
        cr_latest_version,
    }
}

#[tauri::command]
async fn install_bettersteamtools() -> Result<String, String> {
    let steam = require_steam()?;
    let client = http_client()?;

    let version = fetch_bst_latest_tag(&client)
        .await
        .ok_or("Impossible de récupérer la dernière version de BetterSteamTools")?;

    let zip_url = format!(
        "https://github.com/madoiscool/BetterSteamTools/releases/download/{version}/OpenSteamTool-{version}-Release.zip"
    );
    let bytes = client
        .get(&zip_url)
        .send()
        .await
        .map_err(|e| format!("Téléchargement impossible : {e}"))?
        .error_for_status()
        .map_err(|e| format!("Archive introuvable ({e})"))?
        .bytes()
        .await
        .map_err(|e| format!("Lecture archive impossible : {e}"))?;

    let was_running = stop_steam_if_running(&steam);

    let reader = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("ZIP invalide : {e}"))?;
    let wanted = ["dwmapi.dll", "xinput1_4.dll", "OpenSteamTool.dll"];
    let mut extracted = 0usize;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(name) = entry
            .enclosed_name()
            .and_then(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_owned))
        else {
            continue;
        };
        if let Some(target_name) = wanted.iter().find(|w| w.eq_ignore_ascii_case(&name)) {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            fs::write(steam.join(target_name), buf)
                .map_err(|e| format!("Impossible d'écrire {target_name} : {e}"))?;
            extracted += 1;
        }
    }

    if extracted == 0 {
        if was_running {
            let _ = start_steam(&steam);
        }
        return Err("Aucune DLL trouvée dans l'archive BetterSteamTools".into());
    }

    let _ = ensure_toml_lua_path(&steam);
    if was_running {
        let _ = start_steam(&steam);
    }

    Ok(version)
}

#[tauri::command]
async fn uninstall_bettersteamtools() -> Result<(), String> {
    let steam = require_steam()?;
    let was_running = stop_steam_if_running(&steam);

    for name in ["dwmapi.dll", "xinput1_4.dll", "OpenSteamTool.dll"] {
        let p = steam.join(name);
        if p.exists() {
            fs::remove_file(&p).map_err(|e| format!("Impossible de supprimer {name} : {e}"))?;
        }
    }

    if was_running {
        let _ = start_steam(&steam);
    }
    Ok(())
}

#[tauri::command]
async fn install_cloudredirect() -> Result<String, String> {
    let steam = require_steam()?;
    let client = http_client()?;
    let release = fetch_cr_latest_release(&client).await?;

    let dll_asset = release
        .assets
        .iter()
        .find(|a| a.name.eq_ignore_ascii_case("cloud_redirect.dll"))
        .ok_or("cloud_redirect.dll introuvable dans la release")?;

    let dll_bytes = client
        .get(&dll_asset.browser_download_url)
        .send()
        .await
        .map_err(|e| format!("Téléchargement DLL impossible : {e}"))?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let exe_bytes = if let Some(exe_asset) = release
        .assets
        .iter()
        .find(|a| a.name.eq_ignore_ascii_case("CloudRedirect.exe"))
    {
        client
            .get(&exe_asset.browser_download_url)
            .send()
            .await
            .ok()
            .and_then(|r| if r.status().is_success() { Some(r) } else { None })
    } else {
        None
    };

    let was_running = stop_steam_if_running(&steam);

    fs::write(steam.join("cloud_redirect.dll"), dll_bytes)
        .map_err(|e| format!("Écriture cloud_redirect.dll impossible : {e}"))?;

    if let Some(resp) = exe_bytes {
        if let Ok(b) = resp.bytes().await {
            let dir = app_data_dir();
            let _ = fs::create_dir_all(&dir);
            let _ = fs::write(dir.join("CloudRedirect.exe"), b);
        }
    }

    set_toml_cloud_enabled(&steam, true)?;

    if was_running {
        let _ = start_steam(&steam);
    }

    Ok(release.tag_name)
}

#[tauri::command]
async fn toggle_cloudredirect(enabled: bool) -> Result<bool, String> {
    let steam = require_steam()?;
    set_toml_cloud_enabled(&steam, enabled)?;
    Ok(enabled)
}

#[tauri::command]
async fn uninstall_cloudredirect() -> Result<(), String> {
    let steam = require_steam()?;
    let was_running = stop_steam_if_running(&steam);

    let dll = steam.join("cloud_redirect.dll");
    if dll.exists() {
        fs::remove_file(&dll)
            .map_err(|e| format!("Impossible de supprimer cloud_redirect.dll : {e}"))?;
    }

    let exe = app_data_dir().join("CloudRedirect.exe");
    if exe.exists() {
        let _ = fs::remove_file(exe);
    }

    if steam.join("opensteamtool.toml").exists() {
        let _ = set_toml_cloud_enabled(&steam, false);
    }

    if was_running {
        let _ = start_steam(&steam);
    }
    Ok(())
}

#[tauri::command]
fn launch_cloudredirect() -> Result<(), String> {
    let exe = app_data_dir().join("CloudRedirect.exe");
    if !exe.exists() {
        return Err("CloudRedirect.exe n'est pas installé".into());
    }
    Command::new(&exe)
        .current_dir(app_data_dir())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Lancement impossible : {e}"))
}

// ---------- Auto-mise à jour ----------

fn parse_semver(v: &str) -> (u64, u64, u64) {
    let clean = v.trim().trim_start_matches(['v', 'V']);
    let mut parts = clean.split('.').map(|p| {
        p.chars()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse::<u64>()
            .unwrap_or(0)
    });
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

#[tauri::command]
async fn check_app_update() -> Result<AppUpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_owned();
    let client = http_client()?;
    let release: GithubRelease = client
        .get(APP_RELEASES_API)
        .send()
        .await
        .map_err(|e| format!("Serveur de mise à jour inaccessible : {e}"))?
        .error_for_status()
        .map_err(|e| format!("Aucune release disponible ({e})"))?
        .json()
        .await
        .map_err(|e| format!("Réponse invalide : {e}"))?;

    let latest = release.tag_name.trim_start_matches(['v', 'V']).to_owned();
    let asset = release
        .assets
        .iter()
        .find(|a| a.name.eq_ignore_ascii_case("SteamUnlocker.exe"));

    let update_available =
        parse_semver(&latest) > parse_semver(&current) && asset.is_some();

    Ok(AppUpdateInfo {
        current_version: current,
        latest_version: latest,
        update_available,
        download_url: asset.map(|a| a.browser_download_url.clone()),
        release_url: release.html_url,
    })
}

#[tauri::command]
async fn install_app_update(app: tauri::AppHandle, download_url: String) -> Result<(), String> {
    if !download_url.starts_with("https://github.com/")
        && !download_url.starts_with("https://objects.githubusercontent.com/")
        && !download_url.starts_with("https://release-assets.githubusercontent.com/")
    {
        return Err("URL de mise à jour non autorisée".into());
    }

    let client = http_client()?;
    let bytes = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Téléchargement impossible : {e}"))?
        .error_for_status()
        .map_err(|e| format!("Échec téléchargement ({e})"))?
        .bytes()
        .await
        .map_err(|e| format!("Lecture impossible : {e}"))?;

    if bytes.len() < 100_000 || &bytes[..2] != b"MZ" {
        return Err("Exécutable téléchargé invalide".into());
    }

    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = current_exe
        .parent()
        .ok_or("Répertoire introuvable")?
        .to_path_buf();

    let local_stage = exe_dir.join("SteamUnlocker.exe.new");
    let staged = if fs::write(&local_stage, &bytes).is_ok() {
        local_stage
    } else {
        let tmp = std::env::temp_dir().join("SteamUnlocker-update.exe");
        fs::write(&tmp, &bytes).map_err(|e| format!("Écriture mise à jour impossible : {e}"))?;
        tmp
    };

    let q = |p: &Path| format!("'{}'", p.display().to_string().replace('\'', "''"));
    let pid = std::process::id();
    let ps_script = format!(
        "Wait-Process -Id {pid} -Timeout 15 -ErrorAction SilentlyContinue; \
         Start-Sleep -Milliseconds 400; \
         for ($i = 0; $i -lt 10; $i++) {{ \
           try {{ Copy-Item -LiteralPath {src} -Destination {dst} -Force -ErrorAction Stop; break }} \
           catch {{ Start-Sleep -Milliseconds 300 }} \
         }}; \
         Remove-Item -LiteralPath {src} -Force -ErrorAction SilentlyContinue; \
         Start-Process -FilePath 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden -ErrorAction SilentlyContinue; \
         Start-Process -FilePath {dst} -WorkingDirectory {dir}",
        src = q(&staged),
        dst = q(&current_exe),
        dir = q(&exe_dir),
    );

    Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Lancement de la mise à jour impossible : {e}"))?;

    app.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_steam_info,
            sync_app_names,
            get_games,
            get_lua,
            save_lua,
            toggle_lua,
            delete_lua,
            delete_many_lua,
            import_file,
            get_dlls,
            open_folder,
            restart_steam,
            get_mode_status,
            install_bettersteamtools,
            uninstall_bettersteamtools,
            install_cloudredirect,
            toggle_cloudredirect,
            uninstall_cloudredirect,
            launch_cloudredirect,
            check_app_update,
            install_app_update,
            search::get_download_sources,
            search::search_steam_games,
            search::get_steam_app_details,
            search::download_game_files
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de SteamUnlocker");
}
