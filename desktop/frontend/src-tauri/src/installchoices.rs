// What the person installing lpm chose in the Windows installer (hooks.nsh):
// "No" to sending usage data leaves SendUsageData = 0 under HKCU\Software\lpm.
// It becomes the daily ping's and the crash reports' Settings switches the first
// time lpm starts, before either can send anything, and is then removed.
use serde_json::{json, Map, Value};
use windows_sys::Win32::Foundation::ERROR_SUCCESS;
use windows_sys::Win32::System::Registry::{
    RegDeleteKeyValueW, RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD,
};

const KEY: &str = r"Software\lpm";
const VALUE: &str = "SendUsageData";

fn opted_out_settings() -> Value {
    let mut patch = Map::new();
    patch.insert(crate::dailyping::CONSENT_KEY.into(), json!(false));
    patch.insert(crate::crashreport::CONSENT_KEY.into(), json!(false));
    Value::Object(patch)
}

/// Saves the two switches off. Settings written this early would make a first
/// start look like an existing install, so the first-launch defaults go in
/// before them; and a settings file made here is dated like the seeded
/// global.yml, so it can't win the first sync with another computer.
fn opt_out() -> bool {
    crate::firstlaunch::seed_defaults();
    let path = crate::config::settings_path();
    let created = !path.exists();
    if crate::config::merge_settings(opted_out_settings()).is_err() {
        return false;
    }
    if created {
        let _ = crate::firstlaunch::backdate(&path);
    }
    true
}

pub fn apply() {
    let mut send: u32 = 1;
    let mut size = std::mem::size_of::<u32>() as u32;
    let code = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            crate::sys::wide(KEY).as_ptr(),
            crate::sys::wide(VALUE).as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            (&mut send as *mut u32).cast(),
            &mut size,
        )
    };
    if code != ERROR_SUCCESS {
        return;
    }
    if send == 0 && !opt_out() {
        return;
    }
    unsafe {
        RegDeleteKeyValueW(HKEY_CURRENT_USER, crate::sys::wide(KEY).as_ptr(), crate::sys::wide(VALUE).as_ptr());
    }
}
