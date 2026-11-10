#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::egui;
use rodio::{Decoder, OutputStream, Sink, Source};
use std::fs::{self, File};
use std::io::{Cursor, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use winreg::enums::*;
use winreg::RegKey;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const APP_EXE_BYTES: &[u8] = include_bytes!("../../src-tauri/target/release/steamunlocker.exe");
const WEBVIEW_DLL_BYTES: &[u8] =
    include_bytes!("../../src-tauri/target/release/WebView2Loader.dll");
const BGM_MP3_BYTES: &[u8] = include_bytes!("../../public/bgm.mp3");
const ICON_PNG_BYTES: &[u8] = include_bytes!("../../src-tauri/icons/128x128.png");

// Palette Classic (DA du logo : bleu nuit profond + rouge néon)
const CTP_CRUST: egui::Color32 = egui::Color32::from_rgb(6, 9, 17);
const CTP_MANTLE: egui::Color32 = egui::Color32::from_rgb(10, 15, 26);
const CTP_BASE: egui::Color32 = egui::Color32::from_rgb(14, 20, 34);
const CTP_SURFACE0: egui::Color32 = egui::Color32::from_rgb(22, 31, 51);
const CTP_SURFACE1: egui::Color32 = egui::Color32::from_rgb(34, 46, 74);
const CTP_TEXT: egui::Color32 = egui::Color32::from_rgb(241, 245, 249);
const CTP_SUBTEXT: egui::Color32 = egui::Color32::from_rgb(148, 163, 184);
const CTP_OVERLAY: egui::Color32 = egui::Color32::from_rgb(100, 116, 139);
const CTP_MAUVE: egui::Color32 = egui::Color32::from_rgb(255, 51, 59);
const CTP_LAVENDER: egui::Color32 = egui::Color32::from_rgb(255, 92, 98);
const CTP_GREEN: egui::Color32 = egui::Color32::from_rgb(52, 211, 153);
const CTP_PEACH: egui::Color32 = egui::Color32::from_rgb(251, 191, 36);
const CTP_RED: egui::Color32 = egui::Color32::from_rgb(255, 68, 85);
const CTP_ON_ACCENT: egui::Color32 = egui::Color32::WHITE;

fn main() -> eframe::Result {
    let mut viewport = egui::ViewportBuilder::default()
        .with_inner_size([580.0, 455.0])
        .with_min_inner_size([580.0, 455.0])
        .with_max_inner_size([580.0, 455.0])
        .with_resizable(false)
        .with_decorations(false)
        .with_transparent(false);

    if let Ok(icon) = eframe::icon_data::from_png_bytes(ICON_PNG_BYTES) {
        viewport = viewport.with_icon(icon);
    }

    let options = eframe::NativeOptions {
        viewport,
        ..Default::default()
    };

    eframe::run_native(
        "SteamUnlocker",
        options,
        Box::new(|cc| {
            setup_fonts_and_theme(&cc.egui_ctx);
            Ok(Box::new(InstallerApp::new(&cc.egui_ctx)))
        }),
    )
}

fn setup_fonts_and_theme(ctx: &egui::Context) {
    let mut fonts = egui::FontDefinitions::default();
    if let Ok(segoe) = fs::read("C:\\Windows\\Fonts\\segoeui.ttf") {
        fonts.font_data.insert(
            "segoe".to_owned(),
            Arc::new(egui::FontData::from_owned(segoe)),
        );
        fonts
            .families
            .entry(egui::FontFamily::Proportional)
            .or_default()
            .insert(0, "segoe".to_owned());
    }
    ctx.set_fonts(fonts);

    let mut visuals = egui::Visuals::dark();
    visuals.window_fill = CTP_BASE;
    visuals.panel_fill = CTP_BASE;
    visuals.extreme_bg_color = CTP_CRUST;
    visuals.widgets.noninteractive.bg_fill = CTP_SURFACE0;
    visuals.widgets.noninteractive.bg_stroke = egui::Stroke::new(1.0_f32, CTP_SURFACE1);
    visuals.widgets.inactive.bg_fill = CTP_SURFACE0;
    visuals.widgets.inactive.fg_stroke = egui::Stroke::new(1.0_f32, CTP_TEXT);
    visuals.widgets.hovered.bg_fill = CTP_SURFACE1;
    visuals.widgets.hovered.fg_stroke = egui::Stroke::new(1.0_f32, CTP_TEXT);
    visuals.widgets.active.bg_fill = CTP_MAUVE;
    visuals.widgets.active.fg_stroke = egui::Stroke::new(1.0_f32, CTP_ON_ACCENT);
    visuals.selection.bg_fill = CTP_MAUVE;
    visuals.selection.stroke = egui::Stroke::new(1.0_f32, CTP_ON_ACCENT);
    ctx.set_visuals(visuals);
}

fn load_logo_texture(ctx: &egui::Context) -> Option<egui::TextureHandle> {
    let img = image::load_from_memory(ICON_PNG_BYTES).ok()?.to_rgba8();
    let size = [img.width() as usize, img.height() as usize];
    let color_img = egui::ColorImage::from_rgba_unmultiplied(size, img.as_raw());
    Some(ctx.load_texture("steamunlocker_logo", color_img, egui::TextureOptions::LINEAR))
}

fn detect_steam_path() -> Option<String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Valve\\Steam")
        .and_then(|k| k.get_value::<String, _>("SteamPath"))
        .map(|p| p.replace('/', "\\"))
        .ok();
    if let Some(p) = hkcu {
        if Path::new(&p).join("steam.exe").exists() {
            return Some(p);
        }
    }
    let def = r"C:\Program Files (x86)\Steam";
    Path::new(def)
        .join("steam.exe")
        .exists()
        .then(|| def.to_owned())
}

