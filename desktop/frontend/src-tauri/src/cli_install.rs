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

/// First `lpm` executable in PATH order, or None. `dirs` is in shell-resolution
/// order. `is_file()` follows symlinks, so a dangling symlink — which the shell
/// skips during exec resolution — does not count as a hit.
fn first_lpm_in(dirs: &[String]) -> Option<PathBuf> {
    dirs.iter().map(|d| Path::new(d).join(LINK_NAME)).find(|p| p.is_file())
}

/// When our symlink alone reads as "installed", check whether an earlier `lpm`
/// on the user's shell PATH shadows it. Returns the shadowing path when the first
/// `lpm` in PATH order exists and is not our link.
fn shadowed_by(state: &PathState, expected: &Path, dirs: &[String]) -> Option<PathBuf> {
    if status_for(state, expected) != "installed" {
        return None;
    }
    match first_lpm_in(dirs) {
        Some(hit) if hit != link_path() => Some(hit),
        _ => None,
    }
}

/// Parse `lpm --version` output ("lpm X.Y.Z") down to "X.Y.Z". Falls back to the
/// trimmed raw output when it doesn't match the expected shape.
fn parse_cli_version(raw: &str) -> String {
    let trimmed = raw.trim();
    trimmed
        .strip_prefix("lpm ")
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or(trimmed)
        .to_string()
}

