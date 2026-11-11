use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};
use tauri::Emitter;

const STORE_URL: &str = "https://store.steampowered.com";
const COMMUNITY_URL: &str = "https://steamcommunity.com";
const HTTP_TIMEOUT_SECS: u64 = 8;
const SOURCE_TIMEOUT_SECS: u64 = 15;
const SOURCE_CONNECT_SECS: u64 = 4;
const SOURCE_COOLDOWN_SECS: u64 = 60;
const ZIP_CACHE_TTL_SECS: u64 = 24 * 3600;
const DETAILS_CACHE_TTL_SECS: u64 = 1800;
const MAX_ZIP_BYTES: usize = 200 * 1024 * 1024;

#[derive(Clone, Copy)]
struct SourceDef {
    slug: &'static str,
    name: &'static str,
    url_template: &'static str,
    ryuu_headers: bool,
}

const SOURCES: &[SourceDef] = &[
    SourceDef {
        slug: "ryuu",
        name: "Ryuu DB",
        url_template: "http://167.235.229.108/{appid}",
        ryuu_headers: true,
    },
    SourceDef {
        slug: "sushi",
        name: "Sushi DB",
        url_template: "https://github.com/sushi-dev55-alt/sushitools-games-repo-alt/raw/refs/heads/main/{appid}.zip",
        ryuu_headers: false,
    },
    SourceDef {
        slug: "r2",
        name: "R2",
        url_template: "https://pub-5b6d3b7c03fd4ac1afb5bd3017850e20.r2.dev/{appid}.zip",
        ryuu_headers: false,
    },
    SourceDef {
        slug: "luagen",
        name: "Luagen",
        url_template: "https://api.luagen.revo-bd.club/{appid}.zip",
        ryuu_headers: false,
    },
    SourceDef {
        slug: "manifesthub",
        name: "ManifestHub",
        url_template: "https://codeload.github.com/SteamAutoCracks/ManifestHub/zip/refs/heads/{appid}",
        ryuu_headers: false,
    },
    SourceDef {
        slug: "steamcooked",
        name: "Steam Cooked DB",
        url_template: "http://144.2.72.69:3000/Axolat/SteamManifestDB/raw/branch/main/{appid}.zip",
        ryuu_headers: false,
    },
];

static SOURCE_COOLDOWN: OnceLock<Mutex<HashMap<&'static str, Instant>>> = OnceLock::new();
static DETAILS_CACHE: OnceLock<Mutex<HashMap<String, (Instant, SteamAppDetails)>>> = OnceLock::new();

fn source_cooldown_map() -> &'static Mutex<HashMap<&'static str, Instant>> {
    SOURCE_COOLDOWN.get_or_init(|| Mutex::new(HashMap::new()))
}

fn details_cache_map() -> &'static Mutex<HashMap<String, (Instant, SteamAppDetails)>> {
    DETAILS_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Serialize)]
pub struct DownloadSourceInfo {
    pub slug: String,
    pub name: String,
}

