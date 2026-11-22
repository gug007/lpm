// Starting the login helper (linkhelper.rs) at login, so lpm Link can open lpm
// while it's closed. macOS runs it as a launch agent in the person's own
// session, which is where `open` can start an app. Other systems say it isn't
// offered there yet.
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

/// Whether this machine can open lpm from a phone, and whether it's set up to.
pub(crate) fn state() -> Value {
    json!({ "supported": imp::SUPPORTED, "on": imp::installed() })
}

/// The helper's port for `ready` and `paired`, or null while it isn't set up.
pub(crate) fn advertised() -> Value {
    if !imp::installed() {
        return Value::Null;
    }
    let port = crate::remote::effective_port(crate::remotestore::load_config().port);
    json!(crate::linkhelper::launcher_port(port))
}

/// Removing lpm takes the login item with it, so launchd stops starting a
/// helper that is gone.
#[cfg(target_os = "macos")]
pub(crate) fn remove_for_uninstall() -> Result<(), String> {
    imp::uninstall()
}

#[tauri::command(async)]
pub fn remote_set_open_from_phone(
    app: AppHandle,
    hub: State<'_, crate::remote::RemoteHub>,
    enabled: bool,
) -> Result<Value, String> {
    if enabled {
        imp::install()?;
    } else {
        imp::uninstall()?;
    }
    let _ = app.emit("remote-devices-changed", ());
    Ok(crate::remote::state_value(&hub))
}

#[cfg(target_os = "macos")]
mod imp {
    use plist::{Dictionary, Value};
    use std::path::PathBuf;

    pub(super) const SUPPORTED: bool = true;

    fn label() -> &'static str {
        if crate::remotestore::is_dev_instance() {
            "cx.lpm.link-helper.dev"
        } else {
            "cx.lpm.link-helper"
        }
    }

    fn plist_path() -> Option<PathBuf> {
        dirs::home_dir().map(|home| {
            home.join("Library/LaunchAgents")
                .join(format!("{}.plist", label()))
        })
    }

    fn exe() -> Option<String> {
        std::env::current_exe()
            .ok()
            .map(|p| p.to_string_lossy().into_owned())
    }

    /// The agent, set up for this copy of lpm: an agent left by a copy that
    /// moved or was replaced points at a file that isn't this one.
    pub(super) fn installed() -> bool {
        let (Some(path), Some(exe)) = (plist_path(), exe()) else {
            return false;
        };
        let Ok(Value::Dictionary(dict)) = Value::from_file(path) else {
            return false;
        };
        dict.get("ProgramArguments")
            .and_then(Value::as_array)
            .and_then(|args| args.first())
            .and_then(Value::as_string)
            == Some(exe.as_str())
    }

    pub(super) fn agent(exe: &str, lpm_dir: Option<String>) -> Value {
        let mut dict = Dictionary::new();
        dict.insert("Label".into(), label().into());
        dict.insert(
            "ProgramArguments".into(),
            Value::Array(vec![exe.into(), crate::linkhelper::HELPER_ARG.into()]),
        );
        dict.insert("RunAtLoad".into(), true.into());
        dict.insert("KeepAlive".into(), true.into());
        dict.insert("ProcessType".into(), "Background".into());
        dict.insert("LimitLoadToSessionType".into(), "Aqua".into());
        if let Some(dir) = lpm_dir {
            let mut env = Dictionary::new();
            env.insert("LPM_DIR".into(), dir.into());
            dict.insert("EnvironmentVariables".into(), Value::Dictionary(env));
        }
        Value::Dictionary(dict)
    }

    fn domain() -> String {
        format!("gui/{}", unsafe { libc::getuid() })
    }

    fn launchctl(args: &[&str]) -> Result<(), String> {
        let out = crate::osproc::command("/bin/launchctl")
            .args(args)
            .output()
            .map_err(|e| format!("Couldn't run launchctl: {e}"))?;
        if out.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
        }
    }

    pub(super) fn install() -> Result<(), String> {
        let path = plist_path().ok_or("Couldn't find your home folder.")?;
        let exe = exe().ok_or("Couldn't find lpm's own file.")?;
        let lpm_dir = std::env::var(crate::config::DIR_ENV)
            .ok()
            .filter(|v| !v.is_empty());
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let _ = launchctl(&["bootout", &format!("{}/{}", domain(), label())]);
        agent(&exe, lpm_dir)
            .to_file_xml(&path)
            .map_err(|e| format!("Couldn't save the login item: {e}"))?;
        let path_text = path.to_string_lossy().into_owned();
        launchctl(&["bootstrap", &domain(), &path_text]).map_err(|e| {
            let _ = std::fs::remove_file(&path);
            format!("Couldn't start the login item: {e}")
        })
    }

    pub(super) fn uninstall() -> Result<(), String> {
        let _ = launchctl(&["bootout", &format!("{}/{}", domain(), label())]);
        match plist_path() {
            Some(path) if path.exists() => std::fs::remove_file(path).map_err(|e| e.to_string()),
            _ => Ok(()),
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub(super) const SUPPORTED: bool = false;

    pub(super) fn installed() -> bool {
        false
    }

    pub(super) fn install() -> Result<(), String> {
        Err(format!(
            "Opening lpm from a phone is only on macOS for now. Start lpm on this {} yourself.",
            crate::sys::MACHINE
        ))
    }

    pub(super) fn uninstall() -> Result<(), String> {
        Ok(())
    }
}

#[cfg(all(test, target_os = "macos"))]
#[path = "linkhelper_agent_tests.rs"]
mod tests;
