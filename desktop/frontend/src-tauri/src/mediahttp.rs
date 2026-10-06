//! Video preview on Linux. WebKitGTK's GStreamer player only streams http(s),
//! blob and data sources, never an app-registered scheme, so a `<video>` can't
//! load `lpm-media://`. The same handler is served over loopback HTTP instead,
//! under a random per-run token so no other page or local user can guess a URL.

use tauri::AppHandle;

/// `http://127.0.0.1:<port>/<token>`; the media path follows as one
/// percent-encoded segment. Starts the listener on first use.
#[tauri::command(async)]
pub fn media_http_base(app: AppHandle) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        static BASE: std::sync::OnceLock<Result<String, String>> = std::sync::OnceLock::new();
        BASE.get_or_init(|| server::start(app)).clone()
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        Err("video streams through the lpm-media scheme here".into())
    }
}

#[cfg(target_os = "linux")]
mod server {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::time::Duration;

    use tauri::http::Response;
    use tauri::AppHandle;

    /// A request head is a request line and a few headers; anything longer isn't
    /// a media loader.
    const MAX_HEAD: u64 = 16 * 1024;

    pub(super) fn start(app: AppHandle) -> Result<String, String> {
        let listener =
            TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("media server: {e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("media server: {e}"))?
            .port();
        let mut raw = [0u8; 16];
        getrandom::fill(&mut raw).map_err(|e| format!("media server: {e}"))?;
        let token = hex::encode(raw);
        let prefix = format!("/{token}/");
        std::thread::Builder::new()
            .name("media-http".into())
            .spawn(move || {
                for stream in listener.incoming().flatten() {
                    let app = app.clone();
                    let prefix = prefix.clone();
                    std::thread::spawn(move || serve(&app, &prefix, stream));
                }
            })
            .map_err(|e| format!("media server: {e}"))?;
        Ok(format!("http://127.0.0.1:{port}/{token}"))
    }

    struct Head {
        method: String,
        target: String,
        range: Option<String>,
    }

    fn read_head(stream: &TcpStream) -> Option<Head> {
        let mut reader = BufReader::new(stream.take(MAX_HEAD));
        let mut line = String::new();
        reader.read_line(&mut line).ok()?;
        let mut parts = line.split_whitespace();
        let method = parts.next()?.to_string();
        let target = parts.next()?.to_string();
        let mut range = None;
        loop {
            let mut header = String::new();
            if reader.read_line(&mut header).ok()? == 0 {
                return None;
            }
            let header = header.trim_end();
            if header.is_empty() {
                break;
            }
            if let Some((name, value)) = header.split_once(':') {
                if name.trim().eq_ignore_ascii_case("range") {
                    range = Some(value.trim().to_string());
                }
            }
        }
        Some(Head {
            method,
            target,
            range,
        })
    }

    fn serve(app: &AppHandle, prefix: &str, mut stream: TcpStream) {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
        let Some(head) = read_head(&stream) else {
            return;
        };
        let is_head = head.method == "HEAD";
        let response = match head.target.strip_prefix(prefix) {
            Some(segment) if is_head || head.method == "GET" => {
                crate::mediaproto::serve_path(app, segment, is_head, head.range.as_deref())
            }
            _ => {
                let _ = stream.write_all(
                    b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                );
                return;
            }
        };
        let _ = write_response(&mut stream, &response, is_head);
    }

    fn write_response(
        stream: &mut TcpStream,
        response: &Response<Vec<u8>>,
        head: bool,
    ) -> std::io::Result<()> {
        let status = response.status();
        let mut out = format!(
            "HTTP/1.1 {} {}\r\n",
            status.as_u16(),
            status.canonical_reason().unwrap_or("")
        );
        for (name, value) in response.headers() {
            if let Ok(value) = value.to_str() {
                out.push_str(&format!("{name}: {value}\r\n"));
            }
        }
        // A HEAD answer already says how long the file is.
        if !head {
            out.push_str(&format!("Content-Length: {}\r\n", response.body().len()));
        }
        out.push_str("Connection: close\r\n\r\n");
        stream.write_all(out.as_bytes())?;
        if !head {
            stream.write_all(response.body())?;
        }
        stream.flush()
    }
}