#[derive(Serialize, Clone)]
pub struct SteamSearchResult {
    pub app_id: String,
    pub name: String,
    pub price: Option<String>,
    pub tiny_image: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct SteamAppDetails {
    pub app_id: String,
    pub name: String,
    pub app_type: String,
    pub coming_soon: bool,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub release_date: String,
    pub price: String,
    pub header_image: String,
    pub genres: Vec<String>,
    pub metacritic: Option<u32>,
    pub description: String,
}

#[derive(Serialize, Clone)]
pub struct DownloadProgressEvent {
    pub app_id: String,
    pub source: String,
    pub message: String,
    pub downloaded_bytes: usize,
    pub total_bytes: Option<u64>,
}

#[derive(Serialize)]
pub struct DownloadGameResult {
    pub app_id: String,
    pub source_name: String,
    pub size_bytes: usize,
    pub mode: String,
    pub lua_count: usize,
    pub manifest_count: usize,
    pub extracted_files: Vec<String>,
    pub saved_zip_path: Option<String>,
}

fn validate_appid(raw: &str) -> Result<String, String> {
    let clean = raw.trim();
    if clean.is_empty() || clean.len() > 12 || !clean.chars().all(|c| c.is_ascii_digit()) {
        return Err("AppID invalide : indique uniquement des chiffres".into());
    }
    Ok(clean.to_owned())
}

fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char);
            }
            b' ' => out.push_str("%20"),
            b => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn normalize_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut prev_space = true;
    for ch in input.chars().flat_map(|c| c.to_lowercase()) {
        let mapped = match ch {
            'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => Some('a'),
            'è' | 'é' | 'ê' | 'ë' => Some('e'),
            'ì' | 'í' | 'î' | 'ï' => Some('i'),
            'ò' | 'ó' | 'ô' | 'õ' | 'ö' => Some('o'),
            'ù' | 'ú' | 'û' | 'ü' => Some('u'),
            'ç' => Some('c'),
            'ñ' => Some('n'),
            'ý' | 'ÿ' => Some('y'),
            '\'' | '’' => None,
            c if c.is_alphanumeric() => Some(c),
            _ => Some(' '),
        };
        match mapped {
            Some(' ') => {
                if !prev_space {
                    out.push(' ');
                    prev_space = true;
                }
            }
            Some(c) => {
                out.push(c);
                prev_space = false;
            }
            None => {}
        }
    }
    out.trim().to_owned()
}

fn clean_html_text(input: &str) -> String {
    let mut plain = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => plain.push(ch),
            _ => {}
        }
    }
    plain
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
        .trim()
        .to_owned()
}

fn store_http_client(timeout_secs: u64, user_agent: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(user_agent)
        .connect_timeout(Duration::from_secs(SOURCE_CONNECT_SECS))
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Erreur réseau : {e}"))
}

async fn fetch_app_details_internal(appid: &str) -> Result<SteamAppDetails, String> {
    if let Ok(guard) = details_cache_map().lock() {
        if let Some((created, cached)) = guard.get(appid) {
            if created.elapsed().as_secs() < DETAILS_CACHE_TTL_SECS {
                return Ok(cached.clone());
            }
        }
    }

    let client = store_http_client(HTTP_TIMEOUT_SECS, "SteamUnlocker/1.6")?;
    let url = format!("{STORE_URL}/api/appdetails?appids={appid}&l=french&cc=fr");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Steam Store inaccessible : {e}"))?
        .error_for_status()
        .map_err(|e| format!("Steam Store ({e})"))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Réponse Steam invalide : {e}"))?;

    let entry = body.get(appid).ok_or("Jeu introuvable sur Steam")?;
    if !entry.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        return Err("Aucune fiche publique trouvée sur Steam pour cet AppID".into());
    }

    let data = entry.get("data").ok_or("Données Steam vides")?;
    let name = data
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Inconnu")
        .to_owned();
    let app_type = data
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("game")
        .to_owned();
    let coming_soon = data
        .get("release_date")
        .and_then(|r| r.get("coming_soon"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let release_date = data
        .get("release_date")
        .and_then(|r| r.get("date"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("N/A")
        .to_owned();

    let developers = data
        .get("developers")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(str::to_owned))
                .collect::<Vec<_>>()
        })
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| vec!["N/A".to_owned()]);

    let publishers = data
        .get("publishers")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(str::to_owned))
                .collect::<Vec<_>>()
        })
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| vec!["N/A".to_owned()]);

    let is_free = data.get("is_free").and_then(|v| v.as_bool()).unwrap_or(false);
    let price = data
        .get("price_overview")
        .and_then(|p| p.get("final_formatted"))
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| if is_free { "Gratuit".to_owned() } else { "N/A".to_owned() });

    let header_image = data
        .get("header_image")
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg"));

    let genres = data
        .get("genres")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|g| g.get("description").and_then(|d| d.as_str()).map(str::to_owned))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let metacritic = data
        .get("metacritic")
        .and_then(|m| m.get("score"))
        .and_then(|s| s.as_u64())
        .map(|s| s as u32);

    let description = data
        .get("short_description")
        .and_then(|v| v.as_str())
        .map(clean_html_text)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Aucune description disponible.".to_owned());

    let details = SteamAppDetails {
        app_id: appid.to_owned(),
        name,
        app_type,
        coming_soon,
        developers,
        publishers,
        release_date,
        price,
        header_image,
        genres,
        metacritic,
        description,
    };

    if let Ok(mut guard) = details_cache_map().lock() {
        guard.insert(appid.to_owned(), (Instant::now(), details.clone()));
    }

    Ok(details)
}

