// What closing the lid would do, for the Keep awake menu's lid line: nothing on
// a Mac without one, sleep, or keep going in closed-display mode (an external
// display and the power adapter). Only macOS says; elsewhere the menu keeps its
// general sentence.
use serde_json::{json, Value};

pub(crate) const PEER_CMD: &str = "keep_awake_lid";

#[tauri::command(async)]
pub fn keep_awake_lid() -> Value {
    lid()
}

/// `lid` is "none", "sleeps", "stays" or "unknown"; `onPower` whether it runs
/// on the power adapter.
pub(crate) fn lid() -> Value {
    let on_power = crate::keepawake_hold::on_power();
    json!({ "lid": lid_state(on_power), "onPower": on_power })
}

// macOS's own AppleClamshellCausesSleep reads "No" on battery with no display
// connected (seen while a caffeinate assertion is held), so it can't say this.
#[cfg(target_os = "macos")]
fn lid_state(on_power: bool) -> &'static str {
    let Ok(out) = crate::osproc::command("/usr/sbin/ioreg")
        .args(["-r", "-k", "AppleClamshellState", "-d", "1"])
        .output()
    else {
        return "unknown";
    };
    if !out.status.success() {
        return "unknown";
    }
    match read_clamshell(&String::from_utf8_lossy(&out.stdout)) {
        Clamshell::None => "none",
        Clamshell::Unknown => "unknown",
        Clamshell::Closed => "stays",
        Clamshell::Open => closed_display_mode(external_displays() > 0, on_power),
    }
}

#[cfg(not(target_os = "macos"))]
fn lid_state(_on_power: bool) -> &'static str {
    "unknown"
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
#[derive(Debug, PartialEq)]
enum Clamshell {
    None,
    Open,
    Closed,
    Unknown,
}

/// The power domain's clamshell key: a Mac without a lid has none.
#[cfg(any(target_os = "macos", test))]
fn read_clamshell(text: &str) -> Clamshell {
    match text
        .lines()
        .find(|line| line.contains("\"AppleClamshellState\""))
    {
        None => Clamshell::None,
        Some(line) if line.trim_end().ends_with("= Yes") => Clamshell::Closed,
        Some(line) if line.trim_end().ends_with("= No") => Clamshell::Open,
        Some(_) => Clamshell::Unknown,
    }
}

/// A laptop keeps running with its lid closed only with an external display
/// and the power adapter connected.
#[cfg(any(target_os = "macos", test))]
fn closed_display_mode(external_display: bool, on_power: bool) -> &'static str {
    if external_display && on_power {
        "stays"
    } else {
        "sleeps"
    }
}

/// How many active displays aren't the built-in one.
#[cfg(target_os = "macos")]
fn external_displays() -> usize {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGGetActiveDisplayList(max: u32, displays: *mut u32, count: *mut u32) -> i32;
        fn CGDisplayIsBuiltin(display: u32) -> u32;
    }
    let mut displays = [0u32; 16];
    let mut count = 0u32;
    let status =
        unsafe { CGGetActiveDisplayList(displays.len() as u32, displays.as_mut_ptr(), &mut count) };
    if status != 0 {
        return 0;
    }
    displays[..count as usize]
        .iter()
        .filter(|&&display| unsafe { CGDisplayIsBuiltin(display) } == 0)
        .count()
}

#[cfg(test)]
mod tests {
    use super::{closed_display_mode, read_clamshell, Clamshell};

    #[test]
    fn reads_the_clamshell_key() {
        let open = "+-o IOPMrootDomain\n    \"AppleClamshellCausesSleep\" = No\n    \"AppleClamshellState\" = No\n";
        assert_eq!(read_clamshell(open), Clamshell::Open);
        assert_eq!(
            read_clamshell(&open.replace("State\" = No", "State\" = Yes")),
            Clamshell::Closed
        );
        assert_eq!(read_clamshell("+-o IOPMrootDomain\n"), Clamshell::None);
        assert_eq!(read_clamshell(""), Clamshell::None);
        assert_eq!(
            read_clamshell("\"AppleClamshellState\" = 1\n"),
            Clamshell::Unknown
        );
    }

    #[test]
    fn the_lid_closes_without_sleep_only_with_a_display_and_power() {
        assert_eq!(closed_display_mode(true, true), "stays");
        assert_eq!(closed_display_mode(true, false), "sleeps");
        assert_eq!(closed_display_mode(false, true), "sleeps");
        assert_eq!(closed_display_mode(false, false), "sleeps");
    }
}
