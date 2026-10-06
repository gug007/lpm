//! Streams local media files to the webview over the `lpm-media://` scheme.
//!
//! A `<video>` element seeks by asking for byte ranges, so its bytes can't
//! travel as a command result the way an image preview's base64 does — a
//! 48 MB clip would be held in memory several times over and still wouldn't
//! seek. This serves one bounded chunk per request instead, so peak memory is
//! a chunk regardless of file size. A file on a paired Mac is read there a
//! chunk at a time (`mediapeer`).

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::{AppHandle, Runtime, UriSchemeContext, UriSchemeResponder};

pub const SCHEME: &str = "lpm-media";

/// wry hands WKWebView the whole response body in one allocation, so this is a
/// memory ceiling rather than a tuning knob.
pub(crate) const MAX_CHUNK: u64 = 1024 * 1024;

/// A request with no `Range` has to be answered in full. Past this size we
/// answer the first chunk as a 206 and let the media loader range-request the
/// rest, rather than materialising the file.
const MAX_FULL_READ: u64 = 8 * MAX_CHUNK;

const ALLOWED_EXT: &[&str] = &["mp4", "m4v", "mov", "webm", "mkv", "avi", "ogv"];

/// Registered protocols attach to EVERY webview, including the in-pane browser
/// that loads arbitrary remote pages — so the handler answers only the webviews
/// that run our own frontend.
fn is_app_webview(label: &str) -> bool {
    label == "main" || label.starts_with("detached-")
}

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let label = ctx.webview_label().to_string();
    let app = ctx.app_handle().clone();
    // WKWebView calls the scheme handler on the main thread; seeking and
    // reading there would block the UI for the length of every chunk.
    std::thread::spawn(move || responder.respond(serve(&app, &label, &request)));
}

/// The bytes one request gets and where they sit in the file.
pub(crate) struct Chunk {
    pub len: u64,
    pub start: u64,
    pub end: u64,
    pub partial: bool,
    pub mime: String,
    pub data: Vec<u8>,
}

pub(crate) enum Media {
    Bytes(Chunk),
    /// The range starts past the end of a file this long.
    Unsatisfiable(u64),
}

fn empty(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("static response builds")
}

fn serve<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    if !is_app_webview(label) {
        return empty(StatusCode::FORBIDDEN);
    }
    serve_path(
        app,
        request.uri().path().trim_start_matches('/'),
        request.method() == Method::HEAD,
        request
            .headers()
            .get(header::RANGE)
            .and_then(|v| v.to_str().ok()),
    )
}

/// One media request, wherever it came in: `segment` is the absolute path as
/// one percent-encoded segment, the way the frontend sends it.
pub(crate) fn serve_path<R: Runtime>(
    app: &AppHandle<R>,
    segment: &str,
    head: bool,
    range: Option<&str>,
) -> Response<Vec<u8>> {
    let Ok(decoded) = urlencoding::decode(segment) else {
        return empty(StatusCode::BAD_REQUEST);
    };

    // WebKit's media loader ranges from the first byte and never sends HEAD, so
    // HEAD only answers a hand-written probe, which needs the length alone.
    let range = if head { Some("bytes=0-0") } else { range };
    let media = match crate::mediapeer::split_peer_path(&decoded) {
        Some((slug, host_path)) => crate::mediapeer::fetch(app, slug, host_path, range),
        None => read(&decoded, range),
    };
    respond(media, head)
}

/// What one media request asks for, from this machine's disk: the whole file
/// when it is small and no range was asked for, otherwise one chunk.
pub(crate) fn read(path: &str, range: Option<&str>) -> Result<Media, StatusCode> {
    let path = crate::config::expand_home(path);
    let path = Path::new(&path);

    let ext_ok = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| ALLOWED_EXT.contains(&e.to_ascii_lowercase().as_str()));
    if !ext_ok {
        return Err(StatusCode::FORBIDDEN);
    }

    // Checked before opening: opening a FIFO waits for a writer that may never come.
    let meta = std::fs::metadata(path).map_err(|_| StatusCode::NOT_FOUND)?;
    if !meta.is_file() {
        return Err(StatusCode::FORBIDDEN);
    }
    let mut file = File::open(path).map_err(|_| StatusCode::NOT_FOUND)?;
    let len = meta.len();

    let requested = range.map(|v| parse_range(v, len));
    let (start, end) = match requested {
        Some(Some(range)) => range,
        Some(None) => return Ok(Media::Unsatisfiable(len)),
        None if len <= MAX_FULL_READ => (0, len.saturating_sub(1)),
        None => (0, MAX_CHUNK.min(len).saturating_sub(1)),
    };

    let nbytes = end + 1 - start;
    let mut data = Vec::with_capacity(nbytes as usize);
    if file.seek(SeekFrom::Start(start)).is_err()
        || file.take(nbytes).read_to_end(&mut data).is_err()
    {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    let mime = mime_guess::from_path(path)
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    // A rangeless request for a file too big to send whole is still answered
    // partially — the media loader reads Content-Range and asks for the rest.
    let partial = requested.is_some() || nbytes < len;
    Ok(Media::Bytes(Chunk {
        len,
        start,
        end,
        partial,
        mime,
        data,
    }))
}

