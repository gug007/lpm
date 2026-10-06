// Linux halves of "Install command line tool" (cli_install.rs owns the shared
// symlink flow). An AppImage runs from a per-launch mount that vanishes when the
// app quits, so its link targets a copy of the sidecar kept at a stable path,
// refreshed whenever the bundled CLI changes.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

#[cfg(target_os = "linux")]
pub(crate) fn in_appimage(bundled: &Path) -> bool {
    std::env::var_os("APPDIR").is_some_and(|dir| bundled.starts_with(dir))
}

pub(crate) fn stable_copy_path() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| {
        d.join("lpm")
            .join("bin")
            .join(crate::cli_install::BUNDLED_BIN)
    })
}

/// AppImage only: bring the stable copy in line with the running sidecar.
#[cfg(target_os = "linux")]
pub(crate) fn refresh_copy(target: &Path) -> Result<(), String> {
    let bundled = crate::cli_install::bundled_cli_path()?;
    if bundled == target {
        return Ok(());
    }
    sync_copy(&bundled, target).map_err(|e| format!("failed to copy the command line tool: {e}"))
}

/// Copy `src` over `dst` unless it already matches. Staged beside `dst` and
/// renamed in, so a shell never runs a half-written binary.
fn sync_copy(src: &Path, dst: &Path) -> std::io::Result<()> {
    if crate::cli_install::same_contents(src, dst) {
        return Ok(());
    }
    let dir = dst.parent().unwrap_or(Path::new("."));
    std::fs::create_dir_all(dir)?;
    let staged = tempfile::Builder::new()
        .prefix(".lpm-cli-")
        .tempfile_in(dir)?
        .into_temp_path();
    std::fs::copy(src, &staged)?;
    crate::fsperm::set_mode(&staged, 0o755)?;
    staged.persist(dst).map_err(|e| e.error)
}

/// Linux corrections to the shared status: an AppImage copy left behind by an
/// older version needs an update, and an `lpm` the package already put on PATH
/// that runs this very sidecar counts as installed.
pub(crate) fn adjust_status(
    mut value: Value,
    expected: &Path,
    bundled: &Path,
    dirs: &[String],
) -> Value {
    match value["status"].as_str() {
        Some("installed")
            if expected != bundled && !crate::cli_install::same_contents(bundled, expected) =>
        {
            value["status"] = json!("points-elsewhere");
        }
        Some("not-installed") => {
            let hit = crate::cli_install::first_lpm_in(dirs).filter(|hit| {
                matches!(
                    (std::fs::canonicalize(hit), std::fs::canonicalize(bundled)),
                    (Ok(a), Ok(b)) if a == b
                )
            });
            if let Some(hit) = hit {
                value["status"] = json!("installed");
                value["linkPath"] = json!(hit.to_string_lossy());
            }
        }
        _ => {}
    }
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_copy_replaces_only_a_differing_copy() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("mount").join("lpm-cli");
        std::fs::create_dir_all(src.parent().unwrap()).unwrap();
        std::fs::write(&src, b"v2").unwrap();
        let dst = dir.path().join("share").join("bin").join("lpm-cli");

        sync_copy(&src, &dst).unwrap();
        assert_eq!(std::fs::read(&dst).unwrap(), b"v2");
        assert!(crate::cli_install::same_contents(&src, &dst));
        assert_eq!(
            crate::fsperm::mode(&std::fs::metadata(&dst).unwrap()) & 0o777,
            0o755
        );

        std::fs::write(&src, b"v3").unwrap();
        assert!(!crate::cli_install::same_contents(&src, &dst));
        sync_copy(&src, &dst).unwrap();
        assert_eq!(std::fs::read(&dst).unwrap(), b"v3");
        let leftovers = std::fs::read_dir(dst.parent().unwrap()).unwrap().count();
        assert_eq!(leftovers, 1);
    }

    #[test]
    fn stale_appimage_copy_needs_an_update() {
        let dir = tempfile::tempdir().unwrap();
        let bundled = dir.path().join("lpm-cli");
        let copy = dir.path().join("copy").join("lpm-cli");
        std::fs::create_dir_all(copy.parent().unwrap()).unwrap();
        std::fs::write(&bundled, b"new").unwrap();
        std::fs::write(&copy, b"old").unwrap();
        let installed = json!({"status": "installed"});

        let v = adjust_status(installed.clone(), &copy, &bundled, &[]);
        assert_eq!(v["status"], "points-elsewhere");

        std::fs::write(&copy, b"new").unwrap();
        let v = adjust_status(installed.clone(), &copy, &bundled, &[]);
        assert_eq!(v["status"], "installed");

        // A package install links straight at the sidecar; nothing to compare.
        let v = adjust_status(installed, &bundled, &bundled, &[]);
        assert_eq!(v["status"], "installed");
    }

    #[test]
    fn package_provided_lpm_counts_as_installed() {
        let dir = tempfile::tempdir().unwrap();
        let bundled = dir.path().join("usr-bin").join("lpm-cli");
        std::fs::create_dir_all(bundled.parent().unwrap()).unwrap();
        std::fs::write(&bundled, b"cli").unwrap();
        let path_dir = dir.path().join("path");
        std::fs::create_dir_all(&path_dir).unwrap();
        std::os::unix::fs::symlink(&bundled, path_dir.join("lpm")).unwrap();
        let dirs = vec![path_dir.to_string_lossy().into_owned()];
        let absent = json!({"status": "not-installed", "linkPath": "/home/u/.local/bin/lpm"});

        let v = adjust_status(absent.clone(), &bundled, &bundled, &dirs);
        assert_eq!(v["status"], "installed");
        assert_eq!(
            v["linkPath"],
            path_dir.join("lpm").to_string_lossy().into_owned()
        );

        // Some other lpm on PATH is not ours to claim.
        std::fs::remove_file(path_dir.join("lpm")).unwrap();
        std::fs::write(path_dir.join("lpm"), b"other").unwrap();
        let v = adjust_status(absent, &bundled, &bundled, &dirs);
        assert_eq!(v["status"], "not-installed");
    }
}
