// A recursive copy for where there is no `cp` (Windows): folders are walked,
// files go through the platform copy call (CopyFileEx, which clones blocks on
// ReFS and Dev Drive volumes), and links are recreated rather than followed, as
// `cp -R` does. pnpm's node_modules on Windows is a tree of junctions, so a link
// into the tree being copied is pointed at the same place in the copy.
use std::io;
use std::path::{Path, PathBuf};

/// Copy `from` (a file, folder or link) to `to`, which must not exist yet. An
/// absolute link target inside `roots.0` is rebased onto `roots.1`.
pub fn copy(from: &Path, to: &Path, roots: (&Path, &Path)) -> io::Result<()> {
    let meta = std::fs::symlink_metadata(from).map_err(|e| at(from, e))?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return copy_entry(from, to, meta.file_type(), roots);
    }
    std::fs::create_dir(to).map_err(|e| at(to, e))?;
    let mut pending: Vec<(PathBuf, PathBuf)> = vec![(from.to_path_buf(), to.to_path_buf())];
    while let Some((src, dst)) = pending.pop() {
        for entry in std::fs::read_dir(&src).map_err(|e| at(&src, e))? {
            let entry = entry.map_err(|e| at(&src, e))?;
            let path = entry.path();
            let target = dst.join(entry.file_name());
            let kind = entry.file_type().map_err(|e| at(&path, e))?;
            if kind.is_dir() && !kind.is_symlink() {
                std::fs::create_dir(&target).map_err(|e| at(&target, e))?;
                pending.push((path, target));
            } else {
                copy_entry(&path, &target, kind, roots)?;
            }
        }
    }
    Ok(())
}

fn copy_entry(
    from: &Path,
    to: &Path,
    kind: std::fs::FileType,
    roots: (&Path, &Path),
) -> io::Result<()> {
    let copied = if kind.is_symlink() {
        crate::fslink::copy_link(from, to, Some(roots))
    } else {
        std::fs::copy(from, to).map(|_| ())
    };
    copied.map_err(|e| at(from, e))
}

fn at(path: &Path, err: io::Error) -> io::Error {
    io::Error::new(err.kind(), format!("{}: {err}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, body: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    #[test]
    fn copies_a_tree_byte_for_byte() {
        let dir = tempfile::tempdir().unwrap();
        let (src, dst) = (dir.path().join("src"), dir.path().join("dst"));
        write(&src.join("a.txt"), "a");
        write(&src.join("deep/er/b.txt"), "b");
        std::fs::create_dir_all(src.join("empty")).unwrap();
        copy(&src, &dst, (&src, &dst)).unwrap();
        assert_eq!(std::fs::read_to_string(dst.join("a.txt")).unwrap(), "a");
        assert_eq!(
            std::fs::read_to_string(dst.join("deep/er/b.txt")).unwrap(),
            "b"
        );
        assert!(dst.join("empty").is_dir());
        assert_eq!(std::fs::read_to_string(src.join("a.txt")).unwrap(), "a");
    }

    #[test]
    fn copies_a_single_file() {
        let dir = tempfile::tempdir().unwrap();
        let (src, dst) = (dir.path().join("f.txt"), dir.path().join("g.txt"));
        write(&src, "x");
        copy(&src, &dst, (&src, &dst)).unwrap();
        assert_eq!(std::fs::read_to_string(dst).unwrap(), "x");
    }

    #[test]
    fn refuses_an_existing_destination_and_names_it() {
        let dir = tempfile::tempdir().unwrap();
        let (src, dst) = (dir.path().join("src"), dir.path().join("dst"));
        write(&src.join("a.txt"), "a");
        std::fs::create_dir(&dst).unwrap();
        let err = copy(&src, &dst, (&src, &dst)).unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::AlreadyExists);
        assert!(err.to_string().contains("dst"), "{err}");
    }

    #[cfg(unix)]
    #[test]
    fn links_are_recreated_and_kept_inside_the_copy() {
        let dir = tempfile::tempdir().unwrap();
        let (src, dst) = (dir.path().join("src"), dir.path().join("dst"));
        write(&src.join("node_modules/.pnpm/a/index.js"), "a");
        std::os::unix::fs::symlink(src.join("node_modules/.pnpm/a"), src.join("node_modules/a"))
            .unwrap();
        std::os::unix::fs::symlink("/usr", src.join("outside")).unwrap();
        copy(&src, &dst, (&src, &dst)).unwrap();
        assert_eq!(
            std::fs::read_link(dst.join("node_modules/a")).unwrap(),
            dst.join("node_modules/.pnpm/a")
        );
        assert_eq!(
            std::fs::read_link(dst.join("outside")).unwrap(),
            PathBuf::from("/usr")
        );
        assert_eq!(
            std::fs::read_to_string(dst.join("node_modules/a/index.js")).unwrap(),
            "a"
        );
    }
}
