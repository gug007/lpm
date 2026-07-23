// "Remove app" in Settings — app self-removal. Cleans up everything lpm
// installed outside its own bundle (agent skills, the CLI symlink, Claude and
// Codex hooks, the status line), stops running projects, then hands off to a
// detached script that optionally deletes ~/.lpm and moves the .app to the
// Trash once this process has exited. Data removal happens post-exit so the
// shutdown handlers can't recreate files behind it.
use tauri::{AppHandle, State};

fn applescript_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// The detached post-exit script: wait for this pid to die, optionally delete
/// the data dir, then move the .app to the Trash via Finder.
fn cleanup_script(pid: u32, app_path: &str, data_dir: Option<&str>) -> String {
    let data_rm = data_dir
        .map(|d| format!("rm -rf {}; ", crate::updates::shell_quote(d)))
        .unwrap_or_default();
    let trash = format!(
        "osascript -e {}",
        crate::updates::shell_quote(&format!(
            "tell application \"Finder\" to delete POSIX file \"{}\"",
            applescript_escape(app_path)
        ))
    );
    format!("while kill -0 {pid} 2>/dev/null; do sleep 0.2; done; sleep 0.5; {data_rm}{trash}")
}

#[tauri::command(async)]
pub fn uninstall_app(
    app: AppHandle,
    state: State<'_, crate::services::ServiceState>,
    remove_data: bool,
) -> Result<(), String> {
    // No enclosing .app in dev — bail before touching anything.
    if crate::updates::current_version() == "dev" {
        return Err("Removing the app isn't available in development builds.".into());
    }
    let app_path = crate::updates::app_bundle_path()?;

    // Best-effort cleanup: a failed step (e.g. cancelled admin prompt for the
    // CLI symlink) must not leave the user with a half-working install, so the
    // removal proceeds regardless.
    let _ = crate::services::stop_all(app.clone(), state);
    let _ = crate::hooks::remove_agent_hooks_for_uninstall();
    let _ = crate::skill_install::remove_agent_skills();
    let _ = crate::cli_install::remove_managed_symlink();

    let data_dir = remove_data.then(|| crate::config::lpm_dir());
    let script = cleanup_script(
        std::process::id(),
        &app_path.to_string_lossy(),
        data_dir.as_ref().map(|d| d.to_string_lossy()).as_deref(),
    );
    crate::updates::spawn_detached_bash(&script)?;

    // Resolve the invoke first, then exit through the normal shutdown path so
    // tunnels, forwarders, and peer threads are torn down.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(600));
        app.exit(0);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_waits_then_trashes() {
        let s = cleanup_script(123, "/Applications/lpm.app", None);
        assert!(s.starts_with("while kill -0 123 2>/dev/null; do sleep 0.2; done;"));
        assert!(!s.contains("rm -rf"));
        assert!(s.contains(
            r#"'tell application "Finder" to delete POSIX file "/Applications/lpm.app"'"#
        ));
    }

    #[test]
    fn script_removes_data_dir_before_trashing() {
        let s = cleanup_script(1, "/Applications/lpm.app", Some("/Users/x/.lpm"));
        let rm = s.find("rm -rf '/Users/x/.lpm'").expect("data rm present");
        let trash = s.find("osascript").expect("trash present");
        assert!(rm < trash);
    }

    #[test]
    fn applescript_escape_quotes() {
        assert_eq!(applescript_escape(r#"a"b\c"#), r#"a\"b\\c"#);
    }
}
