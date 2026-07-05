// macOS clipboard — port of ReadClipboardFiles + SaveClipboardImage (pty.go).
//
// ReadClipboardFiles uses osascript (NSPasteboard via AppKit) because file-URL
// pasteboard items aren't exposed by simpler clipboard crates. SaveClipboardImage
// is pure base64 decode → temp file (the frontend already supplies the bytes).
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use std::io::Write;

// Byte-for-byte the Go AppleScript (note `|path|` escaping + `character id 10`).
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
    let out = match std::process::Command::new("osascript")
        .arg("-e")
        .arg(READ_FILES_SCRIPT)
        .output()
    {
        Ok(o) => o,
        Err(_) => return Ok(Vec::new()), // osascript failed -> swallow (Go nil,nil)
    };
    if !out.status.success() {
        return Ok(Vec::new());
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    Ok(trimmed.split('\n').map(str::to_string).collect())
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
        if !entry.file_name().to_string_lossy().starts_with("clipboard-") {
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

/// Write text to the system clipboard via pbcopy. The WKWebView refuses
/// `navigator.clipboard` writes that aren't tied to a user gesture, which is
/// exactly the case for OSC 52 writes arriving asynchronously from the PTY.
#[tauri::command(async)]
pub fn set_clipboard_text(text: String) -> Result<(), String> {
    let mut child = std::process::Command::new("pbcopy")
        // Without a UTF-8 locale pbcopy decodes stdin as Mac Roman, mangling
        // multi-byte characters.
        .env("LC_CTYPE", "UTF-8")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn pbcopy: {e}"))?;
    // Always reap the child, even when the write fails, so no zombie is left.
    let write_res = match child.stdin.take() {
        Some(mut stdin) => stdin
            .write_all(text.as_bytes())
            .map_err(|e| format!("write pbcopy: {e}")),
        None => Err("pbcopy stdin unavailable".to_string()),
    };
    let wait_res = child.wait().map_err(|e| format!("wait pbcopy: {e}"));
    write_res?;
    let status = wait_res?;
    if !status.success() {
        return Err(format!("pbcopy exited with {status}"));
    }
    Ok(())
}
