//! `~/.lpm/keys`: signing keys and service credentials that should be on every
//! computer config sync reaches. It syncs like `scripts`, but stays private: the
//! folder is closed to other accounts, a file lands readable by its owner only,
//! and none of it goes into an export archive.

use std::io;
use std::path::Path;

pub(crate) const DIR: &str = "keys";
pub(crate) const FILE_MODE: u32 = 0o600;
const DIR_MODE: u32 = 0o700;

pub(crate) fn holds(rel: &str) -> bool {
    Path::new(rel).starts_with(DIR)
}

/// Makes the folder when it's missing and closes it to other accounts, which also
/// covers a key that was copied in with open permissions.
pub(crate) fn make_private(lpm: &Path) -> io::Result<()> {
    let dir = lpm.join(DIR);
    std::fs::create_dir_all(&dir)?;
    crate::fsperm::set_mode(&dir, DIR_MODE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn holds_only_what_is_under_the_folder() {
        assert!(holds("keys/play.json"));
        assert!(holds("keys/android/upload.jks"));
        assert!(!holds("keys.json"));
        assert!(!holds("scripts/keys/play.json"));
    }

    #[test]
    fn keys_sync_privately_and_never_export() {
        use crate::syncsurface::{
            announced_dir_of, export_global_dirs, is_sync_global_dir, new_global_file_mode,
        };
        assert!(is_sync_global_dir(DIR));
        assert!(!export_global_dirs().any(|d| d == DIR));
        assert_eq!(new_global_file_mode("keys/play.json"), FILE_MODE);
        assert_eq!(new_global_file_mode("keys/android/upload.jks"), FILE_MODE);
        assert_eq!(new_global_file_mode("scripts/keys/rotate.sh"), 0o755);
        assert_eq!(announced_dir_of("keys/play.json"), Some(DIR));
        assert_eq!(announced_dir_of("scripts/keys/rotate.sh"), None);
        assert_eq!(announced_dir_of("keys.json"), None);
    }

    #[cfg(unix)]
    #[test]
    fn the_folder_is_closed_to_other_accounts() {
        let lpm = tempfile::tempdir().unwrap();
        let dir = lpm.path().join(DIR);
        std::fs::create_dir_all(&dir).unwrap();
        crate::fsperm::set_mode(&dir, 0o755).unwrap();

        make_private(lpm.path()).unwrap();

        let mode = crate::fsperm::mode(&std::fs::metadata(&dir).unwrap());
        assert_eq!(mode & 0o777, DIR_MODE);
    }
}
