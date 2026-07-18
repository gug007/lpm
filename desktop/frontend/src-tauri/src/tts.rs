// Kokoro text-to-speech — port of desktop/tts.go.
//
// One session at a time: python3 runs an inline Kokoro script that prints
// {"type":"audio","audio":"<base64 WAV>"} JSON lines; a reader thread re-emits
// each as a "tts-audio" event (bare base64 string — a complete 24kHz WAV the
// frontend's Web Audio player decodes per chunk). State transitions go out as
// "tts-state" ("playing"/"paused"/"stopped"/"error"); errors as "tts-error".
// Pause/Resume are SIGSTOP/SIGCONT; Stop wakes (SIGCONT) then kills.
use crate::config;
use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

const PLAYING: &str = "playing";
const PAUSED: &str = "paused";
const STOPPED: &str = "stopped";

// Verbatim from desktop/tts.go (leading + trailing newline preserved). r#"..."#
// avoids escaping the embedded JSON double-quotes.
const TTS_SCRIPT: &str = r#"
import sys, json, base64, io
try:
    import soundfile as sf
    from kokoro import KPipeline
except ImportError as e:
    print(json.dumps({"type":"error","error":"Missing dependency: "+str(e)+". Install with: pip install kokoro soundfile"}))
    sys.exit(1)

text = sys.argv[1]
voice = sys.argv[2]
speed = float(sys.argv[3])

try:
    pipeline = KPipeline(lang_code=voice[0])
    for gs, ps, audio in pipeline(text, voice=voice, speed=speed):
        buf = io.BytesIO()
        sf.write(buf, audio, 24000, format="WAV")
        b64 = base64.b64encode(buf.getvalue()).decode()
        print(json.dumps({"type":"audio","audio":b64}))
        sys.stdout.flush()
    print(json.dumps({"type":"done","percent":100}))
except Exception as e:
    print(json.dumps({"type":"error","error":str(e)}))
    sys.exit(1)
"#;

#[derive(serde::Deserialize)]
struct TtsChunk {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    audio: String,
    #[serde(default)]
    error: String,
}

struct TtsSession {
    child: Child,
    pid: i32,
    state: String,
    id: u64, // generation guard: only the current session's reader emits "stopped"
}

pub struct TtsState {
    inner: Arc<Mutex<Option<TtsSession>>>,
    counter: AtomicU64,
}

impl Default for TtsState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
            counter: AtomicU64::new(0),
        }
    }
}

type Inner = Arc<Mutex<Option<TtsSession>>>;

#[tauri::command(async)]
pub fn start_tts(app: AppHandle, state: State<'_, TtsState>, text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("text is empty".into());
    }
    let s = config::load_settings();
    let mut voice = s
        .get("ttsVoice")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let mut speed = s.get("ttsSpeed").and_then(|v| v.as_f64()).unwrap_or(0.0);
    if voice.is_empty() {
        voice = "af_heart".into();
    }
    if speed <= 0.0 {
        speed = 1.0;
    }

    stop_internal(&app, &state.inner); // tear down any prior session first

    let mut child = Command::new("python3")
        .arg("-c")
        .arg(TTS_SCRIPT)
        .arg(&text) // sys.argv[1]
        .arg(&voice) // sys.argv[2]
        .arg(format!("{speed:.2}")) // sys.argv[3]
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null()) // errors arrive as JSON on stdout
        .spawn()
        .map_err(|e| format!("start tts process: {e}"))?;
    let stdout = child.stdout.take().ok_or("create stdout pipe")?;
    let pid = child.id() as i32;
    let id = state.counter.fetch_add(1, Ordering::SeqCst) + 1;
    *state.inner.lock().unwrap() = Some(TtsSession {
        child,
        pid,
        state: PLAYING.into(),
        id,
    });
    let _ = app.emit("tts-state", PLAYING);

    let app2 = app.clone();
    let inner: Inner = state.inner.clone();
    std::thread::spawn(move || {
        // BufRead::lines grows unbounded, so base64 WAV chunks aren't truncated
        // (Go needed an explicit 10 MB scanner buffer; here it's automatic).
        for line in std::io::BufReader::new(stdout)
            .lines()
            .map_while(Result::ok)
        {
            let Ok(chunk) = serde_json::from_str::<TtsChunk>(&line) else {
                continue;
            };
            match chunk.kind.as_str() {
                "audio" => {
                    let _ = app2.emit("tts-audio", chunk.audio);
                }
                "done" => {} // no-op (frontend ends via the audio player)
                "error" => {
                    let _ = app2.emit("tts-state", "error");
                    let _ = app2.emit("tts-error", chunk.error);
                }
                _ => {}
            }
        }
        // EOF: if this is still the current session, reap it and emit "stopped"
        // (iff it was playing). A Stop / new Start already took it -> do nothing.
        let mut guard = inner.lock().unwrap();
        let is_current = guard.as_ref().map(|s| s.id == id).unwrap_or(false);
        if is_current {
            let mut sess = guard.take().unwrap();
            drop(guard);
            let was_playing = sess.state == PLAYING;
            let _ = sess.child.wait();
            if was_playing {
                let _ = app2.emit("tts-state", STOPPED);
            }
        }
    });
    Ok(())
}

