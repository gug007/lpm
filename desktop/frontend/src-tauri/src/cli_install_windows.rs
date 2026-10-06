// Windows "Install command line tool": copy the bundled lpm-cli.exe to
// %LOCALAPPDATA%\Programs\lpm\bin\lpm.exe and put that directory on the user's
// Path (HKCU\Environment). Symlinks need admin rights or Developer Mode, and the
// installer replaces the app's own directory on every update, so a copy in a
// directory lpm owns is the stable handle; startup refreshes it after an update.
// Everything in that directory is ours, so a differing lpm.exe there is a stale
// copy to replace, never a foreign file.
//
// The status strings match cli_install.rs so the Settings row reads the same:
// a missing copy is "not-installed"; a stale copy or a Path without the
// directory is "points-elsewhere" (Install fixes both).

use serde_json::{json, Value};
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

const EXE_NAME: &str = "lpm.exe";
const RETIRED_PREFIX: &str = "lpm.exe.";
const RETIRED_SUFFIX: &str = ".old";

#[cfg(windows)]
pub fn bin_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_default()
        .join("Programs")
        .join("lpm")
        .join("bin")
}

#[cfg(windows)]
pub fn target_path() -> PathBuf {
    bin_dir().join(EXE_NAME)
}

/// `%NAME%` references replaced through `lookup`; unknown names stay literal,
/// as Windows leaves them.
fn expand_env(s: &str, lookup: impl Fn(&str) -> Option<String>) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) if end > 0 => match lookup(&after[..end]) {
                Some(value) => {
                    out.push_str(&value);
                    rest = &after[end + 1..];
                }
                None => {
                    out.push('%');
                    rest = after;
                }
            },
            _ => {
                out.push('%');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

fn norm(entry: &str) -> String {
    entry
        .trim()
        .trim_matches('"')
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

fn same_entry(entry: &str, dir: &str) -> bool {
    let expanded = expand_env(entry, |name| std::env::var(name).ok());
    !expanded.trim().is_empty() && norm(&expanded) == norm(dir)
}

/// `current` with `dir` appended, or None when it is already listed.
fn path_with(current: &str, dir: &str) -> Option<String> {
    if current.split(';').any(|e| same_entry(e, dir)) {
        return None;
    }
    let base = current.trim_end_matches(';');
    Some(if base.is_empty() {
        dir.to_string()
    } else {
        format!("{base};{dir}")
    })
}

/// `current` without any entry naming `dir`, or None when none does.
fn path_without(current: &str, dir: &str) -> Option<String> {
    let entries: Vec<&str> = current.split(';').collect();
    let kept: Vec<&str> = entries
        .iter()
        .copied()
        .filter(|e| !same_entry(e, dir))
        .collect();
    (kept.len() != entries.len()).then(|| kept.join(";"))
}

/// The process PATH `live` with `dir` appended, or None when it is listed.
fn live_path_with(live: &OsStr, dir: &Path) -> Option<OsString> {
    let dir_key = norm(&dir.to_string_lossy());
    if std::env::split_paths(live).any(|d| norm(&d.to_string_lossy()) == dir_key) {
        return None;
    }
    let mut next = live.to_os_string();
    if !next.is_empty() {
        next.push(crate::sys::PATH_SEP.to_string());
    }
    next.push(dir);
    Some(next)
}

fn split_dirs(value: &str) -> Vec<PathBuf> {
    value
        .split(';')
        .map(|e| expand_env(e.trim().trim_matches('"'), |n| std::env::var(n).ok()))
        .filter(|e| !e.is_empty())
        .map(PathBuf::from)
        .collect()
}

/// First `lpm` a shell would run, trying each PATHEXT extension per directory.
fn first_lpm(dirs: &[PathBuf], exts: &[String]) -> Option<PathBuf> {
    dirs.iter().find_map(|dir| {
        exts.iter()
            .map(|ext| dir.join(format!("lpm{ext}")))
            .find(|p| p.is_file())
    })
}

#[cfg(windows)]
fn pathext() -> Vec<String> {
    std::env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into())
        .split(';')
        .filter(|e| !e.is_empty())
        .map(|e| e.to_ascii_lowercase())
        .collect()
}

/// Status of the copy at `target` against the bundled CLI. `path_dirs` is the
/// Path a new terminal gets: the machine entries, then the user's.
fn status_value(bundled: &Path, target: &Path, path_dirs: &[PathBuf], exts: &[String]) -> Value {
    let dir = target.parent().unwrap_or(Path::new(""));
    let present = target.is_file();
    let current = present && crate::cli_install::same_contents(bundled, target);
    let on_path = path_dirs
        .iter()
        .any(|d| norm(&d.to_string_lossy()) == norm(&dir.to_string_lossy()));
    let shadowed = first_lpm(path_dirs, exts)
        .filter(|hit| norm(&hit.to_string_lossy()) != norm(&target.to_string_lossy()));
    let status = if !present {
        "not-installed"
    } else if !current || !on_path {
        "points-elsewhere"
    } else if shadowed.is_some() {
        "shadowed"
    } else {
        "installed"
    };
    json!({
        "status": status,
        "linkPath": target.to_string_lossy(),
        "expected": bundled.to_string_lossy(),
        "target": present.then(|| target.to_string_lossy().into_owned()),
        "shadowedBy": shadowed
            .filter(|_| status == "shadowed")
            .map(|p| p.to_string_lossy().into_owned()),
    })
}

/// A unique name to move a locked (running) lpm.exe aside to.
fn retired_name(dir: &Path) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    dir.join(format!(
        "{RETIRED_PREFIX}{}-{nanos}{RETIRED_SUFFIX}",
        std::process::id()
    ))
}

