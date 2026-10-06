// The Path environment value as Windows stores it: the user's under
// HKCU\Environment, the machine's under the Session Manager key. Values are read
// raw (unexpanded) so a rewrite keeps the user's %VAR% references intact.
use std::ptr;
use windows_sys::Win32::Foundation::{
    ERROR_FILE_NOT_FOUND, ERROR_MORE_DATA, ERROR_SUCCESS, LPARAM,
};
use windows_sys::Win32::System::Registry::{
    RegGetValueW, RegSetKeyValueW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, REG_EXPAND_SZ,
    RRF_NOEXPAND, RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
};

const USER_ENV: &str = "Environment";
const SYSTEM_ENV: &str = r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment";

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// The raw (unexpanded) Path value; Ok(None) when it doesn't exist.
fn read(root: HKEY, subkey: &str) -> Result<Option<String>, u32> {
    let sub = wide(subkey);
    let name = wide("Path");
    let flags = RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ | RRF_NOEXPAND;
    for _ in 0..3 {
        let mut size = 0u32;
        let rc = unsafe {
            RegGetValueW(
                root,
                sub.as_ptr(),
                name.as_ptr(),
                flags,
                ptr::null_mut(),
                ptr::null_mut(),
                &mut size,
            )
        };
        if rc == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if rc != ERROR_SUCCESS {
            return Err(rc);
        }
        let mut buf = vec![0u16; (size as usize).div_ceil(2) + 1];
        let mut cap = (buf.len() * 2) as u32;
        let rc = unsafe {
            RegGetValueW(
                root,
                sub.as_ptr(),
                name.as_ptr(),
                flags,
                ptr::null_mut(),
                buf.as_mut_ptr().cast(),
                &mut cap,
            )
        };
        if rc == ERROR_SUCCESS {
            let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            return Ok(Some(String::from_utf16_lossy(&buf[..len])));
        }
        if rc == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        // ERROR_MORE_DATA: the value grew between the two calls.
    }
    Err(ERROR_MORE_DATA)
}

pub fn user_path() -> Result<Option<String>, u32> {
    read(HKEY_CURRENT_USER, USER_ENV)
}

pub fn system_path() -> Option<String> {
    read(HKEY_LOCAL_MACHINE, SYSTEM_ENV).ok().flatten()
}

pub fn set_user_path(value: &str) -> Result<(), String> {
    let sub = wide(USER_ENV);
    let name = wide("Path");
    let data = wide(value);
    let rc = unsafe {
        RegSetKeyValueW(
            HKEY_CURRENT_USER,
            sub.as_ptr(),
            name.as_ptr(),
            REG_EXPAND_SZ,
            data.as_ptr().cast(),
            (data.len() * 2) as u32,
        )
    };
    if rc != ERROR_SUCCESS {
        return Err(format!("failed to update your Path (error {rc})"));
    }
    broadcast_change();
    Ok(())
}

/// Tell Explorer and other top-level windows to reload the environment, so
/// terminals opened from now on see the new Path without a sign-out.
fn broadcast_change() {
    let area = wide("Environment");
    let mut result = 0usize;
    unsafe {
        SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0,
            area.as_ptr() as LPARAM,
            SMTO_ABORTIFHUNG,
            5000,
            &mut result,
        );
    }
}
