// How each platform keeps this machine awake, and the power readings keepawake.rs
// decides by: whether it runs on power, and how full its battery is.
#[cfg(target_os = "linux")]
use std::time::Duration;

/// What a hold asks of the system beyond keeping it from idle-sleeping.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct Flags {
    /// Keep the display from sleeping too.
    pub(crate) screen: bool,
    /// Hold on battery too; otherwise the system honours it on power only.
    pub(crate) battery: bool,
}

pub(crate) fn supported() -> bool {
    #[cfg(any(target_os = "macos", windows))]
    {
        true
    }
    #[cfg(target_os = "linux")]
    {
        use std::sync::LazyLock;
        static INHIBIT: LazyLock<bool> =
            LazyLock::new(|| !crate::sys::headless() && crate::sys::which("systemd-inhibit"));
        *INHIBIT
    }
    #[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
    {
        false
    }
}

/// Whether a hold can keep the display on as well.
pub(crate) fn screen_supported() -> bool {
    cfg!(any(target_os = "macos", windows))
}

// --- macOS: `caffeinate` holds a power assertion, and `-w` ends it with this
// process. `-s` is honoured only on power, `-i` on battery too, `-d` keeps the
// display on.

#[cfg(target_os = "macos")]
pub(crate) struct Hold(std::process::Child);

#[cfg(target_os = "macos")]
pub(crate) fn acquire(flags: Flags) -> Option<Hold> {
    let mut cmd = crate::osproc::command("/usr/bin/caffeinate");
    cmd.arg(if flags.battery { "-i" } else { "-s" });
    if flags.screen {
        cmd.arg("-d");
    }
    cmd.arg("-w")
        .arg(std::process::id().to_string())
        .spawn()
        .ok()
        .map(Hold)
}

#[cfg(target_os = "macos")]
#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IOPSCopyPowerSourcesInfo() -> core_foundation::base::CFTypeRef;
    fn IOPSGetProvidingPowerSourceType(
        snapshot: core_foundation::base::CFTypeRef,
    ) -> core_foundation::string::CFStringRef;
    fn IOPSCopyPowerSourcesList(
        snapshot: core_foundation::base::CFTypeRef,
    ) -> core_foundation::array::CFArrayRef;
    fn IOPSGetPowerSourceDescription(
        snapshot: core_foundation::base::CFTypeRef,
        source: core_foundation::base::CFTypeRef,
    ) -> core_foundation::dictionary::CFDictionaryRef;
}

#[cfg(target_os = "macos")]
fn power_snapshot() -> Option<core_foundation::base::CFType> {
    use core_foundation::base::{CFType, TCFType};
    let snapshot = unsafe { IOPSCopyPowerSourcesInfo() };
    (!snapshot.is_null()).then(|| unsafe { CFType::wrap_under_create_rule(snapshot) })
}

#[cfg(target_os = "macos")]
pub(crate) fn on_power() -> bool {
    use core_foundation::base::TCFType;
    use core_foundation::string::CFString;
    let Some(snapshot) = power_snapshot() else {
        return true;
    };
    let source = unsafe { IOPSGetProvidingPowerSourceType(snapshot.as_CFTypeRef()) };
    source.is_null()
        || unsafe { CFString::wrap_under_get_rule(source) }.to_string() != "Battery Power"
}

#[cfg(target_os = "macos")]
pub(crate) fn battery_level() -> Option<u8> {
    use core_foundation::array::CFArray;
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    let snapshot = power_snapshot()?;
    let list = unsafe { IOPSCopyPowerSourcesList(snapshot.as_CFTypeRef()) };
    if list.is_null() {
        return None;
    }
    let sources: CFArray<CFType> = unsafe { CFArray::wrap_under_create_rule(list) };
    sources.iter().find_map(|source| {
        let desc = unsafe {
            IOPSGetPowerSourceDescription(snapshot.as_CFTypeRef(), source.as_CFTypeRef())
        };
        if desc.is_null() {
            return None;
        }
        let desc: CFDictionary<CFString, CFType> =
            unsafe { CFDictionary::wrap_under_get_rule(desc) };
        let number = |key: &str| {
            desc.find(&CFString::new(key))
                .and_then(|v| v.downcast::<CFNumber>())
                .and_then(|n| n.to_i64())
        };
        percent(number("Current Capacity")?, number("Max Capacity")?)
    })
}

