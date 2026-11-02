// Open at login: the OS starts lpm when the user logs in. The OS keeps the
// switch (macOS Login Items, the Windows Run key, an XDG autostart entry), so it
// is read back from there each time rather than mirrored in settings.json.
use serde::Serialize;

#[cfg(target_os = "macos")]
#[path = "loginitem_macos.rs"]
mod os;

#[cfg(windows)]
#[path = "loginitem_windows.rs"]
mod os;

#[cfg(any(test, target_os = "linux"))]
#[path = "loginitem_linux.rs"]
mod linux;

#[cfg(target_os = "linux")]
use self::linux as os;

#[derive(Serialize, Default, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoginItem {
    pub supported: bool,
    pub enabled: bool,
    /// macOS: added, but waiting for the user to allow it in System Settings.
    pub needs_approval: bool,
}

#[tauri::command(async)]
pub fn login_item_state() -> LoginItem {
    if !available() {
        return LoginItem::default();
    }
    os_state()
}

#[tauri::command(async)]
pub fn login_item_set(enabled: bool) -> Result<LoginItem, String> {
    if !available() {
        return Err("Open at login isn't available here.".into());
    }
    os_set(enabled)?;
    Ok(os_state())
}

// A fresh install opens at login. Release builds on the user's own data dir
// only: a dev build has no app bundle to register, and a second data dir is a
// throwaway copy of lpm.
pub fn enable_by_default() {
    if cfg!(debug_assertions) || crate::config::own_data_dir() || !available() {
        return;
    }
    std::thread::spawn(|| {
        let state = os_state();
        if !state.supported || state.enabled || state.needs_approval {
            return;
        }
        if let Err(e) = os_enable_by_default() {
            eprintln!("warning: couldn't turn on open at login: {e}");
        }
    });
}

// A headless host is started by its own service, never by a desktop login.
fn available() -> bool {
    cfg!(any(target_os = "macos", windows, target_os = "linux")) && !crate::sys::headless()
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn os_state() -> LoginItem {
    os::state()
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn os_set(enabled: bool) -> Result<(), String> {
    os::set(enabled)
}

#[cfg(target_os = "macos")]
fn os_enable_by_default() -> Result<(), String> {
    os::enable_by_default()
}

#[cfg(not(target_os = "macos"))]
fn os_enable_by_default() -> Result<(), String> {
    os_set(true)
}

#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
fn os_state() -> LoginItem {
    LoginItem::default()
}

#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
fn os_set(_enabled: bool) -> Result<(), String> {
    Err("Open at login isn't available here.".into())
}
