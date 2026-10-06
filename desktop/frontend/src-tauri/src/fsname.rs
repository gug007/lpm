// File names chosen elsewhere (another machine, a user) made creatable here.
// macOS and Linux take any name without '/' or NUL. Windows also refuses
// `< > : " \ | ? *` and control characters, a trailing dot or space, and the
// device names (CON, NUL, COM1, ...) with any extension — and a ':' that slips
// through writes to an alternate data stream of a different file instead.

const WINDOWS_RESERVED: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

const WINDOWS_DEVICES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// `name` with what this platform can't hold in a file name replaced by '_'.
/// Unchanged off Windows.
pub fn portable(name: &str) -> String {
    if cfg!(windows) {
        windows_safe(name)
    } else {
        name.to_string()
    }
}

/// Whether `name` can be used as a file name here exactly as written.
pub fn is_portable(name: &str) -> bool {
    portable(name) == name
}

fn windows_safe(name: &str) -> String {
    let mut out: String = name
        .chars()
        .map(|c| {
            if c.is_control() || WINDOWS_RESERVED.contains(&c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    if out.ends_with(['.', ' ']) {
        out.pop();
        out.push('_');
    }
    let stem = out.split('.').next().unwrap_or_default().trim_end();
    if WINDOWS_DEVICES
        .iter()
        .any(|device| stem.eq_ignore_ascii_case(device))
    {
        out.insert(0, '_');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserved_characters_become_underscores() {
        assert_eq!(windows_safe("a:b.txt"), "a_b.txt");
        assert_eq!(windows_safe("what?*.png"), "what__.png");
        assert_eq!(windows_safe("x<y>|\"z\""), "x_y___z_");
        assert_eq!(windows_safe("tab\there"), "tab_here");
        assert_eq!(windows_safe("dir\\file"), "dir_file");
    }

    #[test]
    fn a_trailing_dot_or_space_is_kept_visible() {
        assert_eq!(windows_safe("notes."), "notes_");
        assert_eq!(windows_safe("notes "), "notes_");
        assert_eq!(windows_safe("notes.."), "notes._");
    }

    #[test]
    fn device_names_are_prefixed_whatever_the_case_or_extension() {
        assert_eq!(windows_safe("CON"), "_CON");
        assert_eq!(windows_safe("nul.txt"), "_nul.txt");
        assert_eq!(windows_safe("Com1.tar.gz"), "_Com1.tar.gz");
        assert_eq!(windows_safe("console.log"), "console.log");
        assert_eq!(windows_safe("COM10"), "COM10");
    }

    #[test]
    fn ordinary_names_pass_through() {
        for name in [
            "report.pdf",
            "Screenshot 2026-10-05 at 09.37.48.png",
            "naïve—ü.txt",
        ] {
            assert_eq!(windows_safe(name), name);
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn unix_names_are_left_alone() {
        assert_eq!(portable("a:b?.txt"), "a:b?.txt");
        assert!(is_portable("CON"));
    }
}
