// Which memory folder a project's sessions belong to.
//
// A duplicate is the same codebase under a throwaway name: what an agent learns
// in `web-2` is about `web`, and the copy is usually deleted long before that
// knowledge stops being useful — a fan-out run across five copies would
// otherwise leave five silos, four of them purged on cleanup. So every
// duplicate, plain copy or linked Git worktree, reads and writes its original's
// folder. Only removal wants the folder named after the project itself.
//
// Terminals carry the resolved folder as LPM_MEMORY_DIR (pty.rs) so the agent
// CLIs writing these files through the lpm-memory skill land where the UI reads.
use std::path::{Path, PathBuf};

/// A hand-written `parent_name` chain is followed too, so the walk is bounded
/// and cycle-guarded rather than trusting lpm to be the only writer.
const MAX_PARENT_HOPS: usize = 8;

const MAX_NAME_LEN: usize = 64;

/// The project whose memory folder `project` shares: itself for an original,
/// the original for a duplicate.
pub fn memory_owner(project: &str) -> String {
    resolve_owner(project, crate::config::peek_parent)
}

/// `~/.lpm/memory/<owner>`: where this project's sessions are read and written.
pub fn memory_dir(project: &str) -> Result<PathBuf, String> {
    own_memory_dir(&memory_owner(project))
}

/// The folder named after `project` itself, whether or not it owns it. Removal
/// uses this: purging a duplicate must never reach into its original's memory.
pub fn own_memory_dir(project: &str) -> Result<PathBuf, String> {
    if !is_valid_project(project) {
        return Err(format!("invalid project name {project:?}"));
    }
    Ok(crate::config::lpm_dir().join("memory").join(project))
}

/// Defense in depth: project names come from the config directory, but the name
/// becomes a path segment here, so anything that could climb out of
/// ~/.lpm/memory is refused rather than trusted.
fn is_valid_project(project: &str) -> bool {
    !project.is_empty()
        && !project.starts_with('.')
        && !project.contains('/')
        && !project.contains('\\')
}

/// `parent_of` is injected so the walk is tested without a config directory.
fn resolve_owner(project: &str, parent_of: impl Fn(&str) -> Option<String>) -> String {
    let mut owner = project.to_string();
    let mut seen = vec![owner.clone()];
    for _ in 0..MAX_PARENT_HOPS {
        let Some(parent) = parent_of(&owner).filter(|p| !p.is_empty()) else {
            break;
        };
        if seen.contains(&parent) {
            break;
        }
        seen.push(parent.clone());
        owner = parent;
    }
    owner
}

/// One-shot at launch: fold each duplicate's own memory folder into its
/// original's. Builds before duplicates shared memory wrote sessions under the
/// copy's name, where nothing reads them now and removing the copy would delete
/// them. Once moved this reads one directory per duplicate and stops.
pub fn adopt_duplicate_memory_at_startup() {
    for project in crate::config::project_names() {
        let owner = memory_owner(&project);
        if owner == project {
            continue;
        }
        let (Ok(from), Ok(to)) = (own_memory_dir(&project), own_memory_dir(&owner)) else {
            continue;
        };
        adopt_dir(&from, &to, &project);
    }
}

/// Move every session out of `from` into `to`, then drop the folder if it came
/// away empty. A name already taken in `to` is never overwritten: identical
/// content is dropped, different content moves aside as `<name>-<tag>.md`, and
/// when that is taken too the file stays put — the folder then survives, so no
/// session disappears without a trace.
fn adopt_dir(from: &Path, to: &Path, tag: &str) {
    let Ok(entries) = std::fs::read_dir(from) else {
        return;
    };
    let mut sessions: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("md") && p.is_file())
        .collect();
    sessions.sort();
    if !sessions.is_empty() && std::fs::create_dir_all(to).is_err() {
        return;
    }
    for src in sessions {
        adopt_file(&src, to, tag);
    }
    let _ = std::fs::remove_dir(from);
}

/// Both folders are siblings under ~/.lpm/memory, so a plain rename always
/// applies; a failed one leaves the session in place rather than losing it.
fn adopt_file(src: &Path, to: &Path, tag: &str) {
    let Some(name) = src.file_name().and_then(|n| n.to_str()) else {
        return;
    };
    let dest = to.join(name);
    if !dest.exists() {
        let _ = std::fs::rename(src, &dest);
        return;
    }
    if let (Ok(ours), Ok(theirs)) = (std::fs::read(src), std::fs::read(&dest)) {
        if ours == theirs {
            let _ = std::fs::remove_file(src);
            return;
        }
    }
    let Some(stem) = src.file_stem().and_then(|s| s.to_str()) else {
        return;
    };
    let Some(alt) = suffixed_name(stem, tag) else {
        return;
    };
    let alt = to.join(alt);
    if !alt.exists() {
        let _ = std::fs::rename(src, &alt);
    }
}

