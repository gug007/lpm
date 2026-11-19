//! `lpm://join?i=<invite>`, the link lpm.cx's join page opens: a shared tab's
//! invite, handed to the main window's Join dialog. Nothing joins by itself;
//! the person clicks Join there, and the host still lets them in.
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Url};
use tauri_plugin_deep_link::DeepLinkExt;

/// Tells the main window a join link is waiting (take_share_join_link).
pub const EVENT: &str = "share-join-link";

// Longer than any invite lpm hands out, short enough to refuse junk.
const MAX_PAYLOAD: usize = 4096;

// Held until the window takes it: a link that launched lpm arrives before the
// page is listening.
static PENDING: Mutex<Option<String>> = Mutex::new(None);

pub fn init(app: &AppHandle) {
    if crate::sys::headless() {
        return;
    }
    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        let urls = event.urls();
        receive(&handle, &urls);
        crate::openlink::receive(&handle, &urls);
    });
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        receive(app, &urls);
        crate::openlink::receive(app, &urls);
    }
    // An AppImage has no installer to register the scheme.
    #[cfg(target_os = "linux")]
    if std::env::var_os("APPIMAGE").is_some() {
        if let Err(e) = app.deep_link().register_all() {
            eprintln!("warning: couldn't register lpm:// links: {e}");
        }
    }
}

fn receive(app: &AppHandle, urls: &[Url]) {
    let Some(payload) = urls.iter().find_map(join_payload) else {
        return;
    };
    *PENDING.lock().unwrap() = Some(payload);
    crate::lifecycle::show_main(app);
    let _ = app.emit(EVENT, ());
}

/// The invite's payload (unpadded base64url) in a join link; None for any
/// other URL.
fn join_payload(url: &Url) -> Option<String> {
    if url.scheme() != "lpm" || url.host_str() != Some("join") {
        return None;
    }
    let (_, payload) = url.query_pairs().find(|(k, _)| k == "i")?;
    let ok = !payload.is_empty()
        && payload.len() <= MAX_PAYLOAD
        && payload
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    ok.then(|| payload.into_owned())
}

/// The waiting join link as an invite (`lpm-share:…`), once.
#[tauri::command]
pub fn take_share_join_link() -> Option<String> {
    PENDING
        .lock()
        .unwrap()
        .take()
        .map(|payload| format!("lpm-share:{payload}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(s: &str) -> Option<String> {
        join_payload(&Url::parse(s).unwrap())
    }

    #[test]
    fn a_join_link_carries_its_invite() {
        assert_eq!(payload("lpm://join?i=eyJ2Ijox_-9").as_deref(), Some("eyJ2Ijox_-9"));
        assert_eq!(payload("lpm://join/?x=1&i=abc").as_deref(), Some("abc"));
    }

    #[test]
    fn anything_else_is_ignored() {
        assert_eq!(payload("lpm://pair?p=8765&c=AB12"), None);
        assert_eq!(payload("lpm://join?invite=abc"), None);
        assert_eq!(payload("lpm://join?i="), None);
        assert_eq!(payload("lpm://join?i=a%20b"), None);
        assert_eq!(payload("lpm://join?i=<script>"), None);
        assert_eq!(payload("https://lpm.cx/join?i=abc"), None);
        assert_eq!(payload(&format!("lpm://join?i={}", "a".repeat(MAX_PAYLOAD + 1))), None);
    }
}
