use super::*;
use rusqlite::params;
use tempfile::TempDir;

const ROOT: &str = "/work/shop";

/// Sessions as (id, directory, parent, title, updated, archived), each with
/// its opening prompt as a `session_message`.
fn write_v2(dir: &Path, rows: &[(&str, &str, Option<&str>, &str, i64, Option<i64>, &str)]) {
    let connection = Connection::open(dir.join("opencode.db")).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE session_v2 (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_id TEXT,
                slug TEXT NOT NULL, directory TEXT NOT NULL, title TEXT,
                version TEXT NOT NULL, time_created INTEGER NOT NULL,
                time_updated INTEGER NOT NULL, time_archived INTEGER
            );
            CREATE TABLE session_message (
                id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL,
                seq INTEGER NOT NULL, time_created INTEGER NOT NULL,
                time_updated INTEGER NOT NULL, data TEXT NOT NULL
            );",
        )
        .unwrap();
    for (id, directory, parent, title, updated, archived, prompt) in rows {
        connection
            .execute(
                "INSERT INTO session_v2 VALUES (?1, 'p', ?2, 's', ?3, ?4, '2', ?5, ?5, ?6)",
                params![id, parent, directory, title, updated, archived],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO session_message VALUES (?1 || '-m', ?1, 'user', 1, ?2, ?2, ?3)",
                params![
                    id,
                    updated,
                    serde_json::json!({ "text": prompt, "files": [] }).to_string()
                ],
            )
            .unwrap();
    }
}

#[test]
fn sessions_are_scoped_to_the_project_newest_first_with_their_prompt() {
    let dir = TempDir::new().unwrap();
    write_v2(
        dir.path(),
        &[
            ("ses_old", ROOT, None, "Greeting", 10, None, "hello"),
            (
                "ses_new",
                ROOT,
                None,
                "Checkout fix",
                30,
                None,
                "fix the checkout",
            ),
            (
                "ses_other",
                "/work/other",
                None,
                "Elsewhere",
                40,
                None,
                "hi",
            ),
            (
                "ses_child",
                ROOT,
                Some("ses_new"),
                "Sub-agent",
                50,
                None,
                "look",
            ),
            ("ses_gone", ROOT, None, "Archived", 60, Some(61), "old"),
        ],
    );

    let page = page(Some(dir.path()), ROOT, "", 40);
    let ids = page
        .rows
        .iter()
        .map(|r| r.session_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, ["ses_new", "ses_old"]);
    assert_eq!(page.rows[0].provider, "opencode");
    assert_eq!(page.rows[0].title.as_deref(), Some("Checkout fix"));
    assert_eq!(page.rows[0].preview.as_deref(), Some("fix the checkout"));
    assert_eq!(page.rows[0].updated_at, 30);
    assert!(!page.more);
}

#[test]
fn search_matches_the_title_or_the_opening_prompt_not_the_json_around_it() {
    let dir = TempDir::new().unwrap();
    write_v2(
        dir.path(),
        &[
            (
                "ses_a",
                ROOT,
                None,
                "Checkout fix",
                10,
                None,
                "make 100% sure",
            ),
            ("ses_b", ROOT, None, "Greeting", 20, None, "hello there"),
        ],
    );
    let ids = |needle: &str| {
        page(Some(dir.path()), ROOT, needle, 40)
            .rows
            .into_iter()
            .map(|r| r.session_id)
            .collect::<Vec<_>>()
    };
    assert_eq!(ids("checkout"), ["ses_a"]);
    assert_eq!(ids("there"), ["ses_b"]);
    assert_eq!(ids("100%"), ["ses_a"]);
    assert!(ids("files").is_empty());
}

#[test]
fn a_placeholder_title_gives_way_to_the_prompt_and_a_full_page_says_more() {
    let dir = TempDir::new().unwrap();
    write_v2(
        dir.path(),
        &[
            (
                "ses_a",
                ROOT,
                None,
                "New session - 2026-11-22T08:00:00.000Z",
                10,
                None,
                "add tests",
            ),
            ("ses_b", ROOT, None, "Greeting", 20, None, "hello"),
        ],
    );
    let page = page(Some(dir.path()), ROOT, "", 1);
    assert_eq!(page.rows.len(), 1);
    assert!(page.more);
    let all = super::page(Some(dir.path()), ROOT, "", 40);
    let placeholder = all.rows.iter().find(|r| r.session_id == "ses_a").unwrap();
    assert!(placeholder.title.is_none());
    assert_eq!(placeholder.preview.as_deref(), Some("add tests"));
}

#[test]
fn opencode_1_sessions_list_by_title() {
    let dir = TempDir::new().unwrap();
    let connection = Connection::open(dir.path().join("opencode.db")).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE session (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_id TEXT,
                directory TEXT NOT NULL, title TEXT NOT NULL,
                time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
            );
            INSERT INTO session VALUES ('ses_v1', 'p', NULL, '/work/shop', 'Old title', 1, 2);",
        )
        .unwrap();
    let rows = page(Some(dir.path()), ROOT, "", 40).rows;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].title.as_deref(), Some("Old title"));
    assert!(rows[0].preview.is_none());
}

#[test]
fn no_database_is_an_empty_page() {
    let dir = TempDir::new().unwrap();
    let page = page(Some(dir.path()), ROOT, "", 40);
    assert!(page.rows.is_empty() && !page.more);
    assert!(super::page(None, ROOT, "", 40).rows.is_empty());
}