/// `<stem>-<tag>.md`, kept inside the session-name budget and slugged, because
/// the UI can only save a session whose file name is a plain slug. None when
/// the stem leaves no room for a suffix.
fn suffixed_name(stem: &str, tag: &str) -> Option<String> {
    let slug: String = tag
        .chars()
        .map(|c| {
            let c = c.to_ascii_lowercase();
            if c.is_ascii_lowercase() || c.is_ascii_digit() {
                c
            } else {
                '-'
            }
        })
        .collect();
    let room = MAX_NAME_LEN.checked_sub(stem.len() + 1)?;
    let slug = slug.trim_matches('-');
    let slug = &slug[..slug.len().min(room)];
    let slug = slug.trim_end_matches('-');
    if slug.is_empty() {
        return None;
    }
    Some(format!("{stem}-{slug}.md"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parents(pairs: &[(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        let map: Vec<(String, String)> = pairs
            .iter()
            .map(|(c, p)| (c.to_string(), p.to_string()))
            .collect();
        move |name: &str| {
            map.iter()
                .find(|(c, _)| c == name)
                .map(|(_, p)| p.clone())
        }
    }

    #[test]
    fn an_original_owns_its_own_memory() {
        let parent_of = parents(&[("web-2", "web")]);
        assert_eq!(resolve_owner("web", &parent_of), "web");
    }

    #[test]
    fn a_duplicate_resolves_to_its_original() {
        let parent_of = parents(&[("web-2", "web"), ("web-3", "web")]);
        assert_eq!(resolve_owner("web-2", &parent_of), "web");
        assert_eq!(resolve_owner("web-3", &parent_of), "web");
    }

    /// lpm flattens the chain (a copy of a copy records the first original), but
    /// a hand-written config can nest, and both must land in one folder.
    #[test]
    fn a_chain_walks_up_to_the_root_project() {
        let parent_of = parents(&[("c", "b"), ("b", "a")]);
        assert_eq!(resolve_owner("c", &parent_of), "a");
    }

    #[test]
    fn a_hand_written_cycle_terminates() {
        assert_eq!(resolve_owner("a", &parents(&[("a", "b"), ("b", "a")])), "b");
        assert_eq!(resolve_owner("a", &parents(&[("a", "a")])), "a");
        let long: Vec<(&str, &str)> =
            vec![("a", "b"), ("b", "c"), ("c", "d"), ("d", "e"), ("e", "f"), ("f", "g"),
                 ("g", "h"), ("h", "i"), ("i", "j"), ("j", "k")];
        // Bounded rather than unbounded: the hop cap decides, not the data.
        assert_eq!(resolve_owner("a", &parents(&long)), "i");
    }

    #[test]
    fn an_empty_parent_name_is_not_a_parent() {
        assert_eq!(resolve_owner("web", &parents(&[("web", "")])), "web");
    }

    /// The project name is a path segment under ~/.lpm/memory, so it gets the
    /// same distrust the session slug does.
    #[test]
    fn rejects_project_names_that_could_escape_the_memory_dir() {
        for bad in ["", "..", ".", "../../etc", "a/b", "a\\b", ".hidden"] {
            assert!(!is_valid_project(bad), "{bad:?} should be rejected");
            assert!(own_memory_dir(bad).is_err(), "{bad:?} should not resolve");
        }
        for good in ["web", "web-2", "My Project", "a.b"] {
            assert!(is_valid_project(good), "{good:?} should be accepted");
        }
        assert!(own_memory_dir("web").unwrap().ends_with("memory/web"));
    }

    fn write(dir: &Path, name: &str, body: &str) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join(name), body).unwrap();
    }

    fn read(dir: &Path, name: &str) -> String {
        std::fs::read_to_string(dir.join(name)).unwrap()
    }

    #[test]
    fn adopting_moves_sessions_up_and_drops_the_empty_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let from = tmp.path().join("web-2");
        let to = tmp.path().join("web");
        write(&from, "auth.md", "# Auth\n");
        write(&to, "perf.md", "# Perf\n");

        adopt_dir(&from, &to, "web-2");
        assert_eq!(read(&to, "auth.md"), "# Auth\n");
        assert_eq!(read(&to, "perf.md"), "# Perf\n");
        assert!(!from.exists(), "the copy's folder should be gone");
    }

    #[test]
    fn adopting_creates_the_owner_folder_when_it_has_no_memory_yet() {
        let tmp = tempfile::tempdir().unwrap();
        let from = tmp.path().join("web-2");
        let to = tmp.path().join("web");
        write(&from, "auth.md", "# Auth\n");

        adopt_dir(&from, &to, "web-2");
        assert_eq!(read(&to, "auth.md"), "# Auth\n");
        assert!(!from.exists());
    }

    /// The likely collision: the copy inherited a session name from a save the
    /// original already has. Same bytes -> nothing to keep.
    #[test]
    fn an_identical_session_is_dropped_rather_than_duplicated() {
        let tmp = tempfile::tempdir().unwrap();
        let from = tmp.path().join("web-2");
        let to = tmp.path().join("web");
        write(&from, "auth.md", "# Auth\n");
        write(&to, "auth.md", "# Auth\n");

        adopt_dir(&from, &to, "web-2");
        assert_eq!(read(&to, "auth.md"), "# Auth\n");
        assert!(!to.join("auth-web-2.md").exists());
        assert!(!from.exists());
    }

    #[test]
    fn a_diverged_session_moves_aside_under_the_copys_name() {
        let tmp = tempfile::tempdir().unwrap();
        let from = tmp.path().join("web-2");
        let to = tmp.path().join("web");
        write(&from, "auth.md", "# Auth in the copy\n");
        write(&to, "auth.md", "# Auth\n");

        adopt_dir(&from, &to, "web-2");
        assert_eq!(read(&to, "auth.md"), "# Auth\n", "the original is never overwritten");
        assert_eq!(read(&to, "auth-web-2.md"), "# Auth in the copy\n");
        assert!(!from.exists());
    }

    #[test]
    fn a_taken_fallback_name_leaves_the_session_where_it_is() {
        let tmp = tempfile::tempdir().unwrap();
        let from = tmp.path().join("web-2");
        let to = tmp.path().join("web");
        write(&from, "auth.md", "# Copy\n");
        write(&to, "auth.md", "# Original\n");
        write(&to, "auth-web-2.md", "# An earlier adoption\n");

        adopt_dir(&from, &to, "web-2");
        assert_eq!(read(&from, "auth.md"), "# Copy\n", "nothing is lost silently");
        assert_eq!(read(&to, "auth-web-2.md"), "# An earlier adoption\n");
    }

    #[test]
    fn adopting_leaves_everything_that_is_not_a_session_alone() {
        let tmp = tempfile::tempdir().unwrap();
        let from = tmp.path().join("web-2");
        let to = tmp.path().join("web");
        write(&from, "auth.md", "# Auth\n");
        write(&from, ".DS_Store", "junk");
        std::fs::create_dir(from.join("sub.md")).unwrap();

        adopt_dir(&from, &to, "web-2");
        assert_eq!(read(&to, "auth.md"), "# Auth\n");
        assert!(from.join(".DS_Store").exists());
        assert!(from.exists(), "a folder with leftovers is kept");
    }

    #[test]
    fn adopting_a_folder_that_never_existed_does_nothing() {
        let tmp = tempfile::tempdir().unwrap();
        let to = tmp.path().join("web");
        adopt_dir(&tmp.path().join("web-2"), &to, "web-2");
        assert!(!to.exists(), "the owner's folder is not created for nothing");
    }

    /// lpm's copy names carry random case (`lpm-kSENIj`); the UI can only save a
    /// session whose file name is a plain slug, so the suffix is slugged.
    #[test]
    fn the_fallback_name_stays_a_plain_slug() {
        assert_eq!(suffixed_name("auth", "lpm-kSENIj").unwrap(), "auth-lpm-ksenij.md");
        assert_eq!(suffixed_name("auth", "My Project").unwrap(), "auth-my-project.md");
        assert_eq!(suffixed_name("auth", "a.b").unwrap(), "auth-a-b.md");
        // Trailing separators would leave `auth-x-.md`.
        assert_eq!(suffixed_name("auth", "x_").unwrap(), "auth-x.md");
        assert_eq!(suffixed_name("auth", "..").unwrap_or_default(), "");
    }

    #[test]
    fn the_fallback_name_stays_inside_the_session_name_budget() {
        let tag = "b".repeat(90);
        let name = suffixed_name("auth", &tag).unwrap();
        assert_eq!(name.len(), MAX_NAME_LEN + ".md".len());
        assert!(name.starts_with("auth-b"));
        // No room for a suffix at all: the session stays in the copy's folder.
        assert!(suffixed_name(&"a".repeat(MAX_NAME_LEN), "web-2").is_none());
    }
}
