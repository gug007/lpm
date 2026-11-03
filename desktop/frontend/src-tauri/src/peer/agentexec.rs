// Host half of an agent's command (`lpm exec --on`): an agent on a paired
// computer runs a command here, as this account, once this machine lets that
// computer's agents run commands. The computer it came from has already had a
// person allow it (agentexec.rs); this side holds it to its own setting, says
// on screen that it runs, and keeps it in the log.
//
// The command runs through the same login shell as actions, in its own session,
// with nothing on stdin. What it prints goes back as `agentExecOut`
// frames, and its exit code as the request's result. It is stopped when the
// computer asks (`agentExecKill`) or its connection goes, with a hangup, as a
// closed terminal would stop it.
use super::agentfiles::{policy_of, SERVED_EVENT};
use super::{result_frame, PeerHub};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::mpsc::{channel, Receiver, Sender, SyncSender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const CHUNK: usize = 32 * 1024;
/// How long output may still come after the command exits.
const LINGER: Duration = Duration::from_secs(2);

/// (connection, command id) → the shell the command runs in.
fn running() -> &'static Mutex<HashMap<(u64, String), u32>> {
    static RUNNING: OnceLock<Mutex<HashMap<(u64, String), u32>>> = OnceLock::new();
    RUNNING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn stop(pid: u32) {
    crate::proctree::hang_up_tree_async(pid as i32);
}

/// Stop every command the connection `conn_id` was running here.
pub(crate) fn drop_conn(conn_id: u64) {
    let pids: Vec<u32> = {
        let mut map = running().lock().unwrap();
        let keys: Vec<_> = map.keys().filter(|(c, _)| *c == conn_id).cloned().collect();
        keys.iter().filter_map(|k| map.remove(k)).collect()
    };
    pids.into_iter().for_each(stop);
}

pub(super) fn handle(
    app: &AppHandle,
    hub: &PeerHub,
    out: &SyncSender<String>,
    device_id: &str,
    conn_id: u64,
    t: &str,
    v: &Value,
) {
    let id = v["id"].as_str().unwrap_or_default().to_string();
    if t == "agentExecKill" {
        if let Some(pid) = running().lock().unwrap().remove(&(conn_id, id)) {
            stop(pid);
        }
        return;
    }
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let policy = policy_of(hub, device_id);
    let machine = hub.device_name(device_id);
    let (app, out, v) = (app.clone(), out.clone(), v.clone());
    std::thread::spawn(move || {
        let res = policy
            .allows_run()
            .and_then(|_| run(&app, &out, &machine, conn_id, &id, &v));
        let frame = match res {
            Ok(value) => result_frame(&req_id, true, value),
            Err(e) => result_frame(&req_id, false, Value::String(e)),
        };
        let _ = out.send(frame);
    });
}

/// The folder a command starts in: `raw` with `~` read as this account's home,
/// which is also where it starts when nothing is named.
fn folder(raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim();
    let expanded = crate::config::expand_home(if raw.is_empty() { "~" } else { raw });
    let path = Path::new(&expanded);
    if !path.is_absolute() {
        return Err(format!("{raw} isn't a full path on the other computer"));
    }
    match std::fs::canonicalize(path) {
        Ok(found) if found.is_dir() => Ok(found),
        Ok(_) => Err(format!("{raw} isn't a folder on the other computer")),
        Err(_) => Err(format!("{raw} isn't there on the other computer")),
    }
}

fn spawn(command: &str, cwd: &Path) -> std::io::Result<Child> {
    let mut cmd = crate::shellpath::login_line(cwd, command);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    crate::osproc::detach(&mut cmd);
    cmd.spawn()
}

/// Drops the lines an interactive shell prints first when it has no terminal
/// ("no job control in this shell"); everything after them passes untouched.
#[derive(Default)]
struct Notices {
    past: bool,
    held: Vec<u8>,
}

impl Notices {
    fn pass(&mut self, bytes: &[u8]) -> Vec<u8> {
        if self.past {
            return bytes.to_vec();
        }
        self.held.extend_from_slice(bytes);
        while let Some(end) = self.held.iter().position(|&b| b == b'\n') {
            let line = String::from_utf8_lossy(&self.held[..end]);
            if !crate::shellpath::is_job_control_notice(line.trim_end_matches('\r')) {
                self.past = true;
                return std::mem::take(&mut self.held);
            }
            self.held.drain(..=end);
        }
        Vec::new()
    }

    fn rest(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.held)
    }
}

