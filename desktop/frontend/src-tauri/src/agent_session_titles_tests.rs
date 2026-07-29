use super::*;
use rusqlite::{params, Connection};
use serde_json::json;
use std::fs;
use tempfile::TempDir;

const SESSION_ID: &str = "019fac59-0da4-7160-b104-5b8429ba1054";

fn write_full_state_database(
    home: &Path,
    version: u64,
    name: Option<&str>,
    preview: Option<&str>,
    title: Option<&str>,
    first_user_message: Option<&str>,
) {
    let path = home.join(format!("state_{version}.sqlite"));
    let connection = Connection::open(path).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE threads (
                id TEXT PRIMARY KEY,
                name TEXT,
                preview TEXT,
                title TEXT,
                first_user_message TEXT
            );",
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO threads VALUES (?1, ?2, ?3, ?4, ?5)",
            params![SESSION_ID, name, preview, title, first_user_message],
        )
        .unwrap();
}

fn write_session_index(home: &Path, lines: &[Value]) {
    let content = lines
        .iter()
        .map(Value::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(home.join("session_index.jsonl"), content).unwrap();
}

#[test]
fn validates_provider() {
    assert!(matches!(
        parse_provider("claude").unwrap(),
        AgentProvider::Claude
    ));
    assert!(matches!(
        parse_provider("codex").unwrap(),
        AgentProvider::Codex
    ));
    assert!(parse_provider("cursor").is_err());
}

#[test]
fn accepts_global_project_without_weakening_project_name_validation() {
    assert!(validate_project_name("__global__").is_ok());
    assert!(validate_project_name("local-project").is_ok());
    assert!(validate_project_name("../outside").is_err());
    assert!(validate_project_name("nested/project").is_err());
}

#[test]
fn claude_prefers_custom_title_over_newer_ai_title() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    fs::write(
        &transcript,
        [
            r#"{"type":"ai-title","aiTitle":"First AI title"}"#,
            r#"{"type":"custom-title","customTitle":""}"#,
            r#"{"type":"custom-title","customTitle":"  User   title  "}"#,
            r#"{"type":"ai-title","aiTitle":"Newer AI title"}"#,
            "",
        ]
        .join("\n"),
    )
    .unwrap();

    assert_eq!(
        claude_transcript_title(&transcript, TranscriptScan::default())
            .unwrap()
            .title()
            .as_deref(),
        Some("User title")
    );
}

#[test]
fn claude_custom_title_cleared_by_the_user_falls_back_to_the_ai_title() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    fs::write(
        &transcript,
        [
            r#"{"type":"custom-title","customTitle":"User title"}"#,
            r#"{"type":"ai-title","aiTitle":"Newer AI title"}"#,
            r#"{"type":"custom-title","customTitle":" \n "}"#,
            "",
        ]
        .join("\n"),
    )
    .unwrap();

    assert_eq!(
        claude_transcript_title(&transcript, TranscriptScan::default())
            .unwrap()
            .title()
            .as_deref(),
        Some("Newer AI title")
    );
}

#[test]
fn claude_ignores_transcript_content_that_merely_mentions_title_records() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    fs::write(
        &transcript,
        [
            r#"{"type":"ai-title","aiTitle":"Real title"}"#,
            r#"{"type":"user","message":"grep for \"type\":\"ai-title\" and custom-title"}"#,
            r#"{"type":"assistant","aiTitle":"Not a title record"}"#,
            "",
        ]
        .join("\n"),
    )
    .unwrap();

    assert_eq!(
        claude_transcript_title(&transcript, TranscriptScan::default())
            .unwrap()
            .title()
            .as_deref(),
        Some("Real title")
    );
}

