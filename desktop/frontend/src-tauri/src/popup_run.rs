//! The commands and files behind an action's popup. A command runs the way a
//! label's does (the action's folder and env, the login shell, an SSH
//! project's host), held to a time limit and a size limit, and every failure
//! comes back as words a card can show.
use crate::config::SshSettings;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(15);
const STDERR_MAX: usize = 4096;
const STDERR_WAIT: Duration = Duration::from_millis(500);
const REASON_MAX: usize = 200;

/// What `script` printed. A command still running after `TIMEOUT`, or printing
/// more than `max` bytes, is stopped.
pub(crate) fn run(
    ssh: Option<&SshSettings>,
    dir: &str,
    script: &str,
    max: usize,
) -> Result<String, String> {
    if ssh.is_none() && !Path::new(dir).is_dir() {
        return Err(format!("couldn't start: the folder {dir} doesn't exist"));
    }
    let mut cmd = crate::label_probes::command(ssh, dir, script);
    cmd.stderr(Stdio::piped());
    capture(cmd, max).map(|out| String::from_utf8_lossy(&out).into_owned())
}

/// What `cmd` printed to stdout, held to `TIMEOUT` and `max` bytes. A failure
/// quotes stderr when the caller piped it.
pub(crate) fn capture(mut cmd: Command, max: usize) -> Result<Vec<u8>, String> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("couldn't start: {e}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (out_tx, out_rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = out_tx.send(stdout.map(|s| read_capped(s, max)).unwrap_or_default());
    });
    let (err_tx, err_rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = err_tx.send(stderr.map(|s| read_capped(s, STDERR_MAX).0).unwrap_or_default());
    });
    let stop = |child: &mut std::process::Child| {
        crate::proctree::kill_tree_async(child.id() as i32);
        let _ = child.wait();
    };
    let Ok((out, cut)) = out_rx.recv_timeout(TIMEOUT) else {
        stop(&mut child);
        return Err(format!("took longer than {}s", TIMEOUT.as_secs()));
    };
    if cut {
        stop(&mut child);
        return Err(format!("printed more than {}", size_words(max)));
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        let err = err_rx.recv_timeout(STDERR_WAIT).unwrap_or_default();
        let code = status
            .code()
            .map(|c| format!("exited with {c}"))
            .unwrap_or_else(|| "was stopped".into());
        return Err(match last_line(&err) {
            Some(reason) => format!("{code}: {reason}"),
            None => code,
        });
    }
    Ok(out)
}

/// A file's text and, when it's on this machine, where it is so a page can
/// load its own files beside it. A relative path is from `dir`.
pub(crate) fn read_file(
    ssh: Option<&SshSettings>,
    dir: &str,
    path: &str,
    max: usize,
) -> Result<(String, Option<PathBuf>), String> {
    if let Some(ssh) = ssh {
        let script = format!("cat -- {}", crate::config::quote_remote_path(path));
        return run(Some(ssh), dir, &script, max)
            .map(|text| (text, None))
            .map_err(|e| format!("Couldn't read {path} on the host: {e}."));
    }
    let expanded = crate::config::expand_home(path);
    let full = Path::new(dir).join(&expanded);
    let meta = std::fs::metadata(&full).map_err(|_| format!("Can't find {path}."))?;
    if !meta.is_file() {
        return Err(format!("{path} isn't a file."));
    }
    if meta.len() > max as u64 {
        return Err(format!(
            "{path} is {}; a popup can be up to {}.",
            size_words(meta.len() as usize),
            size_words(max)
        ));
    }
    let bytes = std::fs::read(&full).map_err(|e| format!("Couldn't read {path}: {e}."))?;
    let at = full.canonicalize().ok();
    Ok((String::from_utf8_lossy(&bytes).into_owned(), at))
}

/// Up to `max` bytes, and whether there was more.
fn read_capped(source: impl Read, max: usize) -> (Vec<u8>, bool) {
    let mut buf = Vec::new();
    let read = source.take(max as u64 + 1).read_to_end(&mut buf);
    if read.is_err() {
        return (buf, false);
    }
    let cut = buf.len() > max;
    buf.truncate(max);
    (buf, cut)
}

fn last_line(text: &[u8]) -> Option<String> {
    String::from_utf8_lossy(text)
        .lines()
        .rev()
        .find_map(|line| crate::label_probes::first_line_within(line, REASON_MAX))
}

pub(crate) fn size_words(bytes: usize) -> String {
    if bytes >= 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{} KB", bytes.div_ceil(1024))
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn prints_whole_output() {
        let tmp = dir();
        let out = run(None, &tmp.path().to_string_lossy(), "printf 'a\\nb\\n'", 1024).unwrap();
        assert_eq!(out, "a\nb\n");
    }

    #[test]
    fn a_failure_says_its_code_and_last_error_line() {
        let tmp = dir();
        let err = run(
            None,
            &tmp.path().to_string_lossy(),
            "echo first >&2; echo 'no token' >&2; exit 3",
            1024,
        )
        .unwrap_err();
        assert_eq!(err, "exited with 3: no token");
    }

    #[test]
    fn too_much_output_is_stopped() {
        let tmp = dir();
        let err = run(None, &tmp.path().to_string_lossy(), "yes", 1024).unwrap_err();
        assert!(err.starts_with("printed more than"), "{err}");
    }

    #[test]
    fn a_missing_folder_is_named() {
        let err = run(None, "/no/such/folder/here", "true", 1024).unwrap_err();
        assert!(err.contains("/no/such/folder/here"), "{err}");
    }

    #[test]
    fn reads_a_file_beside_the_folder_and_refuses_one_too_big() {
        let tmp = dir();
        std::fs::write(tmp.path().join("page.html"), "<p>hi</p>").unwrap();
        let root = tmp.path().to_string_lossy().into_owned();
        let (text, at) = read_file(None, &root, "page.html", 1024).unwrap();
        assert_eq!(text, "<p>hi</p>");
        assert!(at.unwrap().ends_with("page.html"));
        assert!(read_file(None, &root, "page.html", 4).unwrap_err().contains("up to"));
        assert_eq!(read_file(None, &root, "gone.html", 1024).unwrap_err(), "Can't find gone.html.");
    }
}
