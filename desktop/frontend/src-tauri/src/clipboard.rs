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
        _ => ".png", // default incl. image/png and unknown
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
