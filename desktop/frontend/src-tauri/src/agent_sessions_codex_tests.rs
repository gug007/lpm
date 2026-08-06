use super::*;
use rusqlite::params;
use tempfile::TempDir;

const SESSION_A: &str = "019fac59-0da4-7160-b104-5b8429ba1054";
const SESSION_B: &str = "019fac59-0da4-7160-b104-5b8429ba1055";

/// Rows as (id, name, cwd, updated_at, archived, source).
fn write_threads(home: &Path, rows: &[(&str, &str, &str, i64, i64, &str)]) {
    let connection = Connection::open(home.join("state_9.sqlite")).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE threads (
                id TEXT PRIMARY KEY,
                name TEXT,
                preview TEXT,
                cwd TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                archived INTEGER NOT NULL DEFAULT 0,
                source TEXT,
                git_branch TEXT
            );",
        )
        .unwrap();
    for (id, name, cwd, updated_at, archived, source) in rows {
        connection
            .execute(
                "INSERT INTO threads (id, name, preview, cwd, updated_at, archived, source, git_branch)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'main')",
                params![
                    id,
                    name,
                    format!("{name} preview"),
                    cwd,
                    updated_at,
                    archived,
                    source
                ],
            )
            .unwrap();
    }
}

#[test]
fn codex_rows_are_scoped_to_the_project_and_ordered_by_recency() {
    let home = TempDir::new().unwrap();
    write_threads(
        home.path(),
        &[
            (SESSION_A, "Older here", "/work/lpm", 1_700_000_000, 0, "cli"),
            (SESSION_B, "Newer here", "/work/lpm", 1_700_000_100, 0, "cli"),
            (
                "019fac59-0da4-7160-b104-5b8429ba1056",
                "Elsewhere",
                "/work/other",
                1_700_000_200,
                0,
                "cli",
            ),
            (
                "019fac59-0da4-7160-b104-5b8429ba1057",
                "Archived",
                "/work/lpm",
                1_700_000_300,
                1,
                "cli",
            ),
        ],
    );

    let sessions = summaries(home.path(), "/work/lpm", "", 10);
    let titles = sessions
        .iter()
        .map(|s| s.title.as_deref().unwrap_or_default())
        .collect::<Vec<_>>();
    assert_eq!(titles, vec!["Newer here", "Older here"]);
    assert_eq!(sessions[0].updated_at, 1_700_000_100_000);
    assert_eq!(sessions[0].git_branch.as_deref(), Some("main"));
}

#[test]
fn codex_search_filters_in_sql() {
    let home = TempDir::new().unwrap();
    write_threads(
        home.path(),
        &[
            (SESSION_A, "Resume picker", "/work/lpm", 1_700_000_000, 0, "cli"),
            (SESSION_B, "Something else", "/work/lpm", 1_700_000_100, 0, "cli"),
        ],
    );

    let sessions = summaries(home.path(), "/work/lpm", "resume", 10);
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].session_id, SESSION_A);
}

/// A wildcard typed into the search box is a literal, not a pattern.
#[test]
fn codex_search_escapes_like_wildcards() {
    let home = TempDir::new().unwrap();
    write_threads(
        home.path(),
        &[
            (SESSION_A, "100% done", "/work/lpm", 1_700_000_000, 0, "cli"),
            (SESSION_B, "nothing alike", "/work/lpm", 1_700_000_100, 0, "cli"),
        ],
    );

    let sessions = summaries(home.path(), "/work/lpm", "100%", 10);
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].session_id, SESSION_A);
}

/// One-shot `codex exec` runs and subagent threads share the database with real
/// conversations; only the interactive ones can be resumed.
#[test]
fn codex_rows_skip_exec_and_subagent_threads() {
    let home = TempDir::new().unwrap();
    write_threads(
        home.path(),
        &[
            (SESSION_A, "Interactive", "/work/lpm", 1_700_000_000, 0, "cli"),
            (SESSION_B, "Commit message", "/work/lpm", 1_700_000_100, 0, "exec"),
            (
                "019fac59-0da4-7160-b104-5b8429ba1056",
                "Spawned",
                "/work/lpm",
                1_700_000_200,
                0,
                "{\"subagent\":\"review\"}",
            ),
        ],
    );

    let sessions = summaries(home.path(), "/work/lpm", "", 10);
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].session_id, SESSION_A);
}

#[test]
fn codex_missing_database_is_empty_not_an_error() {
    let home = TempDir::new().unwrap();
    assert!(summaries(home.path(), "/work/lpm", "", 10).is_empty());
}


