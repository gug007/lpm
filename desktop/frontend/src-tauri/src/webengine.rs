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
#[cfg(windows)]
pub fn harden(win: &tauri::WebviewWindow) {
    let _ = win.with_webview(|pv| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
        use windows_core::Interface;
        let Ok(core) = pv.controller().CoreWebView2() else {
            return;
        };
        let Ok(settings) = core.Settings() else {
            return;
        };
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
        }
    });
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
}
