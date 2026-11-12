//! System notifications for work that finished while nobody was watching.
//!
//! The in-app badge and the chime both assume someone is at the machine. When
//! the window is behind something else — or the Mac is unattended entirely — a
//! banner is the only thing that survives until the user comes back, so agent
//! transitions and automation outcomes both route through here.

use crate::config;
use crate::notifychannels::{self, NotificationChannel, NotificationEvent};
use crate::sound::StatusSound;
use crate::statusbanner::Banner;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

/// Some window of the app is on screen and frontmost — someone is looking at it
/// right now, and the badge in the tab strip is notice enough. Detached terminal
/// windows count: a user watching one is as present as one at the main window.
/// No window at all (headless host, closed to the dock) is unattended. Windows,
/// not webview windows: a browser pane's webview takes the main window off that
/// list.
pub fn window_attended(app: &AppHandle) -> bool {
    app.windows()
        .values()
        .any(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
}

/// Linux banners go over D-Bus to the desktop's notification daemon; a headless
/// host has none, and its paired Mac and phone get the news instead.
fn can_show_banners() -> bool {
    !cfg!(all(unix, not(target_os = "macos"))) || !crate::sys::headless()
}

/// The gates a banner about `event` passes: it can be shown here, the user
/// wants that event's banners, and isn't already here.
pub fn should_notify(app: &AppHandle, event: NotificationEvent) -> bool {
    should_notify_in(app, event, &config::load_settings())
}

fn should_notify_in(app: &AppHandle, event: NotificationEvent, settings: &Value) -> bool {
    can_show_banners()
        && notifychannels::enabled_in(settings, event, NotificationChannel::Banner)
        && !window_attended(app)
}

pub fn notify(app: &AppHandle, title: &str, body: &str) {
    if !can_show_banners() {
        return;
    }
    #[cfg(windows)]
    register_toast_app_id(app);
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Windows shows a toast only for an AppUserModelID something registered. The
/// installer's Start-menu shortcut carries it; a portable or not-yet-installed
/// copy registers it under HKCU, with the name the toast's header shows. The
/// notification plugin sends the bundle identifier as that id.
#[cfg(windows)]
fn register_toast_app_id(app: &AppHandle) {
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        let wide = |s: &str| s.encode_utf16().chain([0]).collect::<Vec<u16>>();
        let subkey = wide(&format!(
            r"Software\Classes\AppUserModelId\{}",
            app.config().identifier
        ));
        let mut key: HKEY = std::ptr::null_mut();
        let created = unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                subkey.as_ptr(),
                0,
                std::ptr::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE,
                std::ptr::null(),
                &mut key,
                std::ptr::null_mut(),
            )
        };
        if created != 0 {
            return;
        }
        let name = wide("DisplayName");
        let value = wide(&app.package_info().name);
        unsafe {
            RegSetValueExW(
                key,
                name.as_ptr(),
                0,
                REG_SZ,
                value.as_ptr().cast(),
                (value.len() * 2) as u32,
            );
            RegCloseKey(key);
        }
    });
}

/// A banner the frontend asks for, under the notification event it names: a
/// scheduled prompt sent or missed while away, or a crashed service.
#[tauri::command(async)]
pub fn notify_unattended(app: AppHandle, title: String, body: String, event: String) {
    if NotificationEvent::of_id(&event).is_some_and(|event| should_notify(&app, event)) {
        notify(&app, &title, &body);
    }
}

/// One banner per status transition worth interrupting for, said the way
/// statusbanner.rs words it. `news` is asked for only once the banner will show.
pub fn notify_status(
    app: &AppHandle,
    event: NotificationEvent,
    settings: &Value,
    project: &str,
    pane_id: &str,
    news: &dyn Fn() -> StatusSound,
) {
    if !should_notify_in(app, event, settings) {
        return;
    }
    let news = news();
    let Some(banner) = Banner::of(&news) else {
        return;
    };
    notify(app, &banner.title, &banner.body);
    crate::bannerwithdraw::record(project, pane_id, &news.value, &banner);
}

/// The same banner for a transition on a paired host, which already resolved
/// what it wants said (an older host sends the bare status, or only names).
pub fn notify_status_named(app: &AppHandle, news: &StatusSound) {
    let Some(event) = NotificationEvent::of_status(&news.value) else {
        return;
    };
    if !should_notify(app, event) {
        return;
    }
    if let Some(banner) = Banner::of(news) {
        notify(app, &banner.title, &banner.body);
    }
}
