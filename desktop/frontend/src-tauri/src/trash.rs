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
#[cfg(all(unix, not(target_os = "macos")))]
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

/// Move `path` to the Recycle Bin. Where the bin can't take it (a network
/// share, an item larger than the bin) the shell would delete outright, so it
/// is told to ask first; declining leaves the path where it is.
#[cfg(windows)]
pub fn move_to_trash(path: &Path) -> Result<(), String> {
    use windows_sys::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED,
    };
    use windows_sys::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT,
        FOF_WANTNUKEWARNING, FO_DELETE, SHFILEOPSTRUCTW,
    };
    if !path.exists() {
        return Ok(());
    }
    let from = shell_path(path)?;
    let flags =
        FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI | FOF_WANTNUKEWARNING;
    let mut op = SHFILEOPSTRUCTW {
        wFunc: FO_DELETE,
        pFrom: from.as_ptr(),
        fFlags: flags as u16,
        ..Default::default()
    };
    let com = unsafe { CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32) };
    let code = unsafe { SHFileOperationW(&mut op) };
    if com >= 0 {
        unsafe { CoUninitialize() };
    }
    if op.fAnyOperationsAborted != 0 {
        return Err("Nothing was removed: it can't go to the Recycle Bin.".into());
    }
    if code != 0 || path.exists() {
        return Err(format!("move to Recycle Bin failed (code {code:#x})"));
    }
    Ok(())
}

/// SHFileOperation takes an absolute, backslashed path without the verbatim
/// `\\?\` prefix.
#[cfg(any(windows, test))]
fn shell_path_text(abs: &str) -> String {
    let s = abs.replace('/', "\\");
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = s.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        s
    }
}

/// The path as the double-NUL-terminated list SHFileOperation reads.
#[cfg(windows)]
fn shell_path(path: &Path) -> Result<Vec<u16>, String> {
    let abs = std::path::absolute(path).map_err(|e| e.to_string())?;
    Ok(shell_path_text(&abs.to_string_lossy())
        .encode_utf16()
        .chain([0, 0])
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_paths_drop_the_verbatim_prefix() {
        assert_eq!(shell_path_text(r"\\?\C:\proj\app"), r"C:\proj\app");
        assert_eq!(shell_path_text(r"\\?\UNC\srv\share\x"), r"\\srv\share\x");
        assert_eq!(shell_path_text("C:/proj/app"), r"C:\proj\app");
    }

    #[test]
    fn a_missing_path_is_already_trashed() {
        let dir = tempfile::tempdir().unwrap();
        assert!(move_to_trash(&dir.path().join("gone")).is_ok());
    }
}
