// Kokoro text-to-speech — port of desktop/tts.go.
//
// One session at a time: python3 runs an inline Kokoro script that prints
// {"type":"audio","audio":"<base64 WAV>"} JSON lines; a reader thread re-emits
// each as a "tts-audio" event (bare base64 string — a complete 24kHz WAV the
// frontend's Web Audio player decodes per chunk). State transitions go out as
// "tts-state" ("playing"/"paused"/"stopped"/"error"); errors as "tts-error".
// Pause/Resume are SIGSTOP/SIGCONT; Stop wakes (SIGCONT) then kills. Windows
// has no such signals, so it suspends and resumes the process's threads.
use crate::config;
use std::io::{BufRead, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

/// python.org's Windows installer puts `python` on PATH, not `python3`.
#[cfg(not(target_os = "linux"))]
const PYTHON: &str = if cfg!(windows) { "python" } else { "python3" };

/// The interpreter Kokoro runs under; Linux keeps it in its own environment.
#[cfg(target_os = "linux")]
fn python() -> Command {
    crate::kokoro_venv::python()
}

#[cfg(not(target_os = "linux"))]
fn python() -> Command {
    crate::osproc::command(PYTHON)
}

/// `pip3 <args>`; on Windows `python -m pip`, the spelling that is always there.
#[cfg(not(target_os = "linux"))]
fn pip(args: &[&str]) -> Command {
    #[cfg(windows)]
    {
        let mut cmd = crate::osproc::command(PYTHON);
        cmd.args(["-m", "pip"]).args(args);
        cmd
    }
    #[cfg(not(windows))]
    {
        let mut cmd = crate::osproc::command("pip3");
        cmd.args(args);
        cmd
    }
}

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

/// Windows caps a whole command line at 32,767 UTF-16 units, short of a long
/// reply, so there the text goes over stdin and argv[1] is a placeholder.
const TEXT_ON_STDIN: bool = cfg!(windows);
const TEXT_FROM_ARGV: &str = "text = sys.argv[1]\n";
// Raw bytes: Windows Python decodes a text stdin with the ANSI code page.
const TEXT_FROM_STDIN: &str = "text = sys.stdin.buffer.read().decode(\"utf-8\")\n";

fn stdin_script() -> String {
    TTS_SCRIPT.replacen(TEXT_FROM_ARGV, TEXT_FROM_STDIN, 1)
}

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

fn is_current(inner: &Inner, id: u64) -> bool {
    inner
        .lock()
        .unwrap()
        .as_ref()
        .map(|s| s.id == id)
        .unwrap_or(false)
}

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

    let mut cmd = python();
    cmd.arg("-c");
    if TEXT_ON_STDIN {
        cmd.arg(stdin_script()).arg("-").stdin(Stdio::piped());
    } else {
        cmd.arg(TTS_SCRIPT)
            .arg(&text) // sys.argv[1]
            .stdin(Stdio::null());
    }
    let mut child = cmd
        .arg(&voice) // sys.argv[2]
        .arg(format!("{speed:.2}")) // sys.argv[3]
        .stdout(Stdio::piped())
        .stderr(Stdio::null()) // errors arrive as JSON on stdout
        .spawn()
        .map_err(|e| format!("start tts process: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        std::thread::spawn(move || {
            let _ = stdin.write_all(text.as_bytes());
        });
    }
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
            // A Stop or a new Start (the frontend restarts synthesis when the
            // speed changes) has already killed this child, but its pipe can
            // still hold whole chunks -- emitting them would play the previous
            // reading's audio over the current one.
            if !is_current(&inner, id) {
                break;
            }
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
        let current = guard.as_ref().map(|s| s.id == id).unwrap_or(false);
        if current {
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
    #[cfg(unix)]
    unsafe {
        libc::kill(sess.pid, libc::SIGCONT);
        libc::kill(sess.pid, libc::SIGKILL);
    }
    // TerminateProcess ends a suspended process just the same.
    #[cfg(windows)]
    let _ = sess.child.kill();
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
    freeze(sess.pid, true).map_err(|e| format!("pause tts: {e}"))?;
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
    freeze(sess.pid, false).map_err(|e| format!("resume tts: {e}"))?;
    sess.state = PLAYING.into();
    drop(guard);
    let _ = app.emit("tts-state", PLAYING);
    Ok(())
}

