// Linux clipboard reads that have to look at what the owner offers before
// taking its bytes. An X11 owner answers whatever target it is asked for with
// the one thing it holds, so a plain text read can come back as an image's
// bytes, and the webview's paste events never carry the image itself.

#[cfg(all(unix, not(target_os = "macos")))]
use super::{clipboard_tool, ClipboardTool};

/// Clipboard text that is safe to type into a terminal: empty when the owner
/// offers no text, or when what comes back is binary.
#[cfg(all(unix, not(target_os = "macos")))]
pub(super) fn text() -> Result<String, String> {
    let Some(tool) = clipboard_tool() else {
        return Ok(String::new());
    };
    let offered = types(tool).map(|types| types.iter().any(|t| is_text_type(t)));
    if offered == Some(false) {
        return Ok(String::new());
    }
    let (program, args) = tool.read;
    let out = std::process::Command::new(program)
        .args(args)
        .env("LC_CTYPE", "UTF-8")
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|e| format!("spawn {program}: {e}"))?;
    if !out.status.success() {
        return Ok(String::new());
    }
    Ok(bytes_as_text(&out.stdout, offered == Some(true)))
}

/// The image the clipboard holds, as (MIME type, bytes).
#[cfg(all(unix, not(target_os = "macos")))]
pub(super) fn image() -> Option<(String, Vec<u8>)> {
    let tool = clipboard_tool()?;
    let (program, args) = tool.read_typed?;
    let mime = pick_image_type(&types(tool)?)?;
    let out = std::process::Command::new(program)
        .args(args)
        .arg(mime)
        .stdin(std::process::Stdio::null())
        .output()
        .ok()?;
    (out.status.success() && !out.stdout.is_empty()).then(|| (mime.to_string(), out.stdout))
}

/// The targets (X11) or MIME types (Wayland) the owner offers; None when the
/// tool can't list them.
#[cfg(all(unix, not(target_os = "macos")))]
fn types(tool: &ClipboardTool) -> Option<Vec<String>> {
    let (program, args) = tool.list_types?;
    let out = std::process::Command::new(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
    )
}

/// NUL bytes mark binary data; invalid UTF-8 is only decoded when the owner
/// said it holds text (a Latin-1 STRING owner).
fn bytes_as_text(bytes: &[u8], offered_text: bool) -> String {
    if bytes.contains(&0) {
        return String::new();
    }
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) if offered_text => String::from_utf8_lossy(bytes).into_owned(),
        Err(_) => String::new(),
    }
}

fn is_text_type(t: &str) -> bool {
    matches!(t, "UTF8_STRING" | "STRING" | "TEXT" | "COMPOUND_TEXT") || t.starts_with("text/")
}

fn pick_image_type(types: &[String]) -> Option<&'static str> {
    const PREFERRED: &[&str] = &[
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/bmp",
    ];
    PREFERRED
        .iter()
        .copied()
        .find(|t| types.iter().any(|offered| offered == t))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(types: &[&str]) -> Vec<String> {
        types.iter().map(|t| t.to_string()).collect()
    }

    #[test]
    fn binary_bytes_are_never_text() {
        let png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";
        assert_eq!(bytes_as_text(png, false), "");
        assert_eq!(bytes_as_text(png, true), "");
        assert_eq!(bytes_as_text(b"\x89PNG", false), "");
    }

    #[test]
    fn text_bytes_pass_through() {
        assert_eq!(bytes_as_text("plain ütf".as_bytes(), false), "plain ütf");
        assert_eq!(bytes_as_text(b"caf\xe9", true), "caf\u{fffd}");
    }

    #[test]
    fn text_targets_are_recognised() {
        assert!(is_text_type("UTF8_STRING"));
        assert!(is_text_type("text/plain;charset=utf-8"));
        assert!(!is_text_type("image/png"));
        assert!(!is_text_type("TARGETS"));
    }

    #[test]
    fn png_wins_among_offered_images() {
        let gtk = list(&[
            "TARGETS",
            "image/bmp",
            "image/jpeg",
            "image/png",
            "image/tiff",
        ]);
        assert_eq!(pick_image_type(&gtk), Some("image/png"));
        assert_eq!(
            pick_image_type(&list(&["TARGETS", "image/jpeg"])),
            Some("image/jpeg")
        );
        assert_eq!(pick_image_type(&list(&["TARGETS", "UTF8_STRING"])), None);
    }
}
