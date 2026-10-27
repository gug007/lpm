// Where a sync may read and write inside a project, and the facts about a file
// both computers compare the same way.
use std::fs::Metadata;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Never listed, compared or copied: git's own folder and system clutter.
const SKIP: &[&str] = &[".git", ".DS_Store", "Thumbs.db", "desktop.ini"];

/// A project-relative path from the other computer or the page, checked before
/// it touches the disk: no way out of the project and nothing inside `.git`.
pub(crate) fn clean_rel(path: &str) -> Result<String, String> {
    let trimmed = path.trim_end_matches('/');
    let parts: Vec<&str> = trimmed.split('/').collect();
    let bad = trimmed.is_empty()
        || path.starts_with('/')
        || parts.iter().any(|p| {
            p.is_empty()
                || *p == "."
                || *p == ".."
                || *p == ".git"
                || p.contains('\\')
                || p.contains(':')
        });
    if bad {
        return Err(format!("{path} isn't a path inside the project"));
    }
    Ok(parts.join("/"))
}

/// Where `rel` lives under `root`. A folder on the way that is a link could lead
/// out of the project, so one is refused.
pub(crate) fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = clean_rel(rel)?;
    let mut at = root.to_path_buf();
    let parts: Vec<&str> = rel.split('/').collect();
    for (i, part) in parts.iter().enumerate() {
        at.push(part);
        if i + 1 < parts.len() {
            if let Ok(meta) = std::fs::symlink_metadata(&at) {
                if meta.file_type().is_symlink() {
                    return Err(format!("{rel} is inside a link to another folder"));
                }
            }
        }
    }
    Ok(at)
}

pub(crate) fn skipped(name: &str) -> bool {
    SKIP.contains(&name)
}

pub(crate) fn mtime_ms(meta: &Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

pub(crate) fn is_exec(meta: &Metadata) -> bool {
    crate::fsperm::mode(meta) & 0o111 != 0
}

pub(crate) fn link_target(path: &Path) -> String {
    std::fs::read_link(path)
        .map(|t| t.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default()
}

/// A folder's children in a fixed order, so both computers walk them alike.
pub(crate) fn sorted_children(dir: &Path) -> Vec<(String, PathBuf)> {
    let mut kids: Vec<(String, PathBuf)> = std::fs::read_dir(dir)
        .map(|it| {
            it.flatten()
                .map(|e| (e.file_name().to_string_lossy().into_owned(), e.path()))
                .filter(|(name, _)| !skipped(name))
                .collect()
        })
        .unwrap_or_default();
    kids.sort_by(|a, b| a.0.cmp(&b.0));
    kids
}

/// Where the project's repository lives, as `origin` names it: what tells two
/// folders of the same name apart.
pub(crate) fn origin_of(root: &Path) -> Option<String> {
    crate::git::git_out(&root.to_string_lossy(), &["remote", "get-url", "origin"])
        .ok()
        .filter(|u| !u.is_empty())
}

/// An `origin` written one way or another (ssh or https, with or without
/// `.git` or a port) reduced to host and path.
fn repo_key(url: &str) -> String {
    let url = url.trim().trim_end_matches('/');
    let url = url.strip_suffix(".git").unwrap_or(url);
    let (host, path) = match url.split_once("://") {
        Some((_, rest)) => {
            let rest = rest.rsplit_once('@').map_or(rest, |(_, r)| r);
            let (host, path) = rest.split_once('/').unwrap_or((rest, ""));
            (host.split(':').next().unwrap_or(host), path)
        }
        None => {
            let rest = url.split_once('@').map_or(url, |(_, r)| r);
            rest.split_once(':').unwrap_or((rest, ""))
        }
    };
    format!(
        "{}/{}",
        host.to_ascii_lowercase(),
        path.to_ascii_lowercase()
    )
}

/// Whether two `origin`s name the same repository. Unknown on either side
/// counts as the same: nothing says they differ.
pub(crate) fn same_repo(a: Option<&str>, b: Option<&str>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => repo_key(a) == repo_key(b),
        _ => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_that_leave_the_project_are_refused() {
        for bad in [
            "",
            "/etc/passwd",
            "../x",
            "a/../../x",
            ".git/config",
            "a//b",
            "C:\\x",
            "a/./b",
        ] {
            assert!(clean_rel(bad).is_err(), "{bad:?} should be refused");
        }
        assert_eq!(clean_rel("public/uploads/").unwrap(), "public/uploads");
        assert_eq!(clean_rel(".env.local").unwrap(), ".env.local");
    }

    #[test]
    fn one_repository_written_different_ways_is_the_same() {
        let same = |a: &str, b: &str| same_repo(Some(a), Some(b));
        assert!(same(
            "git@github.com:acme/storefront.git",
            "https://github.com/acme/storefront"
        ));
        assert!(same(
            "ssh://git@github.com/Acme/Storefront.git",
            "https://github.com/acme/storefront/"
        ));
        assert!(same(
            "ssh://git@gitlab.example.com:2222/team/app.git",
            "https://gitlab.example.com/team/app"
        ));
        assert!(!same(
            "git@github.com:acme/storefront.git",
            "git@github.com:other/storefront.git"
        ));
        assert!(same_repo(None, Some("git@github.com:acme/storefront.git")));
    }
}