// --- Icones vectorielles propres ---

fn draw_speaker_icon(
    painter: &egui::Painter,
    center: egui::Pos2,
    muted: bool,
    color: egui::Color32,
) {
    let x = center.x;
    let y = center.y;
    let pts = vec![
        egui::pos2(x - 6.0, y - 2.5),
        egui::pos2(x - 3.0, y - 2.5),
        egui::pos2(x + 1.0, y - 5.5),
        egui::pos2(x + 1.0, y + 5.5),
        egui::pos2(x - 3.0, y + 2.5),
        egui::pos2(x - 6.0, y + 2.5),
    ];
    painter.add(egui::Shape::convex_polygon(pts, color, egui::Stroke::NONE));

    if muted {
        painter.line_segment(
            [egui::pos2(x + 3.0, y - 3.0), egui::pos2(x + 7.5, y + 3.0)],
            egui::Stroke::new(1.6_f32, color),
        );
        painter.line_segment(
            [egui::pos2(x + 7.5, y - 3.0), egui::pos2(x + 3.0, y + 3.0)],
            egui::Stroke::new(1.6_f32, color),
        );
    } else {
        painter.line_segment(
            [egui::pos2(x + 3.5, y - 3.0), egui::pos2(x + 4.5, y)],
            egui::Stroke::new(1.5_f32, color),
        );
        painter.line_segment(
            [egui::pos2(x + 4.5, y), egui::pos2(x + 3.5, y + 3.0)],
            egui::Stroke::new(1.5_f32, color),
        );
        painter.line_segment(
            [egui::pos2(x + 6.0, y - 4.8), egui::pos2(x + 7.5, y)],
            egui::Stroke::new(1.5_f32, color),
        );
        painter.line_segment(
            [egui::pos2(x + 7.5, y), egui::pos2(x + 6.0, y + 4.8)],
            egui::Stroke::new(1.5_f32, color),
        );
    }
}

fn draw_folder_icon(painter: &egui::Painter, center: egui::Pos2, color: egui::Color32) {
    let x = center.x;
    let y = center.y;
    let tab = egui::Rect::from_min_max(egui::pos2(x - 7.0, y - 5.5), egui::pos2(x - 1.0, y - 2.5));
    painter.rect_filled(tab, 1.5, color);
    let body = egui::Rect::from_min_max(egui::pos2(x - 7.0, y - 3.5), egui::pos2(x + 7.0, y + 5.5));
    painter.rect_stroke(
        body,
        2.0,
        egui::Stroke::new(1.6_f32, color),
        egui::StrokeKind::Middle,
    );
}

fn draw_download_icon(painter: &egui::Painter, center: egui::Pos2, color: egui::Color32) {
    let x = center.x;
    let y = center.y;
    painter.line_segment(
        [egui::pos2(x, y - 6.0), egui::pos2(x, y + 2.5)],
        egui::Stroke::new(1.8_f32, color),
    );
    painter.line_segment(
        [egui::pos2(x - 3.5, y - 0.5), egui::pos2(x, y + 3.0)],
        egui::Stroke::new(1.8_f32, color),
    );
    painter.line_segment(
        [egui::pos2(x + 3.5, y - 0.5), egui::pos2(x, y + 3.0)],
        egui::Stroke::new(1.8_f32, color),
    );
    painter.line_segment(
        [egui::pos2(x - 6.0, y + 6.0), egui::pos2(x + 6.0, y + 6.0)],
        egui::Stroke::new(1.8_f32, color),
    );
}

fn draw_check_circle(
    painter: &egui::Painter,
    center: egui::Pos2,
    radius: f32,
    color: egui::Color32,
) {
    painter.circle_stroke(center, radius, egui::Stroke::new(2.2_f32, color));
    let s = radius * 0.45;
    painter.line_segment(
        [
            egui::pos2(center.x - s, center.y),
            egui::pos2(center.x - s * 0.2, center.y + s * 0.7),
        ],
        egui::Stroke::new(2.4_f32, color),
    );
    painter.line_segment(
        [
            egui::pos2(center.x - s * 0.2, center.y + s * 0.7),
            egui::pos2(center.x + s * 1.1, center.y - s * 0.6),
        ],
        egui::Stroke::new(2.4_f32, color),
    );
}

fn draw_trash_icon(painter: &egui::Painter, center: egui::Pos2, color: egui::Color32) {
    let x = center.x;
    let y = center.y;
    let stroke = egui::Stroke::new(1.5_f32, color);
    painter.line_segment([egui::pos2(x - 6.0, y - 4.0), egui::pos2(x + 6.0, y - 4.0)], stroke);
    painter.line_segment([egui::pos2(x - 2.5, y - 6.0), egui::pos2(x + 2.5, y - 6.0)], stroke);
    let body = egui::Rect::from_min_max(egui::pos2(x - 4.5, y - 4.0), egui::pos2(x + 4.5, y + 6.0));
    painter.rect_stroke(body, 1.5, stroke, egui::StrokeKind::Middle);
}

fn draw_subtle_grid(painter: &egui::Painter, rect: egui::Rect) {
    let stroke = egui::Stroke::new(1.0_f32, egui::Color32::from_rgba_unmultiplied(255, 51, 59, 9));
    let step = 36.0;
    let mut x = rect.left();
    while x <= rect.right() {
        painter.line_segment([egui::pos2(x, rect.top()), egui::pos2(x, rect.bottom())], stroke);
        x += step;
    }
    let mut y = rect.top();
    while y <= rect.bottom() {
        painter.line_segment([egui::pos2(rect.left(), y), egui::pos2(rect.right(), y)], stroke);
        y += step;
    }
}

