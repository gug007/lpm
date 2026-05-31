// Terminal upload + paste-path formatting — port of desktop/upload.go.
//
// For a remote (ssh) pane, files are scp'd to ~/.lpm/uploads/<batch>/ on the
// remote (reusing the terminal's ControlMaster socket) and the remote paths are
// returned. For a local pane, the local paths are returned as-is. The result is
// shell-quoted (single images stay unquoted so path-detecting agents can stat
// them) and the FRONTEND pastes it into the terminal — we never write the pty.
use crate::pty::{self, PtyState};
use crate::{clipboard, config};
use std::path::Path;
use std::process::Command;
use tauri::State;

#[tauri::command(async)]
pub fn upload_and_quote_for_terminal(
    state: State<'_, PtyState>,
    terminal_id: String,
    local_paths: Vec<String>,
) -> Result<String, String> {
    if local_paths.is_empty() {
        return Ok(String::new());
    }
    match pty::session_remote_ssh(&state, &terminal_id) {
        Some((true, Some(ssh))) => {
            let remote_paths = upload_files(&ssh, &local_paths)?;
            Ok(format_paste_paths(&remote_paths))
        }
        _ => Ok(format_paste_paths(&local_paths)),
    }
}

#[tauri::command(async)]
pub fn upload_clipboard_image_for_terminal(
    state: State<'_, PtyState>,
    terminal_id: String,
    b64_data: String,
    mime_type: String,
) -> Result<String, String> {
    let local = clipboard::save_clipboard_image_impl(&b64_data, &mime_type)?;
    upload_and_quote_for_terminal(state, terminal_id, vec![local])
}

fn new_batch_id() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut rb = [0u8; 3];
    let _ = getrandom::getrandom(&mut rb);
    format!("{secs}-{}", hex::encode(rb))
}

fn upload_files(ssh: &config::SshSettings, locals: &[String]) -> Result<Vec<String>, String> {
    let batch = new_batch_id();
    let _ = config::ensure_ssh_control_dir();

    // Resolve via $HOME on the remote to dodge the ~-expansion-vs-quoting trap
    // when pasting paths with special chars in basenames.
    let remote_cmd = format!(
        "mkdir -p \"$HOME/.lpm/uploads/{batch}\" && printf '%s' \"$HOME/.lpm/uploads/{batch}\""
    );
    let mut mkdir_args = config::ssh_args(ssh);
    mkdir_args.push(remote_cmd);
    let out = Command::new("ssh")
        .args(&mkdir_args)
        .output()
        .map_err(|e| format!("ssh mkdir: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "ssh mkdir: {}",
            trim_output(&String::from_utf8_lossy(&out.stderr))
        ));
    }
    let remote_dir = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if remote_dir.is_empty() {
        return Err("ssh mkdir returned empty path".into());
    }

    let mut scp_args = config::scp_args(ssh);
    scp_args.push("-r".into());
    scp_args.push("-p".into());
    scp_args.push("--".into());
    for p in locals {
        scp_args.push(p.clone());
    }
    scp_args.push(format!("{}@{}:{}/", ssh.user, ssh.host, remote_dir));
    let scp = Command::new("scp")
        .args(&scp_args)
        .output()
        .map_err(|e| format!("scp: {e}"))?;
    if !scp.status.success() {
        return Err(format!("scp: {}", trim_output(&String::from_utf8_lossy(&scp.stderr))));
    }

    Ok(locals.iter().map(|p| format!("{remote_dir}/{}", basename(p))).collect())
}

fn basename(p: &str) -> String {
    Path::new(p)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| p.to_string())
}

fn trim_output(s: &str) -> String {
    let s = s.trim();
    const MAX: usize = 400;
    if s.len() > MAX {
        let mut end = MAX;
        while end < s.len() && !s.is_char_boundary(end) {
            end += 1;
        }
        format!("{}...", &s[..end])
    } else {
        s.to_string()
    }
}

/// Mirrors formatPastedPaths (InteractivePane.tsx): a single image path stays
/// unquoted; otherwise each path is shell-quoted and space-joined.
fn format_paste_paths(paths: &[String]) -> String {
    if paths.len() == 1 && is_image_path(&paths[0]) {
        return paths[0].clone();
    }
    paths
        .iter()
        .map(|p| shell_quote_single(p))
        .collect::<Vec<_>>()
        .join(" ")
}

// IMAGE_EXT_RE in InteractivePane.tsx, case-insensitive.
fn is_image_path(s: &str) -> bool {
    let l = s.to_ascii_lowercase();
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".heif"]
        .iter()
        .any(|e| l.ends_with(e))
}

// safePathChars in shellQuote (terminal-io.ts): ^[A-Za-z0-9_./:~-]+$
fn is_safe_path(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '/' | ':' | '~' | '-'))
}

fn shell_quote_single(s: &str) -> String {
    if s.is_empty() {
        return "''".to_string();
    }
    if is_safe_path(s) {
        return s.to_string();
    }
    format!("'{}'", s.replace('\'', r"'\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_image_unquoted() {
        assert_eq!(format_paste_paths(&["/tmp/a.png".into()]), "/tmp/a.png");
        assert_eq!(format_paste_paths(&["/tmp/x.PNG".into()]), "/tmp/x.PNG"); // case-insensitive
    }

    #[test]
    fn multiple_or_nonimage_quoted_when_unsafe() {
        // safe single non-image stays unquoted
        assert_eq!(format_paste_paths(&["/tmp/notes.txt".into()]), "/tmp/notes.txt");
        // space in a path -> quoted
        assert_eq!(format_paste_paths(&["/tmp/a b.txt".into()]), "'/tmp/a b.txt'");
        // two images -> both quoted+joined (not the single-image bypass)
        assert_eq!(
            format_paste_paths(&["/a.png".into(), "/b.png".into()]),
            "/a.png /b.png"
        );
    }

    #[test]
    fn quote_escapes_single_quote() {
        assert_eq!(shell_quote_single("a'b"), r#"'a'\''b'"#);
        assert_eq!(shell_quote_single(""), "''");
    }
}
