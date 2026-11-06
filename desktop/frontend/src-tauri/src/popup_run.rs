//! The commands and files behind an action's popup. A command runs the way a
//! label's does (see `action_exec`), and every failure comes back as words a
//! card can show.
use crate::action_exec::{self, size_words};
use crate::config::SshSettings;
use std::path::Path;
use std::process::Stdio;

/// What `script` printed. A command still running after its time limit, or
/// printing more than `max` bytes, is stopped.
pub(crate) fn run(
    ssh: Option<&SshSettings>,
    dir: &str,
    script: &str,
    max: usize,
) -> Result<String, String> {
    if ssh.is_none() && !Path::new(dir).is_dir() {
        return Err(format!("couldn't start: the folder {dir} doesn't exist"));
    }
    let mut cmd = action_exec::command(ssh, dir, script);
    cmd.stderr(Stdio::piped());
    action_exec::capture(cmd, max).map(|out| String::from_utf8_lossy(&out).into_owned())
}

/// A file's text and, when it's on this machine, where it is so a page can
/// load its own files beside it. A relative path is from `dir`.
pub(crate) fn read_file(
    ssh: Option<&SshSettings>,
    dir: &str,
    path: &str,
    max: usize,
) -> Result<(String, Option<String>), String> {
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
    let at = full.canonicalize().ok().map(|p| p.to_string_lossy().into_owned());
    Ok((String::from_utf8_lossy(&bytes).into_owned(), at))
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
