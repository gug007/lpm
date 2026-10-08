// Runs a hook just before this machine goes to sleep, so the mobile server can
// tell connected phones why it is about to stop answering (they then say
// "asleep" instead of guessing at network trouble).
//
// macOS: IOKit's system power notifications, which hold the sleep until the
// hook returns. Windows: a suspend/resume callback registration. Linux has no
// such hook here: phones fall back to reporting that the machine isn't answering.

use std::sync::OnceLock;

static HOOK: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

fn run_hook() {
    if let Some(hook) = HOOK.get() {
        hook();
    }
}

/// Install `hook` to run before each sleep. Only the first call takes effect.
pub fn start(hook: impl Fn() + Send + Sync + 'static) {
    if HOOK.set(Box::new(hook)).is_err() {
        return;
    }
    platform::watch();
}

#[cfg(target_os = "macos")]
mod platform {
    use core_foundation_sys::runloop::{
        kCFRunLoopCommonModes, CFRunLoopAddSource, CFRunLoopGetCurrent, CFRunLoopRun,
        CFRunLoopSourceRef,
    };
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicU32, Ordering};

    type IoObject = u32;
    type IoConnect = u32;
    type NotificationPort = *mut c_void;
    type InterestCallback = extern "C" fn(*mut c_void, IoObject, u32, *mut c_void);

    const CAN_SYSTEM_SLEEP: u32 = 0xE000_0270;
    const SYSTEM_WILL_SLEEP: u32 = 0xE000_0280;

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IORegisterForSystemPower(
            refcon: *mut c_void,
            port: *mut NotificationPort,
            callback: InterestCallback,
            notifier: *mut IoObject,
        ) -> IoConnect;
        fn IONotificationPortGetRunLoopSource(port: NotificationPort) -> CFRunLoopSourceRef;
        fn IOAllowPowerChange(root: IoConnect, notification: isize) -> i32;
    }

    static ROOT: AtomicU32 = AtomicU32::new(0);

    extern "C" fn on_power(_: *mut c_void, _: IoObject, message: u32, argument: *mut c_void) {
        match message {
            CAN_SYSTEM_SLEEP => unsafe {
                IOAllowPowerChange(ROOT.load(Ordering::Relaxed), argument as isize);
            },
            SYSTEM_WILL_SLEEP => {
                super::run_hook();
                unsafe {
                    IOAllowPowerChange(ROOT.load(Ordering::Relaxed), argument as isize);
                }
            }
            _ => {}
        }
    }

    pub fn watch() {
        std::thread::Builder::new()
            .name("sleepwatch".into())
            .spawn(|| unsafe {
                let mut port: NotificationPort = std::ptr::null_mut();
                let mut notifier: IoObject = 0;
                let root = IORegisterForSystemPower(
                    std::ptr::null_mut(),
                    &mut port,
                    on_power,
                    &mut notifier,
                );
                if root == 0 || port.is_null() {
                    eprintln!("warning: couldn't watch for system sleep");
                    return;
                }
                ROOT.store(root, Ordering::Relaxed);
                CFRunLoopAddSource(
                    CFRunLoopGetCurrent(),
                    IONotificationPortGetRunLoopSource(port),
                    kCFRunLoopCommonModes,
                );
                CFRunLoopRun();
            })
            .ok();
    }
}

#[cfg(windows)]
mod platform {
    use std::ffi::c_void;
    use windows_sys::Win32::System::Power::{
        PowerRegisterSuspendResumeNotification, DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{DEVICE_NOTIFY_CALLBACK, PBT_APMSUSPEND};

    unsafe extern "system" fn on_power(_: *const c_void, kind: u32, _: *const c_void) -> u32 {
        if kind == PBT_APMSUSPEND {
            super::run_hook();
        }
        0
    }

    pub fn watch() {
        // The registration reads these parameters for as long as it lives,
        // which is the life of the process.
        let params: &'static mut DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS =
            Box::leak(Box::new(DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS {
                Callback: Some(on_power),
                Context: std::ptr::null_mut(),
            }));
        let mut handle: *mut c_void = std::ptr::null_mut();
        let status = unsafe {
            PowerRegisterSuspendResumeNotification(
                DEVICE_NOTIFY_CALLBACK,
                params as *mut DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS as *mut c_void,
                &mut handle,
            )
        };
        if status != 0 {
            eprintln!("warning: couldn't watch for system sleep ({status})");
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    pub fn watch() {}
}
