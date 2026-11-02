// An XDG autostart entry (~/.config/autostart/lpm.desktop) starts lpm when the
// desktop session does. An AppImage is started from its file, since the path it
// runs from is a mount that only exists while it runs.
#[cfg(target_os = "linux")]
use super::LoginItem;
use std::path::Path;

#[cfg(target_os = "linux")]
fn entry_path() -> Option<std::path::PathBuf> {
    dirs::config_dir().map(|d| d.join("autostart").join("lpm.desktop"))
}

#[cfg(target_os = "linux")]
pub fn state() -> LoginItem {
    let enabled = entry_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .is_some_and(|text| starts_at_login(&text));
    LoginItem {
        supported: true,
        enabled,
        needs_approval: false,
    }
}

#[cfg(target_os = "linux")]
pub fn set(enabled: bool) -> Result<(), String> {
    use crate::fsatomic::{write, Mode};
    let path = entry_path().ok_or("Couldn't find your config folder.")?;
    if !enabled {
        return match std::fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                Err(format!("Couldn't remove {}: {e}", path.display()))
            }
            _ => Ok(()),
        };
    }
    let program = match crate::daemonlaunch::running_appimage() {
        Some(image) => image,
        None => std::env::current_exe().map_err(|e| format!("Couldn't find lpm: {e}"))?,
    };
    let dir = path
        .parent()
        .ok_or("Couldn't find your autostart folder.")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("Couldn't create {}: {e}", dir.display()))?;
    write(&path, entry(&program).as_bytes(), Mode::Preserve(0o644))
        .map_err(|e| format!("Couldn't write {}: {e}", path.display()))
}

fn entry(program: &Path) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=lpm\nExec={}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
        exec_value(program)
    )
}

// Exec quoting from the Desktop Entry spec: the quoted argument escapes " ` $ \
// with a backslash, then the string escape doubles every backslash, and % is
// doubled for field codes.
fn exec_value(program: &Path) -> String {
    let mut out = String::from("\"");
    for c in program.to_string_lossy().chars() {
        match c {
            '\\' => out.push_str(r"\\\\"),
            '"' | '`' | '$' => {
                out.push_str(r"\\");
                out.push(c);
            }
            '%' => out.push_str("%%"),
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

// A desktop's own Startup Applications tool may keep the file and switch it off.
fn starts_at_login(text: &str) -> bool {
    !text.lines().map(str::trim).any(|line| {
        line.eq_ignore_ascii_case("Hidden=true")
            || line.eq_ignore_ascii_case("X-GNOME-Autostart-enabled=false")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_the_program() {
        assert_eq!(
            exec_value(Path::new("/home/a b/lpm_1.0.AppImage")),
            "\"/home/a b/lpm_1.0.AppImage\""
        );
        assert_eq!(exec_value(Path::new("/x/$y%z")), r#""/x/\\$y%%z""#);
    }

    #[test]
    fn writes_an_entry_that_starts() {
        let text = entry(Path::new("/usr/bin/lpm"));
        assert!(text.contains("Exec=\"/usr/bin/lpm\"\n"));
        assert!(starts_at_login(&text));
    }

    #[test]
    fn honours_a_switched_off_entry() {
        assert!(!starts_at_login("[Desktop Entry]\nHidden=true\n"));
        assert!(!starts_at_login(
            "[Desktop Entry]\nX-GNOME-Autostart-enabled=false\n"
        ));
    }
}