fn out_frame(id: &str, stream: &str, bytes: &[u8]) -> String {
    json!({ "t": "agentExecOut", "id": id, "s": stream, "d": B64.encode(bytes) }).to_string()
}

/// Send what `pipe` prints as `agentExecOut` frames, waiting for room so
/// nothing is dropped. `done` goes when the pipe ends.
fn pass_on(
    mut pipe: impl Read + Send + 'static,
    out: SyncSender<String>,
    id: String,
    stream: &'static str,
    done: Sender<()>,
) {
    std::thread::spawn(move || {
        let _done = done;
        let mut notices = Notices {
            past: stream == "o",
            ..Default::default()
        };
        let mut buf = vec![0u8; CHUNK];
        loop {
            let (bytes, ended) = match pipe.read(&mut buf) {
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Ok(0) | Err(_) => (notices.rest(), true),
                Ok(n) => (notices.pass(&buf[..n]), false),
            };
            if !bytes.is_empty() && out.send(out_frame(&id, stream, &bytes)).is_err() {
                return;
            }
            if ended {
                return;
            }
        }
    });
}

/// Wait for what the command printed to arrive, but not for a process it left
/// running in the background, which holds its output open for as long as it
/// lives: every reader has ended once their `done`s are all gone.
fn drain(done: &Receiver<()>) {
    let _ = done.recv_timeout(LINGER);
}

