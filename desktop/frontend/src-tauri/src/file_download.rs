//! Saving a file from an SSH project or a paired computer onto this one. The
//! dialog is this computer's, and the bytes stream to a temp file beside the
//! destination, so a download that stops leaves nothing behind.
use std::collections::HashMap;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::Path;
use std::process::{ChildStderr, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::{AppHandle, Emitter, State};

use crate::config::{ensure_ssh_control_dir, SshSettings};
use crate::file_browser::checked_rel;
use crate::fsatomic::{self, Mode};
use crate::mediapeer::split_peer_path;
use crate::osproc;
use crate::peerclient::PeerClientHub;
use crate::sshexec::{remote_command, remote_project_for_path};

const PROGRESS_EVENT: &str = "file-download-progress";
const PROGRESS_EVERY: Duration = Duration::from_millis(200);
const CHUNK: u64 = 64 * 1024;
const MAX_STDERR: u64 = 4 * 1024;
/// How much a shell profile may print before the size line.
const MAX_PREAMBLE: u64 = 1024 * 1024;

const SIZE_MARK: &[u8] = b"lpm-file-size:";

/// Bytes received and bytes promised, or None when the host sent no size.
type Received = Option<(u64, u64)>;

/// Prints the file's size after `SIZE_MARK`, then exactly that many bytes: what
/// a shell profile printed first can be told from the file, and a file still
/// being written comes down as it was. `-f` goes first because opening a FIFO
/// waits for a writer that may never come, and BSD `head` refuses a count of 0.
const SEND_SCRIPT: &str = r#"[ -f "$1" ] || { printf '%s\n' "${1##*/} isn't a file" >&2; exit 1; }
size=$(wc -c < "$1") && size=$((size)) && printf 'lpm-file-size:%s\n' "$size" && { [ "$size" = 0 ] || exec head -c "$size" "$1"; }"#;

enum Source {
    Host {
        ssh: SshSettings,
        root: String,
        rel: String,
    },
    Paired {
        hub: PeerClientHub,
        slug: String,
        path: String,
        machine: String,
    },
}

impl Source {
    fn of(hub: &PeerClientHub, root: &str, rel: &str) -> Result<Self, String> {
        if let Some(ssh) = remote_project_for_path(root) {
            return Ok(Source::Host {
                ssh,
                root: root.to_string(),
                rel: rel.to_string(),
            });
        }
        let (slug, host_root) =
            split_peer_path(root).ok_or_else(|| "This file is already here".to_string())?;
        let entry = hub
            .peer_entry(slug)
            .ok_or_else(|| "that machine is no longer paired".to_string())?;
        Ok(Source::Paired {
            hub: hub.clone(),
            slug: slug.to_string(),
            path: join_host_path(host_root, rel),
            machine: crate::remote_machines::display_name(&entry),
        })
    }

    fn copy_to(
        &self,
        out: &mut File,
        name: &str,
        transfer: &Transfer,
        progress: &mut impl FnMut(u64, u64),
    ) -> Result<(), String> {
        match self {
            Source::Host { ssh, root, rel } => {
                from_host(ssh, root, rel, name, transfer, out, progress)
            }
            Source::Paired {
                hub,
                slug,
                path,
                machine,
            } => crate::peerread::fetch(
                hub,
                slug,
                path,
                machine,
                u64::MAX,
                |piece| {
                    if transfer.stopped() {
                        return Err("stopped".to_string());
                    }
                    out.write_all(piece).map_err(|e| e.to_string())
                },
                progress,
            ),
        }
    }
}

fn join_host_path(host_root: &str, rel: &str) -> String {
    format!("{}/{rel}", host_root.trim_end_matches(['/', '\\']))
}

#[derive(Default)]
struct Transfer {
    stopped: AtomicBool,
    ssh_pid: AtomicU32,
}

impl Transfer {
    fn stopped(&self) -> bool {
        self.stopped.load(Ordering::SeqCst)
    }

    /// A read from a stalled connection can't notice a flag, so the ssh client
    /// is ended and the read comes back empty.
    fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        match self.ssh_pid.load(Ordering::SeqCst) {
            0 => {}
            pid => osproc::kill(pid),
        }
    }

    fn track(&self, pid: u32) {
        self.ssh_pid.store(pid, Ordering::SeqCst);
        if self.stopped() {
            osproc::kill(pid);
        }
    }

    /// Before the child is reaped, while its pid can't yet be someone else's.
    fn untrack(&self) {
        self.ssh_pid.store(0, Ordering::SeqCst);
    }
}

fn running() -> &'static Mutex<HashMap<String, Arc<Transfer>>> {
    static RUNNING: OnceLock<Mutex<HashMap<String, Arc<Transfer>>>> = OnceLock::new();
    RUNNING.get_or_init(Default::default)
}

struct Running<'a>(&'a str);

impl Drop for Running<'_> {
    fn drop(&mut self) {
        running().lock().unwrap().remove(self.0);
    }
}

/// Lets through the first report and the last, and one per `PROGRESS_EVERY`
/// between them: a fast link would otherwise send the window thousands a second.
#[derive(Default)]
struct Pace {
    last: Option<Instant>,
}

impl Pace {
    fn due(&mut self, received: u64, total: u64, now: Instant) -> bool {
        let finished = total > 0 && received >= total;
        let waited = self
            .last
            .is_none_or(|at| now.duration_since(at) >= PROGRESS_EVERY);
        if finished || waited {
            self.last = Some(now);
        }
        finished || waited
    }
}

