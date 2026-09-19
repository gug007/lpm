//! Adopting an existing folder as a project. The folder's name is only a
//! suggestion: a project of that name may already exist — possibly shown under
//! a different label, so the user has no way to see the clash — and the folder
//! itself may already be a project.
use crate::config;
use std::path::Path;

/// What adopting a folder produced: the project's name, which is the folder's
/// unless that was taken, whether the folder was already a project, and the
/// services read off its files (none when it got the placeholder).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptedProject {
    pub name: String,
    pub existing: bool,
    pub services: Vec<String>,
}

/// `base` when free, else the first of `base-2`, `base-3`, … that is.
pub(crate) fn available_name(base: &str, taken: impl Fn(&str) -> bool) -> String {
    if !taken(base) {
        return base.to_string();
    }
    (2..)
        .map(|n| format!("{base}-{n}"))
        .find(|candidate| !taken(candidate))
        .expect("an unbounded sequence of candidates always has a free one")
}

/// The local project rooted at `abs_root`, if there is one.
pub(crate) fn project_at_root(abs_root: &str) -> Option<String> {
    let wanted = Path::new(abs_root);
    config::project_names().into_iter().find(|name| {
        matches!(config::project_root(name), Ok((root, false)) if same_folder(Path::new(&root), wanted))
    })
}

/// Whether two paths name the same folder: equal as written (ignoring a
/// trailing slash), or equal once symlinks are resolved.
pub(crate) fn same_folder(a: &Path, b: &Path) -> bool {
    if a.as_os_str().is_empty() || b.as_os_str().is_empty() {
        return false;
    }
    if a.components().eq(b.components()) {
        return true;
    }
    matches!(
        (std::fs::canonicalize(a), std::fs::canonicalize(b)),
        (Ok(x), Ok(y)) if x == y
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn available_name_keeps_a_free_name() {
        assert_eq!(available_name("app", |_| false), "app");
    }

    #[test]
    fn available_name_counts_up_past_taken_names() {
        let taken = |n: &str| matches!(n, "app" | "app-2" | "app-3");
        assert_eq!(available_name("app", taken), "app-4");
    }

    #[test]
    fn same_folder_ignores_a_trailing_slash() {
        assert!(same_folder(Path::new("/a/b"), Path::new("/a/b/")));
        assert!(!same_folder(Path::new("/a/b"), Path::new("/a/c")));
    }

    #[test]
    fn same_folder_resolves_symlinks() {
        let tmp = tempfile::tempdir().unwrap();
        let real = tmp.path().join("real");
        std::fs::create_dir(&real).unwrap();
        let link = tmp.path().join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        assert!(same_folder(&link, &real));
        assert!(!same_folder(&link, tmp.path()));
    }

    #[test]
    fn same_folder_rejects_empty_paths() {
        assert!(!same_folder(Path::new(""), Path::new("")));
    }
}