fn run(
    app: &AppHandle,
    out: &SyncSender<String>,
    machine: &str,
    conn_id: u64,
    id: &str,
    v: &Value,
) -> Result<Value, String> {
    let command = v["command"].as_str().unwrap_or_default();
    if command.trim().is_empty() || id.is_empty() {
        return Err("there is no command to run".into());
    }
    let cwd = folder(v["cwd"].as_str().unwrap_or_default())?;
    let mut child = spawn(command, &cwd).map_err(|e| format!("couldn't start the command: {e}"))?;
    let key = (conn_id, id.to_string());
    running().lock().unwrap().insert(key.clone(), child.id());
    let cwd_text = cwd.to_string_lossy().into_owned();
    let entry = json!({ "side": "host", "machine": machine, "op": "run", "command": command,
        "cwd": cwd_text });
    let _ = app.emit(SERVED_EVENT, &entry);
    let (done, ended) = channel();
    if let Some(pipe) = child.stdout.take() {
        pass_on(pipe, out.clone(), id.to_string(), "o", done.clone());
    }
    if let Some(pipe) = child.stderr.take() {
        pass_on(pipe, out.clone(), id.to_string(), "e", done);
    }
    let status = child.wait();
    running().lock().unwrap().remove(&key);
    drain(&ended);
    let status = status.map_err(|e| e.to_string())?;
    #[cfg(unix)]
    let signal = std::os::unix::process::ExitStatusExt::signal(&status);
    #[cfg(not(unix))]
    let signal: Option<i32> = None;
    let mut logged = entry;
    logged["code"] = json!(status.code());
    crate::agentfiles::log(logged);
    Ok(json!({ "code": status.code(), "signal": signal, "cwd": cwd_text }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_shells_job_control_notices_are_dropped_and_nothing_else() {
        let mut n = Notices::default();
        let first = n.pass(b"bash: cannot set terminal process group (-1): Inappropriate ioctl for device\nbash: no job");
        assert!(first.is_empty());
        let rest = n.pass(b" control in this shell\nreal error\nmore");
        assert_eq!(rest, b"real error\nmore");
        assert_eq!(n.pass(b"!"), b"!");
        let mut quiet = Notices::default();
        assert!(quiet.pass(b"partial").is_empty());
        assert_eq!(quiet.rest(), b"partial");
    }

    fn printed(rx: &std::sync::mpsc::Receiver<String>) -> (String, String) {
        let mut out = (String::new(), String::new());
        for frame in rx.try_iter() {
            let v: Value = serde_json::from_str(&frame).unwrap();
            let text = String::from_utf8(B64.decode(v["d"].as_str().unwrap()).unwrap()).unwrap();
            assert_eq!(v["id"], "c1");
            if v["s"] == "o" {
                out.0.push_str(&text);
            } else {
                out.1.push_str(&text);
            }
        }
        out
    }

    #[cfg(unix)]
    #[test]
    fn a_command_prints_both_streams_and_ends_with_its_code() {
        let dir = tempfile::tempdir().unwrap();
        let mut child = spawn("pwd; echo oops >&2; exit 3", dir.path()).unwrap();
        let (tx, rx) = std::sync::mpsc::sync_channel(64);
        let (done, ended) = channel();
        pass_on(
            child.stdout.take().unwrap(),
            tx.clone(),
            "c1".into(),
            "o",
            done.clone(),
        );
        pass_on(child.stderr.take().unwrap(), tx, "c1".into(), "e", done);
        assert_eq!(child.wait().unwrap().code(), Some(3));
        drain(&ended);
        let (out, err) = printed(&rx);
        let name = dir
            .path()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert!(out.trim_end().ends_with(&name), "{out}");
        assert!(err.ends_with("oops\n"), "{err}");
    }

    #[cfg(unix)]
    #[test]
    fn a_background_process_holding_the_output_open_does_not_hold_the_answer() {
        let dir = tempfile::tempdir().unwrap();
        let mut child = spawn("sleep 30 & echo started", dir.path()).unwrap();
        let (tx, rx) = std::sync::mpsc::sync_channel(64);
        let (done, ended) = channel();
        pass_on(child.stdout.take().unwrap(), tx, "c1".into(), "o", done);
        let pid = child.id();
        assert!(child.wait().unwrap().success());
        let started = std::time::Instant::now();
        drain(&ended);
        assert!(started.elapsed() < LINGER + Duration::from_secs(1));
        assert!(printed(&rx).0.contains("started"));
        crate::osproc::kill_group(pid, true);
    }

    #[cfg(unix)]
    #[test]
    fn stopping_a_command_ends_what_it_started_too() {
        use std::io::BufRead;
        let dir = tempfile::tempdir().unwrap();
        let mut child = spawn("sleep 30 & echo \"bg=$!\"; wait", dir.path()).unwrap();
        let stdout = child.stdout.take().unwrap();
        let bg: u32 = std::io::BufReader::new(stdout)
            .lines()
            .map_while(Result::ok)
            .find_map(|l| l.strip_prefix("bg=").and_then(|n| n.trim().parse().ok()))
            .unwrap();
        running()
            .lock()
            .unwrap()
            .insert((77, "c1".into()), child.id());
        drop_conn(77);
        let started = std::time::Instant::now();
        child.wait().unwrap();
        let grace = Duration::from_millis(crate::proctree::TERM_TIMEOUT_MS);
        assert!(started.elapsed() < grace + Duration::from_secs(2));
        std::thread::sleep(Duration::from_millis(200));
        assert!(
            !crate::osproc::is_alive(bg),
            "the background sleep was stopped with it"
        );
        assert!(running().lock().unwrap().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn a_stopped_command_goes_no_further_down_its_line() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("went-on");
        let line = format!("echo up; sleep 30; touch '{}'", marker.display());
        let mut child = spawn(&line, dir.path()).unwrap();
        let mut lines =
            std::io::BufRead::lines(std::io::BufReader::new(child.stdout.take().unwrap()));
        assert!(lines.any(|l| l.is_ok_and(|l| l == "up")));
        std::thread::sleep(Duration::from_millis(300));
        stop(child.id());
        child.wait().unwrap();
        drop(lines);
        std::thread::sleep(Duration::from_millis(300));
        assert!(!marker.exists(), "the line went on after it was stopped");
    }

    #[test]
    fn a_folder_must_be_there() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            folder(&dir.path().to_string_lossy()).unwrap(),
            std::fs::canonicalize(dir.path()).unwrap()
        );
        assert!(folder(&dir.path().join("nope").to_string_lossy()).is_err());
        assert!(folder("relative/path").is_err());
        assert!(folder("").unwrap().is_absolute(), "the home folder");
        let file = dir.path().join("f");
        std::fs::write(&file, "x").unwrap();
        assert!(folder(&file.to_string_lossy()).is_err());
    }
}
