//! Recording control for lesson videos. WKWebView has no WebDriver on macOS,
//! so a debug build pointed at `LPM_LESSON_SOCKET` serves a line-per-request
//! Unix socket that runs JavaScript in the main webview and places the window
//! where the screen recorder expects it. Never compiled into release builds'
//! behaviour: `socket()` is `None` there whatever the environment says.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, State, WebviewWindow};

pub const SOCKET_ENV: &str = "LPM_LESSON_SOCKET";

type Writer = Arc<Mutex<UnixStream>>;

#[derive(Default)]
pub struct LessonState {
    pending: Mutex<HashMap<u64, Writer>>,
}

pub fn socket() -> Option<String> {
    if !cfg!(debug_assertions) {
        return None;
    }
    std::env::var(SOCKET_ENV).ok().filter(|s| !s.is_empty())
}

pub fn active() -> bool {
    socket().is_some()
}

pub fn start(app: AppHandle) {
    let Some(path) = socket() else { return };
    let _ = std::fs::remove_file(&path);
    let listener = match UnixListener::bind(&path) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("warning: lesson control socket {path}: {e}");
            return;
        }
    };
    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    std::thread::spawn(move || {
        for conn in listener.incoming().flatten() {
            let app = app.clone();
            std::thread::spawn(move || serve(conn, app));
        }
    });
}

fn serve(conn: UnixStream, app: AppHandle) {
    let writer: Writer = match conn.try_clone() {
        Ok(w) => Arc::new(Mutex::new(w)),
        Err(_) => return,
    };
    for line in BufReader::new(conn).lines().map_while(Result::ok) {
        let req: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                reply(&writer, 0, false, json!(format!("bad request: {e}")));
                continue;
            }
        };
        let id = req["id"].as_u64().unwrap_or(0);
        let op = req["op"].as_str().unwrap_or("");
        if op == "eval" {
            let js = req["js"].as_str().unwrap_or("").to_string();
            let state = app.state::<LessonState>();
            state.pending.lock().unwrap().insert(id, writer.clone());
            if let Err(e) = eval(&app, id, &js) {
                state.pending.lock().unwrap().remove(&id);
                reply(&writer, id, false, json!(e));
            }
            continue;
        }
        match handle(&app, op, &req) {
            Ok(v) => reply(&writer, id, true, v),
            Err(e) => reply(&writer, id, false, json!(e)),
        }
    }
}

fn reply(writer: &Writer, id: u64, ok: bool, value: Value) {
    if let Ok(mut w) = writer.lock() {
        let _ = writeln!(w, "{}", json!({ "id": id, "ok": ok, "value": value }));
    }
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "no main window".to_string())
}

// The script runs as an async function body so a beat can `await`; whatever it
// returns comes back through the `lesson_reply` command as JSON text.
fn eval(app: &AppHandle, id: u64, js: &str) -> Result<(), String> {
    let win = main_window(app)?;
    let wrapped = format!(
        r#"(async () => {{
  const __reply = (ok, value) => window.__TAURI_INTERNALS__.invoke("lesson_reply", {{ id: {id}, ok, value }});
  try {{
    const __v = await (async () => {{ {js} }})();
    __reply(true, JSON.stringify(__v === undefined ? null : __v));
  }} catch (e) {{
    __reply(false, e && e.message ? `${{e.name}}: ${{e.message}}\n${{e.stack || ""}}` : String(e));
  }}
}})();"#
    );
    win.eval(&wrapped).map_err(|e| e.to_string())
}

fn handle(app: &AppHandle, op: &str, req: &Value) -> Result<Value, String> {
    match op {
        "ping" => Ok(json!("pong")),
        "bounds" => bounds(&main_window(app)?),
        "window" => {
            let win = main_window(app)?;
            let num = |k: &str| req[k].as_f64();
            if let (Some(w), Some(h)) = (num("w"), num("h")) {
                win.set_size(LogicalSize::new(w, h))
                    .map_err(|e| e.to_string())?;
            }
            if let (Some(x), Some(y)) = (num("x"), num("y")) {
                win.set_position(LogicalPosition::new(x, y))
                    .map_err(|e| e.to_string())?;
            }
            // Centred, a native open panel (which centres itself on the
            // display) lands inside the captured window.
            if req["center"].as_bool() == Some(true) {
                win.center().map_err(|e| e.to_string())?;
            }
            if let Some(top) = req["top"].as_bool() {
                win.set_always_on_top(top).map_err(|e| e.to_string())?;
            }
            if req["focus"].as_bool() == Some(true) {
                let _ = win.unminimize();
                win.show().map_err(|e| e.to_string())?;
                win.set_focus().map_err(|e| e.to_string())?;
            }
            bounds(&win)
        }
        "show" => main_window(app)?
            .show()
            .map(|_| json!(true))
            .map_err(|e| e.to_string()),
        "hide" => main_window(app)?
            .hide()
            .map(|_| json!(true))
            .map_err(|e| e.to_string()),
        "quit" => {
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(50));
                app.exit(0);
            });
            Ok(json!(true))
        }
        other => Err(format!("unknown op {other:?}")),
    }
}

// Physical pixels, the units a screen recorder crops in, plus the scale so a
// caller can convert the window's CSS coordinates.
fn bounds(win: &WebviewWindow) -> Result<Value, String> {
    let pos = win.inner_position().map_err(|e| e.to_string())?;
    let size = win.inner_size().map_err(|e| e.to_string())?;
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    Ok(json!({
        "x": pos.x, "y": pos.y, "w": size.width, "h": size.height, "scale": scale,
    }))
}

#[tauri::command]
pub fn lesson_reply(state: State<'_, LessonState>, id: u64, ok: bool, value: String) {
    let writer = state.pending.lock().unwrap().remove(&id);
    if let Some(w) = writer {
        reply(&w, id, ok, json!(value));
    }
}
