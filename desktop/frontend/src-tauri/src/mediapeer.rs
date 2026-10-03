//! Video preview for a file on a paired Mac. The `lpm-media://` handler asks
//! that Mac for whole blocks of the file, which mediacache.rs cuts the player's
//! ranges from, and the host answers from its own disk with the same reader and
//! chunk cap as a local file, so a clip of any size streams and seeks.

use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};
use tauri::http::StatusCode;
use tauri::{AppHandle, Manager, Runtime};

use crate::mediacache::{FetchBlock, Fetched, BLOCK};
use crate::mediaproto::{Chunk, Media};

/// Advertised in `ready` by a host that answers `MEDIA_RANGE_CMD`.
pub(crate) const MEDIA_RANGE_FEATURE: &str = "mediaRange";
pub(crate) const MEDIA_RANGE_CMD: &str = "media_read_range";

/// The slug and host path of a peer-marked path: `/@peer-<slug>/abs` or
/// `/@peer-<slug>~/rel`, whose `~` the host expands.
pub(crate) fn split_peer_path(value: &str) -> Option<(&str, &str)> {
    let rest = value.strip_prefix("/@peer-")?;
    let slug = rest.get(..8)?;
    let path = &rest[8..];
    let is_slug = slug
        .bytes()
        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
    (is_slug && (path.starts_with('/') || path.starts_with("~/"))).then_some((slug, path))
}

/// Host side: one range of a video for a paired Mac. Only the extensions the
/// local scheme serves are read, and a failure travels back as its HTTP status.
pub(crate) fn serve_host(args: &Value) -> Result<Value, String> {
    let path = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing path".to_string())?;
    let range = args.get("range").and_then(Value::as_str);
    let mtime = std::fs::metadata(crate::config::expand_home(path))
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);
    match crate::mediaproto::read(path, range) {
        Ok(Media::Bytes(c)) => Ok(json!({
            "len": c.len,
            "start": c.start,
            "end": c.end,
            "partial": c.partial,
            "mime": c.mime,
            "mtime": mtime,
            "data": B64.encode(&c.data),
        })),
        Ok(Media::Unsatisfiable(len)) => Ok(json!({ "len": len, "unsatisfiable": true })),
        Err(status) => Err(status.as_u16().to_string()),
    }
}

/// Client side: the range from the paired Mac, cut from blocks the cache
/// fetched (mediacache.rs). A host too old to answer, a dropped connection or a
/// malformed reply fail the request, and the player shows its own error.
pub(crate) fn fetch<R: Runtime>(
    app: &AppHandle<R>,
    slug: &str,
    host_path: &str,
    range: Option<&str>,
) -> Result<Media, StatusCode> {
    let hub = app.state::<crate::peerclient::PeerClientHub>();
    if !hub.supports_media_range(slug) {
        return Err(StatusCode::NOT_IMPLEMENTED);
    }
    let hub = hub.inner().clone();
    let key = (slug.to_string(), host_path.to_string());
    let (slug, host_path) = key.clone();
    let ask: Arc<dyn Fn(Option<String>) -> Result<Fetched, StatusCode> + Send + Sync> =
        Arc::new(move |range| {
            let reply = hub
                .invoke_in_run(
                    &slug,
                    MEDIA_RANGE_CMD,
                    json!({ "path": host_path, "range": range }),
                )
                .map_err(|e| {
                    e.parse::<u16>()
                        .ok()
                        .and_then(|code| StatusCode::from_u16(code).ok())
                        .unwrap_or(StatusCode::BAD_GATEWAY)
                })?;
            decode(&reply).ok_or(StatusCode::BAD_GATEWAY)
        });
    let Some(range) = range else {
        return ask(None).map(|f| f.media);
    };
    let blocks = ask.clone();
    let fetch: FetchBlock = Arc::new(move |n| {
        blocks(Some(format!(
            "bytes={}-{}",
            n * BLOCK,
            n * BLOCK + BLOCK - 1
        )))
    });
    match crate::mediacache::serve(&crate::mediacache::shared(), key, range, fetch) {
        // A file changing under the read isn't cut from blocks; the host answers
        // the range as it stands.
        Err(StatusCode::CONFLICT) => ask(Some(range.to_string())).map(|f| f.media),
        served => served,
    }
}

