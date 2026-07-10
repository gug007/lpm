//! Parse `~/.lpm/terminals.json` for a project's closed-terminal history.
//! Shape: `{ "projects": { "<project>": { "history": [ {actionName, closedAt,
//! label, resumeCmd, startCmd}, ... ] } } }`. The project key is the project
//! file-name stem (the app's `LPM_PROJECT_NAME`), plus `__global__`.

use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize, Default)]
struct TerminalsFile {
    #[serde(default)]
    projects: std::collections::HashMap<String, ProjectTerminals>,
}

#[derive(Deserialize, Default)]
struct ProjectTerminals {
    #[serde(default)]
    history: Vec<HistoryEntry>,
}

/// One closed terminal session recorded in the history log.
#[derive(Deserialize, Clone, Default)]
pub struct HistoryEntry {
    #[serde(rename = "actionName", default)]
    pub action_name: String,
    #[serde(rename = "closedAt", default)]
    pub closed_at: i64, // unix millis
    #[serde(default)]
    pub label: String,
    #[serde(rename = "resumeCmd", default)]
    pub resume_cmd: String,
    #[serde(rename = "startCmd", default)]
    pub start_cmd: String,
}

/// Closed-terminal history for a project, most recent first, capped at `limit`.
/// Missing file / project / malformed JSON all read as empty (non-fatal).
pub fn history(path: &Path, project: &str, limit: usize) -> Vec<HistoryEntry> {
    let Ok(bytes) = std::fs::read(path) else {
        return Vec::new();
    };
    let Ok(file) = serde_json::from_slice::<TerminalsFile>(&bytes) else {
        return Vec::new();
    };
    let Some(pt) = file.projects.get(project) else {
        return Vec::new();
    };
    let mut entries = pt.history.clone();
    entries.sort_by_key(|e| std::cmp::Reverse(e.closed_at));
    entries.truncate(limit);
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_tmp(body: &str) -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("terminals.json");
        std::fs::write(&p, body).unwrap();
        (dir, p)
    }

    #[test]
    fn parses_and_sorts_recent_first() {
        let body = r#"{"projects":{"karucapatoxic":{"history":[
            {"actionName":"a","closedAt":100,"label":"old","resumeCmd":"claude --resume 1"},
            {"actionName":"b","closedAt":300,"label":"new","resumeCmd":"claude --resume 3"},
            {"actionName":"c","closedAt":200,"label":"mid","resumeCmd":"claude --resume 2"}
        ]}}}"#;
        let (_d, p) = write_tmp(body);
        let h = history(&p, "karucapatoxic", 10);
        assert_eq!(h.len(), 3);
        assert_eq!(h[0].label, "new");
        assert_eq!(h[1].label, "mid");
        assert_eq!(h[2].label, "old");
    }

    #[test]
    fn caps_at_limit() {
        let body = r#"{"projects":{"p":{"history":[
            {"closedAt":1},{"closedAt":2},{"closedAt":3},{"closedAt":4},{"closedAt":5}
        ]}}}"#;
        let (_d, p) = write_tmp(body);
        assert_eq!(history(&p, "p", 3).len(), 3);
    }

    #[test]
    fn missing_project_is_empty() {
        let (_d, p) = write_tmp(r#"{"projects":{"other":{"history":[{"closedAt":1}]}}}"#);
        assert!(history(&p, "p", 10).is_empty());
    }

    #[test]
    fn missing_file_is_empty() {
        assert!(history(Path::new("/no/such/terminals.json"), "p", 10).is_empty());
    }

    #[test]
    fn malformed_json_is_empty() {
        let (_d, p) = write_tmp("{ not json");
        assert!(history(&p, "p", 10).is_empty());
    }
}
