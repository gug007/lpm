//! What a popup or app page asks of lpm from its own webview (`lpm.run`,
//! `lpm.refresh`): the page posts it to `lpm-page://localhost/<its id>`, which
//! answers only the popup webviews, and the card or tab that drew the page acts
//! on it in the main window. Answers go back into the page through
//! `popup_view_reply`. The id is only in the page's own bootstrap, so a frame
//! inside the page, or a site the page went on to, can't ask in its name.
use serde_json::Value;
use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::{Emitter, Runtime, UriSchemeContext, UriSchemeResponder};

pub const SCHEME: &str = "lpm-page";

const MAX_MESSAGE: usize = 64 * 1024;

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let label = ctx.webview_label();
    let status = match read(label, request.uri().path(), request.method(), request.body()) {
        Ok(message) => {
            let _ = ctx.app_handle().emit_to(
                "main",
                "popup-view-message",
                serde_json::json!({
                    "id": label.trim_start_matches(crate::popup_view::PREFIX),
                    "message": message,
                }),
            );
            StatusCode::NO_CONTENT
        }
        Err(status) => status,
    };
    let response = Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Vec::new());
    if let Ok(response) = response {
        responder.respond(response);
    }
}

/// The message a popup page posted to its own address, or why it's refused.
fn read(label: &str, path: &str, method: &Method, body: &[u8]) -> Result<Value, StatusCode> {
    let own = label.strip_prefix(crate::popup_view::PREFIX);
    if !crate::popup_view::is_popup_label(label) || own != Some(path.trim_start_matches('/')) {
        return Err(StatusCode::FORBIDDEN);
    }
    if method != Method::POST {
        return Err(StatusCode::METHOD_NOT_ALLOWED);
    }
    if body.len() > MAX_MESSAGE {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    match serde_json::from_slice::<Value>(body) {
        Ok(message) if message.is_object() => Ok(message),
        _ => Err(StatusCode::BAD_REQUEST),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RUN: &[u8] = br#"{"lpmRun":{"id":"1","action":"seed","inputs":{}}}"#;

    #[test]
    fn only_a_popup_page_is_heard() {
        assert!(read("popup-a1", "/a1", &Method::POST, RUN).is_ok());
        assert!(read("popup-tab-a1", "/tab-a1", &Method::POST, RUN).is_ok());
        assert_eq!(read("main", "/main", &Method::POST, RUN), Err(StatusCode::FORBIDDEN));
        assert_eq!(read("browser-3", "/browser-3", &Method::POST, RUN), Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn only_at_the_pages_own_address() {
        assert_eq!(read("popup-a1", "/", &Method::POST, RUN), Err(StatusCode::FORBIDDEN));
        assert_eq!(read("popup-a1", "/b2", &Method::POST, RUN), Err(StatusCode::FORBIDDEN));
        assert_eq!(read("popup-tab-a1", "/a1", &Method::POST, RUN), Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn a_message_is_one_posted_object() {
        assert_eq!(read("popup-a1", "/a1", &Method::GET, RUN), Err(StatusCode::METHOD_NOT_ALLOWED));
        assert_eq!(read("popup-a1", "/a1", &Method::POST, b"[1]"), Err(StatusCode::BAD_REQUEST));
        assert_eq!(read("popup-a1", "/a1", &Method::POST, b"run"), Err(StatusCode::BAD_REQUEST));
        let big = format!(r#"{{"x":"{}"}}"#, "a".repeat(MAX_MESSAGE));
        assert_eq!(
            read("popup-a1", "/a1", &Method::POST, big.as_bytes()),
            Err(StatusCode::PAYLOAD_TOO_LARGE)
        );
    }
}
