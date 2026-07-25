// Session-memory files: `~/.lpm/memory/<project>/<session>.md`.
//
// They live in the lpm config dir rather than inside the checkout (the
// precedent is ~/.lpm/notes/<project> and the per-project instructions dir), so
// memory survives a moved or deleted working copy, never shows up in a diff,
// and needs no gitignore handling at all. Agent CLIs write the same files
// through the lpm-memory skill while the pane is open, so a save is
// compare-and-swap against the text the UI loaded — an agent's newer entry is
// never silently clobbered.
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const MAX_DOC_BYTES: u64 = 1024 * 1024;
const TOO_LARGE: &str =
    "_This session file is too large to show here. Open it from ~/.lpm/memory/._";
const MAX_NAME_LEN: usize = 64;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySession {
    pub name: String,
    pub title: String,
    /// Absolute path to the file — the composer's "@" mention inserts it, so it
    /// has to resolve from any terminal's cwd.
    pub path: String,
    pub updated_at: i64,
    pub size: u64,
    pub content: String,
}

/// `dir` is the project's memory directory (`~/.lpm/memory/<project>`), filled
/// in even when `exists` is false.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryState {
    pub exists: bool,
    pub dir: String,
    pub sessions: Vec<MemorySession>,
}

/// The project must exist and be local: an SSH project's agents run on the other
/// host, where this Mac's ~/.lpm/memory means nothing. The root itself is no
/// longer used for storage, so a rootless project is fine.
fn ensure_local_project(project: &str) -> Result<(), String> {
    let (_, is_remote) = crate::config::project_root(project)?;
    if is_remote {
        return Err("Session memory isn't available for SSH projects.".into());
    }
    Ok(())
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

fn project_memory_dir(project: &str) -> Result<PathBuf, String> {
    if !is_valid_project(project) {
        return Err(format!("invalid project name {project:?}"));
    }
    Ok(crate::config::lpm_dir().join("memory").join(project))
}

#[tauri::command(async)]
pub fn read_memory_sessions(project: String) -> Result<MemoryState, String> {
    ensure_local_project(&project)?;
    Ok(read_sessions_at(&project_memory_dir(&project)?))
}

fn read_sessions_at(dir: &Path) -> MemoryState {
    let dir_str = dir.to_string_lossy().into_owned();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return MemoryState {
            exists: false,
            dir: dir_str,
            sessions: Vec::new(),
        };
    };
    let mut sessions: Vec<MemorySession> = entries.flatten().filter_map(read_session).collect();
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then_with(|| a.name.cmp(&b.name)));
    MemoryState {
        exists: true,
        dir: dir_str,
        sessions,
    }
}

fn read_session(entry: std::fs::DirEntry) -> Option<MemorySession> {
    let path = entry.path();
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return None;
    }
    let name = path.file_stem().and_then(|s| s.to_str())?;
    if name.is_empty() || name.starts_with('.') {
        return None;
    }
    let meta = entry.metadata().ok()?;
    if !meta.is_file() {
        return None;
    }
    let content = if meta.len() > MAX_DOC_BYTES {
        TOO_LARGE.to_string()
    } else {
        std::fs::read_to_string(&path).ok()?
    };
    let updated_at = meta
        .modified()
        .ok()
        .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    Some(MemorySession {
        title: title_of(&content, name),
        name: name.to_string(),
        path: path.to_string_lossy().into_owned(),
        updated_at,
        size: meta.len(),
        content,
    })
}

fn title_of(content: &str, name: &str) -> String {
    let heading = content
        .lines()
        .find(|l| l.trim_start().starts_with('#'))
        .map(|l| l.trim_start().trim_start_matches('#').trim())
        .unwrap_or_default();
    if heading.is_empty() {
        name.to_string()
    } else {
        heading.to_string()
    }
}

/// `^[a-z0-9][a-z0-9-]{0,63}$` — the slug becomes a filename, so nothing that
/// could traverse, hide, or collide case-insensitively is allowed through.
fn is_valid_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.is_empty() || bytes.len() > MAX_NAME_LEN {
        return false;
    }
    let head_ok = bytes[0].is_ascii_lowercase() || bytes[0].is_ascii_digit();
    head_ok
        && bytes
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-')
}

/// `baseline` is the content the caller last loaded: Some means "only write if
/// the file still reads exactly like this", None means overwrite unconditionally.
#[tauri::command(async)]
pub fn write_memory_session(
    project: String,
    name: String,
    content: String,
    baseline: Option<String>,
) -> Result<(), String> {
    ensure_local_project(&project)?;
    write_session_at(
        &project_memory_dir(&project)?,
        &name,
        &content,
        baseline.as_deref(),
    )
}

