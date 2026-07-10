// "Install command line tool" — symlink the bundled CLI into PATH, VS Code
// style, so `lpm …` works in any shell and app updates (which replace the .app
// in place) automatically update the tool through the symlink.
//
// The bundled binary is Contents/MacOS/lpm-cli (named lpm-cli so it can't be
// confused with the app's own executable, `lpm-desktop`, in the same
// directory). The symlink we create is
// /usr/local/bin/lpm -> …/lpm.app/Contents/MacOS/lpm-cli.
//
// Direct symlink first; on permission-denied we escalate once via osascript
// `with administrator privileges` (the standard macOS GUI auth prompt). We never
// silently overwrite anything we don't recognize as our own: a regular file or a
// foreign symlink at the target aborts with an error the UI surfaces.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const INSTALL_DIR: &str = "/usr/local/bin";
const LINK_NAME: &str = "lpm";
/// Bundled sidecar file name (Tauri strips the target-triple suffix on bundling).
const BUNDLED_BIN: &str = "lpm-cli";

fn link_path() -> PathBuf {
    Path::new(INSTALL_DIR).join(LINK_NAME)
}

/// Absolute path of the bundled CLI inside the running .app, or an error when
/// not running from a packaged bundle (dev builds) or the file is missing.
fn bundled_cli_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("cannot resolve app path: {e}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "cannot resolve app directory".to_string())?;
    // A packaged app runs from …/lpm.app/Contents/MacOS/. Anything else (e.g.
    // target/debug during `tauri dev`) is a dev build with no signed sidecar to
    // point at, so refuse rather than linking a throwaway path into PATH.
    if !dir.ends_with("Contents/MacOS") {
        return Err("The command line tool is only available in the packaged app.".into());
    }
    let cli = dir.join(BUNDLED_BIN);
    if !cli.exists() {
        return Err(format!("bundled CLI not found at {}", cli.display()));
    }
    Ok(cli)
}

/// What currently occupies the symlink target path.
#[derive(Debug, PartialEq)]
enum PathState {
    Absent,
    /// A regular file (or anything that isn't our symlink) — never touched.
    Foreign,
    /// A symlink we recognize as ours (its target's file name is `lpm-cli`),
    /// carrying the path it points at.
    OurSymlink(PathBuf),
    /// A symlink pointing somewhere we don't recognize as ours.
    ForeignSymlink(PathBuf),
}

/// Classify the path from filesystem facts, kept pure for testing. `meta` is the
/// symlink-level metadata (from `symlink_metadata`); `target` is the resolved
/// link destination when it is a symlink.
fn classify(exists: bool, is_symlink: bool, target: Option<&Path>) -> PathState {
    if !exists {
        return PathState::Absent;
    }
    if !is_symlink {
        return PathState::Foreign;
    }
    match target {
        Some(t) if t.file_name() == Some(std::ffi::OsStr::new(BUNDLED_BIN)) => {
            PathState::OurSymlink(t.to_path_buf())
        }
        Some(t) => PathState::ForeignSymlink(t.to_path_buf()),
        None => PathState::ForeignSymlink(PathBuf::new()),
    }
}

fn current_state(link: &Path) -> PathState {
    match std::fs::symlink_metadata(link) {
        Err(_) => PathState::Absent,
        Ok(meta) => {
            let is_symlink = meta.file_type().is_symlink();
            let target = if is_symlink {
                std::fs::read_link(link).ok()
            } else {
                None
            };
            classify(true, is_symlink, target.as_deref())
        }
    }
}

/// The status string the UI shows, derived purely from the path state and the
/// expected target.
fn status_for(state: &PathState, expected: &Path) -> &'static str {
    match state {
        PathState::Absent => "not-installed",
        PathState::OurSymlink(t) if t == expected => "installed",
        // Ours but stale (app moved), a foreign symlink, or a plain file all
        // read as "points elsewhere" — occupied by something that isn't a
        // current, correct install.
        _ => "points-elsewhere",
    }
}

/// Whether `install` may proceed, and if so whether it must replace an existing
/// entry first. `Ok(false)` = create fresh, `Ok(true)` = replace ours,
/// `Err` = refuse (foreign occupant) or already done.
enum InstallPlan {
    AlreadyInstalled,
    Create,
    ReplaceOurs,
    RefuseForeign(String),
}

