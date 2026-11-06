//! Only the app's own windows may call lpm. A popup page and a site open in a
//! browser pane are child webviews of the main window, and Tauri would run
//! lpm's commands for any page there it counts as local (a frame from a custom
//! scheme such as `lpm-preview://`). Plugin commands are held to the same
//! webviews by `capabilities/default.json`.
use tauri::{ipc::Invoke, Runtime};

pub(crate) fn is_app_webview(label: &str) -> bool {
    label == "main" || label.starts_with("detached-") || label == crate::quicktermwin::LABEL
}

pub(crate) fn only_app_webviews<R: Runtime>(
    handler: impl Fn(Invoke<R>) -> bool + Send + Sync + 'static,
) -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    move |invoke| {
        if !is_app_webview(invoke.message.webview_ref().label()) {
            invoke.resolver.reject("lpm answers only its own windows");
            return true;
        }
        handler(invoke)
    }
}

#[cfg(test)]
mod tests {
    use super::is_app_webview;

    #[test]
    fn the_app_windows_are_app_webviews() {
        assert!(is_app_webview("main"));
        assert!(is_app_webview("detached-lpm-1a2b3c4d"));
        assert!(is_app_webview("quick-terminal"));
    }

    #[test]
    fn popups_and_browser_panes_are_not() {
        assert!(!is_app_webview("popup-1"));
        assert!(!is_app_webview("browser-3"));
        assert!(!is_app_webview("mainly"));
        assert!(!is_app_webview(""));
    }
}