fn toggle_switch_row(ui: &mut egui::Ui, value: &mut bool, label: &str) {
    ui.horizontal(|ui| {
        let (rect, resp) = ui.allocate_exact_size(egui::vec2(34.0, 18.0), egui::Sense::click());
        if resp.clicked() {
            *value = !*value;
        }
        let bg = if *value { CTP_MAUVE } else { CTP_SURFACE1 };
        ui.painter().rect_filled(rect, 9.0, bg);
        let knob_x = if *value {
            rect.right() - 9.0
        } else {
            rect.left() + 9.0
        };
        ui.painter().circle_filled(
            egui::pos2(knob_x, rect.center().y),
            6.5,
            if *value { CTP_ON_ACCENT } else { CTP_TEXT },
        );
        ui.add_space(6.0);
        let txt_resp = ui.add(
            egui::Label::new(egui::RichText::new(label).size(13.0).color(CTP_TEXT))
                .sense(egui::Sense::click()),
        );
        if txt_resp.clicked() {
            *value = !*value;
        }
    });
}

#[derive(PartialEq, Clone, Copy)]
enum WizardStage {
    Config,
    Installing,
    Finished,
    Uninstalled,
    Error,
}

struct InstallState {
    stage: WizardStage,
    progress: f32,
    status_label: String,
    error_msg: Option<String>,
}

struct AudioController {
    _stream: Option<OutputStream>,
    sink: Option<Sink>,
    is_muted: bool,
    volume: f32,
}

impl AudioController {
    fn new() -> Self {
        let mut controller = Self {
            _stream: None,
            sink: None,
            is_muted: true,
            volume: 0.60,
        };

        if let Ok((stream, stream_handle)) = OutputStream::try_default() {
            if let Ok(sink) = Sink::try_new(&stream_handle) {
                if let Ok(decoder) = Decoder::new(Cursor::new(BGM_MP3_BYTES)) {
                    sink.append(decoder.repeat_infinite());
                    sink.set_volume(controller.volume);
                    sink.pause();
                    controller._stream = Some(stream);
                    controller.sink = Some(sink);
                }
            }
        }
        controller
    }

    fn toggle(&mut self) {
        if let Some(ref sink) = self.sink {
            if self.is_muted {
                sink.set_volume(self.volume);
                sink.play();
                self.is_muted = false;
            } else {
                sink.pause();
                self.is_muted = true;
            }
        }
    }

    fn set_volume(&mut self, vol: f32) {
        self.volume = vol;
        if let Some(ref sink) = self.sink {
            sink.set_volume(vol);
        }
    }
}

struct InstallerApp {
    install_dir: String,
    steam_path: Option<String>,
    create_desktop_shortcut: bool,
    create_start_menu_shortcut: bool,
    launch_after_install: bool,
    logo: Option<egui::TextureHandle>,
    audio: AudioController,
    state: Arc<Mutex<InstallState>>,
}

impl InstallerApp {
    fn new(ctx: &egui::Context) -> Self {
        let default_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("C:\\Program Files"))
            .join("SteamUnlocker")
            .to_string_lossy()
            .to_string();

