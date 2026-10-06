// Where Git Bash's own POSIX paths live on this machine, so a path it prints
// (`/tmp/x`, `/usr/share/x`) can be opened from a terminal link. Its drive
// paths (`/c/…`) need no lookup and are mapped by the UI alone.
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct MsysMounts {
    root: String,
    tmp: String,
}

/// None off Windows, and when the shell lpm runs isn't an MSYS bash.
#[tauri::command]
pub fn get_msys_mounts() -> Option<MsysMounts> {
    if !cfg!(windows) {
        return None;
    }
    let root = msys_root(Path::new(&crate::sys::login_shell()))?;
    Some(MsysMounts {
        root: root.to_string_lossy().into_owned(),
        tmp: std::env::temp_dir().to_string_lossy().into_owned(),
    })
}

/// The tree a bash.exe belongs to: Git's `<root>\bin\bash.exe` and the real
/// `<root>\usr\bin\bash.exe` alike, recognised by its `usr\bin`.
fn msys_root(bash: &Path) -> Option<PathBuf> {
    let mut dir = bash.parent()?;
    if dir.file_name()?.eq_ignore_ascii_case("bin") {
        dir = dir.parent()?;
    }
    if dir
        .file_name()
        .is_some_and(|n| n.eq_ignore_ascii_case("usr"))
    {
        dir = dir.parent()?;
    }
    dir.join("usr")
        .join("bin")
        .is_dir()
        .then(|| dir.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn git_tree() -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("usr").join("bin")).unwrap();
        std::fs::create_dir_all(root.path().join("bin")).unwrap();
        root
    }

    #[test]
    fn root_from_either_bash() {
        let tree = git_tree();
        let root = tree.path();
        let wrapper = root.join("bin").join("bash.exe");
        let real = root.join("usr").join("bin").join("bash.exe");
        assert_eq!(msys_root(&wrapper).as_deref(), Some(root));
        assert_eq!(msys_root(&real).as_deref(), Some(root));
    }

    #[test]
    fn no_root_for_a_shell_outside_an_msys_tree() {
        let tree = tempfile::tempdir().unwrap();
        let pwsh = tree.path().join("PowerShell").join("pwsh.exe");
        assert_eq!(msys_root(&pwsh), None);
        assert_eq!(msys_root(Path::new("bash.exe")), None);
    }
}