fn write_session_at(
    dir: &Path,
    name: &str,
    content: &str,
    baseline: Option<&str>,
) -> Result<(), String> {
    if !is_valid_name(name) {
        return Err("A session name may only use lowercase letters, numbers and dashes.".into());
    }
    let path = dir.join(format!("{name}.md"));
    if let Some(expected) = baseline {
        let current = match std::fs::read(&path) {
            Ok(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(format!("cannot read {}: {e}", path.display())),
        };
        let unchanged = match current {
            Some(ref on_disk) => on_disk == expected,
            None => expected.is_empty(),
        };
        if !unchanged {
            return Err("modified".into());
        }
    }
    std::fs::create_dir_all(dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    crate::fsatomic::write(
        &path,
        content.as_bytes(),
        crate::fsatomic::Mode::Preserve(0o644),
    )
    .map_err(|e| format!("cannot write {}: {e}", path.display()))
}

/// Deleting takes no baseline: the user is throwing the whole session away, so
/// an agent having appended to it since the pane loaded doesn't change the
/// decision. An already-missing file is success — another window or an agent
/// getting there first is the same outcome the caller asked for.
#[tauri::command(async)]
pub fn delete_memory_session(project: String, name: String) -> Result<(), String> {
    ensure_local_project(&project)?;
    delete_session_at(&project_memory_dir(&project)?, &name)
}

fn delete_session_at(dir: &Path, name: &str) -> Result<(), String> {
    if !is_valid_name(name) {
        return Err("A session name may only use lowercase letters, numbers and dashes.".into());
    }
    let path = dir.join(format!("{name}.md"));
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("cannot delete {}: {e}", path.display())),
    }
}

