//! Serves an HTML file and the files it links over `lpm-preview://`, for the
//! file viewer's rendered view. The page sits in an iframe and loads its
//! stylesheets, scripts and images by relative URL, so it needs an origin to
//! resolve them against, and one that isn't the app's.
//!
//! A previewed page runs its own scripts, so it reaches only the folder it was
//! opened from, the way a browser keeps a local page to its folder: each
//! preview registers that folder under a random token, and a path that leaves
//! it is refused.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime, UriSchemeContext, UriSchemeResponder};

pub const SCHEME: &str = "lpm-preview";

/// Folders open to previews at once; the least recently opened goes first.
const MAX_ROOTS: usize = 32;

/// wry hands the webview a response body in one allocation.
const MAX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Default)]
pub struct PreviewRoots(Mutex<VecDeque<(String, PathBuf)>>);

impl PreviewRoots {
    fn token_for(&self, dir: PathBuf) -> String {
        let mut roots = self.0.lock().unwrap();
        if let Some(i) = roots.iter().position(|(_, d)| *d == dir) {
            let entry = roots.remove(i).expect("position is in range");
            let token = entry.0.clone();
            roots.push_back(entry);
            return token;
        }
        let token = uuid::Uuid::new_v4().simple().to_string();
        if roots.len() == MAX_ROOTS {
            roots.pop_front();
        }
        roots.push_back((token.clone(), dir));
        token
    }

    fn root(&self, token: &str) -> Option<PathBuf> {
        let roots = self.0.lock().unwrap();
        roots.iter().find(|(t, _)| t == token).map(|(_, d)| d.clone())
    }
}

/// The token an HTML file's folder is served under, or `None` for a file this
/// machine doesn't hold (an SSH project's, a paired computer's), which the
/// viewer renders from its text instead.
#[tauri::command(async)]
pub fn html_preview_root(app: AppHandle, path: String) -> Option<String> {
    if crate::mediapeer::split_peer_path(&path).is_some() {
        return None;
    }
    let file = PathBuf::from(crate::config::expand_home(&path));
    let dir = file.parent()?;
    if crate::sshexec::remote_project_for_path(&dir.to_string_lossy()).is_some() {
        return None;
    }
    let dir = dir.canonicalize().ok()?;
    Some(app.state::<PreviewRoots>().token_for(dir))
}

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let label = ctx.webview_label().to_string();
    let app = ctx.app_handle().clone();
    // WKWebView calls the scheme handler on the main thread.
    std::thread::spawn(move || responder.respond(serve(&app, &label, request.uri().path())));
}

fn empty(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("static response builds")
}

fn serve<R: Runtime>(app: &AppHandle<R>, label: &str, path: &str) -> Response<Vec<u8>> {
    if !crate::mediaproto::is_app_webview(label) {
        return empty(StatusCode::FORBIDDEN);
    }
    let path = path.trim_start_matches('/');
    let (token, rel) = path.split_once('/').unwrap_or((path, ""));
    let Some(root) = app.state::<PreviewRoots>().root(token) else {
        return empty(StatusCode::NOT_FOUND);
    };
    let Ok(rel) = urlencoding::decode(rel) else {
        return empty(StatusCode::BAD_REQUEST);
    };
    match read(&root, &rel) {
        // No caching, so a page reloaded after the file changed shows the change.
        Ok((bytes, mime)) => Response::builder()
            .header(header::CONTENT_TYPE, mime)
            .header(header::CACHE_CONTROL, "no-store")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(bytes)
            .unwrap_or_else(|_| empty(StatusCode::INTERNAL_SERVER_ERROR)),
        Err(status) => empty(status),
    }
}

/// A file under `root` (canonical) and its type; a folder answers with its
/// `index.html`. Resolved through symlinks before the check, so neither `..`
/// nor a link reaches outside.
fn read(root: &Path, rel: &str) -> Result<(Vec<u8>, String), StatusCode> {
    let mut path = root.join(rel);
    if path.is_dir() {
        path.push("index.html");
    }
    let path = path.canonicalize().map_err(|_| StatusCode::NOT_FOUND)?;
    if !path.starts_with(root) {
        return Err(StatusCode::FORBIDDEN);
    }
    // Checked before opening: opening a FIFO waits for a writer that may never come.
    let meta = std::fs::metadata(&path).map_err(|_| StatusCode::NOT_FOUND)?;
    if !meta.is_file() {
        return Err(StatusCode::FORBIDDEN);
    }
    if meta.len() > MAX_BYTES {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    let bytes = std::fs::read(&path).map_err(|_| StatusCode::NOT_FOUND)?;
    Ok((bytes, content_type(&path)))
}

/// WebKit reads text with no charset, from a page that names none, as Latin-1.
fn content_type(path: &Path) -> String {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let essence = mime.essence_str();
    if essence.starts_with("text/") || essence.ends_with("/javascript") {
        format!("{essence}; charset=utf-8")
    } else {
        essence.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn site() -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("site");
        std::fs::create_dir_all(root.join("css")).unwrap();
        std::fs::write(root.join("index.html"), "<h1>hi</h1>").unwrap();
        std::fs::write(root.join("css/app.css"), "h1{}").unwrap();
        std::fs::write(tmp.path().join("secret.txt"), "key").unwrap();
        let root = root.canonicalize().unwrap();
        (tmp, root)
    }

    #[test]
    fn serves_files_under_the_root_with_their_type() {
        let (_tmp, root) = site();
        let (bytes, mime) = read(&root, "css/app.css").unwrap();
        assert_eq!(bytes, b"h1{}");
        assert_eq!(mime, "text/css; charset=utf-8");
    }

    #[test]
    fn a_folder_answers_with_its_index() {
        let (_tmp, root) = site();
        let (bytes, mime) = read(&root, "").unwrap();
        assert_eq!(bytes, b"<h1>hi</h1>");
        assert_eq!(mime, "text/html; charset=utf-8");
    }

    #[test]
    fn refuses_paths_outside_the_root() {
        let (_tmp, root) = site();
        assert_eq!(read(&root, "../secret.txt"), Err(StatusCode::FORBIDDEN));
        let outside = root.parent().unwrap().join("secret.txt");
        assert_eq!(
            read(&root, &outside.to_string_lossy()),
            Err(StatusCode::FORBIDDEN)
        );
        assert_eq!(read(&root, "missing.js"), Err(StatusCode::NOT_FOUND));
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_link_out_of_the_root() {
        let (_tmp, root) = site();
        let outside = root.parent().unwrap().join("secret.txt");
        std::os::unix::fs::symlink(&outside, root.join("leak.txt")).unwrap();
        assert_eq!(read(&root, "leak.txt"), Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn a_folder_keeps_its_token_and_the_oldest_goes_first() {
        let roots = PreviewRoots::default();
        let first = roots.token_for(PathBuf::from("/a"));
        assert_eq!(roots.token_for(PathBuf::from("/a")), first);
        for i in 0..MAX_ROOTS {
            roots.token_for(PathBuf::from(format!("/b{i}")));
        }
        assert_eq!(roots.root(&first), None);
    }
}