#[tauri::command]
pub fn get_download_sources() -> Vec<DownloadSourceInfo> {
    SOURCES
        .iter()
        .map(|s| DownloadSourceInfo {
            slug: s.slug.to_owned(),
            name: s.name.to_owned(),
        })
        .collect()
}

#[tauri::command]
pub async fn search_steam_games(query: String) -> Result<Vec<SteamSearchResult>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let mut results: Vec<SteamSearchResult> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // Si l'utilisateur saisit un AppID numérique, on interroge directement sa fiche en tête de liste.
    if trimmed.len() <= 12 && trimmed.chars().all(|c| c.is_ascii_digit()) {
        if let Ok(info) = fetch_app_details_internal(trimmed).await {
            seen.insert(info.app_id.clone());
            results.push(SteamSearchResult {
                app_id: info.app_id,
                name: info.name,
                price: Some(info.price),
                tiny_image: Some(info.header_image),
            });
        } else {
            let fallback_name = crate::app_names_store()
                .read()
                .ok()
                .and_then(|m| m.get(trimmed).cloned())
                .unwrap_or_else(|| format!("AppID {trimmed}"));
            seen.insert(trimmed.to_owned());
            results.push(SteamSearchResult {
                app_id: trimmed.to_owned(),
                name: fallback_name,
                price: None,
                tiny_image: None,
            });
        }
    }

    let normalized = normalize_text(&trimmed.chars().take(200).collect::<String>());
    if normalized.is_empty() {
        return Ok(results);
    }

    let client = store_http_client(HTTP_TIMEOUT_SECS, "SteamUnlocker/1.6")?;
    let store_url = format!(
        "{STORE_URL}/api/storesearch/?term={}&l=french&cc=fr",
        percent_encode(&normalized)
    );

    if let Ok(resp) = client.get(&store_url).send().await {
        if let Ok(json) = resp.error_for_status().map(|r| r.json::<serde_json::Value>()) {
            if let Ok(val) = json.await {
                if let Some(items) = val.get("items").and_then(|v| v.as_array()) {
                    for item in items {
                        let Some(id) = item.get("id").and_then(|v| v.as_u64()) else {
                            continue;
                        };
                        let Some(name) = item.get("name").and_then(|v| v.as_str()) else {
                            continue;
                        };
                        let id_str = id.to_string();
                        if !seen.insert(id_str.clone()) {
                            continue;
                        }
                        let price = item
                            .get("price")
                            .and_then(|p| p.get("final"))
                            .and_then(|f| f.as_u64())
                            .map(|cents| {
                                if cents == 0 {
                                    "Gratuit".to_owned()
                                } else {
                                    format!("{:.2} €", cents as f64 / 100.0).replace('.', ",")
                                }
                            });
                        let tiny_image = item
                            .get("tiny_image")
                            .and_then(|v| v.as_str())
                            .map(str::to_owned);
                        results.push(SteamSearchResult {
                            app_id: id_str,
                            name: name.to_owned(),
                            price,
                            tiny_image,
                        });
                    }
                }
            }
        }
    }

    // Fallback Steam Community SearchApps (identique à SteamBot)
    if results.len() <= 1 {
        let ignored = [
            "a", "an", "the", "of", "for", "to", "and", "in", "on", "de", "la", "le", "les",
            "du", "des", "un", "une", "et",
        ];
        let words: Vec<&str> = normalized
            .split_whitespace()
            .filter(|w| !ignored.contains(w))
            .collect();
        let search_words = if words.is_empty() {
            normalized.split_whitespace().collect::<Vec<_>>()
        } else {
            words
        };
        let term = search_words.join(" ");
        let comm_url = format!("{COMMUNITY_URL}/actions/SearchApps/{}", percent_encode(&term));
        if let Ok(resp) = client.get(&comm_url).send().await {
            if let Ok(val) = resp.json::<serde_json::Value>().await {
                if let Some(arr) = val.as_array() {
                    for item in arr {
                        let Some(id) = item.get("appid").and_then(|v| v.as_str()) else {
                            continue;
                        };
                        let Some(name) = item.get("name").and_then(|v| v.as_str()) else {
                            continue;
                        };
                        if !id.chars().all(|c| c.is_ascii_digit()) {
                            continue;
                        }
                        let norm_name = normalize_text(name);
                        if !search_words.iter().all(|w| norm_name.contains(w)) {
                            continue;
                        }
                        if seen.insert(id.to_owned()) {
                            results.push(SteamSearchResult {
                                app_id: id.to_owned(),
                                name: name.to_owned(),
                                price: None,
                                tiny_image: None,
                            });
                        }
                    }
                }
            }
        }
    }

    results.truncate(25);
    Ok(results)
}

