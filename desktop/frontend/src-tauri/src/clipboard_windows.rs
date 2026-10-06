// The Win32 clipboard: CF_UNICODETEXT for text, CF_HDROP for files copied in
// Explorer. clip.exe is no substitute: it mangles UTF-8 and cannot read.
use std::time::Duration;
use windows_sys::Win32::Foundation::GlobalFree;
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    SetClipboardData,
};
use windows_sys::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
use windows_sys::Win32::System::Ole::{CF_HDROP, CF_UNICODETEXT};
use windows_sys::Win32::UI::Shell::DragQueryFileW;

/// The clipboard, held open; another app holding it briefly is retried.
struct Open;

impl Open {
    fn new() -> Result<Self, String> {
        for _ in 0..10 {
            if unsafe { OpenClipboard(std::ptr::null_mut()) } != 0 {
                return Ok(Open);
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        Err("the clipboard is in use by another app".into())
    }
}

impl Drop for Open {
    fn drop(&mut self) {
        unsafe { CloseClipboard() };
    }
}

fn available(format: u16) -> bool {
    unsafe { IsClipboardFormatAvailable(u32::from(format)) != 0 }
}

pub fn read_text() -> Result<String, String> {
    if !available(CF_UNICODETEXT) {
        return Ok(String::new());
    }
    let _open = Open::new()?;
    let handle = unsafe { GetClipboardData(u32::from(CF_UNICODETEXT)) };
    if handle.is_null() {
        return Ok(String::new());
    }
    let ptr = unsafe { GlobalLock(handle) } as *const u16;
    if ptr.is_null() {
        return Ok(String::new());
    }
    let units = unsafe { std::slice::from_raw_parts(ptr, GlobalSize(handle) / 2) };
    let len = units.iter().position(|&u| u == 0).unwrap_or(units.len());
    let text = String::from_utf16_lossy(&units[..len]);
    unsafe { GlobalUnlock(handle) };
    Ok(text)
}

/// Lone `\n` becomes `\r\n`, the line ending Windows apps expect on paste.
fn crlf(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\n', "\r\n")
}

pub fn write_text(text: &str) -> Result<(), String> {
    let wide: Vec<u16> = crlf(text).encode_utf16().chain([0]).collect();
    let mem = unsafe { GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2) };
    if mem.is_null() {
        return Err("could not allocate clipboard memory".into());
    }
    let dst = unsafe { GlobalLock(mem) } as *mut u16;
    if dst.is_null() {
        unsafe { GlobalFree(mem) };
        return Err("could not lock clipboard memory".into());
    }
    unsafe {
        std::ptr::copy_nonoverlapping(wide.as_ptr(), dst, wide.len());
        GlobalUnlock(mem);
    }
    let _open = match Open::new() {
        Ok(open) => open,
        Err(e) => {
            unsafe { GlobalFree(mem) };
            return Err(e);
        }
    };
    unsafe { EmptyClipboard() };
    // On success the clipboard owns the memory; on failure it is still ours.
    if unsafe { SetClipboardData(u32::from(CF_UNICODETEXT), mem) }.is_null() {
        let err = std::io::Error::last_os_error();
        unsafe { GlobalFree(mem) };
        return Err(format!("could not set the clipboard: {err}"));
    }
    Ok(())
}

pub fn read_files() -> Vec<String> {
    if !available(CF_HDROP) {
        return Vec::new();
    }
    let Ok(_open) = Open::new() else {
        return Vec::new();
    };
    let hdrop = unsafe { GetClipboardData(u32::from(CF_HDROP)) };
    if hdrop.is_null() {
        return Vec::new();
    }
    let count = unsafe { DragQueryFileW(hdrop, u32::MAX, std::ptr::null_mut(), 0) };
    (0..count)
        .filter_map(|i| {
            let len = unsafe { DragQueryFileW(hdrop, i, std::ptr::null_mut(), 0) };
            let mut buf = vec![0u16; len as usize + 1];
            let got = unsafe { DragQueryFileW(hdrop, i, buf.as_mut_ptr(), buf.len() as u32) };
            (got > 0).then(|| String::from_utf16_lossy(&buf[..got as usize]))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn line_feeds_become_crlf_once() {
        assert_eq!(crlf("a\nb\r\nc"), "a\r\nb\r\nc");
    }
}