fn plan_install(state: &PathState, expected: &Path) -> InstallPlan {
    match state {
        PathState::Absent => InstallPlan::Create,
        PathState::OurSymlink(t) if t == expected => InstallPlan::AlreadyInstalled,
        // Our symlink pointing at an old/other bundle path: safe to repoint.
        PathState::OurSymlink(_) => InstallPlan::ReplaceOurs,
        PathState::Foreign => InstallPlan::RefuseForeign(format!(
            "A file already exists at {} and is not an lpm symlink. Remove it and try again.",
            link_path().display()
        )),
        PathState::ForeignSymlink(t) => InstallPlan::RefuseForeign(format!(
            "{} already points to {} (not lpm). Remove it and try again.",
            link_path().display(),
            t.display()
        )),
    }
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn applescript_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Try to create/replace the symlink directly (works when /usr/local/bin is
/// user-writable, e.g. Homebrew setups). Returns Err with the io::Error so the
/// caller can decide whether to escalate on PermissionDenied.
fn symlink_direct(expected: &Path, link: &Path, replace: bool) -> std::io::Result<()> {
    if let Some(parent) = link.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if replace {
        let _ = std::fs::remove_file(link);
    }
    std::os::unix::fs::symlink(expected, link)
}

/// Escalate via the macOS admin prompt. `ln -sf` covers both create and
/// replace-ours; the foreign-occupant cases are already rejected before we get
/// here, so force is safe.
fn symlink_escalated(expected: &Path, link: &Path) -> Result<(), String> {
    let dir = link.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let inner = format!(
        "mkdir -p {} && ln -sf {} {}",
        shell_quote(&dir.to_string_lossy()),
        shell_quote(&expected.to_string_lossy()),
        shell_quote(&link.to_string_lossy()),
    );
    let script = format!(
        "do shell script \"{}\" with administrator privileges",
        applescript_escape(&inner)
    );
    let out = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("failed to run osascript: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        // User-cancelled auth dialog is AppleScript error -128.
        if err.contains("-128") {
            return Err("Installation cancelled.".into());
        }
        return Err(format!("failed to create symlink: {}", err.trim()));
    }
    Ok(())
}

fn do_install(expected: &Path, link: &Path, replace: bool) -> Result<(), String> {
    match symlink_direct(expected, link, replace) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
            symlink_escalated(expected, link)
        }
        Err(e) => Err(format!("failed to create symlink: {e}")),
    }
}

fn status_value(state: &PathState, expected: &Path) -> Value {
    let status = status_for(state, expected);
    let target = match state {
        PathState::OurSymlink(t) | PathState::ForeignSymlink(t) => {
            Some(t.to_string_lossy().into_owned())
        }
        _ => None,
    };
    json!({
        "status": status,
        "linkPath": link_path().to_string_lossy(),
        "expected": expected.to_string_lossy(),
        "target": target,
    })
}

// ---- commands ---------------------------------------------------------------

/// Report whether the `lpm` CLI is on PATH: `installed`, `not-installed`, or
/// `points-elsewhere` (occupied by a foreign file / stale link). In a dev build
/// (no bundle) returns `{"status":"unavailable"}` rather than erroring, so the
/// UI can hide the control gracefully.
#[tauri::command(async)]
pub fn cli_install_status() -> Result<Value, String> {
    let expected = match bundled_cli_path() {
        Ok(p) => p,
        Err(_) => {
            return Ok(json!({
                "status": "unavailable",
                "linkPath": link_path().to_string_lossy(),
            }))
        }
    };
    Ok(status_value(&current_state(&link_path()), &expected))
}