#[test]
fn cached_claude_transcript_title_follows_appends() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    fs::write(
        &transcript,
        format!("{}\n", r#"{"type":"ai-title","aiTitle":"First title"}"#),
    )
    .unwrap();
    assert_eq!(
        cached_claude_transcript_title(&transcript)
            .unwrap()
            .as_deref(),
        Some("First title")
    );
    assert_eq!(
        cached_claude_transcript_title(&transcript)
            .unwrap()
            .as_deref(),
        Some("First title")
    );

    // A half-written record is ignored until its newline lands, so resuming
    // mid-line can't drop it.
    let mut appended = fs::read_to_string(&transcript).unwrap();
    appended.push_str(r#"{"type":"ai-title","aiTitle":"Second title"}"#);
    fs::write(&transcript, &appended).unwrap();
    assert_eq!(
        cached_claude_transcript_title(&transcript)
            .unwrap()
            .as_deref(),
        Some("First title")
    );

    appended.push('\n');
    fs::write(&transcript, appended).unwrap();
    assert_eq!(
        cached_claude_transcript_title(&transcript)
            .unwrap()
            .as_deref(),
        Some("Second title")
    );
}

#[test]
fn cached_claude_transcript_title_rescans_a_replaced_transcript() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("replaced.jsonl");
    fs::write(
        &transcript,
        format!(
            "{}\n",
            r#"{"type":"ai-title","aiTitle":"Long first title"}"#
        ),
    )
    .unwrap();
    assert_eq!(
        cached_claude_transcript_title(&transcript)
            .unwrap()
            .as_deref(),
        Some("Long first title")
    );

    fs::write(
        &transcript,
        format!("{}\n", r#"{"type":"ai-title","aiTitle":"Short"}"#),
    )
    .unwrap();
    assert_eq!(
        cached_claude_transcript_title(&transcript)
            .unwrap()
            .as_deref(),
        Some("Short")
    );
}

#[test]
fn claude_uses_last_nonempty_ai_title_and_ignores_partial_lines() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    fs::write(
        &transcript,
        [
            r#"{"type":"ai-title","aiTitle":"Old title"}"#,
            "not json",
            r#"{"type":"ai-title","aiTitle":" "}"#,
            r#"{"type":"ai-title","aiTitle":"Latest title"}"#,
            r#"{"type":"ai-title""#,
        ]
        .join("\n"),
    )
    .unwrap();

    assert_eq!(
        claude_transcript_title(&transcript, TranscriptScan::default())
            .unwrap()
            .title()
            .as_deref(),
        Some("Latest title")
    );
    assert_eq!(
        claude_transcript_title(&dir.path().join("missing.jsonl"), TranscriptScan::default())
            .unwrap()
            .title(),
        None
    );
}

#[test]
fn codex_prefers_database_name_then_session_index_then_preview() {
    let named = TempDir::new().unwrap();
    write_full_state_database(
        named.path(),
        5,
        Some("Database name"),
        Some("Preview"),
        Some("Title"),
        Some("First"),
    );
    write_session_index(
        named.path(),
        &[json!({"id": SESSION_ID, "thread_name": "Index name"})],
    );
    assert_eq!(
        codex_session_title(named.path(), SESSION_ID).as_deref(),
        Some("Database name")
    );

    let indexed = TempDir::new().unwrap();
    write_full_state_database(
        indexed.path(),
        5,
        None,
        Some("Preview"),
        Some("Title"),
        Some("First"),
    );
    write_session_index(
        indexed.path(),
        &[json!({"id": SESSION_ID, "thread_name": "Index name"})],
    );
    assert_eq!(
        codex_session_title(indexed.path(), SESSION_ID).as_deref(),
        Some("Index name")
    );

    let previewed = TempDir::new().unwrap();
    write_full_state_database(
        previewed.path(),
        5,
        None,
        Some("#   Fix the terminal tabs"),
        Some("Title"),
        Some("First"),
    );
    assert_eq!(
        codex_session_title(previewed.path(), SESSION_ID).as_deref(),
        Some("Fix the terminal tabs")
    );
}

