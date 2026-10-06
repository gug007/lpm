// System clipboard — port of ReadClipboardFiles + SaveClipboardImage (pty.go).
//
// ReadClipboardFiles uses osascript on macOS (NSPasteboard via AppKit) because
// file-URL pasteboard items aren't exposed by simpler clipboard crates; Linux
// reads the copied files' URI list through the same Wayland/X11 tools as text,
// and Windows uses the Win32 clipboard (clipboard_windows.rs). SaveClipboardImage
// is pure base64 decode → temp file (the frontend already supplies the bytes).
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use std::io::Write;

#[cfg(windows)]
#[path = "clipboard_windows.rs"]
mod win;

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
#[path = "clipboard_linux.rs"]
mod linux;

// Byte-for-byte the Go AppleScript (note `|path|` escaping + `character id 10`).
#[cfg(target_os = "macos")]
const READ_FILES_SCRIPT: &str = r#"use framework "AppKit"
set pb to current application's NSPasteboard's generalPasteboard()
set fileType to current application's NSPasteboardTypeFileURL
if not (pb's canReadItemWithDataConformingToTypes:{fileType}) as boolean then return ""
set urls to pb's readObjectsForClasses:{current application's NSURL} options:(missing value)
if urls is missing value or (count of urls) = 0 then return ""
set paths to {}
repeat with u in urls
if (u's isFileURL() as boolean) then copy (u's |path|() as text) to end of paths
end repeat
set AppleScript's text item delimiters to (character id 10)
return paths as text"#;

#[tauri::command(async)]
pub fn read_clipboard_files() -> Result<Vec<String>, String> {
    Ok(clipboard_files())
}

#[cfg(target_os = "macos")]
fn clipboard_files() -> Vec<String> {
    let out = match std::process::Command::new("osascript")
        .arg("-e")
        .arg(READ_FILES_SCRIPT)
        .output()
    {
        Ok(o) => o,
        Err(_) => return Vec::new(), // osascript failed -> swallow (Go nil,nil)
    };
    if !out.status.success() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    trimmed.split('\n').map(str::to_string).collect()
}

/// A file manager publishes copied files as a `text/uri-list` (GNOME's own
/// `x-special/gnome-copied-files` adds a leading copy/cut line). xsel can only
/// read text, so with it there are never files.
#[cfg(all(unix, not(target_os = "macos")))]
fn clipboard_files() -> Vec<String> {
    let Some((program, args)) = clipboard_tool().and_then(|t| t.read_typed) else {
        return Vec::new();
    };
    for mime in ["text/uri-list", "x-special/gnome-copied-files"] {
        let Ok(out) = std::process::Command::new(program)
            .args(args)
            .arg(mime)
            .stdin(std::process::Stdio::null())
            .output()
        else {
            return Vec::new();
        };
        if out.status.success() {
            let files = file_paths_from_uri_list(&String::from_utf8_lossy(&out.stdout));
            if !files.is_empty() {
                return files;
            }
        }
    }
    Vec::new()
}

#[cfg(windows)]
fn clipboard_files() -> Vec<String> {
    win::read_files()
}

/// Local `file://` URIs from a URI list, percent-decoded; comments, other
/// schemes and other hosts' files are skipped.
#[cfg(any(test, all(unix, not(target_os = "macos"))))]
fn file_paths_from_uri_list(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.starts_with('#'))
        .filter_map(|l| {
            let rest = l.strip_prefix("file://")?;
            let path = match rest.find('/') {
                Some(0) => rest,
                Some(i) if &rest[..i] == "localhost" => &rest[i..],
                _ => return None,
            };
            let bytes = urlencoding::decode_binary(path.as_bytes());
            Some(String::from_utf8_lossy(&bytes).into_owned())
        })
        .collect()
}

fn ext_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => ".jpg",
        "image/gif" => ".gif",
        "image/webp" => ".webp",
        "image/bmp" => ".bmp",
        "image/heic" => ".heic",
        "image/heif" => ".heif",
        "image/svg+xml" => ".svg",
        "image/tiff" => ".tif",
        _ => ".png", // default incl. image/png and unknown
    }
}

