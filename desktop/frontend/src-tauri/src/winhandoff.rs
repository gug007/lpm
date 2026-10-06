// A second launch hands off to the running instance through
// tauri-plugin-single-instance, which sends it a message and waits for as long
// as that takes. A running instance that stopped responding left every later
// launch waiting forever with no window, so check that it answers first. Must
// be registered before the single-instance plugin.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    FindWindowW, MessageBoxW, SendMessageTimeoutW, MB_ICONWARNING, MB_OK, SMTO_ABORTIFHUNG, WM_NULL,
};

const ANSWER_MS: u32 = 5000;

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("handoff-check")
        .setup(|app, _| {
            if running_instance_hung(&app.config().identifier) {
                show_warning();
                app.cleanup_before_exit();
                std::process::exit(1);
            }
            Ok(())
        })
        .build()
}

fn running_instance_hung(identifier: &str) -> bool {
    // The single-instance plugin's message window, named after the identifier.
    let class = wide(&format!("{identifier}-sic"));
    let title = wide(&format!("{identifier}-siw"));
    unsafe {
        let hwnd = FindWindowW(class.as_ptr(), title.as_ptr());
        if hwnd.is_null() {
            return false;
        }
        let mut result = 0;
        SendMessageTimeoutW(
            hwnd,
            WM_NULL,
            0,
            0,
            SMTO_ABORTIFHUNG,
            ANSWER_MS,
            &mut result,
        ) == 0
    }
}

fn show_warning() {
    let text = wide(
        "lpm is already open, but it isn't responding.\n\n\
         End lpm in Task Manager, then open it again.",
    );
    let caption = wide("lpm");
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_OK | MB_ICONWARNING,
        );
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}