// --- Linux desktop: a logind inhibitor, held by `systemd-inhibit` around a
// command that ends with this process.

#[cfg(target_os = "linux")]
pub(crate) struct Hold(std::process::Child);

#[cfg(target_os = "linux")]
pub(crate) fn acquire(_flags: Flags) -> Option<Hold> {
    crate::osproc::command("systemd-inhibit")
        .args([
            "--no-ask-password",
            "--what=idle:sleep",
            "--who=lpm",
            "--why=Keep awake is on",
            "--mode=block",
            "tail",
        ])
        .arg(format!("--pid={}", std::process::id()))
        .args(["-f", "/dev/null"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()
        .map(Hold)
        .and_then(|mut hold| {
            // logind or polkit can refuse the inhibitor; the helper then exits
            // straight away instead of failing to start.
            std::thread::sleep(Duration::from_millis(300));
            hold.refresh().then_some(hold)
        })
}

#[cfg(target_os = "linux")]
fn power_supplies() -> Vec<std::path::PathBuf> {
    std::fs::read_dir("/sys/class/power_supply")
        .map(|dir| dir.flatten().map(|e| e.path()).collect())
        .unwrap_or_default()
}

#[cfg(target_os = "linux")]
fn read_supply(supply: &std::path::Path, name: &str) -> String {
    std::fs::read_to_string(supply.join(name))
        .unwrap_or_default()
        .trim()
        .to_string()
}

#[cfg(target_os = "linux")]
pub(crate) fn on_power() -> bool {
    let mut mains = false;
    for supply in power_supplies() {
        if read_supply(&supply, "type") == "Mains" {
            mains = true;
            if read_supply(&supply, "online") == "1" {
                return true;
            }
        }
    }
    !mains
}

#[cfg(target_os = "linux")]
pub(crate) fn battery_level() -> Option<u8> {
    power_supplies().iter().find_map(|supply| {
        if read_supply(supply, "type") != "Battery" {
            return None;
        }
        percent(read_supply(supply, "capacity").parse().ok()?, 100)
    })
}

#[cfg(unix)]
impl Hold {
    /// Whether the hold is still in force: the helper may have been refused.
    pub(crate) fn refresh(&mut self) -> bool {
        matches!(self.0.try_wait(), Ok(None))
    }
}

#[cfg(unix)]
impl Drop for Hold {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
pub(crate) fn acquire(_flags: Flags) -> Option<Hold> {
    None
}

#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
pub(crate) fn on_power() -> bool {
    true
}

#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
pub(crate) fn battery_level() -> Option<u8> {
    None
}

// --- Windows: resetting the system idle timer on every check keeps it from
// sleeping, without holding anything that could outlive the app.

#[cfg(windows)]
pub(crate) struct Hold(Flags);

#[cfg(windows)]
pub(crate) fn acquire(flags: Flags) -> Option<Hold> {
    let mut hold = Hold(flags);
    hold.refresh().then_some(hold)
}

#[cfg(windows)]
impl Hold {
    pub(crate) fn refresh(&mut self) -> bool {
        use windows_sys::Win32::System::Power::{
            SetThreadExecutionState, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
        };
        let display = if self.0.screen {
            ES_DISPLAY_REQUIRED
        } else {
            0
        };
        unsafe { SetThreadExecutionState(ES_SYSTEM_REQUIRED | display) != 0 }
    }
}

#[cfg(windows)]
fn power_status() -> Option<windows_sys::Win32::System::Power::SYSTEM_POWER_STATUS> {
    use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s: SYSTEM_POWER_STATUS = unsafe { std::mem::zeroed() };
    (unsafe { GetSystemPowerStatus(&mut s) } != 0).then_some(s)
}

#[cfg(windows)]
pub(crate) fn on_power() -> bool {
    power_status().is_none_or(|s| s.ACLineStatus != 0)
}

#[cfg(windows)]
pub(crate) fn battery_level() -> Option<u8> {
    let level = power_status()?.BatteryLifePercent;
    (level <= 100).then_some(level)
}

#[cfg_attr(not(any(target_os = "macos", target_os = "linux")), allow(dead_code))]
fn percent(current: i64, max: i64) -> Option<u8> {
    (max > 0).then(|| (current * 100 / max).clamp(0, 100) as u8)
}