fn respond(media: Result<Media, StatusCode>, head: bool) -> Response<Vec<u8>> {
    let chunk = match media {
        Err(status) => return empty(status),
        Ok(Media::Unsatisfiable(len)) => {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{len}"))
                .body(Vec::new())
                .unwrap_or_else(|_| empty(StatusCode::INTERNAL_SERVER_ERROR));
        }
        Ok(Media::Bytes(chunk)) => chunk,
    };

    // wry sends no Content-Type of its own; without one the media engine has
    // nothing to dispatch on.
    let resp = Response::builder()
        .header(header::CONTENT_TYPE, &chunk.mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "content-range");
    if head {
        return resp
            .header(header::CONTENT_LENGTH, chunk.len)
            .body(Vec::new())
            .unwrap_or_else(|_| empty(StatusCode::INTERNAL_SERVER_ERROR));
    }

    // Content-Length is left to wry, which fills it from the body it is handed:
    // a value that disagrees with what is sent leaves WebKit waiting on bytes
    // that never arrive.
    let resp = if chunk.partial {
        resp.status(StatusCode::PARTIAL_CONTENT).header(
            header::CONTENT_RANGE,
            format!("bytes {}-{}/{}", chunk.start, chunk.end, chunk.len),
        )
    } else {
        resp.status(StatusCode::OK)
    };
    resp.body(chunk.data)
        .unwrap_or_else(|_| empty(StatusCode::INTERNAL_SERVER_ERROR))
}

/// Single-byte-range parse (`bytes=start-`, `bytes=start-end`, `bytes=-suffix`)
/// clamped to one chunk. `None` means unsatisfiable. Multipart ranges aren't
/// answered: media loaders never ask for them.
pub(crate) fn parse_range(header_value: &str, len: u64) -> Option<(u64, u64)> {
    if len == 0 {
        return None;
    }
    let spec = header_value.trim().strip_prefix("bytes=")?;
    let spec = spec.split(',').next()?.trim();
    let (from, to) = spec.split_once('-')?;

    let (start, end) = if from.is_empty() {
        let suffix: u64 = to.parse().ok()?;
        if suffix == 0 {
            return None;
        }
        (len.saturating_sub(suffix), len - 1)
    } else {
        let start: u64 = from.parse().ok()?;
        let end = if to.is_empty() {
            len - 1
        } else {
            to.parse::<u64>().ok()?.min(len - 1)
        };
        (start, end)
    };

    if start >= len || end < start {
        return None;
    }
    Some((start, start + (end - start).min(MAX_CHUNK - 1)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_open_ended_range() {
        assert_eq!(parse_range("bytes=0-", 100), Some((0, 99)));
        assert_eq!(parse_range("bytes=10-", 100), Some((10, 99)));
    }

    #[test]
    fn parses_closed_range_and_clamps_to_length() {
        assert_eq!(parse_range("bytes=0-49", 100), Some((0, 49)));
        assert_eq!(parse_range("bytes=50-999", 100), Some((50, 99)));
    }

    #[test]
    fn parses_suffix_range() {
        assert_eq!(parse_range("bytes=-20", 100), Some((80, 99)));
        assert_eq!(parse_range("bytes=-500", 100), Some((0, 99)));
    }

    #[test]
    fn caps_a_range_at_one_chunk() {
        let len = 8 * MAX_CHUNK;
        assert_eq!(parse_range("bytes=0-", len), Some((0, MAX_CHUNK - 1)));
    }

    #[test]
    fn rejects_unsatisfiable_ranges() {
        assert_eq!(parse_range("bytes=100-", 100), None);
        assert_eq!(parse_range("bytes=90-10", 100), None);
        assert_eq!(parse_range("bytes=-0", 100), None);
        assert_eq!(parse_range("bytes=0-", 0), None);
        assert_eq!(parse_range("items=0-", 100), None);
    }

    #[test]
    fn only_app_webviews_are_served() {
        assert!(is_app_webview("main"));
        assert!(is_app_webview("detached-lpm-1a2b3c4d"));
        assert!(!is_app_webview("browser-1"));
        assert!(!is_app_webview(""));
    }
}