fn decode(reply: &Value) -> Option<Fetched> {
    let len = reply.get("len")?.as_u64()?;
    let stamp = reply.get("mtime").and_then(Value::as_u64);
    if reply.get("unsatisfiable").and_then(Value::as_bool) == Some(true) {
        return Some(Fetched {
            media: Media::Unsatisfiable(len),
            stamp,
        });
    }
    let media = Media::Bytes(Chunk {
        len,
        start: reply.get("start")?.as_u64()?,
        end: reply.get("end")?.as_u64()?,
        partial: reply.get("partial")?.as_bool()?,
        mime: reply.get("mime")?.as_str()?.to_string(),
        data: B64.decode(reply.get("data")?.as_str()?).ok()?,
    });
    Some(Fetched { media, stamp })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_absolute_and_home_paths() {
        assert_eq!(
            split_peer_path("/@peer-abcd1234/Users/dev/clip.mp4"),
            Some(("abcd1234", "/Users/dev/clip.mp4"))
        );
        assert_eq!(
            split_peer_path("/@peer-abcd1234~/Movies/clip.mp4"),
            Some(("abcd1234", "~/Movies/clip.mp4"))
        );
    }

    #[test]
    fn leaves_local_and_malformed_paths_alone() {
        assert_eq!(split_peer_path("/Users/dev/clip.mp4"), None);
        assert_eq!(split_peer_path("/@peer-ABCD1234/x.mp4"), None);
        assert_eq!(split_peer_path("/@peer-abcd123/x.mp4"), None);
        assert_eq!(split_peer_path("/@peer-abcd1234x.mp4"), None);
        assert_eq!(split_peer_path("/@peer-Ωbcd1234/x.mp4"), None);
    }

    fn clip(bytes: &[u8]) -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("clip.mp4");
        std::fs::write(&path, bytes).unwrap();
        (dir, path.to_string_lossy().into_owned())
    }

    #[test]
    fn a_host_reply_decodes_to_the_requested_range() {
        let (_dir, path) = clip(b"0123456789");
        let reply = serve_host(&json!({ "path": path, "range": "bytes=2-5" })).unwrap();
        let Some(Fetched {
            media: Media::Bytes(chunk),
            stamp: Some(_),
        }) = decode(&reply)
        else {
            panic!("expected bytes with the file's modification time");
        };
        assert_eq!((chunk.len, chunk.start, chunk.end), (10, 2, 5));
        assert!(chunk.partial);
        assert_eq!(chunk.mime, "video/mp4");
        assert_eq!(chunk.data, b"2345");
    }

    #[test]
    fn a_range_past_the_end_stays_unsatisfiable() {
        let (_dir, path) = clip(b"0123456789");
        let reply = serve_host(&json!({ "path": path, "range": "bytes=10-" })).unwrap();
        assert!(matches!(
            decode(&reply),
            Some(Fetched {
                media: Media::Unsatisfiable(10),
                ..
            })
        ));
    }

    #[test]
    fn the_host_refuses_what_the_local_scheme_would() {
        let dir = tempfile::tempdir().unwrap();
        let text = dir.path().join("notes.txt");
        std::fs::write(&text, "secret").unwrap();
        let err = serve_host(&json!({ "path": text.to_string_lossy(), "range": "bytes=0-" }));
        assert_eq!(err.unwrap_err(), "403");
        let missing = dir.path().join("gone.mp4");
        let err = serve_host(&json!({ "path": missing.to_string_lossy(), "range": null }));
        assert_eq!(err.unwrap_err(), "404");
    }
}