/// The line carrying the size, wherever a profile with no newline of its own
/// left it on the line.
fn size_on(line: &[u8]) -> Option<u64> {
    let at = line
        .windows(SIZE_MARK.len())
        .rposition(|w| w == SIZE_MARK)?;
    std::str::from_utf8(&line[at + SIZE_MARK.len()..])
        .ok()?
        .trim()
        .parse()
        .ok()
}

fn read_size(from: &mut impl BufRead) -> io::Result<Option<u64>> {
    let mut preamble = from.by_ref().take(MAX_PREAMBLE);
    let mut line = Vec::new();
    loop {
        line.clear();
        if preamble.read_until(b'\n', &mut line)? == 0 {
            return Ok(None);
        }
        if let Some(size) = size_on(&line) {
            return Ok(Some(size));
        }
    }
}

fn copy_body(
    from: &mut impl Read,
    size: u64,
    out: &mut impl Write,
    progress: &mut impl FnMut(u64, u64),
) -> Result<u64, String> {
    let mut buffer = vec![0; CHUNK as usize];
    let mut received = 0;
    progress(0, size);
    while received < size {
        let want = CHUNK.min(size - received) as usize;
        let read = match from.read(&mut buffer[..want]) {
            Ok(0) | Err(_) => break,
            Ok(read) => read,
        };
        out.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
        received += read as u64;
        progress(received, size);
    }
    Ok(received)
}

/// An `Err` is this computer failing to write. A stream that ends early is for
/// `settle` to judge.
fn receive(
    from: &mut impl BufRead,
    out: &mut impl Write,
    progress: &mut impl FnMut(u64, u64),
) -> Result<Received, String> {
    let Ok(Some(size)) = read_size(from) else {
        return Ok(None);
    };
    Ok(Some((copy_body(from, size, out, progress)?, size)))
}

fn settle(
    received: Result<Received, String>,
    exited_ok: bool,
    stderr: &str,
    name: &str,
) -> Result<(), String> {
    match received? {
        Some((got, size)) if got == size && exited_ok => Ok(()),
        _ if !stderr.is_empty() => Err(stderr.to_string()),
        Some(_) if exited_ok => Err(format!("{name} changed while it was being read")),
        _ => Err(format!(
            "The connection closed before {name} finished downloading"
        )),
    }
}

fn capture(mut stderr: ChildStderr) -> JoinHandle<String> {
    std::thread::spawn(move || {
        let mut kept = Vec::new();
        let _ = stderr.by_ref().take(MAX_STDERR).read_to_end(&mut kept);
        let _ = io::copy(&mut stderr, &mut io::sink());
        String::from_utf8_lossy(&kept).trim().to_string()
    })
}

fn from_host(
    ssh: &SshSettings,
    root: &str,
    rel: &str,
    name: &str,
    transfer: &Transfer,
    out: &mut File,
    progress: &mut impl FnMut(u64, u64),
) -> Result<(), String> {
    let _ = ensure_ssh_control_dir();
    let target = format!("./{rel}");
    let mut child = remote_command(ssh, root, "sh", &["-c", SEND_SCRIPT, "sh", &target], &[])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    transfer.track(child.id());
    let stderr = child.stderr.take().map(capture);
    let stdout = child.stdout.take().ok_or("no output from the host")?;
    let received = receive(&mut BufReader::new(stdout), out, progress);
    if received.is_err() {
        let _ = child.kill();
    }
    transfer.untrack();
    let exited_ok = child.wait().is_ok_and(|status| status.success());
    let stderr = stderr
        .and_then(|thread| thread.join().ok())
        .unwrap_or_default();
    settle(received, exited_ok, &stderr, name)
}

fn save(
    app: &AppHandle,
    id: &str,
    source: &Source,
    name: &str,
    dest: &Path,
) -> Result<Option<String>, String> {
    let transfer = Arc::new(Transfer::default());
    running()
        .lock()
        .unwrap()
        .insert(id.to_string(), transfer.clone());
    let _running = Running(id);
    let mut pace = Pace::default();
    let mut progress = |received: u64, total: u64| {
        if pace.due(received, total, Instant::now()) {
            let event = json!({ "id": id, "received": received, "total": total });
            let _ = app.emit(PROGRESS_EVENT, event);
        }
    };
    progress(0, 0);
    store(source, name, dest, &transfer, &mut progress)
}

fn store(
    source: &Source,
    name: &str,
    dest: &Path,
    transfer: &Transfer,
    progress: &mut impl FnMut(u64, u64),
) -> Result<Option<String>, String> {
    let stored = fsatomic::write_with(dest, Mode::Preserve(0o644), |out| {
        source
            .copy_to(out, name, transfer, progress)
            .map_err(io::Error::other)
    });
    match stored {
        Ok(()) => Ok(Some(dest.to_string_lossy().into_owned())),
        Err(_) if transfer.stopped() => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Where the file was saved, or None when the dialog was dismissed or the
/// download stopped. Progress comes as `file-download-progress` under `id`.
#[tauri::command]
pub async fn download_project_file(
    app: AppHandle,
    hub: State<'_, PeerClientHub>,
    id: String,
    root: String,
    rel: String,
) -> Result<Option<String>, String> {
    let rel = checked_rel(&rel)?;
    let name = rel.rsplit('/').next().unwrap_or_default().to_string();
    if name.is_empty() {
        return Err("not a file".into());
    }
    let source = Source::of(hub.inner(), &root, &rel)?;
    let portable = crate::fsname::portable(&name);
    let Some(dest) = crate::files::pick_save_path(app.clone(), portable).await? else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || save(&app, &id, &source, &name, &dest))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_file_download(id: String) {
    if let Some(transfer) = running().lock().unwrap().get(&id) {
        transfer.stop();
    }
}

#[cfg(test)]
#[path = "file_download_tests.rs"]
mod tests;