/// Stop (`true`) or continue the synthesizer: SIGSTOP/SIGCONT, or on Windows
/// suspending/resuming every thread of the process.
fn freeze(pid: i32, stop: bool) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        let sig = if stop { libc::SIGSTOP } else { libc::SIGCONT };
        if unsafe { libc::kill(pid, sig) } != 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }
    #[cfg(windows)]
    crate::procwin::suspend(pid as u32, stop)
}

#[tauri::command(async)]
pub fn check_kokoro_installed() -> bool {
    python()
        .args(["-c", "from kokoro import KPipeline; import soundfile"])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[tauri::command(async)]
pub fn install_kokoro() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        crate::kokoro_venv::install()
    }
    #[cfg(not(target_os = "linux"))]
    {
        let out = pip(&["install", "kokoro", "soundfile"])
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
}

#[tauri::command(async)]
pub fn uninstall_kokoro() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        crate::kokoro_venv::uninstall()
    }
    #[cfg(not(target_os = "linux"))]
    {
        let out = pip(&["uninstall", "-y", "kokoro", "soundfile"])
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
}

#[cfg(not(target_os = "linux"))]
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

// ---- OpenAI engine ---------------------------------------------------------
//
// The Kokoro path above streams chunked WAV to the desktop's Web Audio player.
// OpenAI returns one encoded buffer instead, so it needs no session state: the
// command synthesizes and hands the whole clip back, and the caller plays it.
// That difference is why the phone gets real scrubbing on this engine and not
// on Kokoro.

#[tauri::command(async)]
pub fn set_openai_key(key: String) -> Result<(), String> {
    crate::secrets::set(crate::secrets::OPENAI_API_KEY, &key)
}

#[tauri::command(async)]
pub fn has_openai_key() -> bool {
    crate::secrets::has(crate::secrets::OPENAI_API_KEY)
}

#[tauri::command(async)]
pub fn clear_openai_key() -> Result<(), String> {
    crate::secrets::delete(crate::secrets::OPENAI_API_KEY)
}

#[tauri::command(async)]
pub fn openai_voices() -> Vec<String> {
    crate::openaitts::VOICES.iter().map(|v| (*v).to_string()).collect()
}

/// Synthesize `text` with the saved key and return base64 AAC. Used by the
/// desktop player and, via remote.rs, by the phone.
#[tauri::command(async)]
pub fn openai_tts_speak(text: String) -> Result<String, String> {
    let audio = crate::openaitts::synthesize_off_worker(
        text,
        openai_voice(),
        openai_speed(),
    )?;
    use base64::Engine as _;
    Ok(base64::engine::general_purpose::STANDARD.encode(audio))
}

pub fn openai_voice() -> String {
    let s = config::load_settings();
    let v = s
        .get("ttsOpenAiVoice")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if v.is_empty() {
        crate::openaitts::DEFAULT_VOICE.to_string()
    } else {
        v
    }
}

pub fn openai_speed() -> f64 {
    let s = config::load_settings();
    let speed = s.get("ttsSpeed").and_then(|v| v.as_f64()).unwrap_or(0.0);
    if speed <= 0.0 {
        1.0
    } else {
        speed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_stdin_script_takes_the_text_from_stdin_and_keeps_the_rest() {
        assert_eq!(TTS_SCRIPT.matches(TEXT_FROM_ARGV).count(), 1);
        let script = stdin_script();
        assert!(!script.contains(TEXT_FROM_ARGV));
        assert_eq!(script.matches(TEXT_FROM_STDIN).count(), 1);
        assert_eq!(
            script.replacen(TEXT_FROM_STDIN, TEXT_FROM_ARGV, 1),
            TTS_SCRIPT
        );
    }
}
