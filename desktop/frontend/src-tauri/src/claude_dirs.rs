//! Every Claude config dir lpm can start sessions in on this machine, keyed by
//! the account id usage is filed under, and the lookup that finds which of them
//! holds a conversation. Read-only: nothing here creates or re-links a dir.
//!
//! A session's transcript lives in the config dir it ran under
//! (`<dir>/projects/<slug of its cwd>/<id>.jsonl`), so once projects can switch
//! accounts the only reliable record of where a conversation belongs is the
//! file itself.
use crate::config::{self, ClaudeEnv};
use std::path::{Path, PathBuf};

pub const MAIN_LOGIN: &str = "default";

/// How a terminal reaches one config dir.
#[derive(Clone, Debug, PartialEq)]
pub enum DirKind {
    /// The `CLAUDE_CONFIG_DIR` lpm itself was started with.
    Ambient,
    /// `~/.claude`, the main login.
    Home,
    /// `~/.lpm/claude-accounts/<id>`.
    Account(String),
}

impl DirKind {
    pub fn env(&self) -> ClaudeEnv {
        match self {
            DirKind::Ambient => ClaudeEnv::Inherit,
            DirKind::Home => ClaudeEnv::Scrub,
            DirKind::Account(id) => config::claude_env_for_account(Some(id)),
        }
    }
}

#[derive(Clone, Debug)]
pub struct AccountDir {
    /// The id usage is filed under (`default` for the main login).
    pub id: String,
    pub dir: PathBuf,
    pub kind: DirKind,
}

/// The main login (lpm's ambient dir when set, and `~/.claude`) and each
/// registered account.
pub fn account_dirs() -> Vec<AccountDir> {
    let home = dirs::home_dir().unwrap_or_default().join(".claude");
    let mut out: Vec<AccountDir> = Vec::new();
    if let Some(ambient) = std::env::var_os(config::CLAUDE_CONFIG_DIR_ENV).filter(|v| !v.is_empty())
    {
        let ambient = PathBuf::from(ambient);
        if ambient != home {
            out.push(AccountDir {
                id: config::limits_account_of_config_dir(ambient.to_str()),
                dir: ambient,
                kind: DirKind::Ambient,
            });
        }
    }
    out.push(AccountDir {
        id: MAIN_LOGIN.to_string(),
        dir: home,
        kind: DirKind::Home,
    });
    for id in config::registered_claude_account_ids() {
        let dir = config::claude_account_dir(&id);
        if !out.iter().any(|a| a.dir == dir) {
            out.push(AccountDir {
                kind: DirKind::Account(id.clone()),
                id,
                dir,
            });
        }
    }
    out
}

/// The transcript dir of one project inside one config dir.
pub fn sessions_dir(config_dir: &Path, project_root: &str) -> PathBuf {
    config_dir
        .join("projects")
        .join(crate::hooks::claude_project_slug(project_root))
}

/// Which account holds `session_id`, and the file. The project root's dir is
/// checked first; a session started in a subfolder sits under that folder's
/// name instead, and ids are unique, so every project dir is searched next.
pub fn find_transcript(project_root: &str, session_id: &str) -> Option<(AccountDir, PathBuf)> {
    find_in(&account_dirs(), project_root, session_id)
}

fn find_in(
    dirs: &[AccountDir],
    project_root: &str,
    session_id: &str,
) -> Option<(AccountDir, PathBuf)> {
    if !crate::socketsrv::valid_session_id(session_id) {
        return None;
    }
    let file = format!("{session_id}.jsonl");
    let direct = dirs.iter().find_map(|a| {
        let path = sessions_dir(&a.dir, project_root).join(&file);
        path.is_file().then(|| (a.clone(), path))
    });
    direct.or_else(|| {
        dirs.iter().find_map(|a| {
            std::fs::read_dir(a.dir.join("projects"))
                .ok()?
                .flatten()
                .map(|e| e.path().join(&file))
                .find(|p| p.is_file())
                .map(|p| (a.clone(), p))
        })
    })
}

/// The transcript to read for a session: wherever it actually is, else where
/// the project's own account would put it (so a reader reports "nothing yet"
/// for the right file rather than failing).
pub fn transcript_for(info: &config::SpawnInfo, session_id: &str) -> PathBuf {
    find_transcript(&info.root, session_id)
        .map(|(_, path)| path)
        .unwrap_or_else(|| {
            crate::hooks::claude_transcript_path(
                config::claude_env_for_account(info.claude_account.as_deref()),
                &info.root,
                session_id,
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir(id: &str, path: PathBuf, kind: DirKind) -> AccountDir {
        AccountDir {
            id: id.into(),
            dir: path,
            kind,
        }
    }

    #[test]
    fn finds_the_account_that_holds_a_session() {
        let tmp = tempfile::tempdir().unwrap();
        let root = "/Users/me/Projects/app";
        let sid = "0f8c2a51-6a8e-4c43-9a1e-2b7f3f5d9c10";
        let work = tmp.path().join("work");
        let sessions = sessions_dir(&work, root);
        std::fs::create_dir_all(&sessions).unwrap();
        std::fs::write(sessions.join(format!("{sid}.jsonl")), "{}\n").unwrap();
        let dirs = vec![
            dir("default", tmp.path().join("main"), DirKind::Home),
            dir("work", work, DirKind::Account("work".into())),
        ];
        let (found, path) = find_in(&dirs, root, sid).unwrap();
        assert_eq!(found.id, "work");
        assert!(path.ends_with(format!("{sid}.jsonl")));
    }

    #[test]
    fn finds_a_session_started_in_a_subfolder() {
        let tmp = tempfile::tempdir().unwrap();
        let sid = "0f8c2a51-6a8e-4c43-9a1e-2b7f3f5d9c10";
        let ambient = tmp.path().join("alt");
        let sub = sessions_dir(&ambient, "/Users/me/Projects/app/packages/web");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::write(sub.join(format!("{sid}.jsonl")), "{}\n").unwrap();
        let dirs = vec![dir("default", ambient, DirKind::Ambient)];
        let (found, _) = find_in(&dirs, "/Users/me/Projects/app", sid).unwrap();
        assert_eq!(found.kind, DirKind::Ambient);
        assert_eq!(found.kind.env(), ClaudeEnv::Inherit);
    }

    #[test]
    fn rejects_ids_that_could_escape_the_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let dirs = vec![dir("default", tmp.path().to_path_buf(), DirKind::Home)];
        assert!(find_in(&dirs, "/x", "../../etc/passwd").is_none());
    }
}