/// Drop a removed project's memory. Numbered duplicate names get reused, so the
/// next project under a reused name must not inherit the old one's sessions —
/// the same reason notes and the instructions dir are purged there. Routed
/// through `project_memory_dir` so the name guard stands between a config value
/// and a recursive delete; an unusable name removes nothing.
pub fn purge_project(project: &str) {
    let Ok(dir) = project_memory_dir(project) else {
        return;
    };
    let _ = crate::config::remove_dir_all_retry(&dir);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_memory(dir: &Path, name: &str, body: &str) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join(name), body).unwrap();
    }

    fn names(state: &MemoryState) -> Vec<&str> {
        state.sessions.iter().map(|s| s.name.as_str()).collect()
    }

    fn set_mtime(path: &Path, when: std::time::SystemTime) {
        let file = std::fs::File::options().write(true).open(path).unwrap();
        file.set_modified(when).unwrap();
    }

    #[test]
    fn missing_dir_reports_not_exists_with_the_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("memory").join("web");
        let state = read_sessions_at(&dir);
        assert!(!state.exists);
        assert!(state.sessions.is_empty());
        assert_eq!(state.dir, dir.to_string_lossy());
    }

    #[test]
    fn empty_dir_exists_with_no_sessions() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path()).unwrap();
        let state = read_sessions_at(tmp.path());
        assert!(state.exists);
        assert!(state.sessions.is_empty());
    }

    #[test]
    fn reads_newest_first_skipping_non_markdown_and_dotfiles() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        write_memory(dir, "old.md", "# Old work");
        write_memory(dir, "new.md", "# New work");
        write_memory(dir, "notes.txt", "skip");
        write_memory(dir, ".hidden.md", "skip");
        std::fs::create_dir(dir.join("sub.md")).unwrap();

        let now = std::time::SystemTime::now();
        set_mtime(&dir.join("old.md"), now - std::time::Duration::from_secs(3600));
        set_mtime(&dir.join("new.md"), now);

        let state = read_sessions_at(dir);
        assert_eq!(names(&state), ["new", "old"]);
        assert_eq!(state.sessions[0].title, "New work");
        assert_eq!(state.sessions[0].content, "# New work");
        assert_eq!(state.sessions[0].size, "# New work".len() as u64);
        assert!(state.sessions[0].updated_at > state.sessions[1].updated_at);
    }

    /// The composer's "@" mention inserts this path from a terminal whose cwd is
    /// the project checkout, which no longer contains the file.
    #[test]
    fn each_session_carries_its_absolute_path() {
        let tmp = tempfile::tempdir().unwrap();
        write_memory(tmp.path(), "auth-refactor.md", "# Auth");
        let state = read_sessions_at(tmp.path());
        let expected = tmp.path().join("auth-refactor.md");
        assert_eq!(state.sessions[0].path, expected.to_string_lossy());
        assert!(Path::new(&state.sessions[0].path).is_absolute());
    }

    #[test]
    fn title_falls_back_to_the_slug() {
        assert_eq!(title_of("# Auth refactor\n\n## Goal", "auth"), "Auth refactor");
        assert_eq!(title_of("   ###  Deep  \n", "auth"), "Deep");
        assert_eq!(title_of("no heading at all\n", "auth"), "auth");
        assert_eq!(title_of("", "auth"), "auth");
        assert_eq!(
            title_of("#\n# Real\n", "auth"),
            "auth",
            "an empty heading is not a title"
        );
    }

    #[test]
    fn oversized_files_come_back_as_a_placeholder() {
        let tmp = tempfile::tempdir().unwrap();
        let big = "x".repeat(MAX_DOC_BYTES as usize + 1);
        write_memory(tmp.path(), "huge.md", &big);
        let state = read_sessions_at(tmp.path());
        assert_eq!(state.sessions[0].content, TOO_LARGE);
        assert_eq!(state.sessions[0].size, big.len() as u64);
        assert_eq!(state.sessions[0].title, "huge");
    }

    #[test]
    fn rejects_names_that_are_not_plain_slugs() {
        for bad in [
            "", "../x", "a/b", ".hidden", "X", "Auth", "café", "a_b", "a b", "-lead", "a.md",
            &"a".repeat(MAX_NAME_LEN + 1),
        ] {
            assert!(!is_valid_name(bad), "{bad:?} should be rejected");
        }
        for good in ["a", "9", "auth-refactor", "fix-2-freeze", &"a".repeat(MAX_NAME_LEN)] {
            assert!(is_valid_name(good), "{good:?} should be accepted");
        }
    }

    /// The project name is now a path segment under ~/.lpm/memory, so it gets
    /// the same distrust the session slug does.
    #[test]
    fn rejects_project_names_that_could_escape_the_memory_dir() {
        for bad in ["", "..", ".", "../../etc", "a/b", "a\\b", ".hidden"] {
            assert!(!is_valid_project(bad), "{bad:?} should be rejected");
            assert!(project_memory_dir(bad).is_err(), "{bad:?} should not resolve");
        }
        for good in ["web", "web-2", "My Project", "a.b"] {
            assert!(is_valid_project(good), "{good:?} should be accepted");
        }
        let dir = project_memory_dir("web").unwrap();
        assert!(dir.ends_with("memory/web"));
    }

    #[test]
    fn write_rejects_a_bad_name_before_touching_the_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("web");
        assert!(write_session_at(&dir, "../escape", "x", None).is_err());
        assert!(!dir.exists());
    }

    #[test]
    fn write_creates_the_project_dir_and_the_file() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("memory").join("web");
        write_session_at(&dir, "auth-refactor", "# Auth\n", None).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join("auth-refactor.md")).unwrap(),
            "# Auth\n"
        );
    }

    #[test]
    fn cas_rejects_a_stale_baseline() {
        let tmp = tempfile::tempdir().unwrap();
        write_memory(tmp.path(), "auth.md", "on disk");

        let err = write_session_at(tmp.path(), "auth", "mine", Some("what I loaded")).unwrap_err();
        assert_eq!(err, "modified");
        assert_eq!(
            std::fs::read_to_string(tmp.path().join("auth.md")).unwrap(),
            "on disk"
        );

        write_session_at(tmp.path(), "auth", "mine", Some("on disk")).unwrap();
        assert_eq!(
            std::fs::read_to_string(tmp.path().join("auth.md")).unwrap(),
            "mine"
        );
    }

    #[test]
    fn cas_treats_a_missing_file_as_empty() {
        let tmp = tempfile::tempdir().unwrap();
        // Someone else deleted (or never created) the file the UI thinks it loaded.
        let err = write_session_at(tmp.path(), "gone", "mine", Some("had content")).unwrap_err();
        assert_eq!(err, "modified");
        // An empty baseline is the "new file" case and goes through.
        write_session_at(tmp.path(), "fresh", "mine", Some("")).unwrap();
        assert_eq!(
            std::fs::read_to_string(tmp.path().join("fresh.md")).unwrap(),
            "mine"
        );
    }

    #[test]
    fn delete_removes_only_the_named_session() {
        let tmp = tempfile::tempdir().unwrap();
        write_memory(tmp.path(), "auth.md", "# Auth");
        write_memory(tmp.path(), "freeze.md", "# Freeze");

        delete_session_at(tmp.path(), "auth").unwrap();
        assert!(!tmp.path().join("auth.md").exists());
        assert!(tmp.path().join("freeze.md").exists());

        // Whoever deletes second must not see an error.
        delete_session_at(tmp.path(), "auth").unwrap();
    }

    #[test]
    fn delete_rejects_a_bad_name_before_touching_the_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("memory").join("web");
        write_memory(&dir, "keep.md", "# Keep");
        // `..md` would resolve to the parent directory's file without the guard.
        std::fs::write(tmp.path().join("memory").join("escape.md"), "# Escape").unwrap();

        assert!(delete_session_at(&dir, "../escape").is_err());
        assert!(delete_session_at(&dir, "Keep").is_err());
        assert!(tmp.path().join("memory").join("escape.md").exists());
        assert!(dir.join("keep.md").exists());
    }

    #[test]
    fn no_baseline_overwrites() {
        let tmp = tempfile::tempdir().unwrap();
        write_memory(tmp.path(), "auth.md", "on disk");
        write_session_at(tmp.path(), "auth", "mine", None).unwrap();
        assert_eq!(
            std::fs::read_to_string(tmp.path().join("auth.md")).unwrap(),
            "mine"
        );
    }
}