#[tauri::command(async)]
pub fn stop_tts(app: AppHandle, state: State<'_, TtsState>) {
    stop_internal(&app, &state.inner);
}

fn stop_internal(app: &AppHandle, inner: &Inner) {
    let sess = inner.lock().unwrap().take();
    let Some(mut sess) = sess else {
        return;
    };
    // Wake a possibly-paused process so the kill isn't queued behind SIGSTOP,
    // then terminate. SIGKILL (== Go's context-cancel) dies promptly.
    unsafe {
        libc::kill(sess.pid, libc::SIGCONT);
        libc::kill(sess.pid, libc::SIGKILL);
    }
    let _ = sess.child.wait(); // reap; the reader thread will see None -> no double emit
    let _ = app.emit("tts-state", STOPPED);
}

#[tauri::command(async)]
pub fn pause_tts(app: AppHandle, state: State<'_, TtsState>) -> Result<(), String> {
    let mut guard = state.inner.lock().unwrap();
    let sess = guard.as_mut().ok_or("no active tts session")?;
    if sess.state != PLAYING {
        return Err(format!("tts is not playing (state: {})", sess.state));
    }
    if unsafe { libc::kill(sess.pid, libc::SIGSTOP) } != 0 {
        return Err(format!("pause tts: {}", std::io::Error::last_os_error()));
    }
    sess.state = PAUSED.into();
    drop(guard);
    let _ = app.emit("tts-state", PAUSED);
    Ok(())
}

#[tauri::command(async)]
pub fn resume_tts(app: AppHandle, state: State<'_, TtsState>) -> Result<(), String> {
    let mut guard = state.inner.lock().unwrap();
    let sess = guard.as_mut().ok_or("no active tts session")?;
    if sess.state != PAUSED {
        return Err(format!("tts is not paused (state: {})", sess.state));
    }
    if unsafe { libc::kill(sess.pid, libc::SIGCONT) } != 0 {
        return Err(format!("resume tts: {}", std::io::Error::last_os_error()));
    }
    sess.state = PLAYING.into();
    drop(guard);
    let _ = app.emit("tts-state", PLAYING);
    Ok(())
}

#[tauri::command(async)]
pub fn check_kokoro_installed() -> bool {
    Command::new("python3")
        .args(["-c", "from kokoro import KPipeline; import soundfile"])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[tauri::command(async)]
pub fn install_kokoro() -> Result<(), String> {
    let out = Command::new("pip3")
        .args(["install", "kokoro", "soundfile"])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!(
            "pip3 install failed: {}\n{}",
            out.status,
            combined(&out)
        ));
    }
    Ok(())
}

#[tauri::command(async)]
pub fn uninstall_kokoro() -> Result<(), String> {
    let out = Command::new("pip3")
        .args(["uninstall", "-y", "kokoro", "soundfile"])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!(
            "pip3 uninstall failed: {}\n{}",
            out.status,
            combined(&out)
        ));
    }
    Ok(())
}

fn combined(out: &std::process::Output) -> String {
    let mut s = String::from_utf8_lossy(&out.stdout).into_owned();
    s.push_str(&String::from_utf8_lossy(&out.stderr));
    s
}

/// Kill any live TTS child on app exit (prevents an orphaned suspended python).
pub fn stop_on_exit(app: &AppHandle) {
    let state = app.state::<TtsState>();
    stop_internal(app, &state.inner);
}