/// Best-effort delete of copies moved aside earlier; one still running stays.
fn clear_retired(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with(RETIRED_PREFIX) && name.ends_with(RETIRED_SUFFIX) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Put `src` at `dst` unless it already matches. A running lpm.exe can't be
/// overwritten but can be renamed, so a locked copy is moved aside first.
fn place_copy(src: &Path, dst: &Path) -> std::io::Result<()> {
    let dir = dst.parent().unwrap_or(Path::new("."));
    std::fs::create_dir_all(dir)?;
    clear_retired(dir);
    if crate::cli_install::same_contents(src, dst) {
        return Ok(());
    }
    let staged = tempfile::Builder::new()
        .prefix(".lpm-")
        .tempfile_in(dir)?
        .into_temp_path();
    std::fs::copy(src, &staged)?;
    let staged = match staged.persist(dst) {
        Ok(()) => return Ok(()),
        Err(e) if dst.exists() => e.path,
        Err(e) => return Err(e.error),
    };
    std::fs::rename(dst, retired_name(dir))?;
    staged.persist(dst).map_err(|e| e.error)
}

/// Remove the copy (moving it aside when it is running) and any leftovers.
fn remove_copy(dir: &Path) -> std::io::Result<()> {
    let target = dir.join(EXE_NAME);
    if target.exists() && std::fs::remove_file(&target).is_err() {
        std::fs::rename(&target, retired_name(dir))?;
    }
    clear_retired(dir);
    let _ = std::fs::remove_dir(dir);
    if let Some(parent) = dir.parent() {
        let _ = std::fs::remove_dir(parent);
    }
    Ok(())
}

#[cfg(windows)]
fn path_dirs() -> Vec<PathBuf> {
    let mut dirs = split_dirs(&crate::winpath::system_path().unwrap_or_default());
    dirs.extend(split_dirs(
        &crate::winpath::user_path()
            .ok()
            .flatten()
            .unwrap_or_default(),
    ));
    dirs
}

#[cfg(windows)]
pub fn status() -> Result<Value, String> {
    let target = target_path();
    let Ok(bundled) = crate::cli_install::bundled_cli_path() else {
        return Ok(json!({
            "status": "unavailable",
            "linkPath": target.to_string_lossy(),
        }));
    };
    let mut value = status_value(&bundled, &target, &path_dirs(), &pathext());
    let probe = match value["status"].as_str() {
        Some("installed" | "shadowed") => target,
        _ => bundled,
    };
    value["cliVersion"] = json!(crate::cli_install::read_cli_version(&probe));
    Ok(value)
}

#[cfg(windows)]
pub fn install() -> Result<Value, String> {
    let bundled = crate::cli_install::bundled_cli_path()?;
    let dir = bin_dir();
    place_copy(&bundled, &dir.join(EXE_NAME))
        .map_err(|e| format!("failed to copy the command line tool: {e}"))?;
    let current = crate::winpath::user_path()
        .map_err(|code| format!("failed to read your Path (error {code})"))?
        .unwrap_or_default();
    if let Some(next) = path_with(&current, &dir.to_string_lossy()) {
        crate::winpath::set_user_path(&next)?;
    }
    // lpm's terminals copy this process's PATH, which the registry edit and
    // its broadcast never reach.
    let live = std::env::var_os("PATH").unwrap_or_default();
    if let Some(next) = live_path_with(&live, &dir) {
        std::env::set_var("PATH", next);
    }
    status()
}

/// App uninstall: remove the copy and its Path entry.
#[cfg(windows)]
pub fn remove() -> Result<(), String> {
    let dir = bin_dir();
    remove_copy(&dir).map_err(|e| format!("failed to remove the command line tool: {e}"))?;
    let current = crate::winpath::user_path()
        .map_err(|code| format!("failed to read your Path (error {code})"))?
        .unwrap_or_default();
    if let Some(next) = path_without(&current, &dir.to_string_lossy()) {
        crate::winpath::set_user_path(&next)?;
    }
    Ok(())
}

/// Startup: refresh a copy the user installed once an update changed the
/// bundled CLI. Never creates a first copy and never edits Path.
#[cfg(windows)]
pub fn repair_quietly() {
    let Ok(bundled) = crate::cli_install::bundled_cli_path() else {
        return;
    };
    let target = target_path();
    if target.is_file() {
        let _ = place_copy(&bundled, &target);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lookup(name: &str) -> Option<String> {
        match name {
            "LOCALAPPDATA" => Some(r"C:\Users\ada\AppData\Local".into()),
            "USERPROFILE" => Some(r"C:\Users\ada".into()),
            _ => None,
        }
    }

    #[test]
    fn expands_known_variables_and_keeps_the_rest() {
        assert_eq!(
            expand_env(r"%LOCALAPPDATA%\Programs\lpm\bin", lookup),
            r"C:\Users\ada\AppData\Local\Programs\lpm\bin"
        );
        assert_eq!(expand_env(r"%NOPE%\bin", lookup), r"%NOPE%\bin");
        assert_eq!(expand_env("100%", lookup), "100%");
        assert_eq!(expand_env("%%USERPROFILE%", lookup), r"%C:\Users\ada");
    }

    #[test]
    fn path_with_appends_once() {
        let dir = r"C:\Users\ada\AppData\Local\Programs\lpm\bin";
        assert_eq!(path_with("", dir).unwrap(), dir);
        assert_eq!(
            path_with(r"C:\tools;", dir).unwrap(),
            format!(r"C:\tools;{dir}")
        );
        // Already present, differing only in case, quoting or a trailing slash.
        let listed = r#"C:\tools;"c:\users\ada\appdata\local\programs\lpm\bin\""#;
        assert_eq!(path_with(listed, dir), None);
    }

    #[test]
    fn path_without_drops_every_copy_of_the_entry() {
        let dir = r"C:\lpm\bin";
        assert_eq!(
            path_without(r"C:\a;C:\LPM\bin;C:\b;c:\lpm\bin\", dir).unwrap(),
            r"C:\a;C:\b"
        );
        assert_eq!(path_without(r"C:\a;C:\b", dir), None);
    }

    fn setup() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let bundled = tmp.path().join("app").join("lpm-cli.exe");
        std::fs::create_dir_all(bundled.parent().unwrap()).unwrap();
        std::fs::write(&bundled, b"v2").unwrap();
        let target = tmp.path().join("bin").join(EXE_NAME);
        (tmp, bundled, target)
    }

    fn exts() -> Vec<String> {
        vec![".exe".into(), ".cmd".into()]
    }

    #[test]
    fn status_follows_copy_and_path() {
        let (_tmp, bundled, target) = setup();
        let bin = target.parent().unwrap().to_path_buf();
        let on_path = vec![bin.clone()];

        let v = status_value(&bundled, &target, &on_path, &exts());
        assert_eq!(v["status"], "not-installed");
        assert!(v["target"].is_null());

        place_copy(&bundled, &target).unwrap();
        assert_eq!(
            status_value(&bundled, &target, &[], &exts())["status"],
            "points-elsewhere"
        );
        let v = status_value(&bundled, &target, &on_path, &exts());
        assert_eq!(v["status"], "installed");
        assert!(v["shadowedBy"].is_null());

        std::fs::write(&bundled, b"v3").unwrap();
        assert_eq!(
            status_value(&bundled, &target, &on_path, &exts())["status"],
            "points-elsewhere"
        );
    }

    #[test]
    fn an_earlier_lpm_shadows_the_copy() {
        let (tmp, bundled, target) = setup();
        place_copy(&bundled, &target).unwrap();
        let early = tmp.path().join("early");
        std::fs::create_dir_all(&early).unwrap();
        std::fs::write(early.join("lpm.cmd"), b"@echo off").unwrap();
        let dirs = vec![early.clone(), target.parent().unwrap().to_path_buf()];
        let v = status_value(&bundled, &target, &dirs, &exts());
        assert_eq!(v["status"], "shadowed");
        assert_eq!(
            v["shadowedBy"],
            early.join("lpm.cmd").to_string_lossy().into_owned()
        );
    }

    #[test]
    fn place_copy_clears_copies_moved_aside_earlier() {
        let (_tmp, bundled, target) = setup();
        place_copy(&bundled, &target).unwrap();
        let dir = target.parent().unwrap();
        let retired = retired_name(dir);
        std::fs::write(&retired, b"old").unwrap();
        std::fs::write(&bundled, b"v3").unwrap();
        place_copy(&bundled, &target).unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"v3");
        assert!(!retired.exists());
        assert_eq!(std::fs::read_dir(dir).unwrap().count(), 1);
    }

    #[test]
    fn remove_copy_clears_the_directory() {
        let (tmp, bundled, _) = setup();
        let dir = tmp.path().join("Programs").join("lpm").join("bin");
        place_copy(&bundled, &dir.join(EXE_NAME)).unwrap();
        std::fs::write(retired_name(&dir), b"old").unwrap();
        remove_copy(&dir).unwrap();
        assert!(!dir.exists());
        assert!(!dir.parent().unwrap().exists());
        assert!(tmp.path().join("Programs").exists());
    }

    #[test]
    fn the_live_path_gains_the_dir_once() {
        let sep = crate::sys::PATH_SEP;
        let dir = Path::new("/home/ada/lpm/bin");
        assert_eq!(
            live_path_with(OsStr::new(""), dir).unwrap(),
            "/home/ada/lpm/bin"
        );
        let live = format!("/usr/bin{sep}/opt/tools");
        assert_eq!(
            live_path_with(OsStr::new(&live), dir).unwrap(),
            format!("{live}{sep}/home/ada/lpm/bin").as_str()
        );
        let listed = format!("/usr/bin{sep}/HOME/Ada/lpm/bin/");
        assert_eq!(live_path_with(OsStr::new(&listed), dir), None);
    }

    #[test]
    fn split_dirs_skips_empty_and_quoted_entries() {
        assert_eq!(
            split_dirs(r#"C:\a;;"C:\b c";  "#),
            vec![PathBuf::from(r"C:\a"), PathBuf::from(r"C:\b c")]
        );
    }

    #[test]
    fn first_lpm_tries_extensions_in_order_per_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let a = tmp.path().join("a");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::write(a.join("lpm.cmd"), b"x").unwrap();
        std::fs::write(a.join("lpm.exe"), b"x").unwrap();
        assert_eq!(first_lpm(&[a.clone()], &exts()), Some(a.join("lpm.exe")));
        assert_eq!(first_lpm(&[], &exts()), None);
    }
}
