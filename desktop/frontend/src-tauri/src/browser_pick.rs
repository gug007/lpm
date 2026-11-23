// Picking an element (or an area) on a browser tab's page, for the agent. The
// tabs' webviews are in no capability, so a page can't call back: the picker
// script (browser_pick.js) keeps its answer on the page and this side reads it
// with eval_with_callback until one turns up. The page writes that answer, so
// everything in it is treated as untrusted text, and the picture comes from
// the engine's own snapshot rather than from the page.
use crate::browser::EMBEDDED;
use crate::browser_snapshot::{capture, Clip};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const SCRIPT: &str = include_str!("browser_pick.js");
const KEY_SLOT: &str = "__LPM_PICK_KEY__";
const POLL: Duration = Duration::from_millis(120);
const READ_WAIT: Duration = Duration::from_secs(3);
const GIVE_UP: Duration = Duration::from_secs(600);
const MAX_ANSWER: usize = 64 * 1024;
const PAD: f64 = 6.0;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PickKind {
    Element,
    Area,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PickRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickViewport {
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub scroll_x: f64,
    #[serde(default)]
    pub scroll_y: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PickComponent {
    pub framework: String,
    #[serde(default)]
    pub names: Vec<String>,
    pub file: Option<String>,
    pub line: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPick {
    pub kind: PickKind,
    pub url: String,
    #[serde(default)]
    pub title: String,
    pub tag: Option<String>,
    pub selector: Option<String>,
    pub text: Option<String>,
    pub html: Option<String>,
    pub component: Option<PickComponent>,
    pub rect: PickRect,
    pub viewport: PickViewport,
    /// Base64 PNG of the picked rect, taken by the engine. Never read from the page.
    #[serde(default, skip_deserializing)]
    pub image: Option<String>,
}

#[derive(Debug, PartialEq)]
enum Answer {
    Waiting,
    Gone,
    Cancelled,
    Picked(Box<BrowserPick>),
}

fn running() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static RUNNING: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    RUNNING.get_or_init(Default::default)
}

/// Ends a pick waiting on the browser tab `id`, if there is one.
pub(crate) fn cancel_pick(id: &str) {
    if let Some(stop) = running().lock().unwrap().remove(id) {
        stop.store(true, Ordering::Relaxed);
    }
}

fn begin(id: &str) -> Arc<AtomicBool> {
    let stop = Arc::new(AtomicBool::new(false));
    if let Some(old) = running()
        .lock()
        .unwrap()
        .insert(id.to_string(), stop.clone())
    {
        old.store(true, Ordering::Relaxed);
    }
    stop
}

fn end(id: &str, stop: &Arc<AtomicBool>) {
    let mut map = running().lock().unwrap();
    if map.get(id).is_some_and(|s| Arc::ptr_eq(s, stop)) {
        map.remove(id);
    }
}

/// Lets the user pick an element or area on the tab's page and returns it with
/// a picture of it, or None when they cancel, leave the page or close the tab.
#[tauri::command(async)]
pub fn pick_in_browser(app: AppHandle, id: String) -> Result<Option<BrowserPick>, String> {
    if !EMBEDDED {
        return Err(
            "Pages open in your browser on this computer, so there's nothing to pick here.".into(),
        );
    }
    let wv = app
        .get_webview(&id)
        .ok_or("Open a page first, then pick on it.")?;
    let key = serde_json::to_string(&format!("__lpmPick_{}", uuid::Uuid::new_v4().simple()))
        .map_err(|e| e.to_string())?;
    let stop = begin(&id);
    let picked = wait_for_pick(&app, &id, &wv, &key, &stop);
    end(&id, &stop);
    if !matches!(picked, Ok(Some(_))) {
        stop_script(&app, &id, &key);
    }
    let Some(mut pick) = picked? else {
        return Ok(None);
    };
    if let (Some(wv), Some(clip)) = (app.get_webview(&id), clip_for(&pick)) {
        pick.image = capture(&wv, clip);
    }
    Ok(Some(pick))
}

#[tauri::command(async)]
pub fn cancel_browser_pick(id: String) {
    cancel_pick(&id);
}

fn wait_for_pick(
    app: &AppHandle,
    id: &str,
    wv: &tauri::Webview,
    key: &str,
    stop: &AtomicBool,
) -> Result<Option<BrowserPick>, String> {
    wv.eval(SCRIPT.replace(KEY_SLOT, key))
        .map_err(|e| e.to_string())?;
    let probe = format!("(function(){{var p=window[{key}];return p?p.take():\"gone\"}})()");
    let started = Instant::now();
    let mut seen = false;
    loop {
        if stop.load(Ordering::Relaxed) || started.elapsed() > GIVE_UP {
            return Ok(None);
        }
        std::thread::sleep(POLL);
        let Some(wv) = app.get_webview(id) else {
            return Ok(None);
        };
        match ask(&wv, &probe) {
            Answer::Waiting => seen = true,
            Answer::Gone if !seen => return Err("This page didn't let lpm pick on it.".into()),
            Answer::Gone | Answer::Cancelled => return Ok(None),
            Answer::Picked(pick) => return Ok(Some(*pick)),
        }
    }
}

fn ask(wv: &tauri::Webview, probe: &str) -> Answer {
    let (tx, rx) = mpsc::channel();
    let sent = wv.eval_with_callback(probe.to_string(), move |raw| {
        let _ = tx.send(raw);
    });
    if sent.is_err() {
        return Answer::Waiting;
    }
    rx.recv_timeout(READ_WAIT)
        .map(|raw| read_answer(&raw))
        .unwrap_or(Answer::Waiting)
}

fn stop_script(app: &AppHandle, id: &str, key: &str) {
    if let Some(wv) = app.get_webview(id) {
        let _ = wv.eval(format!(
            "(function(){{var p=window[{key}];if(p)p.stop()}})()"
        ));
    }
}

/// What the probe returned, as the engine hands it over: JSON of the value,
/// or nothing at all for null on WebKit.
fn read_answer(raw: &str) -> Answer {
    let raw = raw.trim();
    if raw.is_empty() || raw == "null" || raw == "undefined" {
        return Answer::Waiting;
    }
    if raw.len() > MAX_ANSWER {
        return Answer::Cancelled;
    }
    let Ok(text) = serde_json::from_str::<String>(raw) else {
        return Answer::Waiting;
    };
    if text == "gone" {
        return Answer::Gone;
    }
    match serde_json::from_str::<BrowserPick>(&text) {
        Ok(pick) => tidy(pick).map_or(Answer::Cancelled, |p| Answer::Picked(Box::new(p))),
        Err(_) => Answer::Cancelled,
    }
}

fn cap(s: Option<String>, max: usize) -> Option<String> {
    let s = s?;
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    Some(match s.char_indices().nth(max) {
        Some((at, _)) => format!("{}…", &s[..at]),
        None => s.to_string(),
    })
}

fn tidy(mut pick: BrowserPick) -> Option<BrowserPick> {
    let finite = [
        pick.rect.x,
        pick.rect.y,
        pick.rect.width,
        pick.rect.height,
        pick.viewport.width,
        pick.viewport.height,
        pick.viewport.scroll_x,
        pick.viewport.scroll_y,
    ];
    if finite.iter().any(|v| !v.is_finite()) || pick.rect.width < 0.0 || pick.rect.height < 0.0 {
        return None;
    }
    pick.url = cap(Some(pick.url), 2000).unwrap_or_default();
    pick.title = cap(Some(pick.title), 200).unwrap_or_default();
    pick.tag = cap(pick.tag, 40);
    pick.selector = cap(pick.selector, 500);
    pick.text = cap(pick.text, 160);
    pick.html = cap(pick.html, 300);
    pick.component = pick.component.map(|mut c| {
        c.framework = cap(Some(c.framework), 20).unwrap_or_default();
        c.names = c
            .names
            .into_iter()
            .take(3)
            .filter_map(|n| cap(Some(n), 80))
            .collect();
        c.file = cap(c.file, 300);
        c
    });
    pick.image = None;
    Some(pick)
}

/// The part of the viewport to photograph: the pick padded a little, cut to
/// what is on screen. None when none of it is.
fn clip_for(pick: &BrowserPick) -> Option<Clip> {
    let r = pick.rect;
    let (vw, vh) = (pick.viewport.width, pick.viewport.height);
    let left = (r.x - PAD).max(0.0);
    let top = (r.y - PAD).max(0.0);
    let right = (r.x + r.width + PAD).min(vw);
    let bottom = (r.y + r.height + PAD).min(vh);
    if right - left < 2.0 || bottom - top < 2.0 {
        return None;
    }
    Some(Clip {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        scroll_x: pick.viewport.scroll_x,
        scroll_y: pick.viewport.scroll_y,
    })
}

#[cfg(test)]
#[path = "browser_pick_tests.rs"]
mod tests;
