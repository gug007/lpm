// The per-user Run key starts lpm at sign-in. Task Manager's Startup apps page
// switches an entry off by marking it in StartupApproved instead of removing it,
// so that mark is read too, and cleared when lpm is switched back on.
use super::LoginItem;
use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
use windows_sys::Win32::System::Registry::{
    RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ,
    RRF_RT_REG_BINARY, RRF_RT_REG_SZ,
};

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
const NAME: &str = "lpm";

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain([0]).collect()
}

pub fn state() -> LoginItem {
    LoginItem {
        supported: true,
        enabled: has_run_entry() && !switched_off(),
        needs_approval: false,
    }
}

pub fn set(enabled: bool) -> Result<(), String> {
    if enabled {
        let exe = std::env::current_exe().map_err(|e| format!("Couldn't find lpm.exe: {e}"))?;
        let command = wide(&format!("\"{}\"", exe.display()));
        let code = unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                wide(RUN).as_ptr(),
                wide(NAME).as_ptr(),
                REG_SZ,
                command.as_ptr().cast(),
                (command.len() * 2) as u32,
            )
        };
        if code != ERROR_SUCCESS {
            return Err(format!("Couldn't add lpm to startup apps (error {code})."));
        }
        delete(APPROVED)
    } else {
        delete(RUN)?;
        delete(APPROVED)
    }
}

fn has_run_entry() -> bool {
    let mut size = 0u32;
    let code = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            wide(RUN).as_ptr(),
            wide(NAME).as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut size,
        )
    };
    code == ERROR_SUCCESS
}

// Task Manager writes 12 bytes whose first is odd while the entry is off.
fn switched_off() -> bool {
    let mut data = [0u8; 12];
    let mut size = data.len() as u32;
    let code = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            wide(APPROVED).as_ptr(),
            wide(NAME).as_ptr(),
            RRF_RT_REG_BINARY,
            std::ptr::null_mut(),
            data.as_mut_ptr().cast(),
            &mut size,
        )
    };
    code == ERROR_SUCCESS && size > 0 && data[0] & 1 == 1
}

fn delete(subkey: &str) -> Result<(), String> {
    let code = unsafe {
        RegDeleteKeyValueW(
            HKEY_CURRENT_USER,
            wide(subkey).as_ptr(),
            wide(NAME).as_ptr(),
        )
    };
    if code == ERROR_SUCCESS || code == ERROR_FILE_NOT_FOUND {
        Ok(())
    } else {
        Err(format!(
            "Couldn't remove lpm from startup apps (error {code})."
        ))
    }
}
