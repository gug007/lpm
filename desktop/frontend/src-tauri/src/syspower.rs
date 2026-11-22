// Locking this computer's screen and putting it to sleep, as a phone asks.
//
// macOS locks the way Control-Command-Q does (login.framework's
// SACLockScreenImmediate, looked up at run time) and sleeps with `pmset
// sleepnow`. A Linux desktop locks its session with `loginctl` and suspends with
// `systemctl`; a headless host has no screen to lock, so it only sleeps. Windows
// uses LockWorkStation and SetSuspendState.
use std::sync::OnceLock;

/// Whether this computer can lock its screen from here.
pub(crate) fn can_lock() -> bool {
    static CAN: OnceLock<bool> = OnceLock::new();
    *CAN.get_or_init(|| !crate::sys::headless() && imp::can_lock())
}

/// Whether this computer can be put to sleep from here.
pub(crate) fn can_sleep() -> bool {
    static CAN: OnceLock<bool> = OnceLock::new();
    *CAN.get_or_init(imp::can_sleep)
}

pub(crate) fn lock_screen() -> Result<(), String> {
    if !can_lock() {
        return Err(format!(
            "This {} can't lock its screen from lpm.",
            crate::sys::MACHINE
        ));
    }
    imp::lock_screen()
}

pub(crate) fn sleep_now() -> Result<(), String> {
    if !can_sleep() {
        return Err(format!(
            "This {} can't be put to sleep from lpm.",
            crate::sys::MACHINE
        ));
    }
    imp::sleep_now()
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn run(program: &str, args: &[&str]) -> Result<(), String> {
    let out = crate::osproc::command(program)
        .args(args)
        .output()
        .map_err(|e| format!("Couldn't run {program}: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    let said = String::from_utf8_lossy(&out.stderr).trim().to_string();
    Err(if said.is_empty() {
        format!("{program} {} failed.", args.join(" "))
    } else {
        said
    })
}

#[cfg(target_os = "macos")]
mod imp {
    use std::ffi::{c_int, c_void, CStr};
    use std::sync::OnceLock;

    const LOGIN: &CStr =
        c"/System/Library/PrivateFrameworks/login.framework/Versions/Current/login";
    const PMSET: &str = "/usr/bin/pmset";

    type LockFn = unsafe extern "C" fn() -> c_int;

    fn lock_fn() -> Option<LockFn> {
        static FN: OnceLock<Option<usize>> = OnceLock::new();
        let addr = *FN.get_or_init(|| unsafe {
            let handle = libc::dlopen(LOGIN.as_ptr(), libc::RTLD_LAZY);
            if handle.is_null() {
                return None;
            }
            let sym: *mut c_void = libc::dlsym(handle, c"SACLockScreenImmediate".as_ptr());
            (!sym.is_null()).then_some(sym as usize)
        });
        addr.map(|a| unsafe { std::mem::transmute::<usize, LockFn>(a) })
    }

    pub(super) fn can_lock() -> bool {
        lock_fn().is_some()
    }

    pub(super) fn can_sleep() -> bool {
        std::path::Path::new(PMSET).exists()
    }

    pub(super) fn lock_screen() -> Result<(), String> {
        let lock = lock_fn().ok_or("This Mac can't lock its screen from lpm.")?;
        match unsafe { lock() } {
            0 => Ok(()),
            code => Err(format!("Couldn't lock the screen (error {code}).")),
        }
    }

    pub(super) fn sleep_now() -> Result<(), String> {
        super::run(PMSET, &["sleepnow"])
    }
}

#[cfg(target_os = "linux")]
mod imp {
    pub(super) fn can_lock() -> bool {
        crate::sys::which("loginctl")
    }

    pub(super) fn can_sleep() -> bool {
        crate::sys::which("systemctl")
    }

    pub(super) fn lock_screen() -> Result<(), String> {
        super::run("loginctl", &["lock-session"])
    }

    pub(super) fn sleep_now() -> Result<(), String> {
        super::run("systemctl", &["suspend"])
    }
}

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::System::Power::SetSuspendState;
    use windows_sys::Win32::System::Shutdown::LockWorkStation;

    pub(super) fn can_lock() -> bool {
        true
    }

    pub(super) fn can_sleep() -> bool {
        true
    }

    pub(super) fn lock_screen() -> Result<(), String> {
        if unsafe { LockWorkStation() } != 0 {
            Ok(())
        } else {
            Err(format!(
                "Couldn't lock the screen: {}",
                std::io::Error::last_os_error()
            ))
        }
    }

    pub(super) fn sleep_now() -> Result<(), String> {
        if unsafe { SetSuspendState(false, false, false) } {
            Ok(())
        } else {
            Err(format!(
                "Couldn't put this PC to sleep: {}",
                std::io::Error::last_os_error()
            ))
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
mod imp {
    pub(super) fn can_lock() -> bool {
        false
    }

    pub(super) fn can_sleep() -> bool {
        false
    }

    pub(super) fn lock_screen() -> Result<(), String> {
        Err("Locking isn't supported on this system.".into())
    }

    pub(super) fn sleep_now() -> Result<(), String> {
        Err("Sleep isn't supported on this system.".into())
    }
}