/// Run the on-PATH CLI binary and read its reported version, or None when it
/// can't be executed. `bin` is the executable to run.
fn read_cli_version(bin: &Path) -> Option<String> {
    let out = std::process::Command::new(bin).arg("--version").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    let v = parse_cli_version(&raw);
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

/// Which binary to probe for the version: the installed link when it's the one
/// the shell would run, else the bundled sidecar.
fn version_probe_bin(status: &str, expected: &Path) -> PathBuf {
    match status {
        "installed" | "shadowed" => link_path(),
        _ => expected.to_path_buf(),
    }
}

fn status_value(state: &PathState, expected: &Path) -> Value {
    let mut value = status_value_in(state, expected, &crate::sys::shell_path_dirs());
    let status = value["status"].as_str().unwrap_or_default().to_string();
    let version = read_cli_version(&version_probe_bin(&status, expected));
    value["cliVersion"] = json!(version);
    value
}

/// Testable core of `status_value`: `dirs` is the shell-resolution-order PATH.
fn status_value_in(state: &PathState, expected: &Path, dirs: &[String]) -> Value {
    let mut status = status_for(state, expected);
    let target = match state {
        PathState::OurSymlink(t) | PathState::ForeignSymlink(t) => {
            Some(t.to_string_lossy().into_owned())
        }
        _ => None,
    };
    let shadowed = shadowed_by(state, expected, dirs);
    if shadowed.is_some() {
        status = "shadowed";
    }
    json!({
        "status": status,
        "linkPath": link_path().to_string_lossy(),
        "expected": expected.to_string_lossy(),
        "target": target,
        "shadowedBy": shadowed.map(|p| p.to_string_lossy().into_owned()),
    })
}

fn repair_at(expected: &Path, link: &Path) {
    if let InstallPlan::ReplaceOurs = plan_install(&current_state(link), expected) {
        let _ = symlink_direct(expected, link, true);
    }
}

/// Startup repair: silently repoint our own stale symlink (app moved/renamed).
/// Never creates a fresh link, never touches foreign occupants, and never
/// escalates — an admin prompt must not appear spontaneously at launch. Failures
/// are left for the Settings install button.
pub fn repair_symlink_quietly() {
    let Ok(expected) = bundled_cli_path() else {
        return;
    };
    repair_at(&expected, &link_path());
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

    #[test]
    fn repair_repoints_our_stale_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let link = dir.path().join("lpm");
        let stale = dir.path().join("old").join("lpm-cli");
        std::fs::create_dir_all(stale.parent().unwrap()).unwrap();
        std::fs::write(&stale, b"old").unwrap();
        symlink_direct(&stale, &link, false).unwrap();

        let expected = dir.path().join("new").join("lpm-cli");
        std::fs::create_dir_all(expected.parent().unwrap()).unwrap();
        std::fs::write(&expected, b"new").unwrap();
        repair_at(&expected, &link);
        assert_eq!(std::fs::read_link(&link).unwrap(), expected);
    }

    #[test]
    fn repair_leaves_absent_path_absent() {
        let dir = tempfile::tempdir().unwrap();
        let link = dir.path().join("lpm");
        let expected = dir.path().join("lpm-cli");
        std::fs::write(&expected, b"x").unwrap();
        repair_at(&expected, &link);
        assert!(std::fs::symlink_metadata(&link).is_err());
    }

    #[test]
    fn parse_cli_version_strips_prefix() {
        assert_eq!(parse_cli_version("lpm 0.4.100\n"), "0.4.100");
        assert_eq!(parse_cli_version("  lpm 1.2.3  "), "1.2.3");
    }

    #[test]
    fn parse_cli_version_falls_back_to_raw() {
        assert_eq!(parse_cli_version("weird-output"), "weird-output");
        assert_eq!(parse_cli_version("lpm-cli 2.0.0"), "lpm-cli 2.0.0");
    }

    #[test]
    fn version_probe_bin_picks_link_when_installed() {
        assert_eq!(version_probe_bin("installed", &expected()), link_path());
        assert_eq!(version_probe_bin("shadowed", &expected()), link_path());
        assert_eq!(version_probe_bin("points-elsewhere", &expected()), expected());
    }

    #[test]
    fn first_lpm_none_for_empty_dirs() {
        assert_eq!(first_lpm_in(&[]), None);
    }

    #[test]
    fn first_lpm_finds_earliest_executable() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a");
        let b = dir.path().join("b");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        std::fs::write(a.join("lpm"), b"x").unwrap();
        std::fs::write(b.join("lpm"), b"y").unwrap();
        let dirs = vec![
            a.to_string_lossy().into_owned(),
            b.to_string_lossy().into_owned(),
        ];
        assert_eq!(first_lpm_in(&dirs), Some(a.join("lpm")));
    }

    #[test]
    fn first_lpm_skips_dangling_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let early = dir.path().join("early");
        std::fs::create_dir_all(&early).unwrap();
        std::os::unix::fs::symlink(dir.path().join("missing"), early.join("lpm")).unwrap();
        let dirs = vec![early.to_string_lossy().into_owned()];
        // Dangling link: is_file() follows and finds nothing, matching the shell.
        assert_eq!(first_lpm_in(&dirs), None);
    }

    #[test]
    fn shadowed_when_earlier_dir_has_lpm() {
        let dir = tempfile::tempdir().unwrap();
        let early = dir.path().join("early");
        std::fs::create_dir_all(&early).unwrap();
        let shadow = early.join("lpm");
        std::fs::write(&shadow, b"stale").unwrap();
        let dirs = vec![early.to_string_lossy().into_owned()];
        let state = PathState::OurSymlink(expected());
        assert_eq!(
            shadowed_by(&state, &expected(), &dirs),
            Some(shadow.clone())
        );
        let v = status_value_in(&state, &expected(), &dirs);
        assert_eq!(v["status"], "shadowed");
        assert_eq!(v["shadowedBy"], shadow.to_string_lossy().into_owned());
    }

    #[test]
    fn not_shadowed_when_first_hit_is_link_path() {
        // The only PATH dir is INSTALL_DIR, so the sole `lpm` reachable is our own
        // link_path() (or none) — never a shadowing binary.
        let dirs = vec![INSTALL_DIR.to_string()];
        let state = PathState::OurSymlink(expected());
        assert_eq!(shadowed_by(&state, &expected(), &dirs), None);
        assert_eq!(status_value_in(&state, &expected(), &dirs)["status"], "installed");
    }

    #[test]
    fn not_shadowed_when_not_installed() {
        let dir = tempfile::tempdir().unwrap();
        let early = dir.path().join("early");
        std::fs::create_dir_all(&early).unwrap();
        std::fs::write(early.join("lpm"), b"stale").unwrap();
        let dirs = vec![early.to_string_lossy().into_owned()];
        // Symlink absent → "not-installed" → shadow check does not apply.
        assert_eq!(shadowed_by(&PathState::Absent, &expected(), &dirs), None);
        let v = status_value_in(&PathState::Absent, &expected(), &dirs);
        assert_eq!(v["status"], "not-installed");
        assert!(v["shadowedBy"].is_null());
    }

    #[test]
    fn repair_leaves_foreign_file_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let link = dir.path().join("lpm");
        std::fs::write(&link, b"foreign").unwrap();
        let expected = dir.path().join("lpm-cli");
        std::fs::write(&expected, b"x").unwrap();
        repair_at(&expected, &link);
        assert_eq!(std::fs::read(&link).unwrap(), b"foreign");
    }
}