#[tauri::command]
pub async fn get_steam_app_details(app_id: String) -> Result<SteamAppDetails, String> {
    let id = validate_appid(&app_id)?;
    fetch_app_details_internal(&id).await
}

fn zip_cache_dir() -> PathBuf {
    crate::app_data_dir().join("zip_cache")
}

fn valid_zip_bytes(bytes: &[u8]) -> bool {
    let Ok(archive) = zip::ZipArchive::new(Cursor::new(bytes)) else {
        return false;
    };
    for i in 0..archive.len() {
        if let Some(f) = archive.name_for_index(i) {
            if !f.ends_with('/') && !f.ends_with('\\') {
                return true;
            }
        }
    }
    false
}

fn read_cached_zip(path: &Path) -> Option<Vec<u8>> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?;
    let age = SystemTime::now().duration_since(modified).ok()?;
    if age.as_secs() >= ZIP_CACHE_TTL_SECS {
        let _ = fs::remove_file(path);
        return None;
    }
    let bytes = fs::read(path).ok()?;
    if bytes.len() <= MAX_ZIP_BYTES && valid_zip_bytes(&bytes) {
        Some(bytes)
    } else {
        let _ = fs::remove_file(path);
        None
    }
}

fn clean_expired_zip_cache(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("zip") {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            if let Ok(mod_t) = meta.modified() {
                if now.duration_since(mod_t).map_or(false, |d| d.as_secs() >= ZIP_CACHE_TTL_SECS) {
                    let _ = fs::remove_file(p);
                }
            }
        }
    }
}

fn emit_progress(
    app: &tauri::AppHandle,
    app_id: &str,
    source: &str,
    message: String,
    downloaded_bytes: usize,
    total_bytes: Option<u64>,
) {
    let _ = app.emit(
        "search-download-progress",
        DownloadProgressEvent {
            app_id: app_id.to_owned(),
            source: source.to_owned(),
            message,
            downloaded_bytes,
            total_bytes,
        },
    );
}

fn in_cooldown(slug: &str) -> bool {
    let Ok(mut guard) = source_cooldown_map().lock() else {
        return false;
    };
    if let Some(&until) = guard.get(slug) {
        if Instant::now() < until {
            return true;
        }
        guard.remove(slug);
    }
    false
}

fn set_cooldown(slug: &'static str) {
    if let Ok(mut guard) = source_cooldown_map().lock() {
        guard.insert(slug, Instant::now() + Duration::from_secs(SOURCE_COOLDOWN_SECS));
    }
}

fn clear_cooldown(slug: &str) {
    if let Ok(mut guard) = source_cooldown_map().lock() {
        guard.remove(slug);
    }
}

