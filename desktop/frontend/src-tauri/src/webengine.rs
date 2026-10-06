// Engine-specific setup for the app's own webviews. WKWebView needs none; the
// WebKitGTK and WebView2 defaults below would otherwise blank the window or let
// browser shortcuts act on the app.

#[cfg(target_os = "linux")]
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "linux")]
const DMABUF_ENV: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";

#[cfg(target_os = "linux")]
static DMABUF_SET_HERE: AtomicBool = AtomicBool::new(false);

/// WebKitGTK's DMA-BUF renderer paints a blank window on the proprietary NVIDIA
/// driver. Must run before GTK starts, and never overrides the user's own value.
/// A headless host has no window to paint.
#[cfg(target_os = "linux")]
pub fn prepare_linux_env() {
    let nvidia = std::path::Path::new("/proc/driver/nvidia/version").exists();
    let user_set = std::env::var_os(DMABUF_ENV).is_some();
    if disable_dmabuf(user_set, nvidia, crate::sys::headless()) {
        std::env::set_var(DMABUF_ENV, "1");
        DMABUF_SET_HERE.store(true, Ordering::Relaxed);
    }
}

/// The variable lpm set for its own webviews, when it did: terminals, services
/// and the session daemon leave it out, so the user's programs (their own
/// WebKitGTK apps included) run as they would outside lpm.
#[cfg(target_os = "linux")]
pub fn app_only_env() -> Option<&'static str> {
    DMABUF_SET_HERE
        .load(Ordering::Relaxed)
        .then_some(DMABUF_ENV)
}

#[cfg(any(target_os = "linux", test))]
fn disable_dmabuf(user_set: bool, nvidia: bool, headless: bool) -> bool {
    nvidia && !user_set && !headless
}

/// WebView2 ships with browser accelerators on: F5/Ctrl+R reload the whole app,
/// Ctrl+P prints, Ctrl+F opens find, Ctrl+Shift+C opens DevTools. WebView2
/// applies this from the next navigation, so the frontend guards the first page
/// load itself (webviewGuards.ts).
///
/// It also asks the user before a page reads the clipboard, which a terminal's
/// Ctrl+Shift+V does; the app's own pages read it without that prompt.
#[cfg(windows)]
pub fn harden(win: &tauri::WebviewWindow) {
    crate::winfocus::attach(win);
    use tauri::Manager;
    let dev_url = if tauri::is_dev() {
        win.config().build.dev_url.clone()
    } else {
        None
    };
    let _ = win.with_webview(move |pv| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
        use windows_core::Interface;
        let Ok(core) = pv.controller().CoreWebView2() else {
            return;
        };
        if let Ok(settings) = core.Settings().and_then(|s| s.cast::<ICoreWebView2Settings3>()) {
            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
        }
        allow_app_clipboard_reads(&core, dev_url);
    });
}

#[cfg(windows)]
fn allow_app_clipboard_reads(
    core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    dev_url: Option<tauri::Url>,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    let handler = webview2_com::PermissionRequestedEventHandler::create(Box::new(
        move |_, args| unsafe {
            let Some(args) = args else {
                return Ok(());
            };
            let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
            args.PermissionKind(&mut kind)?;
            if kind != COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ {
                return Ok(());
            }
            let mut uri = windows_core::PWSTR::null();
            args.Uri(&mut uri)?;
            if is_app_origin(&webview2_com::take_pwstr(uri), dev_url.as_ref()) {
                args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
            }
            Ok(())
        },
    ));
    let mut token = 0i64;
    let _ = unsafe { core.add_PermissionRequested(&handler, &mut token) };
}

/// Whether `uri` belongs to the app's own pages: Tauri's asset host, or the dev
/// server in a dev build.
#[cfg(any(windows, test))]
fn is_app_origin(uri: &str, dev_url: Option<&tauri::Url>) -> bool {
    let Ok(origin) = tauri::Url::parse(uri).map(|u| u.origin()) else {
        return false;
    };
    ["http://tauri.localhost", "https://tauri.localhost"]
        .iter()
        .filter_map(|app| tauri::Url::parse(app).ok())
        .chain(dev_url.cloned())
        .any(|app| app.origin() == origin)
}

#[cfg(not(windows))]
pub fn harden(_win: &tauri::WebviewWindow) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dmabuf_is_disabled_only_on_nvidia_without_a_user_value() {
        assert!(disable_dmabuf(false, true, false));
        assert!(!disable_dmabuf(true, true, false));
        assert!(!disable_dmabuf(false, false, false));
        assert!(!disable_dmabuf(true, false, false));
    }

    #[test]
    fn a_headless_host_keeps_dmabuf() {
        assert!(!disable_dmabuf(false, true, true));
    }

    #[test]
    fn only_the_apps_own_pages_read_the_clipboard_unprompted() {
        assert!(is_app_origin("http://tauri.localhost/", None));
        assert!(is_app_origin("https://tauri.localhost/index.html", None));
        assert!(!is_app_origin("http://tauri.localhost.example.com/", None));
        assert!(!is_app_origin("https://example.com/", None));
        assert!(!is_app_origin("not a url", None));
        let dev = tauri::Url::parse("http://127.0.0.1:9245").unwrap();
        assert!(is_app_origin("http://127.0.0.1:9245/src/main.tsx", Some(&dev)));
        assert!(!is_app_origin("http://127.0.0.1:9246/", Some(&dev)));
        assert!(!is_app_origin("http://127.0.0.1:9245/", None));
    }
}
