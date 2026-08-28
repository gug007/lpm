//! Moving a file or folder to the system Trash. Never a hard delete: on a host
//! with no trash tool this errors and leaves the path in place, because the
//! user consented to a recoverable move, not a destruction. A path that is
//! already gone counts as success, so a retried removal never wedges.

use std::path::Path;

/// AppleScript (ASObjC) that sends argv item 1 to the Trash via Foundation's
/// NSFileManager — the same mechanism as dragging to Trash, so the folder stays
/// restorable and no Finder-automation permission is needed. The path travels as
/// an argv item, so it never has to be escaped into the script source.
#[cfg(target_os = "macos")]
const TRASH_SCRIPT: &str = r#"use framework "Foundation"
on run argv
set p to item 1 of argv
set fm to current application's NSFileManager's defaultManager()
set u to current application's NSURL's fileURLWithPath:p
set {ok, err} to fm's trashItemAtURL:u resultingItemURL:(missing value) |error|:(reference)
if not ok then error (err's localizedDescription() as text)
end run"#;

/// Move `path` to the host's trash, using whichever tool the desktop stack
/// provides. A host with none is an ERROR, never a fallback hard delete: the user
/// consented to a recoverable move, so `rm -rf` is not an acceptable substitute.
#[cfg(not(target_os = "macos"))]
pub fn move_to_trash(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    const TOOLS: &[(&str, &[&str])] = &[("gio", &["trash"]), ("trash-put", &[])];
    for (bin, args) in TOOLS {
        if !crate::sys::which(bin) {
            continue;
        }
        let out = std::process::Command::new(bin)
            .args(*args)
            .arg(path)
            .output()
            .map_err(|e| format!("move to Trash: {e}"))?;
        if out.status.success() {
            return Ok(());
        }
        let err = String::from_utf8_lossy(&out.stderr);
        let msg = err.trim();
        return Err(if msg.is_empty() {
            "move to Trash failed".to_string()
        } else {
            format!("move to Trash: {msg}")
        });
    }
    Err("This host has no Trash, so nothing was removed. Remove it on the host directly.".into())
}

/// Move `path` to the macOS Trash. A path that is already gone counts as success
/// so a retried removal never gets stuck on a folder that's no longer there.
#[cfg(target_os = "macos")]
pub fn move_to_trash(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let out = std::process::Command::new("osascript")
        .arg("-e")
        .arg(TRASH_SCRIPT)
        .arg(path)
        .output()
        .map_err(|e| format!("move to Trash: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let msg = err.trim();
        return Err(if msg.is_empty() {
            "move to Trash failed".to_string()
        } else {
            format!("move to Trash: {msg}")
        });
    }
    Ok(())
}