async fn fetch_source_zip(
    app: &tauri::AppHandle,
    appid: &str,
    src: SourceDef,
) -> Result<Vec<u8>, (String, bool)> {
    let url = src.url_template.replace("{appid}", appid);
    let ua = if src.ryuu_headers {
        "discord(dot)gg/luatools"
    } else {
        "SteamUnlocker/1.6"
    };
    let client = store_http_client(SOURCE_TIMEOUT_SECS, ua).map_err(|e| (e, false))?;

    let mut req = client.get(&url);
    if src.ryuu_headers {
        req = req.header("Accept", "*/*");
    }

    let mut resp = req.send().await.map_err(|e| {
        let network_err = e.is_timeout() || e.is_connect();
        (format!("Erreur réseau : {e}"), network_err)
    })?;

    if !resp.status().is_success() {
        return Err((format!("HTTP {}", resp.status().as_u16()), false));
    }

    let total = resp.content_length();
    if total.is_some_and(|len| len as usize > MAX_ZIP_BYTES) {
        return Err(("Archive ZIP trop volumineuse (limite 200 Mo)".into(), false));
    }

    let mut bytes = Vec::with_capacity(total.unwrap_or(65536).min(8 * 1024 * 1024) as usize);
    let mut last_emit = Instant::now();

    while let Some(chunk) = resp.chunk().await.map_err(|e| {
        let network_err = e.is_timeout();
        (format!("Lecture interrompue : {e}"), network_err)
    })? {
        if bytes.len() + chunk.len() > MAX_ZIP_BYTES {
            return Err(("Archive ZIP trop volumineuse (limite 200 Mo)".into(), false));
        }
        bytes.extend_from_slice(&chunk);

        if last_emit.elapsed().as_millis() >= 120 {
            let mb = bytes.len() as f64 / 1_048_576.0;
            let msg = match total {
                Some(t) => format!("{} : {mb:.1} Mo / {:.1} Mo", src.name, t as f64 / 1_048_576.0),
                None => format!("{} : {mb:.1} Mo", src.name),
            };
            emit_progress(app, appid, src.name, msg, bytes.len(), total);
            last_emit = Instant::now();
        }
    }

    if !valid_zip_bytes(&bytes) {
        return Err(("La source ne renvoie pas une archive ZIP valide".into(), false));
    }

    Ok(bytes)
}