        Self {
            install_dir: default_dir,
            steam_path: detect_steam_path(),
            create_desktop_shortcut: true,
            create_start_menu_shortcut: true,
            launch_after_install: true,
            logo: load_logo_texture(ctx),
            audio: AudioController::new(),
            state: Arc::new(Mutex::new(InstallState {
                stage: WizardStage::Config,
                progress: 0.0,
                status_label: String::new(),
                error_msg: None,
            })),
        }
    }

    fn resolved_target_dir(&self) -> PathBuf {
        let mut target_dir = PathBuf::from(self.install_dir.trim());
        if target_dir.file_name().and_then(|n| n.to_str()) != Some("SteamUnlocker") {
            target_dir.push("SteamUnlocker");
        }
        target_dir
    }

    fn is_already_installed(&self) -> bool {
        self.resolved_target_dir()
            .join("SteamUnlocker.exe")
            .exists()
    }

    fn start_install(&mut self, ctx: egui::Context) {
        let target_dir = self.resolved_target_dir();
        self.install_dir = target_dir.to_string_lossy().into_owned();
        let make_desktop = self.create_desktop_shortcut;
        let make_start_menu = self.create_start_menu_shortcut;
        let state_arc = Arc::clone(&self.state);

        {
            let mut st = state_arc.lock().unwrap();
            st.stage = WizardStage::Installing;
            st.progress = 0.05;
            st.status_label = "Préparation de l'installation...".to_string();
            st.error_msg = None;
        }

        std::thread::spawn(move || {
            let set_status = |label: &str, prog: f32| {
                let mut st = state_arc.lock().unwrap();
                st.status_label = label.to_string();
                st.progress = prog;
                ctx.request_repaint();
            };

            let _ = Command::new("taskkill")
                .args(["/F", "/IM", "SteamUnlocker.exe"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            set_status("Création du répertoire...", 0.12);
            if let Err(e) = fs::create_dir_all(&target_dir) {
                let mut st = state_arc.lock().unwrap();
                st.stage = WizardStage::Error;
                st.error_msg = Some(format!("Impossible de créer le dossier : {e}"));
                ctx.request_repaint();
                return;
            }

            set_status("Copie de WebView2Loader.dll...", 0.25);
            let dll_path = target_dir.join("WebView2Loader.dll");
            if let Err(e) = fs::write(&dll_path, WEBVIEW_DLL_BYTES) {
                let mut st = state_arc.lock().unwrap();
                st.stage = WizardStage::Error;
                st.error_msg = Some(format!("Erreur d'écriture DLL : {e}"));
                ctx.request_repaint();
                return;
            }

            set_status("Installation de SteamUnlocker.exe...", 0.35);
            let exe_path = target_dir.join("SteamUnlocker.exe");
            match File::create(&exe_path) {
                Ok(mut file) => {
                    let chunk_size = (APP_EXE_BYTES.len() / 12).max(1);
                    let total = APP_EXE_BYTES.len();
                    let mut written = 0;
                    for chunk in APP_EXE_BYTES.chunks(chunk_size) {
                        if let Err(e) = file.write_all(chunk) {
                            let mut st = state_arc.lock().unwrap();
                            st.stage = WizardStage::Error;
                            st.error_msg = Some(format!("Erreur d'écriture : {e}"));
                            ctx.request_repaint();
                            return;
                        }
                        written += chunk.len();
                        let frac = written as f32 / total as f32;
                        {
                            let mut st = state_arc.lock().unwrap();
                            st.progress = 0.35 + frac * 0.45;
                        }
                        ctx.request_repaint();
                    }
                }
                Err(e) => {
                    let mut st = state_arc.lock().unwrap();
                    st.stage = WizardStage::Error;
                    st.error_msg = Some(format!("Erreur de création fichier : {e}"));
                    ctx.request_repaint();
                    return;
                }
            }

            let desktop_lnk = dirs::desktop_dir().map(|d| d.join("SteamUnlocker.lnk"));
            let start_lnk = dirs::config_dir().map(|r| {
                r.join("Microsoft")
                    .join("Windows")
                    .join("Start Menu")
                    .join("Programs")
                    .join("SteamUnlocker.lnk")
            });

            if make_desktop {
                if let Some(lnk) = &desktop_lnk {
                    set_status("Création du raccourci Bureau...", 0.86);
                    let _ = create_windows_shortcut(&exe_path, &target_dir, lnk);
                }
            }

            if make_start_menu {
                if let Some(lnk) = &start_lnk {
                    set_status("Ajout au Menu Démarrer...", 0.92);
                    if let Some(parent) = lnk.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    let _ = create_windows_shortcut(&exe_path, &target_dir, lnk);
                }
            }

            set_status("Enregistrement dans Windows...", 0.97);
            let _ = register_uninstaller(&target_dir, &exe_path, desktop_lnk, start_lnk);
            let _ = Command::new("ie4uinit.exe")
                .arg("-show")
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            set_status("Installation terminée", 1.0);
            let mut st = state_arc.lock().unwrap();
            st.stage = WizardStage::Finished;
            ctx.request_repaint();
        });
    }

    fn start_uninstall(&mut self, ctx: egui::Context) {
        let target_dir = self.resolved_target_dir();
        let state_arc = Arc::clone(&self.state);
        {
            let mut st = state_arc.lock().unwrap();
            st.stage = WizardStage::Installing;
            st.progress = 0.25;
            st.status_label = "Désinstallation en cours...".to_string();
            st.error_msg = None;
        }

        std::thread::spawn(move || {
            let _ = Command::new("taskkill")
                .args(["/F", "/IM", "SteamUnlocker.exe"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
            std::thread::sleep(std::time::Duration::from_millis(400));

            let _ = fs::remove_file(target_dir.join("SteamUnlocker.exe"));
            let _ = fs::remove_file(target_dir.join("WebView2Loader.dll"));
            let _ = fs::remove_dir(&target_dir);

            if let Some(desktop) = dirs::desktop_dir() {
                let _ = fs::remove_file(desktop.join("SteamUnlocker.lnk"));
            }
            if let Some(roaming) = dirs::config_dir() {
                let _ = fs::remove_file(
                    roaming
                        .join("Microsoft")
                        .join("Windows")
                        .join("Start Menu")
                        .join("Programs")
                        .join("SteamUnlocker.lnk"),
                );
            }

            let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(UNINSTALL_KEY);

            let mut st = state_arc.lock().unwrap();
            st.progress = 1.0;
            st.stage = WizardStage::Uninstalled;
            ctx.request_repaint();
        });
    }
}

const UNINSTALL_KEY: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SteamUnlocker";

fn register_uninstaller(
    dir: &Path,
    exe: &Path,
    desktop_lnk: Option<PathBuf>,
    start_lnk: Option<PathBuf>,
) -> std::io::Result<()> {
    let q = |p: &Path| format!("'{}'", p.display().to_string().replace('\'', "''"));
    let mut script = format!(
        "Stop-Process -Name 'SteamUnlocker' -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 600; \
         Remove-Item -LiteralPath {exe},{dll} -Force -ErrorAction SilentlyContinue; \
         Remove-Item -LiteralPath {dir} -ErrorAction SilentlyContinue; ",
        exe = q(exe),
        dll = q(&dir.join("WebView2Loader.dll")),
        dir = q(dir),
    );
    for lnk in [desktop_lnk, start_lnk].into_iter().flatten() {
        script.push_str(&format!(
            "Remove-Item -LiteralPath {} -Force -ErrorAction SilentlyContinue; ",
            q(&lnk)
        ));
    }
    script.push_str(&format!("Remove-Item -Path 'HKCU:\\{UNINSTALL_KEY}' -Force"));

    let (key, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(UNINSTALL_KEY)?;
    key.set_value("DisplayName", &"SteamUnlocker")?;
    key.set_value("DisplayVersion", &env!("CARGO_PKG_VERSION"))?;
    key.set_value("Publisher", &"Axolat")?;
    key.set_value("DisplayIcon", &exe.display().to_string())?;
    key.set_value("InstallLocation", &dir.display().to_string())?;
    key.set_value(
        "UninstallString",
        &format!("powershell.exe -NoProfile -WindowStyle Hidden -Command \"{script}\""),
    )?;
    key.set_value("NoModify", &1u32)?;
    key.set_value("NoRepair", &1u32)?;
    key.set_value("EstimatedSize", &((APP_EXE_BYTES.len() / 1024) as u32))?;
    Ok(())
}

fn create_windows_shortcut(target: &Path, work_dir: &Path, link_path: &Path) -> std::io::Result<()> {
    let target_esc = target.display().to_string().replace('\'', "''");
    let ps_script = format!(
        "$ws = New-Object -ComObject WScript.Shell; \
         $s = $ws.CreateShortcut('{}'); \
         $s.TargetPath = '{target_esc}'; \
         $s.WorkingDirectory = '{}'; \
         $s.IconLocation = '{target_esc},0'; \
         $s.Description = 'SteamUnlocker'; \
         $s.Save()",
        link_path.display().to_string().replace('\'', "''"),
        work_dir.display().to_string().replace('\'', "''")
    );

    Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()?;

    Ok(())
}

impl eframe::App for InstallerApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let (stage, progress, status_label, error_msg) = {
            let st = self.state.lock().unwrap();
            (
                st.stage,
                st.progress,
                st.status_label.clone(),
                st.error_msg.clone(),
            )
        };

        // Barre de titre avec vrai logo PNG
        egui::TopBottomPanel::top("titlebar")
            .exact_height(42.0)
            .frame(
                egui::Frame::new()
                    .fill(CTP_MANTLE)
                    .inner_margin(egui::Margin::symmetric(14, 0))
                    .stroke(egui::Stroke::new(1.0_f32, CTP_SURFACE0)),
            )
            .show(ctx, |ui| {
                let titlebar_rect = ui.max_rect();
                let drag_resp = ui.interact(
                    titlebar_rect,
                    ui.id().with("drag_title"),
                    egui::Sense::drag(),
                );
                if drag_resp.drag_started() {
                    ctx.send_viewport_cmd(egui::ViewportCommand::StartDrag);
                }

                ui.horizontal_centered(|ui| {
                    if let Some(ref tex) = self.logo {
                        ui.add(
                            egui::Image::new(tex)
                                .fit_to_exact_size(egui::vec2(22.0, 22.0))
                                .corner_radius(5.0),
                        );
                    }

                    ui.add_space(4.0);
                    ui.label(
                        egui::RichText::new("SteamUnlocker")
                            .size(13.0)
                            .strong()
                            .color(CTP_TEXT),
                    );

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let (close_rect, close_resp) =
                            ui.allocate_exact_size(egui::vec2(28.0, 28.0), egui::Sense::click());
                        if close_resp.hovered() {
                            ui.painter()
                                .rect_filled(close_rect, 6.0, CTP_RED.linear_multiply(0.2));
                        }
                        let c_col = if close_resp.hovered() {
                            CTP_RED
                        } else {
                            CTP_SUBTEXT
                        };
                        let cc = close_rect.center();
                        ui.painter().line_segment(
                            [
                                egui::pos2(cc.x - 4.5, cc.y - 4.5),
                                egui::pos2(cc.x + 4.5, cc.y + 4.5),
                            ],
                            egui::Stroke::new(1.5_f32, c_col),
                        );
                        ui.painter().line_segment(
                            [
                                egui::pos2(cc.x + 4.5, cc.y - 4.5),
                                egui::pos2(cc.x - 4.5, cc.y + 4.5),
                            ],
                            egui::Stroke::new(1.5_f32, c_col),
                        );
                        if close_resp.on_hover_text("Fermer").clicked() {
                            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                        }

                        let (min_rect, min_resp) =
                            ui.allocate_exact_size(egui::vec2(28.0, 28.0), egui::Sense::click());
                        if min_resp.hovered() {
                            ui.painter().rect_filled(min_rect, 6.0, CTP_SURFACE0);
                        }
                        let mc = min_rect.center();
                        ui.painter().line_segment(
                            [egui::pos2(mc.x - 5.0, mc.y), egui::pos2(mc.x + 5.0, mc.y)],
                            egui::Stroke::new(1.5_f32, CTP_SUBTEXT),
                        );
                        if min_resp.on_hover_text("Réduire").clicked() {
                            ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(true));
                        }

                        ui.add_space(6.0);

                        if !self.audio.is_muted {
                            let mut vol = self.audio.volume;
                            if ui
                                .add(
                                    egui::Slider::new(&mut vol, 0.0..=1.0)
                                        .show_value(false)
                                        .trailing_fill(true),
                                )
                                .changed()
                            {
                                self.audio.set_volume(vol);
                            }
                            ui.add_space(4.0);
                        }

                        let (spk_rect, spk_resp) =
                            ui.allocate_exact_size(egui::vec2(30.0, 26.0), egui::Sense::click());
                        let bg_col = if !self.audio.is_muted {
                            CTP_MAUVE.linear_multiply(0.18)
                        } else if spk_resp.hovered() {
                            CTP_SURFACE0
                        } else {
                            CTP_BASE
                        };
                        ui.painter().rect_filled(spk_rect, 6.0, bg_col);
                        ui.painter().rect_stroke(
                            spk_rect,
                            6.0,
                            egui::Stroke::new(
                                1.0_f32,
                                if !self.audio.is_muted {
                                    CTP_MAUVE
                                } else {
                                    CTP_SURFACE0
                                },
                            ),
                            egui::StrokeKind::Middle,
                        );
                        let icon_col = if !self.audio.is_muted {
                            CTP_MAUVE
                        } else {
                            CTP_OVERLAY
                        };
                        draw_speaker_icon(
                            ui.painter(),
                            spk_rect.center(),
                            self.audio.is_muted,
                            icon_col,
                        );

                        let tip = if self.audio.is_muted {
                            "Activer la musique (Yume Nikki)"
                        } else {
                            "Couper la musique"
                        };
                        if spk_resp.on_hover_text(tip).clicked() {
                            self.audio.toggle();
                        }
                    });
                });
            });

        // Contenu central
        egui::CentralPanel::default()
            .frame(
                egui::Frame::new()
                    .fill(CTP_BASE)
                    .inner_margin(egui::Margin::symmetric(26, 22))
                    .stroke(egui::Stroke::new(1.0_f32, CTP_SURFACE0)),
            )
            .show(ctx, |ui| {
                draw_subtle_grid(ui.painter(), ui.max_rect());

                match stage {
                    WizardStage::Config => {
                        let already_installed = self.is_already_installed();
                        let size_mb =
                            (APP_EXE_BYTES.len() + WEBVIEW_DLL_BYTES.len()) as f32 / (1024.0 * 1024.0);

                        // Hero avec le vrai logo PNG + Titre + Statut
                        ui.horizontal(|ui| {
                            if let Some(ref tex) = self.logo {
                                ui.add(
                                    egui::Image::new(tex)
                                        .fit_to_exact_size(egui::vec2(46.0, 46.0))
                                        .corner_radius(10.0),
                                );
                                ui.add_space(6.0);
                            }

                            ui.vertical(|ui| {
                                ui.horizontal(|ui| {
                                    ui.label(
                                        egui::RichText::new("Installer SteamUnlocker")
                                            .size(20.0)
                                            .strong()
                                            .color(CTP_TEXT),
                                    );
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            let (badge_txt, badge_col) = if already_installed {
                                                ("Déjà installé", CTP_GREEN)
                                            } else {
                                                ("Nouvelle installation", CTP_MAUVE)
                                            };
                                            egui::Frame::new()
                                                .fill(badge_col.linear_multiply(0.15))
                                                .stroke(egui::Stroke::new(
                                                    1.0_f32,
                                                    badge_col.linear_multiply(0.45),
                                                ))
                                                .corner_radius(12.0)
                                                .inner_margin(egui::Margin::symmetric(10, 3))
                                                .show(ui, |ui| {
                                                    ui.label(
                                                        egui::RichText::new(badge_txt)
                                                            .size(11.0)
                                                            .strong()
                                                            .color(badge_col),
                                                    );
                                                });
                                        },
                                    );
                                });
                                ui.label(
                                    egui::RichText::new(format!(
                                        "v{} · {size_mb:.1} Mo requis · 100% autonome",
                                        env!("CARGO_PKG_VERSION")
                                    ))
                                    .size(12.0)
                                    .color(CTP_SUBTEXT),
                                );
                            });
                        });

                        ui.add_space(12.0);

                        // Pill détection Steam
                        egui::Frame::new()
                            .fill(CTP_MANTLE)
                            .stroke(egui::Stroke::new(1.0_f32, CTP_SURFACE0))
                            .corner_radius(8.0)
                            .inner_margin(egui::Margin::symmetric(12, 7))
                            .show(ui, |ui| {
                                ui.set_width(ui.available_width());
                                ui.horizontal(|ui| {
                                    let (dot_col, msg) = match &self.steam_path {
                                        Some(p) => (CTP_GREEN, format!("Steam détecté · {p}")),
                                        None => (CTP_PEACH, "Steam non détecté".to_string()),
                                    };
                                    let (d_rect, _) = ui.allocate_exact_size(
                                        egui::vec2(10.0, 10.0),
                                        egui::Sense::hover(),
                                    );
                                    ui.painter().circle_filled(d_rect.center(), 3.5, dot_col);
                                    ui.label(egui::RichText::new(msg).size(11.5).color(CTP_SUBTEXT));
                                });
                            });

                        ui.add_space(10.0);

                        // Carte Dossier d'installation
                        egui::Frame::new()
                            .fill(CTP_SURFACE0.linear_multiply(0.65))
                            .stroke(egui::Stroke::new(1.0_f32, CTP_SURFACE1))
                            .corner_radius(10.0)
                            .inner_margin(egui::Margin::same(14))
                            .show(ui, |ui| {
                                ui.set_width(ui.available_width());
                                ui.label(
                                    egui::RichText::new("Dossier d'installation")
                                        .size(12.0)
                                        .color(CTP_SUBTEXT),
                                );
                                ui.add_space(6.0);
                                ui.horizontal(|ui| {
                                    egui::Frame::new()
                                        .fill(CTP_CRUST)
                                        .stroke(egui::Stroke::new(1.0_f32, CTP_SURFACE1))
                                        .corner_radius(7.0)
                                        .inner_margin(egui::Margin::symmetric(8, 5))
                                        .show(ui, |ui| {
                                            ui.add(
                                                egui::TextEdit::singleline(&mut self.install_dir)
                                                    .frame(false)
                                                    .desired_width(ui.available_width() - 44.0)
                                                    .font(egui::TextStyle::Monospace),
                                            );
                                        });
                                    let (fld_rect, fld_resp) = ui.allocate_exact_size(
                                        egui::vec2(32.0, 30.0),
                                        egui::Sense::click(),
                                    );
                                    ui.painter().rect_filled(
                                        fld_rect,
                                        7.0,
                                        if fld_resp.hovered() {
                                            CTP_SURFACE1
                                        } else {
                                            CTP_MANTLE
                                        },
                                    );
                                    draw_folder_icon(ui.painter(), fld_rect.center(), CTP_MAUVE);
                                    if fld_resp.on_hover_text("Parcourir...").clicked() {
                                        if let Some(p) = rfd::FileDialog::new().pick_folder() {
                                            self.install_dir = p
                                                .join("SteamUnlocker")
                                                .to_string_lossy()
                                                .to_string();
                                        }
                                    }
                                });
                            });

                        ui.add_space(10.0);

                        // Carte Options avec interrupteurs
                        egui::Frame::new()
                            .fill(CTP_SURFACE0.linear_multiply(0.65))
                            .stroke(egui::Stroke::new(1.0_f32, CTP_SURFACE1))
                            .corner_radius(10.0)
                            .inner_margin(egui::Margin::same(14))
                            .show(ui, |ui| {
                                ui.set_width(ui.available_width());
                                toggle_switch_row(
                                    ui,
                                    &mut self.create_desktop_shortcut,
                                    "Créer un raccourci sur le Bureau",
                                );
                                ui.add_space(7.0);
                                toggle_switch_row(
                                    ui,
                                    &mut self.create_start_menu_shortcut,
                                    "Ajouter au Menu Démarrer",
                                );
                                ui.add_space(7.0);
                                toggle_switch_row(
                                    ui,
                                    &mut self.launch_after_install,
                                    "Lancer après l'installation",
                                );
                            });

                        ui.with_layout(egui::Layout::bottom_up(egui::Align::RIGHT), |ui| {
                            ui.add_space(2.0);
                            ui.horizontal(|ui| {
                                let primary_lbl = if already_installed {
                                    "Mettre à jour"
                                } else {
                                    "Installer"
                                };
                                let btn_rect_size = egui::vec2(154.0, 38.0);
                                let (rect, resp) =
                                    ui.allocate_exact_size(btn_rect_size, egui::Sense::click());
                                let fill = if resp.hovered() {
                                    CTP_LAVENDER
                                } else {
                                    CTP_MAUVE
                                };
                                ui.painter().rect_filled(rect, 9.0, fill);

                                let icon_pos = egui::pos2(rect.left() + 24.0, rect.center().y);
                                draw_download_icon(ui.painter(), icon_pos, CTP_ON_ACCENT);

                                ui.painter().text(
                                    egui::pos2(rect.left() + 42.0, rect.center().y),
                                    egui::Align2::LEFT_CENTER,
                                    primary_lbl,
                                    egui::FontId::proportional(14.0),
                                    CTP_ON_ACCENT,
                                );

                                if resp.clicked() {
                                    self.start_install(ctx.clone());
                                }

                                if already_installed {
                                    ui.add_space(8.0);
                                    let (u_rect, u_resp) = ui.allocate_exact_size(
                                        egui::vec2(130.0, 38.0),
                                        egui::Sense::click(),
                                    );
                                    ui.painter().rect_filled(
                                        u_rect,
                                        9.0,
                                        if u_resp.hovered() {
                                            CTP_RED.linear_multiply(0.25)
                                        } else {
                                            CTP_MANTLE
                                        },
                                    );
                                    ui.painter().rect_stroke(
                                        u_rect,
                                        9.0,
                                        egui::Stroke::new(1.0_f32, CTP_RED.linear_multiply(0.5)),
                                        egui::StrokeKind::Middle,
                                    );
                                    draw_trash_icon(
                                        ui.painter(),
                                        egui::pos2(u_rect.left() + 22.0, u_rect.center().y),
                                        CTP_RED,
                                    );
                                    ui.painter().text(
                                        egui::pos2(u_rect.left() + 38.0, u_rect.center().y),
                                        egui::Align2::LEFT_CENTER,
                                        "Désinstaller",
                                        egui::FontId::proportional(13.0),
                                        CTP_RED,
                                    );
                                    if u_resp.clicked() {
                                        self.start_uninstall(ctx.clone());
                                    }
                                }
                            });
                        });
                    }

                    WizardStage::Installing => {
                        ui.add_space(65.0);
                        ui.vertical_centered(|ui| {
                            if let Some(ref tex) = self.logo {
                                ui.add(
                                    egui::Image::new(tex)
                                        .fit_to_exact_size(egui::vec2(52.0, 52.0))
                                        .corner_radius(12.0),
                                );
                                ui.add_space(14.0);
                            }
                            ui.label(
                                egui::RichText::new("Installation en cours")
                                    .size(20.0)
                                    .strong()
                                    .color(CTP_TEXT),
                            );
                            ui.add_space(6.0);
                            ui.label(
                                egui::RichText::new(&status_label)
                                    .size(13.0)
                                    .color(CTP_SUBTEXT),
                            );
                            ui.add_space(24.0);

                            let bar_rect = ui
                                .allocate_exact_size(egui::vec2(440.0, 10.0), egui::Sense::hover())
                                .0;
                            ui.painter().rect_filled(bar_rect, 5.0, CTP_SURFACE0);
                            let fill_width = bar_rect.width() * progress.clamp(0.0, 1.0);
                            let fill_rect = egui::Rect::from_min_size(
                                bar_rect.min,
                                egui::vec2(fill_width, bar_rect.height()),
                            );
                            ui.painter().rect_filled(fill_rect, 5.0, CTP_MAUVE);

                            ui.add_space(10.0);
                            ui.label(
                                egui::RichText::new(format!("{:.0}%", progress * 100.0))
                                    .size(12.0)
                                    .monospace()
                                    .color(CTP_MAUVE),
                            );
                        });
                    }

                    WizardStage::Finished => {
                        ui.add_space(50.0);
                        ui.vertical_centered(|ui| {
                            let (chk_rect, _) = ui.allocate_exact_size(
                                egui::vec2(56.0, 56.0),
                                egui::Sense::hover(),
                            );
                            draw_check_circle(ui.painter(), chk_rect.center(), 24.0, CTP_GREEN);

                            ui.add_space(12.0);
                            ui.label(
                                egui::RichText::new("Installation terminée")
                                    .size(21.0)
                                    .strong()
                                    .color(CTP_TEXT),
                            );
                            ui.add_space(4.0);
                            ui.label(
                                egui::RichText::new("SteamUnlocker est prêt à être utilisé.")
                                    .size(13.0)
                                    .color(CTP_SUBTEXT),
                            );
                        });

                        ui.with_layout(egui::Layout::bottom_up(egui::Align::RIGHT), |ui| {
                            ui.horizontal(|ui| {
                                let finish_lbl = if self.launch_after_install {
                                    "Lancer"
                                } else {
                                    "Terminer"
                                };
                                let (rect, resp) = ui.allocate_exact_size(
                                    egui::vec2(140.0, 38.0),
                                    egui::Sense::click(),
                                );
                                ui.painter().rect_filled(
                                    rect,
                                    9.0,
                                    if resp.hovered() {
                                        CTP_LAVENDER
                                    } else {
                                        CTP_MAUVE
                                    },
                                );
                                ui.painter().text(
                                    rect.center(),
                                    egui::Align2::CENTER_CENTER,
                                    finish_lbl,
                                    egui::FontId::proportional(14.0),
                                    CTP_ON_ACCENT,
                                );
                                if resp.clicked() {
                                    if self.launch_after_install {
                                        let exe = PathBuf::from(&self.install_dir)
                                            .join("SteamUnlocker.exe");
                                        let _ = Command::new(exe)
                                            .current_dir(&self.install_dir)
                                            .spawn();
                                    }
                                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                                }

                                ui.add_space(8.0);

                                let (f_rect, f_resp) = ui.allocate_exact_size(
                                    egui::vec2(38.0, 38.0),
                                    egui::Sense::click(),
                                );
                                ui.painter().rect_filled(
                                    f_rect,
                                    9.0,
                                    if f_resp.hovered() {
                                        CTP_SURFACE1
                                    } else {
                                        CTP_SURFACE0
                                    },
                                );
                                draw_folder_icon(ui.painter(), f_rect.center(), CTP_TEXT);
                                if f_resp.on_hover_text("Ouvrir le dossier").clicked() {
                                    let _ = Command::new("explorer").arg(&self.install_dir).spawn();
                                }
                            });
                        });
                    }

                    WizardStage::Uninstalled => {
                        ui.add_space(50.0);
                        ui.vertical_centered(|ui| {
                            let (chk_rect, _) = ui.allocate_exact_size(
                                egui::vec2(56.0, 56.0),
                                egui::Sense::hover(),
                            );
                            draw_check_circle(ui.painter(), chk_rect.center(), 24.0, CTP_MAUVE);

                            ui.add_space(12.0);
                            ui.label(
                                egui::RichText::new("Désinstallation terminée")
                                    .size(21.0)
                                    .strong()
                                    .color(CTP_TEXT),
                            );
                            ui.add_space(4.0);
                            ui.label(
                                egui::RichText::new("Les fichiers et raccourcis ont été supprimés.")
                                    .size(13.0)
                                    .color(CTP_SUBTEXT),
                            );
                        });

                        ui.with_layout(egui::Layout::bottom_up(egui::Align::RIGHT), |ui| {
                            let (rect, resp) = ui
                                .allocate_exact_size(egui::vec2(120.0, 38.0), egui::Sense::click());
                            ui.painter().rect_filled(
                                rect,
                                9.0,
                                if resp.hovered() {
                                    CTP_LAVENDER
                                } else {
                                    CTP_MAUVE
                                },
                            );
                            ui.painter().text(
                                rect.center(),
                                egui::Align2::CENTER_CENTER,
                                "Fermer",
                                egui::FontId::proportional(14.0),
                                CTP_ON_ACCENT,
                            );
                            if resp.clicked() {
                                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                            }
                        });
                    }

                    WizardStage::Error => {
                        ui.add_space(50.0);
                        ui.vertical_centered(|ui| {
                            ui.label(
                                egui::RichText::new("Erreur d'installation")
                                    .size(20.0)
                                    .strong()
                                    .color(CTP_RED),
                            );
                            ui.add_space(10.0);
                            if let Some(ref err) = error_msg {
                                ui.label(egui::RichText::new(err).size(13.0).color(CTP_SUBTEXT));
                            }
                        });

                        ui.with_layout(egui::Layout::bottom_up(egui::Align::RIGHT), |ui| {
                            let (rect, resp) = ui
                                .allocate_exact_size(egui::vec2(130.0, 38.0), egui::Sense::click());
                            ui.painter().rect_filled(
                                rect,
                                9.0,
                                if resp.hovered() {
                                    CTP_SURFACE1
                                } else {
                                    CTP_SURFACE0
                                },
                            );
                            ui.painter().text(
                                rect.center(),
                                egui::Align2::CENTER_CENTER,
                                "Réessayer",
                                egui::FontId::proportional(14.0),
                                CTP_TEXT,
                            );
                            if resp.clicked() {
                                self.state.lock().unwrap().stage = WizardStage::Config;
                            }
                        });
                    }
                }
            });
    }
}
