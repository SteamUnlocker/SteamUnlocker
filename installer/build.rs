use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let ico_path = manifest_dir.join("../src-tauri/icons/icon.ico");
    println!("cargo:rerun-if-changed={}", ico_path.display());

    if let Ok(canon) = fs::canonicalize(&ico_path) {
        let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
        let rc_path = out_dir.join("icon.rc");
        let res_path = out_dir.join("icon.o");
        let clean_ico = canon
            .to_string_lossy()
            .trim_start_matches(r"\\?\")
            .replace('\\', "/");

        fs::write(&rc_path, format!("1 ICON \"{clean_ico}\"\n")).unwrap();

        let status = Command::new("windres")
            .args([
                "-i",
                rc_path.to_str().unwrap(),
                "-o",
                res_path.to_str().unwrap(),
                "-O",
                "coff",
            ])
            .status();

        if let Ok(s) = status {
            if s.success() {
                println!("cargo:rustc-link-arg={}", res_path.display());
            }
        }
    }
}