#[tauri::command]
pub async fn download_game_files(
    app: tauri::AppHandle,
    app_id: String,
    source_slug: Option<String>,
    mode: String,
) -> Result<DownloadGameResult, String> {
    let id = validate_appid(&app_id)?;
    let requested_slug = source_slug
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "auto");

    let sources: Vec<SourceDef> = SOURCES
        .iter()
        .copied()
        .filter(|s| requested_slug.is_none_or(|slug| s.slug == slug))
        .collect();

    if sources.is_empty() {
        return Err("Source introuvable".into());
    }

    let install_mode = mode != "save_zip";
    let steam = if install_mode {
        Some(crate::require_steam()?)
    } else {
        None
    };

    let cache_dir = zip_cache_dir();
    let _ = fs::create_dir_all(&cache_dir);
    clean_expired_zip_cache(&cache_dir);

    emit_progress(
        &app,
        &id,
        "Cache",
        format!("Préparation pour l'AppID {id}…"),
        0,
        None,
    );

    let mut chosen: Option<(&'static str, Vec<u8>)> = None;

    // 1. Vérifier d'abord le cache local (TTL 24h)
    for src in &sources {
        let cached_path = cache_dir.join(format!("{id}.{}.zip", src.slug));
        if let Some(bytes) = read_cached_zip(&cached_path) {
            emit_progress(
                &app,
                &id,
                src.name,
                format!("Archive trouvée dans le cache — {}", src.name),
                bytes.len(),
                Some(bytes.len() as u64),
            );
            chosen = Some((src.name, bytes));
            break;
        }
    }

    // 2. Sinon interroger les sources dans l'ordre
    if chosen.is_none() {
        for src in &sources {
            if requested_slug.is_none() && in_cooldown(src.slug) {
                continue;
            }
            emit_progress(
                &app,
                &id,
                src.name,
                format!("Recherche de {id} sur {}…", src.name),
                0,
                None,
            );
            match fetch_source_zip(&app, &id, *src).await {
                Ok(bytes) => {
                    clear_cooldown(src.slug);
                    let cached_path = cache_dir.join(format!("{id}.{}.zip", src.slug));
                    let _ = fs::write(&cached_path, &bytes);
                    chosen = Some((src.name, bytes));
                    break;
                }
                Err((_err, is_net_err)) => {
                    if requested_slug.is_none() && is_net_err {
                        set_cooldown(src.slug);
                    }
                }
            }
        }
    }

    let (source_name, bytes) =
        chosen.ok_or_else(|| "Archive ZIP introuvable sur les sources demandées".to_owned())?;
    let size_bytes = bytes.len();

    if !install_mode {
        let dl_dir = dirs::download_dir().unwrap_or_else(|| crate::app_data_dir().join("downloads"));
        fs::create_dir_all(&dl_dir).map_err(|e| format!("Création dossier impossible : {e}"))?;
        let out_path = dl_dir.join(format!("{id}.zip"));
        fs::write(&out_path, &bytes).map_err(|e| format!("Écriture ZIP impossible : {e}"))?;
        return Ok(DownloadGameResult {
            app_id: id,
            source_name: source_name.to_owned(),
            size_bytes,
            mode,
            lua_count: 0,
            manifest_count: 0,
            extracted_files: Vec::new(),
            saved_zip_path: Some(out_path.to_string_lossy().into_owned()),
        });
    }

    let steam = steam.unwrap();
    let plugin_dir = crate::stplugin_dir(&steam);
    let depot_dir = steam.join("depotcache");
    fs::create_dir_all(&plugin_dir).map_err(|e| format!("Création stplug-in impossible : {e}"))?;
    fs::create_dir_all(&depot_dir).map_err(|e| format!("Création depotcache impossible : {e}"))?;

    emit_progress(
        &app,
        &id,
        source_name,
        format!("Installation des fichiers depuis {source_name}…"),
        size_bytes,
        Some(size_bytes as u64),
    );

    let mut archive = zip::ZipArchive::new(Cursor::new(&bytes))
        .map_err(|e| format!("Archive ZIP invalide : {e}"))?;

    let mut lua_count = 0usize;
    let mut manifest_count = 0usize;
    let mut extracted_files = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let raw_name = entry.name().to_owned();
        if raw_name.contains("__MACOSX") {
            continue;
        }
        let Some(file_name) = Path::new(&raw_name)
            .file_name()
            .and_then(|s| s.to_str())
            .filter(|s| !s.starts_with("._"))
        else {
            continue;
        };
        let Ok(clean_name) = crate::sanitize_script_id(file_name) else {
            continue;
        };
        let lower = clean_name.to_lowercase();

        let dest = if lower.ends_with(".lua") || lower.ends_with(".lua.disabled") || lower.ends_with(".st") {
            if lower.eq_ignore_ascii_case("steamtools.lua") {
                continue;
            }
            lua_count += 1;
            plugin_dir.join(&clean_name)
        } else if lower.ends_with(".manifest") {
            manifest_count += 1;
            depot_dir.join(&clean_name)
        } else {
            continue;
        };

        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        fs::write(&dest, buf).map_err(|e| format!("Écriture {clean_name} impossible : {e}"))?;
        extracted_files.push(clean_name);
    }

    if lua_count == 0 && manifest_count == 0 {
        return Err(format!(
            "L'archive de {source_name} ne contient aucun .lua, .st ou .manifest."
        ));
    }

    Ok(DownloadGameResult {
        app_id: id,
        source_name: source_name.to_owned(),
        size_bytes,
        mode,
        lua_count,
        manifest_count,
        extracted_files,
        saved_zip_path: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    #[test]
    fn appid_validation_matches_steambot_rules() {
        assert_eq!(validate_appid(" 650700 ").unwrap(), "650700");
        assert!(validate_appid("").is_err());
        assert!(validate_appid("abc").is_err());
        assert!(validate_appid("1234567890123").is_err());
    }

    #[test]
    fn search_normalization_folds_accents_and_quotes() {
        assert_eq!(normalize_search_for_test("Café d'Été — 2!"), "cafe dete 2");
    }

    fn normalize_search_for_test(s: &str) -> String {
        normalize_text(s)
    }

    #[test]
    fn zip_validation_detects_non_empty_files() {
        assert!(!valid_zip_bytes(b"not a zip"));

        let mut buf = Cursor::new(Vec::new());
        {
            let mut zw = zip::ZipWriter::new(&mut buf);
            zw.start_file("1604000.lua", SimpleFileOptions::default()).unwrap();
            zw.write_all(b"addappid(1604000)\n").unwrap();
            zw.finish().unwrap();
        }
        assert!(valid_zip_bytes(&buf.into_inner()));
    }
}