#[test]
fn codex_repeat_lookups_reuse_the_cached_databases_and_columns() {
    let dir = TempDir::new().unwrap();
    write_full_state_database(dir.path(), 5, None, Some("Cached preview"), None, None);

    assert_eq!(
        codex_session_title(dir.path(), SESSION_ID).as_deref(),
        Some("Cached preview")
    );
    // Second call answers from the cached path list and column set; the schema
    // it recorded still has to produce the same row.
    assert_eq!(
        codex_session_title(dir.path(), SESSION_ID).as_deref(),
        Some("Cached preview")
    );
    let cache = codex_database_cache().lock().unwrap();
    let entry = cache.get(dir.path()).unwrap();
    assert_eq!(entry.paths.len(), 1);
    assert_eq!(entry.columns.len(), 1);
}

#[test]
fn codex_feature_detects_legacy_columns() {
    let dir = TempDir::new().unwrap();
    let connection = Connection::open(dir.path().join("state_4.sqlite")).unwrap();
    connection
        .execute_batch("CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT NOT NULL);")
        .unwrap();
    connection
        .execute(
            "INSERT INTO threads VALUES (?1, ?2)",
            params![SESSION_ID, "Legacy title"],
        )
        .unwrap();
    drop(connection);

    assert_eq!(
        codex_session_title(dir.path(), SESSION_ID).as_deref(),
        Some("Legacy title")
    );
}

#[test]
fn codex_uses_newest_state_database_and_root_over_stale_duplicate() {
    let dir = TempDir::new().unwrap();
    fs::create_dir(dir.path().join("sqlite")).unwrap();
    write_full_state_database(
        &dir.path().join("sqlite"),
        5,
        Some("Stale duplicate"),
        None,
        None,
        None,
    );
    write_full_state_database(dir.path(), 4, Some("Older root"), None, None, None);
    write_full_state_database(dir.path(), 5, Some("Current root"), None, None, None);

    assert_eq!(
        codex_session_title(dir.path(), SESSION_ID).as_deref(),
        Some("Current root")
    );
}

#[test]
fn session_index_uses_last_matching_nonempty_name() {
    let dir = TempDir::new().unwrap();
    fs::write(
        dir.path().join("session_index.jsonl"),
        [
            r#"{"id":"other","thread_name":"Ignore"}"#,
            r#"{"id":"019fac59-0da4-7160-b104-5b8429ba1054","thread_name":"First"}"#,
            "partial json",
            r#"{"id":"019fac59-0da4-7160-b104-5b8429ba1054","thread_name":" "}"#,
            r#"{"id":"019fac59-0da4-7160-b104-5b8429ba1054","thread_name":"Last"}"#,
        ]
        .join("\n"),
    )
    .unwrap();

    assert_eq!(
        session_index_title(&dir.path().join("session_index.jsonl"), SESSION_ID)
            .unwrap()
            .as_deref(),
        Some("Last")
    );
}

#[test]
fn fallback_titles_are_sanitized_and_compacted() {
    assert_eq!(
        compact_fallback("#\n  Fix\u{0}   tabs\tplease").as_deref(),
        Some("Fix tabs please")
    );
    let screenshot_prompt = "/var/folders/yw/x2b6hp7j4l7gr3l75_87pv4c0000gn/T/TemporaryItems/NSIRD_screencaptureui_06Zw0R/Screenshot 2026-07-29 at 09.19.49.png can we get title of running codex and claude?";
    assert_eq!(
        strip_leading_image_path(screenshot_prompt),
        "can we get title of running codex and claude?"
    );
    assert_eq!(
        compact_fallback(screenshot_prompt).as_deref(),
        Some("can we get title of running codex and claude?")
    );
    let title = compact_fallback(
        "Investigate how a very long running Codex session can expose a stable and useful title for a terminal tab",
    )
    .unwrap();
    assert!(title.chars().count() <= MAX_TITLE_CHARS);
    assert!(title.ends_with('…'));
    assert!(!title.contains('\n'));
}
