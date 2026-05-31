// Dock menu (right-click the dock icon) listing every project with a running
// dot — port of desktop/dockmenu_darwin.{go,m}. The NSMenu is built in
// dockmenu.m (compiled by build.rs); this is the Rust ↔ ObjC bridge. Reopen and
// quit are handled by Tauri (RunEvent::Reopen / the app menu), so unlike the
// Wails version this only installs applicationDockMenu:.

#[cfg(target_os = "macos")]
mod imp {
    use std::ffi::{c_char, c_int, CStr, CString};
    use std::sync::{Mutex, OnceLock};
    use tauri::{AppHandle, Emitter, Manager};

    extern "C" {
        fn setupDockMenu();
        fn updateDockMenuProjects(names: *const *const c_char, running: *const c_int, count: c_int);
    }

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static LAST_SIG: Mutex<String> = Mutex::new(String::new());

    pub fn install(app: &AppHandle) {
        let _ = APP.set(app.clone());
        // Reference the callback so the linker keeps it for the ObjC object file.
        std::hint::black_box(dockMenuItemClicked as extern "C" fn(*const c_char));
        unsafe { setupDockMenu() };
    }

    pub fn refresh(projects: &[(String, bool)]) {
        let mut sig = String::with_capacity(projects.len() * 8);
        for (name, running) in projects {
            sig.push_str(name);
            sig.push(if *running { '1' } else { '0' });
            sig.push(',');
        }
        {
            let mut last = LAST_SIG.lock().unwrap();
            if *last == sig {
                return;
            }
            *last = sig;
        }
        if projects.is_empty() {
            unsafe { updateDockMenuProjects(std::ptr::null(), std::ptr::null(), 0) };
            return;
        }
        let names: Vec<CString> = projects
            .iter()
            .map(|(n, _)| CString::new(n.as_str()).unwrap_or_default())
            .collect();
        let name_ptrs: Vec<*const c_char> = names.iter().map(|c| c.as_ptr()).collect();
        let running: Vec<c_int> = projects.iter().map(|(_, r)| *r as c_int).collect();
        // The ObjC side copies these into NSArrays synchronously before its async
        // dispatch, so the buffers are safe to drop when this returns.
        unsafe {
            updateDockMenuProjects(name_ptrs.as_ptr(), running.as_ptr(), projects.len() as c_int);
        }
    }

    #[no_mangle]
    pub extern "C" fn dockMenuItemClicked(name: *const c_char) {
        if name.is_null() {
            return;
        }
        let name = unsafe { CStr::from_ptr(name) }.to_string_lossy().into_owned();
        let Some(app) = APP.get() else { return };
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.set_focus();
        }
        let _ = app.emit("dock-project-selected", name);
    }
}

#[cfg(target_os = "macos")]
pub use imp::{install, refresh};

#[cfg(not(target_os = "macos"))]
pub fn install(_app: &tauri::AppHandle) {}
#[cfg(not(target_os = "macos"))]
pub fn refresh(_projects: &[(String, bool)]) {}
