// What deleting a file gives the disk back. Its length overstates that when the
// data lives on elsewhere: a hard link (pnpm's store) frees nothing, and on APFS
// a clone frees only the blocks it no longer shares with the file it was copied
// from, which for a fresh duplicate is almost none.
use std::fs::Metadata;
use std::path::Path;

#[cfg(target_os = "macos")]
pub(crate) fn own_bytes(path: &Path, meta: &Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    if meta.nlink() > 1 {
        return 0;
    }
    private_size(path).unwrap_or_else(|| meta.blocks().saturating_mul(512))
}

#[cfg(all(unix, not(target_os = "macos")))]
pub(crate) fn own_bytes(_path: &Path, meta: &Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    if meta.nlink() > 1 {
        0
    } else {
        meta.blocks().saturating_mul(512)
    }
}

#[cfg(windows)]
pub(crate) fn own_bytes(_path: &Path, meta: &Metadata) -> u64 {
    meta.len()
}

/// APFS's count of the bytes a file shares with no other file. None off APFS,
/// where the attribute isn't kept.
#[cfg(target_os = "macos")]
fn private_size(path: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    #[repr(C, packed(4))]
    struct Reply {
        length: u32,
        private: libc::off_t,
    }
    let c = std::ffi::CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut list: libc::attrlist = unsafe { std::mem::zeroed() };
    list.bitmapcount = libc::ATTR_BIT_MAP_COUNT;
    list.forkattr = libc::ATTR_CMNEXT_PRIVATESIZE;
    let mut reply = Reply {
        length: 0,
        private: 0,
    };
    let rc = unsafe {
        libc::getattrlist(
            c.as_ptr(),
            std::ptr::addr_of_mut!(list).cast(),
            std::ptr::addr_of_mut!(reply).cast(),
            std::mem::size_of::<Reply>(),
            libc::FSOPT_NOFOLLOW | libc::FSOPT_ATTR_CMN_EXTENDED,
        )
    };
    let (length, private) = (reply.length, reply.private);
    (rc == 0 && length as usize >= std::mem::size_of::<Reply>() && private >= 0)
        .then_some(private as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn own(path: &Path) -> u64 {
        own_bytes(path, &std::fs::symlink_metadata(path).unwrap())
    }

    #[cfg(unix)]
    #[test]
    fn a_hard_link_frees_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a");
        std::fs::write(&a, vec![1u8; 64 * 1024]).unwrap();
        std::fs::hard_link(&a, dir.path().join("b")).unwrap();
        assert_eq!(own(&a), 0);
    }

    #[test]
    fn a_plain_file_frees_its_data() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a");
        std::fs::write(&a, vec![1u8; 64 * 1024]).unwrap();
        assert!(own(&a) >= 64 * 1024);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn an_apfs_clone_frees_only_what_it_changed() {
        let dir = tempfile::tempdir().unwrap();
        if !crate::diskspace::space(dir.path()).is_some_and(|s| s.clones) {
            return;
        }
        let a = dir.path().join("a");
        let b = dir.path().join("b");
        std::fs::write(&a, vec![1u8; 256 * 1024]).unwrap();
        let ok = std::process::Command::new("/bin/cp")
            .arg("-c")
            .arg(&a)
            .arg(&b)
            .status()
            .unwrap()
            .success();
        assert!(ok);
        assert_eq!(own(&b), 0);
        assert_eq!(own(&a), 0);
    }
}