// Best-effort removal of clipboard image temp files older than 24h. save_clip-
// board_image leaves each pasted image on disk (the agent reads the pasted path
// asynchronously), so they accumulate; the OS only sweeps $TMPDIR after days.
// Only our "clipboard-" prefixed files are touched — Finder/OS-drop paths point
// at real user files and are never written here. The 24h grace covers an in-
// flight paste the receiver hasn't read yet and same-day history recalls.
pub fn reap_stale_clipboard_images() {
    const MAX_AGE: std::time::Duration = std::time::Duration::from_secs(24 * 60 * 60);
    let now = std::time::SystemTime::now();
    let entries = match std::fs::read_dir(std::env::temp_dir()) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        if !entry
            .file_name()
            .to_string_lossy()
            .starts_with("clipboard-")
        {
            continue;
        }
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|m| now.duration_since(m).ok())
            .is_some_and(|age| age > MAX_AGE);
        if stale {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Read the system clipboard's text — the read twin of set_clipboard_text.
/// Returns an empty string when the clipboard holds no text, or when this host
/// has no clipboard at all (a headless server: nothing to read, not an error the
/// invite-detect path should surface). Capped at 16 KB: invites are tiny, and
/// shipping a multi-MB clipboard to JS is wasteful. `full` lifts the cap for a
/// keyboard paste, which must never deliver part of what was copied.
#[tauri::command(async)]
pub fn read_clipboard_text(full: Option<bool>) -> Result<String, String> {
    let s = clipboard_text()?;
    Ok(if full == Some(true) { s } else { cap_text(s) })
}

fn cap_text(mut s: String) -> String {
    const CAP: usize = 16 * 1024;
    if s.len() > CAP {
        let mut end = CAP;
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        s.truncate(end);
    }
    s
}

#[cfg(target_os = "macos")]
fn clipboard_text() -> Result<String, String> {
    let Some((program, args)) = read_argv() else {
        return Ok(String::new());
    };
    let out = std::process::Command::new(program)
        .args(args)
        .env("LC_CTYPE", "UTF-8")
        .output()
        .map_err(|e| format!("spawn {program}: {e}"))?;
    if !out.status.success() {
        return Ok(String::new());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn clipboard_text() -> Result<String, String> {
    linux::text()
}

/// An image the clipboard holds, for a paste whose webview hands over none
/// (WebKitGTK paste events carry no image data).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardImage {
    mime_type: String,
    b64_data: String,
}

#[tauri::command(async)]
pub fn read_clipboard_image() -> Option<ClipboardImage> {
    #[cfg(all(unix, not(target_os = "macos")))]
    let image = linux::image();
    #[cfg(not(all(unix, not(target_os = "macos"))))]
    let image: Option<(String, Vec<u8>)> = None;
    image.map(|(mime_type, bytes)| ClipboardImage {
        mime_type,
        b64_data: B64.encode(bytes),
    })
}

#[cfg(windows)]
fn clipboard_text() -> Result<String, String> {
    win::read_text()
}

/// Decode a base64 image and write it to a temp file; returns the path. The
/// file is intentionally left on disk (matches Go — caller pastes the path).
pub fn save_clipboard_image_impl(b64_data: &str, mime_type: &str) -> Result<String, String> {
    let bytes = B64
        .decode(b64_data.as_bytes())
        .map_err(|e| format!("decode base64: {e}"))?;
    let tmp = tempfile::Builder::new()
        .prefix("clipboard-")
        .suffix(ext_for_mime(mime_type))
        .tempfile()
        .map_err(|e| format!("create temp file: {e}"))?;
    let (mut file, path) = tmp.into_parts();
    if let Err(e) = file.write_all(&bytes) {
        drop(file);
        let _ = std::fs::remove_file(&path);
        return Err(format!("write temp file: {e}"));
    }
    let kept = path.keep().map_err(|e| format!("persist temp file: {e}"))?;
    Ok(kept.to_string_lossy().into_owned())
}

#[tauri::command(async)]
pub fn save_clipboard_image(b64_data: String, mime_type: String) -> Result<String, String> {
    save_clipboard_image_impl(&b64_data, &mime_type)
}

/// Decode a base64 file and write it to disk under its ORIGINAL basename,
/// uniquified via a fresh temp subdirectory so distinct uploads with the same
/// name never collide and the name an agent sees stays meaningful. Returns the
/// path (left on disk like the image path — the caller pastes it).
pub fn save_clipboard_file_impl(b64_data: &str, name: &str) -> Result<String, String> {
    let bytes = B64
        .decode(b64_data.as_bytes())
        .map_err(|e| format!("decode base64: {e}"))?;
    let base = std::path::Path::new(name)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "file".to_string());
    let mut rb = [0u8; 4];
    let _ = getrandom::fill(&mut rb);
    let dir = std::env::temp_dir().join(format!("lpm-upload-{}", hex::encode(rb)));
    std::fs::create_dir_all(&dir).map_err(|e| format!("create upload dir: {e}"))?;
    let path = dir.join(&base);
    std::fs::write(&path, &bytes).map_err(|e| format!("write file: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

/// The clipboard helper for this host, as (program, args). macOS always has
/// pbcopy/pbpaste; Linux probes once for the usual Wayland/X11 tools; Windows
/// talks to the Win32 clipboard directly.
#[cfg(all(unix, not(target_os = "macos")))]
struct ClipboardTool {
    write: (&'static str, &'static [&'static str]),
    read: (&'static str, &'static [&'static str]),
    /// Reads the MIME type given as the last argument; None for a tool that
    /// only reads text.
    read_typed: Option<(&'static str, &'static [&'static str])>,
    /// Lists the offered types one per line; None for a tool that can't.
    list_types: Option<(&'static str, &'static [&'static str])>,
}

#[cfg(all(unix, not(target_os = "macos")))]
const CLIPBOARD_TOOLS: &[ClipboardTool] = &[
    ClipboardTool {
        write: ("wl-copy", &[]),
        read: ("wl-paste", &["--no-newline", "--type", "text"]),
        read_typed: Some(("wl-paste", &["--no-newline", "--type"])),
        list_types: Some(("wl-paste", &["--list-types"])),
    },
    ClipboardTool {
        write: ("xclip", &["-selection", "clipboard"]),
        read: ("xclip", &["-selection", "clipboard", "-o"]),
        read_typed: Some(("xclip", &["-selection", "clipboard", "-o", "-t"])),
        list_types: Some(("xclip", &["-selection", "clipboard", "-o", "-t", "TARGETS"])),
    },
    ClipboardTool {
        write: ("xsel", &["--clipboard", "--input"]),
        read: ("xsel", &["--clipboard", "--output"]),
        read_typed: None,
        list_types: None,
    },
];

#[cfg(all(unix, not(target_os = "macos")))]
fn clipboard_tool() -> Option<&'static ClipboardTool> {
    static FOUND: std::sync::OnceLock<Option<usize>> = std::sync::OnceLock::new();
    (*FOUND.get_or_init(|| {
        CLIPBOARD_TOOLS
            .iter()
            .position(|t| crate::sys::which(t.write.0))
    }))
    .map(|i| &CLIPBOARD_TOOLS[i])
}

#[cfg(all(unix, not(target_os = "macos")))]
const NO_CLIPBOARD: &str =
    "This host has no clipboard available (install wl-clipboard, xclip, or xsel).";

#[cfg(target_os = "macos")]
fn write_argv() -> Result<(&'static str, &'static [&'static str]), String> {
    Ok(("pbcopy", &[]))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn write_argv() -> Result<(&'static str, &'static [&'static str]), String> {
    clipboard_tool()
        .map(|t| t.write)
        .ok_or_else(|| NO_CLIPBOARD.to_string())
}

#[cfg(target_os = "macos")]
fn read_argv() -> Option<(&'static str, &'static [&'static str])> {
    Some(("pbpaste", &[]))
}

/// Write text to the system clipboard. The WKWebView refuses
/// `navigator.clipboard` writes that aren't tied to a user gesture, which is
/// exactly the case for OSC 52 writes arriving asynchronously from the PTY.
#[tauri::command(async)]
pub fn set_clipboard_text(text: String) -> Result<(), String> {
    write_text(&text)
}

#[cfg(windows)]
fn write_text(text: &str) -> Result<(), String> {
    win::write_text(text)
}

#[cfg(unix)]
fn write_text(text: &str) -> Result<(), String> {
    let (program, args) = write_argv()?;
    let mut child = std::process::Command::new(program)
        .args(args)
        // Without a UTF-8 locale pbcopy decodes stdin as Mac Roman, mangling
        // multi-byte characters.
        .env("LC_CTYPE", "UTF-8")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn {program}: {e}"))?;
    // Always reap the child, even when the write fails, so no zombie is left.
    let write_res = match child.stdin.take() {
        Some(mut stdin) => stdin
            .write_all(text.as_bytes())
            .map_err(|e| format!("write {program}: {e}")),
        None => Err(format!("{program} stdin unavailable")),
    };
    let wait_res = child.wait().map_err(|e| format!("wait {program}: {e}"));
    write_res?;
    let status = wait_res?;
    if !status.success() {
        return Err(format!("{program} exited with {status}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uri_list_yields_local_file_paths() {
        let list = "# comment\r\nfile:///home/dev/My%20Notes/a%23b.md\r\nfile://localhost/tmp/x.png\r\nhttps://example.com/y\r\nfile://otherhost/z\r\n";
        assert_eq!(
            file_paths_from_uri_list(list),
            vec!["/home/dev/My Notes/a#b.md", "/tmp/x.png"]
        );
    }

    #[test]
    fn cap_text_cuts_long_text_on_a_char_boundary() {
        assert_eq!(cap_text("short".into()), "short");
        let long = format!("{}é", "a".repeat(16 * 1024 - 1));
        let capped = cap_text(long);
        assert_eq!(capped.len(), 16 * 1024 - 1);
        assert!(capped.bytes().all(|b| b == b'a'));
    }

    #[test]
    fn gnome_copied_files_skip_the_operation_line() {
        assert_eq!(
            file_paths_from_uri_list("copy\nfile:///srv/app/main.rs"),
            vec!["/srv/app/main.rs"]
        );
    }
}