/// Symlink the bundled CLI to /usr/local/bin/lpm (escalating for permission if
/// needed). Idempotent; refuses to overwrite a foreign occupant.
#[tauri::command(async)]
pub fn install_cli() -> Result<Value, String> {
    let expected = bundled_cli_path()?;
    let link = link_path();
    match plan_install(&current_state(&link), &expected) {
        InstallPlan::AlreadyInstalled => {}
        InstallPlan::Create => do_install(&expected, &link, false)?,
        InstallPlan::ReplaceOurs => do_install(&expected, &link, true)?,
        InstallPlan::RefuseForeign(msg) => return Err(msg),
    }
    // Re-read so the UI gets the authoritative post-install state.
    Ok(status_value(&current_state(&link), &expected))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn expected() -> PathBuf {
        PathBuf::from("/Applications/lpm.app/Contents/MacOS/lpm-cli")
    }

    #[test]
    fn classify_recognizes_states() {
        assert_eq!(classify(false, false, None), PathState::Absent);
        assert_eq!(classify(true, false, None), PathState::Foreign);
        let ours = Path::new("/Applications/lpm.app/Contents/MacOS/lpm-cli");
        assert_eq!(
            classify(true, true, Some(ours)),
            PathState::OurSymlink(ours.to_path_buf())
        );
        let foreign = Path::new("/opt/homebrew/bin/lpm-other");
        assert_eq!(
            classify(true, true, Some(foreign)),
            PathState::ForeignSymlink(foreign.to_path_buf())
        );
    }

    #[test]
    fn classify_ours_by_bundled_basename_at_any_path() {
        // A symlink into a differently-located bundle is still ours (basename
        // lpm-cli), so a moved app repoints rather than erroring.
        let moved = Path::new("/Users/x/Applications/lpm.app/Contents/MacOS/lpm-cli");
        assert_eq!(
            classify(true, true, Some(moved)),
            PathState::OurSymlink(moved.to_path_buf())
        );
    }

    #[test]
    fn status_strings() {
        assert_eq!(status_for(&PathState::Absent, &expected()), "not-installed");
        assert_eq!(
            status_for(&PathState::OurSymlink(expected()), &expected()),
            "installed"
        );
        assert_eq!(
            status_for(&PathState::Foreign, &expected()),
            "points-elsewhere"
        );
        assert_eq!(
            status_for(&PathState::ForeignSymlink(PathBuf::from("/x")), &expected()),
            "points-elsewhere"
        );
        // Ours but pointing at a stale bundle path.
        assert_eq!(
            status_for(
                &PathState::OurSymlink(PathBuf::from("/old/lpm.app/Contents/MacOS/lpm-cli")),
                &expected()
            ),
            "points-elsewhere"
        );
    }

    #[test]
    fn plan_create_when_absent() {
        assert!(matches!(
            plan_install(&PathState::Absent, &expected()),
            InstallPlan::Create
        ));
    }

    #[test]
    fn plan_noop_when_already_correct() {
        assert!(matches!(
            plan_install(&PathState::OurSymlink(expected()), &expected()),
            InstallPlan::AlreadyInstalled
        ));
    }

    #[test]
    fn plan_replace_when_ours_but_stale() {
        let stale = PathState::OurSymlink(PathBuf::from("/old/lpm.app/Contents/MacOS/lpm-cli"));
        assert!(matches!(
            plan_install(&stale, &expected()),
            InstallPlan::ReplaceOurs
        ));
    }

    #[test]
    fn plan_refuses_foreign_file() {
        assert!(matches!(
            plan_install(&PathState::Foreign, &expected()),
            InstallPlan::RefuseForeign(_)
        ));
    }

    #[test]
    fn plan_refuses_foreign_symlink() {
        assert!(matches!(
            plan_install(
                &PathState::ForeignSymlink(PathBuf::from("/usr/bin/other")),
                &expected()
            ),
            InstallPlan::RefuseForeign(_)
        ));
    }

    #[test]
    fn direct_symlink_roundtrips_in_tempdir() {
        // Exercises the create + replace paths without touching /usr/local/bin.
        let dir = tempfile::tempdir().unwrap();
        let link = dir.path().join("lpm");
        let target_a = dir.path().join("lpm-cli");
        std::fs::write(&target_a, b"a").unwrap();
        symlink_direct(&target_a, &link, false).unwrap();
        assert_eq!(std::fs::read_link(&link).unwrap(), target_a);
        assert_eq!(
            current_state(&link),
            PathState::OurSymlink(target_a.clone())
        );

        // Replace with a new target (idempotent re-point).
        let target_b = dir.path().join("nested").join("lpm-cli");
        std::fs::create_dir_all(target_b.parent().unwrap()).unwrap();
        std::fs::write(&target_b, b"b").unwrap();
        symlink_direct(&target_b, &link, true).unwrap();
        assert_eq!(std::fs::read_link(&link).unwrap(), target_b);
    }
}
